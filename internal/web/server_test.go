package web

import (
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
