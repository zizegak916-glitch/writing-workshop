package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/voocel/ainovel-cli/assets"
	"github.com/voocel/ainovel-cli/internal/bootstrap"
	"github.com/voocel/ainovel-cli/internal/host"
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
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("CORS header = %q, want *", got)
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
		"backend_id":"ainovel-cli",
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
