package web

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

const testHTTPBridgeToken = "test-bridge-token-with-32-characters"

func TestHTTPBridgeRequiresCompleteSafeConfiguration(t *testing.T) {
	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", "")
	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN", "")
	bridge, err := newHTTPBridgeFromEnv()
	if err != nil || bridge != nil {
		t.Fatalf("disabled bridge = %#v, err=%v", bridge, err)
	}

	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", `{"cpa":"http://127.0.0.1:8317"}`)
	if _, err := newHTTPBridgeFromEnv(); err == nil || !strings.Contains(err.Error(), "both") {
		t.Fatalf("missing token error = %v", err)
	}

	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN", testHTTPBridgeToken)
	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", `{"../open":"http://127.0.0.1:8317"}`)
	if _, err := newHTTPBridgeFromEnv(); err == nil || !strings.Contains(err.Error(), "target name") {
		t.Fatalf("unsafe alias error = %v", err)
	}

	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", `{"cpa":"file:///tmp/provider"}`)
	if _, err := newHTTPBridgeFromEnv(); err == nil || !strings.Contains(err.Error(), "http://") {
		t.Fatalf("unsafe scheme error = %v", err)
	}

	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", `{"cpa":"http://user:pass@127.0.0.1:8317"}`)
	if _, err := newHTTPBridgeFromEnv(); err == nil || !strings.Contains(err.Error(), "credentials") {
		t.Fatalf("embedded credentials error = %v", err)
	}
}

func TestHTTPBridgeRelaysLongRequestAndCORSPreflight(t *testing.T) {
	var upstreamHits atomic.Int32
	var upstreamBodyBytes atomic.Int64
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamHits.Add(1)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read upstream body: %v", err)
		}
		upstreamBodyBytes.Store(int64(len(body)))
		if r.URL.RequestURI() != "/v1/chat/completions?route=pages" {
			t.Errorf("upstream URI = %q", r.URL.RequestURI())
		}
		if r.Header.Get("Authorization") != "Bearer provider-key" || r.Header.Get("X-Route") != "pages" {
			t.Errorf("forwarded headers = %#v", r.Header)
		}
		for _, blocked := range []string{httpBridgeTokenHeader, "Cookie", "Origin", "X-Forwarded-For", "X-Real-IP"} {
			if value := r.Header.Get(blocked); value != "" {
				t.Errorf("blocked header %s reached upstream: %q", blocked, value)
			}
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("X-Request-ID", "bridge-long-1")
		w.Header().Set("Set-Cookie", "must-not-leak=1")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"长篇\"}}]}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	defer upstream.Close()

	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", mustJSON(t, map[string]string{"cpa": upstream.URL}))
	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN", testHTTPBridgeToken)
	t.Setenv("WRITING_WORKSHOP_ALLOWED_ORIGINS", "https://zizegak916-glitch.github.io")
	bridge, err := newHTTPBridgeFromEnv()
	if err != nil {
		t.Fatalf("newHTTPBridgeFromEnv: %v", err)
	}
	server, handler := newTestServer(t)
	server.httpBridge = bridge

	preflight := httptest.NewRequest(http.MethodOptions, "/api/http-bridge/cpa/v1/chat/completions?route=pages", nil)
	preflight.Header.Set("Origin", "https://zizegak916-glitch.github.io")
	preflight.Header.Set("Access-Control-Request-Headers", "authorization, x-ww-bridge-token, x-route")
	preflightRecorder := httptest.NewRecorder()
	handler.ServeHTTP(preflightRecorder, preflight)
	if preflightRecorder.Code != http.StatusNoContent {
		t.Fatalf("preflight status=%d body=%s", preflightRecorder.Code, preflightRecorder.Body.String())
	}
	if got := preflightRecorder.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(strings.ToLower(got), "x-route") ||
		!strings.Contains(strings.ToLower(got), strings.ToLower(httpBridgeTokenHeader)) {
		t.Fatalf("preflight allow headers = %q", got)
	}

	longText := strings.Repeat("长篇正文与记忆链。", 120000)
	payload := []byte(`{"model":"test","messages":[{"role":"user","content":` + mustJSON(t, longText) + `}],"stream":true}`)
	request := httptest.NewRequest(http.MethodPost, "/api/http-bridge/cpa/v1/chat/completions?route=pages", bytes.NewReader(payload))
	request.Header.Set("Origin", "https://zizegak916-glitch.github.io")
	request.Header.Set(httpBridgeTokenHeader, testHTTPBridgeToken)
	request.Header.Set("Authorization", "Bearer provider-key")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Route", "pages")
	request.Header.Set("Cookie", "browser-cookie=1")
	request.Header.Set("X-Forwarded-For", "203.0.113.9")
	request.Header.Set("X-Real-IP", "203.0.113.10")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("bridge status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if upstreamHits.Load() != 1 || upstreamBodyBytes.Load() != int64(len(payload)) {
		t.Fatalf("upstream hits=%d bytes=%d want=%d", upstreamHits.Load(), upstreamBodyBytes.Load(), len(payload))
	}
	if recorder.Header().Get("X-Writing-Workshop-Bridge") != "cpa" ||
		recorder.Header().Get("X-Request-ID") != "bridge-long-1" ||
		recorder.Header().Get("Set-Cookie") != "" {
		t.Fatalf("bridge response headers = %#v", recorder.Header())
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://zizegak916-glitch.github.io" {
		t.Fatalf("CORS origin = %q", got)
	}
	if !strings.Contains(recorder.Body.String(), "长篇") || !strings.Contains(recorder.Body.String(), "[DONE]") {
		t.Fatalf("unexpected stream body = %q", recorder.Body.String())
	}
}

func TestHTTPBridgeRejectsBadTokenUnknownTargetAndOversizeBody(t *testing.T) {
	var hits atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()

	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", mustJSON(t, map[string]string{"cpa": upstream.URL}))
	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN", testHTTPBridgeToken)
	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_MAX_BYTES", "1024")
	bridge, err := newHTTPBridgeFromEnv()
	if err != nil {
		t.Fatalf("newHTTPBridgeFromEnv: %v", err)
	}
	server, handler := newTestServer(t)
	server.httpBridge = bridge

	for _, test := range []struct {
		name   string
		path   string
		token  string
		body   []byte
		status int
	}{
		{name: "missing token", path: "/api/http-bridge/cpa/v1/models", status: http.StatusUnauthorized},
		{name: "unknown target", path: "/api/http-bridge/other/v1/models", token: testHTTPBridgeToken, status: http.StatusNotFound},
		{name: "oversize body", path: "/api/http-bridge/cpa/v1/chat/completions", token: testHTTPBridgeToken, body: bytes.Repeat([]byte("x"), 1025), status: http.StatusRequestEntityTooLarge},
	} {
		t.Run(test.name, func(t *testing.T) {
			method := http.MethodGet
			if test.body != nil {
				method = http.MethodPost
			}
			request := httptest.NewRequest(method, test.path, bytes.NewReader(test.body))
			if test.token != "" {
				request.Header.Set(httpBridgeTokenHeader, test.token)
			}
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != test.status {
				t.Fatalf("status=%d want=%d body=%s", recorder.Code, test.status, recorder.Body.String())
			}
		})
	}
	if hits.Load() != 0 {
		t.Fatalf("rejected requests reached upstream %d times", hits.Load())
	}
}

func TestHTTPBridgeRejectsRedirectOutsideConfiguredTarget(t *testing.T) {
	var escaped atomic.Bool
	escape := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		escaped.Store(true)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer escape.Close()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Location", escape.URL+"/stolen")
		w.WriteHeader(http.StatusTemporaryRedirect)
	}))
	defer upstream.Close()

	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS", mustJSON(t, map[string]string{"cpa": upstream.URL}))
	t.Setenv("WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN", testHTTPBridgeToken)
	bridge, err := newHTTPBridgeFromEnv()
	if err != nil {
		t.Fatalf("newHTTPBridgeFromEnv: %v", err)
	}
	server, handler := newTestServer(t)
	server.httpBridge = bridge
	request := httptest.NewRequest(http.MethodGet, "/api/http-bridge/cpa/v1/models", nil)
	request.Header.Set(httpBridgeTokenHeader, testHTTPBridgeToken)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if escaped.Load() {
		t.Fatal("bridge followed redirect outside configured target")
	}
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return string(data)
}
