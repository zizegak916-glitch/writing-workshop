package web

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/zizegak916-glitch/writing-workshop/internal/bootstrap"
	"github.com/zizegak916-glitch/writing-workshop/internal/domain"
	"github.com/zizegak916-glitch/writing-workshop/internal/engine"
	"github.com/zizegak916-glitch/writing-workshop/internal/engine/llm"
	"github.com/zizegak916-glitch/writing-workshop/internal/host"
	"github.com/zizegak916-glitch/writing-workshop/internal/rules"
	storepkg "github.com/zizegak916-glitch/writing-workshop/internal/store"
	staticfiles "github.com/zizegak916-glitch/writing-workshop/web/static"
)

type Server struct {
	host  *host.Host
	store *storepkg.Store
	addr  string

	httpBridge *httpBridge

	hub      *sseHub
	runMu    sync.Mutex
	runCtx   map[string]context.CancelFunc
	memoryMu sync.Mutex

	extension runtimeExtension
}

func NewServer(h *host.Host, addr string) *Server {
	if strings.TrimSpace(addr) == "" {
		addr = "127.0.0.1:8787"
	}
	s := &Server{
		host:      h,
		store:     h.Store(),
		addr:      addr,
		hub:       newSSEHub(),
		runCtx:    map[string]context.CancelFunc{},
		extension: disabledRuntimeExtension{},
	}
	s.hub.attachHost(h)
	return s
}

func NewServerFromEnv(h *host.Host, addr string) (*Server, error) {
	bridge, err := newHTTPBridgeFromEnv()
	if err != nil {
		return nil, err
	}
	server := NewServer(h, addr)
	server.httpBridge = bridge
	return server, nil
}

func (s *Server) ListenAndServe(ctx context.Context) error {
	mux := http.NewServeMux()
	s.routes(mux)

	srv := &http.Server{
		Addr:              s.addr,
		Handler:           cors(mux),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()
	slog.Info("Web 工坊已启动", "module", "web", "addr", s.addr)
	err := srv.ListenAndServe()
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

func (s *Server) routes(mux *http.ServeMux) {
	s.extension.Mount(mux)
	sub, _ := fs.Sub(staticfiles.Files, ".")
	mux.Handle("/", http.FileServer(http.FS(sub)))
	handleMethods(mux, "/admin", s.handleAdmin, http.MethodGet)
	handleMethods(mux, "/api/health", s.handleHealth, http.MethodGet)
	handleMethods(mux, "/api/events", s.handleEvents, http.MethodGet)
	handleMethods(mux, "/api/dashboard", s.handleDashboard, http.MethodGet)
	handleMethods(mux, "/api/agents/status", s.handleAgents, http.MethodGet)
	handleMethods(mux, "/api/config", s.handleConfig, http.MethodGet, http.MethodPost, http.MethodPut)
	handleMethods(mux, "/api/rules", s.handleRules, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/capabilities", s.handleCapabilities, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/external-catalog", s.handleExternalCatalog, http.MethodGet, http.MethodPost)
	handleMethods(mux, "/api/skill-packs", s.handleSkillPacks, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/categories", s.handleCategories, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/memories", s.handleMemories, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/run", s.handleRun, http.MethodPost)
	handleMethods(mux, "/api/projects", s.handleProjects, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/directives", s.handleDirectives, http.MethodGet, http.MethodPost, http.MethodDelete)
	handleMethods(mux, "/api/chapters", s.handleChapters, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/characters", s.handleCharacters, http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete)
	handleMethods(mux, "/api/start", s.handleStart, http.MethodPost)
	handleMethods(mux, "/api/resume", s.handleResume, http.MethodPost)
	handleMethods(mux, "/api/abort", s.handleAbort, http.MethodPost)
	handleMethods(mux, "/api/ai", s.handleAI, http.MethodPost)
	handleMethods(mux, "/api/ai/stream", s.handleAIStream, http.MethodPost)
	handleMethods(mux, "/api/models", s.handleModels, http.MethodGet)
	handleMethods(mux, "/api/models/switch", s.handleSwitchModel, http.MethodPost)
	handleMethods(mux, "/api/http-bridge/", s.handleHTTPBridge, http.MethodGet, http.MethodPost)
	handleMethods(mux, "/api/style/check", s.handleStyleCheck, http.MethodPost)
	handleMethods(mux, "/api/corpus", s.handleCorpus, http.MethodGet, http.MethodPost, http.MethodDelete)
	handleMethods(mux, "/api/corpus/refinements", s.handleCorpusRefinements, http.MethodPost)
}

func (s *Server) handleHTTPBridge(w http.ResponseWriter, r *http.Request) {
	s.httpBridge.serveHTTP(w, r)
}

// handleMethods preserves Go 1.22's method-aware ServeMux behavior while the
// self-hosted runtime remains buildable with Go 1.21. GET also accepts HEAD.
func handleMethods(mux *http.ServeMux, pattern string, handler http.HandlerFunc, methods ...string) {
	allowed := make(map[string]struct{}, len(methods)+1)
	allowHeader := append([]string(nil), methods...)
	for _, method := range methods {
		allowed[method] = struct{}{}
		if method == http.MethodGet {
			allowed[http.MethodHead] = struct{}{}
			allowHeader = append(allowHeader, http.MethodHead)
		}
	}
	mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		if _, ok := allowed[r.Method]; !ok {
			w.Header().Set("Allow", strings.Join(allowHeader, ", "))
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}
		handler(w, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	cfg := s.host.Config()
	mode := "configured"
	if cfg.Provider == "ollama" && cfg.ModelName == "offline-demo" {
		mode = "demo"
	}
	writeJSON(w, map[string]any{
		"status": "ok",
		"mode":   mode,
	})
}

func (s *Server) handleAdmin(w http.ResponseWriter, r *http.Request) {
	content, err := fs.ReadFile(staticfiles.Files, "admin.html")
	if err != nil {
		httpError(w, err, http.StatusInternalServerError)
		return
	}
	http.ServeContent(w, r, "admin.html", time.Time{}, bytes.NewReader(content))
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	s.hub.serve(w, r)
}

func (s *Server) handleDashboard(w http.ResponseWriter, _ *http.Request) {
	snap := s.host.Snapshot()
	chapters, _ := s.chapterList()
	ruleBundle := s.ruleBundle()
	writeJSON(w, map[string]any{
		"snapshot":   snap,
		"chapters":   chapters,
		"rules":      ruleBundle,
		"store_dir":  s.store.Dir(),
		"updated_at": time.Now().Format(time.RFC3339),
	})
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		cfg := redactConfig(s.host.Config())
		writeJSON(w, map[string]any{
			"config":     cfg,
			"configPath": bootstrap.DefaultConfigPath(),
			"env": map[string]string{
				"api_key_pattern": "WRITING_WORKSHOP_<PROVIDER>_API_KEY 或 <PROVIDER>_API_KEY（兼容旧 AINOVEL_ 前缀）",
			},
		})
	case http.MethodPost, http.MethodPut:
		cfg := s.host.Config()
		var req configUpdate
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if err := validateConfigUpdate(req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if req.Config != nil {
			cfg = *req.Config
		}
		applyConfigUpdate(&cfg, req)
		if err := s.host.UpdateConfig(cfg); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"saved": true, "config": redactConfig(s.host.Config())})
	}
}

func (s *Server) handleRules(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		bundle := s.ruleBundle()
		raw, _ := s.loadWebRules()
		writeJSON(w, map[string]any{
			"structured":   bundle.Structured,
			"preferences":  bundle.Preferences,
			"conflicts":    bundle.Conflicts,
			"sources":      bundle.Sources,
			"custom":       raw,
			"presets":      rulePresets(),
			"rules_path":   s.webRulesPath(),
			"export_types": []string{"json", "yaml"},
		})
	case http.MethodPost, http.MethodPut:
		var req rulesUpdate
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		content, err := buildRulesContent(req)
		if err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if err := s.saveWebRules(content); err != nil {
			respond(w, nil, err)
			return
		}
		bundle := s.ruleBundle()
		writeJSON(w, map[string]any{"saved": true, "custom": content, "structured": bundle.Structured, "sources": bundle.Sources})
	case http.MethodDelete:
		err := os.Remove(s.webRulesPath())
		if os.IsNotExist(err) {
			err = nil
		}
		respond(w, map[string]any{"deleted": err == nil}, err)
	}
}

func (s *Server) handleProjects(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		project, err := s.currentProject()
		if err != nil {
			respond(w, nil, err)
			return
		}
		if project == nil {
			writeJSON(w, []any{})
			return
		}
		writeJSON(w, []projectPayload{*project})
	case http.MethodPost, http.MethodPut:
		var req struct {
			Name          string `json:"name"`
			Description   string `json:"description"`
			Premise       string `json:"premise"`
			TotalChapters int    `json:"total_chapters"`
		}
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Premise) != "" || strings.TrimSpace(req.Description) != "" {
			premise := strings.TrimSpace(req.Premise)
			if premise == "" {
				premise = strings.TrimSpace(req.Description)
			}
			if err := s.store.Outline.SavePremise(premise); err != nil {
				respond(w, nil, err)
				return
			}
		}
		if strings.TrimSpace(req.Name) != "" {
			if err := s.store.Progress.SetNovelName(req.Name); err != nil {
				respond(w, nil, err)
				return
			}
		}
		if req.TotalChapters > 0 {
			if err := s.store.Progress.SetTotalChapters(req.TotalChapters); err != nil {
				respond(w, nil, err)
				return
			}
		}
		project, err := s.currentProject()
		respond(w, project, err)
	case http.MethodDelete:
		err := s.clearCurrentProject()
		respond(w, map[string]any{"deleted": err == nil}, err)
	}
}

func (s *Server) handleAgents(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, map[string]any{
		"agents":   s.host.Snapshot().Agents,
		"snapshot": s.host.Snapshot(),
	})
}

func (s *Server) handleDirectives(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := s.store.Directives.Load()
		respond(w, list, err)
	case http.MethodPost:
		var req struct {
			Text string `json:"text"`
		}
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		text := strings.TrimSpace(req.Text)
		if text == "" {
			httpError(w, fmt.Errorf("text is required"), http.StatusBadRequest)
			return
		}
		chapter, total := 0, 0
		if progress, _ := s.store.Progress.Load(); progress != nil {
			chapter = progress.NextChapter()
			total = progress.TotalChapters
		}
		list, err := s.store.Directives.Add(domain.UserDirective{
			Text:          text,
			Chapter:       chapter,
			TotalChapters: total,
			CreatedAt:     time.Now().Format(time.RFC3339),
		})
		if err == nil {
			s.host.Steer("保存长效创作要求并在后续写作中遵守：" + text)
		}
		respond(w, list, err)
	case http.MethodDelete:
		index, _ := strconv.Atoi(r.URL.Query().Get("index"))
		list, err := s.store.Directives.Remove(index)
		if err == nil {
			s.host.Steer(fmt.Sprintf("已删除第 %d 条长效创作要求，请后续不再遵循该条。", index))
		}
		respond(w, list, err)
	}
}

func (s *Server) handleChapters(w http.ResponseWriter, r *http.Request) {
	chapter, _ := strconv.Atoi(r.URL.Query().Get("chapter"))
	switch r.Method {
	case http.MethodGet:
		if chapter > 0 {
			ch, err := s.loadChapter(chapter)
			respond(w, ch, err)
			return
		}
		list, err := s.chapterList()
		respond(w, list, err)
	case http.MethodPut:
		if chapter <= 0 {
			httpError(w, fmt.Errorf("chapter must be > 0"), http.StatusBadRequest)
			return
		}
		var req struct {
			Content string `json:"content"`
			Final   bool   `json:"final"`
		}
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		var err error
		if req.Final {
			err = s.store.Drafts.SaveFinalChapter(chapter, req.Content)
		} else {
			err = s.store.Drafts.SaveDraft(chapter, req.Content)
		}
		if err == nil {
			s.host.Steer(fmt.Sprintf("用户已在 Web 章节编辑器更新第 %d 章，请读取真实章节内容后继续。", chapter))
		}
		respond(w, map[string]any{"saved": err == nil, "chapter": chapter}, err)
	case http.MethodPost:
		var req struct {
			Chapter int    `json:"chapter"`
			Content string `json:"content"`
			Final   bool   `json:"final"`
		}
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if req.Chapter <= 0 {
			httpError(w, fmt.Errorf("chapter must be > 0"), http.StatusBadRequest)
			return
		}
		var err error
		if req.Final {
			err = s.store.Drafts.SaveFinalChapter(req.Chapter, req.Content)
		} else {
			err = s.store.Drafts.SaveDraft(req.Chapter, req.Content)
		}
		respond(w, map[string]any{"saved": err == nil, "chapter": req.Chapter}, err)
	case http.MethodDelete:
		if chapter <= 0 {
			httpError(w, fmt.Errorf("chapter must be > 0"), http.StatusBadRequest)
			return
		}
		err := s.store.Drafts.DeleteChapter(chapter)
		respond(w, map[string]any{"deleted": err == nil, "chapter": chapter}, err)
	}
}

func (s *Server) handleCharacters(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		chars, err := s.store.Characters.Load()
		respond(w, chars, err)
	case http.MethodPost:
		var ch domain.Character
		if err := readJSON(r, &ch); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(ch.Name) == "" {
			httpError(w, fmt.Errorf("name is required"), http.StatusBadRequest)
			return
		}
		chars, err := s.store.Characters.Load()
		if err != nil {
			respond(w, nil, err)
			return
		}
		chars = append(chars, ch)
		err = s.store.Characters.Save(chars)
		respond(w, chars, err)
	case http.MethodPut:
		name := strings.TrimSpace(r.URL.Query().Get("name"))
		var ch domain.Character
		if err := readJSON(r, &ch); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if name == "" {
			name = strings.TrimSpace(ch.Name)
		}
		if name == "" {
			httpError(w, fmt.Errorf("name is required"), http.StatusBadRequest)
			return
		}
		chars, err := s.store.Characters.Load()
		if err != nil {
			respond(w, nil, err)
			return
		}
		replaced := false
		for i := range chars {
			if chars[i].Name == name {
				chars[i] = ch
				replaced = true
				break
			}
		}
		if !replaced {
			chars = append(chars, ch)
		}
		err = s.store.Characters.Save(chars)
		respond(w, chars, err)
	case http.MethodDelete:
		name := strings.TrimSpace(r.URL.Query().Get("name"))
		if name == "" {
			httpError(w, fmt.Errorf("name is required"), http.StatusBadRequest)
			return
		}
		chars, err := s.store.Characters.Load()
		if err != nil {
			respond(w, nil, err)
			return
		}
		filtered := chars[:0]
		for _, ch := range chars {
			if ch.Name != name {
				filtered = append(filtered, ch)
			}
		}
		err = s.store.Characters.Save(filtered)
		respond(w, filtered, err)
	}
}

func (s *Server) handleStart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Prompt       string `json:"prompt"`
		Outline      string `json:"outline"`
		TargetWords  int    `json:"target_words"`
		Provider     string `json:"provider"`
		Model        string `json:"model"`
		Resume       bool   `json:"resume"`
		HeadlessHint bool   `json:"headless"`
	}
	if err := readJSON(r, &req); err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	if req.Provider != "" || req.Model != "" {
		if err := s.host.SwitchModel("default", req.Provider, req.Model); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
	}
	if req.Resume {
		label, err := s.host.Resume()
		respond(w, map[string]any{"started": err == nil, "resume_label": label}, err)
		return
	}
	prompt := composeStartPrompt(req.Prompt, req.Outline, req.TargetWords, req.HeadlessHint)
	err := s.host.Start(prompt)
	respond(w, map[string]any{"started": err == nil}, err)
}

func (s *Server) handleResume(w http.ResponseWriter, _ *http.Request) {
	label, err := s.host.Resume()
	respond(w, map[string]any{"started": err == nil, "resume_label": label}, err)
}

func (s *Server) handleAbort(w http.ResponseWriter, _ *http.Request) {
	capabilityRuns := s.abortCapabilityRuns()
	writeJSON(w, map[string]any{"aborted": s.host.Abort() || capabilityRuns > 0, "capability_runs": capabilityRuns})
}

func (s *Server) handleAI(w http.ResponseWriter, r *http.Request) {
	req, messages, err := decodeAIRequest(r)
	if err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	resolved, err := s.resolveAIProvider(req.Provider, req.Model)
	if err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	ctx, cancel := s.aiRequestContext(r.Context(), resolved.Key)
	defer cancel()
	text, usage, providerKey, modelName, err := s.generateAI(ctx, resolved.Key, resolved.Model, messages)
	if err != nil {
		respond(w, nil, err)
		return
	}
	writeJSON(w, map[string]any{
		"id":       "writing-workshop",
		"object":   "chat.completion",
		"provider": providerKey,
		"model":    modelName,
		"choices": []map[string]any{{
			"index": 0,
			"message": map[string]any{
				"role":    "assistant",
				"content": text,
			},
			"finish_reason": "stop",
		}},
		"content": []map[string]any{{
			"type": "text",
			"text": text,
		}},
		"usage": map[string]any{
			"prompt_tokens":     usageInput(usage),
			"completion_tokens": usageOutput(usage),
			"input_tokens":      usageInput(usage),
			"output_tokens":     usageOutput(usage),
			"total_tokens":      usageTotal(usage),
		},
	})
}

func decodeAIRequest(r *http.Request) (aiRequest, []engine.Message, error) {
	var req aiRequest
	if err := readJSON(r, &req); err != nil {
		return req, nil, err
	}
	messages := convertAIMessages(req.Messages)
	if len(messages) == 0 && strings.TrimSpace(req.Message) != "" {
		messages = []engine.Message{{
			Role:    engine.RoleUser,
			Content: []engine.ContentBlock{engine.TextBlock(strings.TrimSpace(req.Message))},
		}}
	}
	if len(messages) == 0 {
		return req, nil, fmt.Errorf("messages or message is required")
	}
	return req, messages, nil
}

func (s *Server) aiRequestContext(parent context.Context, provider string) (context.Context, context.CancelFunc) {
	timeout := 60 * time.Second
	if pc, ok := s.host.Config().Providers[provider]; ok && pc.RequestTimeoutMS > 0 {
		timeout = time.Duration(pc.RequestTimeoutMS) * time.Millisecond
	}
	return context.WithTimeout(parent, timeout)
}

func (s *Server) generateAIStream(ctx context.Context, provider, modelName string, messages []engine.Message, onDelta func(string)) (string, *engine.Usage, error) {
	resolved, err := s.resolveAIProvider(provider, modelName)
	if err != nil {
		return "", nil, err
	}
	if useRawProvider(resolved) {
		return rawProviderRequest(ctx, resolved, messages, true, onDelta)
	}
	model, _, _, err := s.aiModel(resolved.Key, resolved.Model)
	if err != nil {
		return "", nil, err
	}
	stream, err := model.GenerateStream(ctx, messages, nil)
	if err != nil {
		resp, fallbackErr := model.Generate(ctx, messages, nil)
		if fallbackErr != nil {
			return "", nil, errors.Join(err, fallbackErr)
		}
		text := resp.Message.TextContent()
		if text != "" {
			onDelta(text)
		}
		return text, resp.Message.Usage, nil
	}
	var text strings.Builder
	var usage *engine.Usage
	streamed := false
	for event := range stream {
		switch event.Type {
		case engine.StreamEventTextDelta:
			if event.Delta == "" {
				continue
			}
			streamed = true
			text.WriteString(event.Delta)
			onDelta(event.Delta)
		case engine.StreamEventDone:
			usage = event.Message.Usage
			if !streamed {
				if final := event.Message.TextContent(); final != "" {
					text.WriteString(final)
					onDelta(final)
				}
			}
		case engine.StreamEventError:
			if event.Err != nil {
				return text.String(), usage, event.Err
			}
			return text.String(), usage, errors.New("model stream failed")
		}
	}
	if strings.TrimSpace(text.String()) == "" {
		return "", usage, errors.New("model stream ended without text")
	}
	return text.String(), usage, nil
}

func (s *Server) handleAIStream(w http.ResponseWriter, r *http.Request) {
	req, messages, err := decodeAIRequest(r)
	if err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	resolved, err := s.resolveAIProvider(req.Provider, req.Model)
	if err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	providerKey, modelName := resolved.Key, resolved.Model
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpError(w, errors.New("streaming is not supported"), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	writeSSE(w, "start", map[string]any{"provider": providerKey, "model": modelName})
	flusher.Flush()
	ctx, cancel := s.aiRequestContext(r.Context(), providerKey)
	defer cancel()
	text, usage, err := s.generateAIStream(ctx, providerKey, modelName, messages, func(delta string) {
		writeSSE(w, "delta", map[string]any{"text": delta})
		flusher.Flush()
	})
	if err != nil {
		writeSSE(w, "error", map[string]any{"error": err.Error()})
		flusher.Flush()
		return
	}
	writeSSE(w, "done", map[string]any{
		"text": text,
		"usage": map[string]int{
			"prompt_tokens":     usageInput(usage),
			"completion_tokens": usageOutput(usage),
			"total_tokens":      usageTotal(usage),
		},
	})
	flusher.Flush()
}

func (s *Server) handleModels(w http.ResponseWriter, _ *http.Request) {
	providers := s.host.ConfiguredProviders()
	models := map[string][]string{}
	for _, provider := range providers {
		models[provider] = s.host.ConfiguredModels(provider)
	}
	provider, model, _ := s.host.CurrentModelSelection("default")
	writeJSON(w, map[string]any{
		"providers": providers,
		"models":    models,
		"current": map[string]string{
			"provider": provider,
			"model":    model,
		},
	})
}

func (s *Server) handleSwitchModel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Role     string `json:"role"`
		Provider string `json:"provider"`
		Model    string `json:"model"`
	}
	if err := readJSON(r, &req); err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = "default"
	}
	err := s.host.SwitchModel(req.Role, req.Provider, req.Model)
	respond(w, map[string]any{"switched": err == nil}, err)
}

func (s *Server) handleStyleCheck(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Chapter int    `json:"chapter"`
		Content string `json:"content"`
	}
	if err := readJSON(r, &req); err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	text := req.Content
	if strings.TrimSpace(text) == "" && req.Chapter > 0 {
		ch, err := s.loadChapter(req.Chapter)
		if err != nil {
			httpError(w, err, http.StatusInternalServerError)
			return
		}
		text = ch.Content
	}
	bundle := s.ruleBundle()
	violations := rules.Check(text, domain.WordCount(text), bundle.Structured)
	writeJSON(w, map[string]any{
		"word_count":   domain.WordCount(text),
		"violations":   violations,
		"conflicts":    bundle.Conflicts,
		"rule_sources": bundle.Sources,
	})
}

func (s *Server) chapterList() ([]chapterSummary, error) {
	snap := s.host.Snapshot()
	byChapter := map[int]host.OutlineSnapshot{}
	for _, o := range snap.Outline {
		byChapter[o.Chapter] = o
	}
	maxChapter := snap.TotalChapters
	if maxChapter == 0 {
		maxChapter = len(snap.Outline)
	}
	if diskMax, err := s.maxChapterOnDisk(); err != nil {
		return nil, err
	} else if diskMax > maxChapter {
		maxChapter = diskMax
	}
	list := make([]chapterSummary, 0, maxChapter)
	for i := 1; i <= maxChapter; i++ {
		ch, err := s.loadChapter(i)
		if err != nil {
			return nil, err
		}
		o := byChapter[i]
		ch.Title = firstNonEmpty(ch.Title, o.Title, fmt.Sprintf("第 %d 章", i))
		ch.CoreEvent = o.CoreEvent
		list = append(list, chapterSummary{
			Chapter:   ch.Chapter,
			Title:     ch.Title,
			CoreEvent: ch.CoreEvent,
			WordCount: ch.WordCount,
			Final:     ch.Final,
		})
	}
	return list, nil
}

func (s *Server) maxChapterOnDisk() (int, error) {
	maxChapter := 0
	for _, dir := range []string{"chapters", "drafts"} {
		entries, err := os.ReadDir(filepath.Join(s.store.Dir(), dir))
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return 0, err
		}
		for _, entry := range entries {
			name := entry.Name()
			if entry.IsDir() || !strings.HasSuffix(name, ".md") {
				continue
			}
			n, err := strconv.Atoi(strings.TrimLeft(strings.TrimSuffix(strings.TrimSuffix(name, ".draft.md"), ".md"), "0"))
			if err == nil && n > maxChapter {
				maxChapter = n
			}
		}
	}
	return maxChapter, nil
}

func (s *Server) loadChapter(chapter int) (chapterPayload, error) {
	if chapter <= 0 {
		return chapterPayload{}, fmt.Errorf("chapter must be > 0")
	}
	final, err := s.store.Drafts.LoadChapterText(chapter)
	if err != nil {
		return chapterPayload{}, err
	}
	content := final
	isFinal := final != ""
	if content == "" {
		content, err = s.store.Drafts.LoadDraft(chapter)
		if err != nil {
			return chapterPayload{}, err
		}
	}
	title := extractMarkdownTitle(content)
	return chapterPayload{
		Chapter:   chapter,
		Title:     title,
		Content:   content,
		WordCount: domain.WordCount(content),
		Final:     isFinal,
	}, nil
}

func (s *Server) ruleBundle() rules.Bundle {
	return rules.Merge(rules.Load(rules.LoadOptions{
		RulesFS:         s.host.RulesFS(),
		HomeRulesDir:    rules.DefaultHomeRulesDir(),
		ProjectRulesDir: rules.DefaultProjectRulesDir(s.store.Dir()),
	}))
}

type chapterPayload struct {
	Chapter   int    `json:"chapter"`
	Title     string `json:"title"`
	CoreEvent string `json:"core_event,omitempty"`
	Content   string `json:"content"`
	WordCount int    `json:"word_count"`
	Final     bool   `json:"final"`
}

type chapterSummary struct {
	Chapter   int    `json:"chapter"`
	Title     string `json:"title"`
	CoreEvent string `json:"core_event,omitempty"`
	WordCount int    `json:"word_count"`
	Final     bool   `json:"final"`
}

type projectPayload struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description,omitempty"`
	Premise       string `json:"premise,omitempty"`
	TotalChapters int    `json:"total_chapters"`
	StoreDir      string `json:"store_dir"`
}

type configUpdate struct {
	Config         *bootstrap.Config `json:"config"`
	Provider       string            `json:"provider"`
	Model          string            `json:"model"`
	APIKey         string            `json:"api_key"`
	ClearAPIKey    bool              `json:"clear_api_key"`
	BaseURL        string            `json:"base_url"`
	Type           string            `json:"type"`
	Protocol       string            `json:"protocol"`
	AuthMode       string            `json:"auth_mode"`
	RequestTimeout int               `json:"request_timeout_ms"`
	ContextWindow  *int              `json:"context_window"`
	ExactEndpoint  *bool             `json:"exact_endpoint"`
	Models         []string          `json:"models"`
	Extra          map[string]any    `json:"extra"`
	ExtraBody      map[string]any    `json:"extra_body"`
}

type rulesUpdate struct {
	Raw              string           `json:"raw"`
	Format           string           `json:"format"`
	Preference       string           `json:"preference"`
	Genre            string           `json:"genre"`
	ChapterWords     *rules.WordRange `json:"chapter_words"`
	ForbiddenChars   []string         `json:"forbidden_chars"`
	ForbiddenPhrases []string         `json:"forbidden_phrases"`
	FatigueWords     map[string]int   `json:"fatigue_words"`
	Preset           string           `json:"preset"`
}

func validateConfigUpdate(req configUpdate) error {
	if protocol := strings.ToLower(strings.TrimSpace(req.Protocol)); protocol != "" {
		switch protocol {
		case "auto", "openai-chat", "openai-responses", "anthropic", "ollama":
		default:
			return fmt.Errorf("unsupported protocol %q", req.Protocol)
		}
	}
	if authMode := strings.ToLower(strings.TrimSpace(req.AuthMode)); authMode != "" {
		switch authMode {
		case "auto", "bearer", "x-api-key", "none":
		default:
			return fmt.Errorf("unsupported auth_mode %q", req.AuthMode)
		}
	}
	if baseURL := strings.TrimSpace(req.BaseURL); baseURL != "" {
		u, err := url.Parse(baseURL)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
			return fmt.Errorf("base_url must be an http(s) URL")
		}
	}
	if req.Extra != nil {
		if rawHeaders, ok := req.Extra["headers"]; ok {
			headers, ok := rawHeaders.(map[string]any)
			if !ok {
				return fmt.Errorf("extra.headers must be an object")
			}
			for name := range headers {
				if isForbiddenCustomHeader(name) {
					return fmt.Errorf("custom header %q is not allowed", name)
				}
			}
		}
	}
	return nil
}

type aiMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type aiRequest struct {
	Provider string      `json:"provider"`
	Model    string      `json:"model"`
	Messages []aiMessage `json:"messages"`
	Message  string      `json:"message"`
	Mode     string      `json:"mode"`
}

func applyConfigUpdate(cfg *bootstrap.Config, req configUpdate) {
	provider := strings.TrimSpace(req.Provider)
	model := strings.TrimSpace(req.Model)
	if provider != "" {
		cfg.Provider = provider
	}
	if model != "" {
		cfg.ModelName = model
	}
	if req.ContextWindow != nil {
		cfg.ContextWindow = max(0, *req.ContextWindow)
	}
	if cfg.Providers == nil {
		cfg.Providers = make(map[string]bootstrap.ProviderConfig)
	}
	if provider == "" {
		provider = cfg.Provider
	}
	pc := cfg.Providers[provider]
	if req.ClearAPIKey {
		pc.APIKey = ""
	} else if req.APIKey != "" {
		pc.APIKey = req.APIKey
	}
	if req.BaseURL != "" {
		pc.BaseURL = req.BaseURL
	}
	if req.Type != "" {
		pc.Type = req.Type
	}
	if req.Protocol != "" {
		pc.Protocol = req.Protocol
	}
	if req.AuthMode != "" {
		pc.AuthMode = req.AuthMode
	}
	if req.RequestTimeout > 0 {
		pc.RequestTimeoutMS = min(max(req.RequestTimeout, 5000), 600000)
	}
	if req.ExactEndpoint != nil {
		pc.ExactEndpoint = *req.ExactEndpoint
	}
	if len(req.Models) > 0 {
		pc.Models = append([]string(nil), req.Models...)
	}
	if req.Extra != nil {
		pc.Extra = cloneAnyMap(req.Extra)
	}
	if req.ExtraBody != nil {
		pc.ExtraBody = cloneAnyMap(req.ExtraBody)
	}
	if model != "" && !containsString(pc.Models, model) {
		pc.Models = append(pc.Models, model)
	}
	cfg.Providers[provider] = pc
}

func cloneAnyMap(source map[string]any) map[string]any {
	if source == nil {
		return nil
	}
	cloned := make(map[string]any, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func (s *Server) webRulesPath() string {
	return filepath.Join(s.store.Dir(), ".writing-workshop", "rules", "web.rules.md")
}

func (s *Server) loadWebRules() (string, error) {
	data, err := os.ReadFile(s.webRulesPath())
	if os.IsNotExist(err) {
		return "", nil
	}
	return string(data), err
}

func (s *Server) saveWebRules(content string) error {
	path := s.webRulesPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

func buildRulesContent(req rulesUpdate) (string, error) {
	if raw := strings.TrimSpace(req.Raw); raw != "" {
		return raw + "\n", nil
	}
	if preset := strings.TrimSpace(req.Preset); preset != "" {
		for _, p := range rulePresets() {
			if p["id"] == preset {
				return strings.TrimSpace(p["content"]) + "\n", nil
			}
		}
		return "", fmt.Errorf("unknown preset %q", preset)
	}
	var b strings.Builder
	b.WriteString("---\n")
	if req.Genre != "" {
		fmt.Fprintf(&b, "genre: %q\n", req.Genre)
	}
	if req.ChapterWords != nil {
		fmt.Fprintf(&b, "chapter_words: %d-%d\n", req.ChapterWords.Min, req.ChapterWords.Max)
	}
	if len(req.ForbiddenChars) > 0 {
		writeYAMLStringList(&b, "forbidden_chars", req.ForbiddenChars)
	}
	if len(req.ForbiddenPhrases) > 0 {
		writeYAMLStringList(&b, "forbidden_phrases", req.ForbiddenPhrases)
	}
	if len(req.FatigueWords) > 0 {
		b.WriteString("fatigue_words:\n")
		for k, v := range req.FatigueWords {
			fmt.Fprintf(&b, "  %q: %d\n", k, v)
		}
	}
	b.WriteString("---\n")
	if strings.TrimSpace(req.Preference) != "" {
		b.WriteString(strings.TrimSpace(req.Preference))
		b.WriteByte('\n')
	}
	if b.String() == "---\n---\n" {
		return "", fmt.Errorf("rule content is required")
	}
	return b.String(), nil
}

func writeYAMLStringList(b *strings.Builder, key string, values []string) {
	b.WriteString(key + ":\n")
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			fmt.Fprintf(b, "  - %q\n", value)
		}
	}
}

func rulePresets() []map[string]string {
	return []map[string]string{
		{
			"id":          "character",
			"name":        "人物描写规则",
			"description": "强调动作、选择和关系压力，减少标签化心理描写。",
			"content":     "---\nforbidden_phrases: [\"他很复杂\", \"她很特别\"]\nfatigue_words: {不禁: 1, 似乎: 3}\n---\n# 人物描写规则\n- 用动作、物件和具体选择体现人物性格。\n- 重要角色每次出场要带出当下目标、阻力或关系变化。\n- 避免只用性格标签解释人物。",
		},
		{
			"id":          "dialogue",
			"name":        "对话规则",
			"description": "控制对白解释感，要求每句对白承担冲突、信息或节奏功能。",
			"content":     "---\nforbidden_phrases: [\"如你所知\", \"我来解释一下\"]\n---\n# 对话规则\n- 对话应有潜台词，避免角色直接替作者说明设定。\n- 同一场对话中，每个角色的措辞和关注点要可区分。\n- 长解释拆进动作、反问、打断或误解里。",
		},
		{
			"id":          "scene",
			"name":        "场景规则",
			"description": "让场景服务目标、冲突和转折，避免空泛环境描写。",
			"content":     "---\nchapter_words: 2500-6000\nfatigue_words: {突然: 2, 只见: 2}\n---\n# 场景规则\n- 每个场景要有明确目标、阻碍和结果变化。\n- 环境描写优先选择会影响行动或情绪判断的细节。\n- 场景结尾要推动人物处境变化，而不是原地停住。",
		},
	}
}

func (s *Server) clearCurrentProject() error {
	dir := filepath.Clean(s.store.Dir())
	if dir == "." || dir == string(filepath.Separator) || dir == "" {
		return fmt.Errorf("refuse to delete unsafe store dir %q", s.store.Dir())
	}
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return s.store.Init()
}

func (s *Server) currentProject() (*projectPayload, error) {
	progress, err := s.store.Progress.Load()
	if err != nil {
		return nil, err
	}
	premise, err := s.store.Outline.LoadPremise()
	if err != nil {
		return nil, err
	}
	if progress == nil && strings.TrimSpace(premise) == "" {
		return nil, nil
	}
	name := ""
	total := 0
	if progress != nil {
		name = progress.NovelName
		total = progress.TotalChapters
	}
	if name == "" {
		name = domain.ExtractNovelNameFromPremise(premise)
	}
	if name == "" {
		name = "当前项目"
	}
	return &projectPayload{
		ID:            "current",
		Name:          name,
		Description:   truncateText(premise, 160),
		Premise:       premise,
		TotalChapters: total,
		StoreDir:      s.store.Dir(),
	}, nil
}

func (s *Server) aiModel(provider, modelName string) (engine.ChatModel, string, string, error) {
	cfg := s.host.Config()
	provider = strings.TrimSpace(provider)
	modelName = strings.TrimSpace(modelName)
	if provider == "" {
		provider = cfg.Provider
	}
	if modelName == "" {
		modelName = cfg.ModelName
	}
	pc, ok := cfg.Providers[provider]
	if !ok {
		return nil, provider, modelName, fmt.Errorf("provider %q is not configured", provider)
	}
	if pc.APIKey == "" {
		pc.APIKey = providerAPIKeyFromEnv(provider)
	}
	providerType, err := pc.ProviderType(provider)
	if err != nil {
		return nil, provider, modelName, err
	}
	m, err := llm.NewModel(providerType, modelName,
		llm.WithAPIKey(pc.APIKey),
		llm.WithBaseURL(pc.BaseURL),
		llm.WithStreamIdleTimeout(5*time.Minute),
		llm.WithProviderExtra(pc.Extra),
		llm.WithExtra(pc.ExtraBody),
	)
	if err != nil {
		return nil, provider, modelName, err
	}
	return m, provider, modelName, nil
}

func convertAIMessages(in []aiMessage) []engine.Message {
	out := make([]engine.Message, 0, len(in))
	for _, msg := range in {
		text := contentText(msg.Content)
		if strings.TrimSpace(text) == "" {
			continue
		}
		out = append(out, engine.Message{
			Role:    toAgentRole(msg.Role),
			Content: []engine.ContentBlock{engine.TextBlock(text)},
		})
	}
	return out
}

func contentText(v any) string {
	switch c := v.(type) {
	case string:
		return c
	case []any:
		var parts []string
		for _, item := range c {
			if m, ok := item.(map[string]any); ok {
				if text, ok := m["text"].(string); ok {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "\n")
	default:
		b, _ := json.Marshal(c)
		return string(b)
	}
}

func toAgentRole(role string) engine.Role {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "assistant":
		return engine.RoleAssistant
	case "system":
		return engine.RoleSystem
	case "tool":
		return engine.RoleTool
	default:
		return engine.RoleUser
	}
}

func usageInput(u *engine.Usage) int {
	if u == nil {
		return 0
	}
	return u.Input
}

func usageOutput(u *engine.Usage) int {
	if u == nil {
		return 0
	}
	return u.Output
}

func usageTotal(u *engine.Usage) int {
	if u == nil {
		return 0
	}
	if u.TotalTokens > 0 {
		return u.TotalTokens
	}
	return u.Input + u.Output
}

func redactConfig(cfg bootstrap.Config) bootstrap.Config {
	for name, provider := range cfg.Providers {
		if provider.APIKey != "" {
			provider.APIKey = "********"
		}
		if provider.Extra != nil {
			provider.Extra = cloneAnyMap(provider.Extra)
			delete(provider.Extra, "headers")
		}
		cfg.Providers[name] = provider
	}
	return cfg
}

func truncateText(s string, maxRunes int) string {
	runes := []rune(strings.TrimSpace(s))
	if len(runes) <= maxRunes {
		return string(runes)
	}
	return string(runes[:maxRunes]) + "..."
}

func composeStartPrompt(prompt, outline string, targetWords int, headless bool) string {
	var parts []string
	if strings.TrimSpace(prompt) != "" {
		parts = append(parts, strings.TrimSpace(prompt))
	}
	if strings.TrimSpace(outline) != "" {
		parts = append(parts, "[用户提供的大纲]\n"+strings.TrimSpace(outline))
	}
	if targetWords > 0 {
		parts = append(parts, fmt.Sprintf("[目标字数]\n全书目标约 %d 字。若故事需要，可在保持节奏的前提下自行微调。", targetWords))
	}
	if headless {
		parts = append(parts, "[运行方式]\n按无人值守写作任务处理：能自行推进时不要等待用户确认，遇到预算、规则或一致性硬问题再停机。")
	}
	return strings.Join(parts, "\n\n")
}

func extractMarkdownTitle(text string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#") {
			return strings.TrimSpace(strings.TrimLeft(line, "#"))
		}
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func providerAPIKeyFromEnv(provider string) string {
	key := strings.ToUpper(strings.NewReplacer("-", "_", ".", "_").Replace(strings.TrimSpace(provider)))
	for _, name := range []string{"WRITING_WORKSHOP_" + key + "_API_KEY", key + "_API_KEY", "AINOVEL_" + key + "_API_KEY"} {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

const maxJSONBody = 8 << 20

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxJSONBody+1))
	if err := decoder.Decode(v); err != nil {
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("invalid JSON body: multiple values")
		}
		return fmt.Errorf("invalid JSON body: %w", err)
	}
	return nil
}

func respond(w http.ResponseWriter, payload any, err error) {
	if err != nil {
		httpError(w, err, http.StatusInternalServerError)
		return
	}
	writeJSON(w, payload)
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(payload)
}

func httpError(w http.ResponseWriter, err error, status int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			if !originAllowed(origin, r.Host, os.Getenv("WRITING_WORKSHOP_ALLOWED_ORIGINS")) {
				httpError(w, fmt.Errorf("cross-origin request rejected"), http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", corsAllowedHeaders(r.Header.Get("Access-Control-Request-Headers")))
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, Request-ID, CF-Ray, X-Writing-Workshop-Bridge")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func corsAllowedHeaders(requested string) string {
	defaults := []string{
		"Content-Type", "Authorization", "X-Requested-With", "X-API-Key",
		"Anthropic-Version", "Anthropic-Dangerous-Direct-Browser-Access", httpBridgeTokenHeader,
	}
	seen := make(map[string]bool, len(defaults))
	for _, name := range defaults {
		seen[strings.ToLower(name)] = true
	}
	for _, name := range strings.Split(requested, ",") {
		name = http.CanonicalHeaderKey(strings.TrimSpace(name))
		if name == "" || strings.ContainsAny(name, "\r\n") || bridgeRequestHeaderBlocked(name) {
			continue
		}
		lower := strings.ToLower(name)
		if !seen[lower] {
			defaults = append(defaults, name)
			seen[lower] = true
		}
	}
	return strings.Join(defaults, ", ")
}

func originAllowed(origin, requestHost, configured string) bool {
	parsed, err := url.Parse(origin)
	if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") && strings.EqualFold(parsed.Host, requestHost) {
		return true
	}
	for _, allowed := range strings.Split(configured, ",") {
		if strings.EqualFold(strings.TrimSpace(allowed), origin) {
			return true
		}
	}
	return false
}

type sseHub struct {
	mu      sync.Mutex
	clients map[chan sseMessage]struct{}
}

type sseMessage struct {
	Event string
	Data  any
}

func newSSEHub() *sseHub {
	return &sseHub{clients: make(map[chan sseMessage]struct{})}
}

func (h *sseHub) attachHost(rt *host.Host) {
	go func() {
		for ev := range rt.Events() {
			h.broadcast(sseMessage{Event: "event", Data: ev})
		}
	}()
	go func() {
		for delta := range rt.Stream() {
			if delta == host.StreamClearSentinel {
				h.broadcast(sseMessage{Event: "clear", Data: map[string]any{"clear": true}})
				continue
			}
			h.broadcast(sseMessage{Event: "stream", Data: map[string]any{"delta": delta}})
		}
	}()
}

func (h *sseHub) serve(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		httpError(w, fmt.Errorf("streaming unsupported"), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan sseMessage, 128)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, ch)
		h.mu.Unlock()
		close(ch)
	}()

	writeSSE(w, "ready", map[string]any{"ok": true, "time": time.Now().Format(time.RFC3339)})
	flusher.Flush()
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-ch:
			writeSSE(w, msg.Event, msg.Data)
			flusher.Flush()
		case <-ticker.C:
			writeSSE(w, "ping", map[string]any{"time": time.Now().Format(time.RFC3339)})
			flusher.Flush()
		}
	}
}

func (h *sseHub) broadcast(msg sseMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients {
		select {
		case ch <- msg:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- msg:
			default:
			}
		}
	}
}

func writeSSE(w http.ResponseWriter, event string, data any) {
	b, _ := json.Marshal(data)
	fmt.Fprintf(w, "event: %s\n", event)
	fmt.Fprintf(w, "data: %s\n\n", b)
}
