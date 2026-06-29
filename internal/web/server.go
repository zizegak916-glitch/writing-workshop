package web

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/voocel/agentcore"
	"github.com/voocel/agentcore/llm"
	"github.com/voocel/ainovel-cli/internal/bootstrap"
	"github.com/voocel/ainovel-cli/internal/domain"
	"github.com/voocel/ainovel-cli/internal/host"
	"github.com/voocel/ainovel-cli/internal/rules"
	storepkg "github.com/voocel/ainovel-cli/internal/store"
	staticfiles "github.com/voocel/ainovel-cli/web/static"
)

type Server struct {
	host  *host.Host
	store *storepkg.Store
	addr  string

	hub *sseHub
}

func NewServer(h *host.Host, addr string) *Server {
	if strings.TrimSpace(addr) == "" {
		addr = "127.0.0.1:8787"
	}
	s := &Server{
		host:  h,
		store: h.Store(),
		addr:  addr,
		hub:   newSSEHub(),
	}
	s.hub.attachHost(h)
	return s
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
	sub, _ := fs.Sub(staticfiles.Files, ".")
	mux.Handle("/", http.FileServer(http.FS(sub)))
	mux.HandleFunc("GET /api/events", s.handleEvents)
	mux.HandleFunc("GET /api/dashboard", s.handleDashboard)
	mux.HandleFunc("GET /api/agents/status", s.handleAgents)
	mux.HandleFunc("GET /api/config", s.handleConfig)
	mux.HandleFunc("GET /api/rules", s.handleRules)
	mux.HandleFunc("GET /api/projects", s.handleProjects)
	mux.HandleFunc("POST /api/projects", s.handleProjects)
	mux.HandleFunc("PUT /api/projects", s.handleProjects)
	mux.HandleFunc("DELETE /api/projects", s.handleProjects)
	mux.HandleFunc("GET /api/directives", s.handleDirectives)
	mux.HandleFunc("POST /api/directives", s.handleDirectives)
	mux.HandleFunc("DELETE /api/directives", s.handleDirectives)
	mux.HandleFunc("GET /api/chapters", s.handleChapters)
	mux.HandleFunc("POST /api/chapters", s.handleChapters)
	mux.HandleFunc("PUT /api/chapters", s.handleChapters)
	mux.HandleFunc("DELETE /api/chapters", s.handleChapters)
	mux.HandleFunc("GET /api/characters", s.handleCharacters)
	mux.HandleFunc("POST /api/characters", s.handleCharacters)
	mux.HandleFunc("PUT /api/characters", s.handleCharacters)
	mux.HandleFunc("DELETE /api/characters", s.handleCharacters)
	mux.HandleFunc("POST /api/start", s.handleStart)
	mux.HandleFunc("POST /api/resume", s.handleResume)
	mux.HandleFunc("POST /api/abort", s.handleAbort)
	mux.HandleFunc("POST /api/ai", s.handleAI)
	mux.HandleFunc("GET /api/models", s.handleModels)
	mux.HandleFunc("POST /api/models/switch", s.handleSwitchModel)
	mux.HandleFunc("POST /api/style/check", s.handleStyleCheck)
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

func (s *Server) handleConfig(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, redactConfig(s.host.Config()))
}

func (s *Server) handleRules(w http.ResponseWriter, _ *http.Request) {
	bundle := s.ruleBundle()
	writeJSON(w, map[string]any{
		"structured": bundle.Structured,
		"conflicts":  bundle.Conflicts,
		"sources":    bundle.Sources,
	})
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
		writeJSON(w, map[string]any{"deleted": false, "reason": "current ainovel store project cannot be deleted from web API"})
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
	writeJSON(w, map[string]any{"aborted": s.host.Abort()})
}

func (s *Server) handleAI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Provider string      `json:"provider"`
		Model    string      `json:"model"`
		Messages []aiMessage `json:"messages"`
		Message  string      `json:"message"`
		Mode     string      `json:"mode"`
	}
	if err := readJSON(r, &req); err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	messages := convertAIMessages(req.Messages)
	if len(messages) == 0 && strings.TrimSpace(req.Message) != "" {
		messages = []agentcore.Message{{
			Role:    agentcore.RoleUser,
			Content: []agentcore.ContentBlock{agentcore.TextBlock(strings.TrimSpace(req.Message))},
		}}
	}
	if len(messages) == 0 {
		httpError(w, fmt.Errorf("messages or message is required"), http.StatusBadRequest)
		return
	}
	model, providerKey, modelName, err := s.aiModel(req.Provider, req.Model)
	if err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	resp, err := model.Generate(r.Context(), messages, nil)
	if err != nil {
		respond(w, nil, err)
		return
	}
	text := resp.Message.TextContent()
	usage := resp.Message.Usage
	writeJSON(w, map[string]any{
		"id":       "ainovel-cli",
		"object":   "chat.completion",
		"provider": providerKey,
		"model":    modelName,
		"choices": []map[string]any{{
			"index": 0,
			"message": map[string]any{
				"role":    "assistant",
				"content": text,
			},
			"finish_reason": resp.Message.StopReason,
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

type aiMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
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

func (s *Server) aiModel(provider, modelName string) (agentcore.ChatModel, string, string, error) {
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

func convertAIMessages(in []aiMessage) []agentcore.Message {
	out := make([]agentcore.Message, 0, len(in))
	for _, msg := range in {
		text := contentText(msg.Content)
		if strings.TrimSpace(text) == "" {
			continue
		}
		out = append(out, agentcore.Message{
			Role:    toAgentRole(msg.Role),
			Content: []agentcore.ContentBlock{agentcore.TextBlock(text)},
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

func toAgentRole(role string) agentcore.Role {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "assistant":
		return agentcore.RoleAssistant
	case "system":
		return agentcore.RoleSystem
	case "tool":
		return agentcore.RoleTool
	default:
		return agentcore.RoleUser
	}
}

func usageInput(u *agentcore.Usage) int {
	if u == nil {
		return 0
	}
	return u.Input
}

func usageOutput(u *agentcore.Usage) int {
	if u == nil {
		return 0
	}
	return u.Output
}

func usageTotal(u *agentcore.Usage) int {
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

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
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
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
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
