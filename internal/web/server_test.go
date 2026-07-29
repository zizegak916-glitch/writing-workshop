package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/zizegak916-glitch/writing-workshop/assets"
	"github.com/zizegak916-glitch/writing-workshop/internal/bootstrap"
	"github.com/zizegak916-glitch/writing-workshop/internal/host"
)

func TestProjectsEmptyList(t *testing.T) {
	cfg := bootstrap.Config{
		OutputDir: t.TempDir(),
		Provider:  "ollama",
		ModelName: "qwen3:14b",
		Providers: map[string]bootstrap.ProviderConfig{
			"ollama": {
				BaseURL: "http://localhost:11434/v1",
				Models:  []string{"qwen3:14b"},
			},
		},
		Style: "default",
	}
	h, err := host.New(cfg, assets.Load(cfg.Style))
	if err != nil {
		t.Fatalf("host.New: %v", err)
	}
	defer h.Close()

	s := NewServer(h, "127.0.0.1:0")
	mux := http.NewServeMux()
	s.routes(mux)

	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	rec := httptest.NewRecorder()
	cors(mux).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := strings.TrimSpace(rec.Body.String()); got != "[]" {
		t.Fatalf("body = %s, want []", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("same-origin request must not need CORS header, got %q", got)
	}
}

func TestCORSAllowsExplicitOrigin(t *testing.T) {
	_, mux := newTestServer(t)
	t.Setenv("WRITING_WORKSHOP_ALLOWED_ORIGINS", "https://writer.example")
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	req.Header.Set("Origin", "https://writer.example")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || rec.Header().Get("Access-Control-Allow-Origin") != "https://writer.example" {
		t.Fatalf("status=%d origin=%q body=%s", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"), rec.Body.String())
	}
}

func TestCORSRejectsUnknownOrigin(t *testing.T) {
	_, mux := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/projects", bytes.NewBufferString(`{"name":"blocked"}`))
	req.Header.Set("Origin", "https://attacker.example")
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status=%d, want 403, body=%s", rec.Code, rec.Body.String())
	}
}

func TestHealth(t *testing.T) {
	_, mux := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"status":"ok"`) {
		t.Fatalf("unexpected health response: %s", rec.Body.String())
	}
}

func TestCapabilitiesSaveAndRun(t *testing.T) {
	s, mux := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/capabilities", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET capabilities status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "builtin-rewrite") {
		t.Fatalf("default capabilities missing builtin-rewrite: %s", rec.Body.String())
	}

	body := bytes.NewBufferString(`{
		"name":"通用润色",
		"type":"skill",
		"version":"1.0.0",
		"source":"https://github.com/example/writing-skill",
		"license":"MIT",
		"entry":"skill.json",
		"output":"text",
		"supports_stream":true,
		"supports_abort":true,
		"enabled":true
	}`)
	req = httptest.NewRequest(http.MethodPost, "/api/capabilities", body)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST capabilities status = %d, body = %s", rec.Code, rec.Body.String())
	}

	runBody := bytes.NewBufferString(`{
		"backend_id":"writing-workshop",
		"skill_ids":["builtin-rewrite"],
		"task":"rewrite",
		"context":{"selection":"雨落在窗边。"}
	}`)
	req = httptest.NewRequest(http.MethodPost, "/api/run", runBody)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST run status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("run JSON: %v", err)
	}
	if got["finished"] != true || !strings.Contains(got["output"].(string), "雨落在窗边") {
		t.Fatalf("unexpected run response: %#v", got)
	}

	if _, err := s.loadCapabilities(); err != nil {
		t.Fatalf("loadCapabilities after save: %v", err)
	}
}

func TestCapabilitiesRejectIncompleteManifest(t *testing.T) {
	_, mux := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/capabilities", bytes.NewBufferString(`{"name":"bad"}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body = %s", rec.Code, rec.Body.String())
	}
}

func TestCapabilitiesDefaultCannotBeDeleted(t *testing.T) {
	_, mux := newTestServer(t)
	req := httptest.NewRequest(http.MethodDelete, "/api/capabilities?id=builtin-rewrite", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body = %s", rec.Code, rec.Body.String())
	}
}

func TestDisabledCapabilityCannotRun(t *testing.T) {
	_, mux := newTestServer(t)
	body := bytes.NewBufferString(`{
		"id":"disabled-skill",
		"name":"停用能力",
		"type":"skill",
		"version":"1.0.0",
		"source":"https://github.com/example/disabled-skill",
		"license":"MIT",
		"entry":"skill.json",
		"output":"text",
		"enabled":false
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/capabilities", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST disabled capability status = %d, body = %s", rec.Code, rec.Body.String())
	}

	runBody := bytes.NewBufferString(`{
		"skill_ids":["disabled-skill"],
		"task":"echo",
		"context":{"selection":"test"}
	}`)
	req = httptest.NewRequest(http.MethodPost, "/api/run", runBody)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("POST run status = %d, want 400, body = %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "disabled") {
		t.Fatalf("disabled error missing: %s", rec.Body.String())
	}
}

func TestRunStreamsEvents(t *testing.T) {
	_, mux := newTestServer(t)
	runBody := bytes.NewBufferString(`{
		"skill_ids":["builtin-outline"],
		"task":"outline",
		"context":{"selection":"一个关于海边灯塔的故事"},
		"params":{"stream":true}
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/run", runBody)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST run stream status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Content-Type"); !strings.Contains(got, "text/event-stream") {
		t.Fatalf("content-type = %q", got)
	}
	body := rec.Body.String()
	for _, want := range []string{"event: start", "event: delta", "event: done", "大纲草案"} {
		if !strings.Contains(body, want) {
			t.Fatalf("stream missing %q: %s", want, body)
		}
	}
}

func TestCapabilityInstructionsComposeIntoRunMessage(t *testing.T) {
	caps := []capabilityManifest{{
		Name:         "节奏校准",
		Type:         "skill",
		Instructions: "保留事件顺序，只调整段落张力。",
	}}
	got := capabilityRunMessage("雨落在窗边。", caps)
	for _, want := range []string{"节奏校准", "保留事件顺序", "雨落在窗边"} {
		if !strings.Contains(got, want) {
			t.Fatalf("capabilityRunMessage missing %q: %s", want, got)
		}
	}
}

func TestResolveRunTaskFromBuiltinCapability(t *testing.T) {
	if got := resolveRunTask("", []capabilityManifest{{Entry: "builtin:outline"}}); got != "outline" {
		t.Fatalf("resolveRunTask = %q, want outline", got)
	}
	if got := resolveRunTask("echo", []capabilityManifest{{Entry: "builtin:outline"}}); got != "echo" {
		t.Fatalf("explicit task must win, got %q", got)
	}
}

func TestSkillPacksAndCategories(t *testing.T) {
	_, mux := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/skill-packs", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "chapter-revision") {
		t.Fatalf("GET skill packs status=%d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/categories", bytes.NewBufferString(`{
		"name":"自定义研究分类",
		"color":"#123ABC",
		"scope":"capability"
	}`))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "自定义研究分类") {
		t.Fatalf("POST category status=%d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/skill-packs", bytes.NewBufferString(`{
		"id":"my-review-pack",
		"name":"我的修订包",
		"description":"组合多个真实能力",
		"category":"revision",
		"skill_ids":["builtin-rewrite","builtin-continuity","builtin-rewrite"],
		"enabled":true
	}`))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST skill pack status=%d body=%s", rec.Code, rec.Body.String())
	}
	if strings.Count(rec.Body.String(), "builtin-rewrite") != 1 {
		t.Fatalf("skill ids must be deduplicated: %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/skill-packs?id=chapter-revision", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("built-in pack delete status=%d, want 400, body=%s", rec.Code, rec.Body.String())
	}
}

func TestSkillPackRejectsUnknownSkill(t *testing.T) {
	_, mux := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/api/skill-packs", bytes.NewBufferString(`{
		"id":"bad-pack",
		"name":"坏包",
		"skill_ids":["does-not-exist"],
		"enabled":true
	}`))
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "not found") {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestExternalCatalogImportsMetadataOnly(t *testing.T) {
	_, mux := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/external-catalog", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET external catalog status=%d body=%s", rec.Code, rec.Body.String())
	}
	for _, want := range []string{`"execution_policy":"metadata-only"`, `"mcp-filesystem"`, `"openai-plugins"`, `"deprecated-upstream"`} {
		if !strings.Contains(rec.Body.String(), want) {
			t.Fatalf("external catalog missing %q: %s", want, rec.Body.String())
		}
	}

	req = httptest.NewRequest(http.MethodPost, "/api/external-catalog", bytes.NewBufferString(`{"id":"mcp-filesystem"}`))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("POST external catalog status=%d body=%s", rec.Code, rec.Body.String())
	}
	var imported struct {
		Imported   bool               `json:"imported"`
		Capability capabilityManifest `json:"capability"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &imported); err != nil {
		t.Fatalf("decode external import: %v", err)
	}
	if !imported.Imported || imported.Capability.Enabled || imported.Capability.Entry != "external:mcp-server" {
		t.Fatalf("external import must be disabled metadata: %#v", imported)
	}

	runBody := bytes.NewBufferString(`{
		"skill_ids":["external-mcp-filesystem"],
		"task":"echo",
		"context":{"selection":"must not run"}
	}`)
	req = httptest.NewRequest(http.MethodPost, "/api/run", runBody)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "disabled") {
		t.Fatalf("external metadata unexpectedly ran: status=%d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/capabilities", bytes.NewBufferString(`{
		"id":"unsafe-external",
		"name":"unsafe",
		"type":"skill",
		"version":"upstream",
		"source":"https://example.com/source",
		"license":"MIT",
		"entry":"external:mcp-server",
		"output":"external",
		"enabled":true
	}`))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "metadata-only") {
		t.Fatalf("enabled external entry must be rejected: status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestAIProviderContractsWithLocalMocks(t *testing.T) {
	tests := []struct {
		name         string
		providerType string
		model        string
		response     string
		wantPath     string
	}{
		{
			name: "openai", providerType: "openai", model: "contract-gpt",
			response: `{"id":"chatcmpl-contract","object":"chat.completion","model":"contract-gpt","choices":[{"index":0,"message":{"role":"assistant","content":"openai contract ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":3,"total_tokens":7}}`,
			wantPath: "chat/completions",
		},
		{
			name: "anthropic", providerType: "anthropic", model: "contract-claude",
			response: `{"id":"msg_contract","type":"message","role":"assistant","model":"contract-claude","content":[{"type":"text","text":"anthropic contract ok"}],"stop_reason":"end_turn","usage":{"input_tokens":4,"output_tokens":3}}`,
			wantPath: "messages",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotPath string
			var gotBody map[string]any
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
					t.Errorf("decode upstream request: %v", err)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(tt.response))
			}))
			defer upstream.Close()

			cfg := bootstrap.Config{
				OutputDir: t.TempDir(),
				Provider:  tt.name,
				ModelName: tt.model,
				Providers: map[string]bootstrap.ProviderConfig{
					tt.name: {
						Type:    tt.providerType,
						APIKey:  "contract-key",
						BaseURL: upstream.URL + "/v1",
						Models:  []string{tt.model},
					},
				},
				Style: "default",
			}
			h, err := host.New(cfg, assets.Load(cfg.Style))
			if err != nil {
				t.Fatalf("host.New: %v", err)
			}
			defer h.Close()
			s := NewServer(h, "127.0.0.1:0")
			mux := http.NewServeMux()
			s.routes(mux)

			req := httptest.NewRequest(http.MethodPost, "/api/ai", bytes.NewBufferString(
				`{"provider":"`+tt.name+`","model":"`+tt.model+`","message":"contract request"}`,
			))
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("POST /api/ai status=%d body=%s upstream_path=%s", rec.Code, rec.Body.String(), gotPath)
			}
			if !strings.Contains(gotPath, tt.wantPath) {
				t.Fatalf("upstream path=%q, want to contain %q", gotPath, tt.wantPath)
			}
			if gotBody["model"] != tt.model {
				t.Fatalf("upstream model=%v, want %q; body=%#v", gotBody["model"], tt.model, gotBody)
			}
			if !strings.Contains(rec.Body.String(), tt.name+" contract ok") {
				t.Fatalf("proxy response missing upstream content: %s", rec.Body.String())
			}
		})
	}
}

func TestApplyConfigUpdatePreservesNetworkOptions(t *testing.T) {
	cfg := bootstrap.Config{
		Provider:  "custom",
		ModelName: "old-model",
		Providers: map[string]bootstrap.ProviderConfig{"custom": {
			Type:   "openai",
			APIKey: "old-key",
		}},
	}
	applyConfigUpdate(&cfg, configUpdate{
		Provider: "custom",
		Model:    "new-model",
		BaseURL:  "https://relay.example/v1",
		Type:     "anthropic",
		Extra: map[string]any{
			"headers": map[string]any{"X-Relay-Route": "cn-a"},
		},
		ExtraBody: map[string]any{"temperature": 0.4},
	})
	pc := cfg.Providers["custom"]
	if pc.Type != "anthropic" || pc.BaseURL != "https://relay.example/v1" {
		t.Fatalf("network options not applied: %#v", pc)
	}
	headers, ok := pc.Extra["headers"].(map[string]any)
	if !ok || headers["X-Relay-Route"] != "cn-a" {
		t.Fatalf("custom headers not applied: %#v", pc.Extra)
	}
	if pc.ExtraBody["temperature"] != 0.4 {
		t.Fatalf("extra body not applied: %#v", pc.ExtraBody)
	}
}

func newTestServer(t *testing.T) (*Server, http.Handler) {
	t.Helper()
	cfg := bootstrap.Config{
		OutputDir: t.TempDir(),
		Provider:  "ollama",
		ModelName: "qwen3:14b",
		Providers: map[string]bootstrap.ProviderConfig{
			"ollama": {
				BaseURL: "http://localhost:11434/v1",
				Models:  []string{"qwen3:14b"},
			},
		},
		Style: "default",
	}
	h, err := host.New(cfg, assets.Load(cfg.Style))
	if err != nil {
		t.Fatalf("host.New: %v", err)
	}
	t.Cleanup(func() { h.Close() })
	s := NewServer(h, "127.0.0.1:0")
	mux := http.NewServeMux()
	s.routes(mux)
	return s, cors(mux)
}
