package llm

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	engine "github.com/zizegak916-glitch/writing-workshop/internal/engine"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return fn(req) }

func TestNativeHTTPAdapters(t *testing.T) {
	tests := []struct {
		name, provider, path, response, wantText, wantAuth string
	}{
		{"openai", "openai", "/chat/completions", `{"choices":[{"message":{"content":"openai-ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}`, "openai-ok", "Bearer secret"},
		{"anthropic", "anthropic", "/messages", `{"content":[{"type":"text","text":"anthropic-ok"}],"stop_reason":"end_turn","usage":{"input_tokens":6,"output_tokens":3}}`, "anthropic-ok", "secret"},
		{"gemini", "gemini", "/models/demo:generateContent", `{"candidates":[{"content":{"parts":[{"text":"gemini-ok"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":7,"candidatesTokenCount":4,"totalTokenCount":11}}`, "gemini-ok", "secret"},
		{"ollama", "ollama", "/api/chat", `{"message":{"content":"ollama-ok"},"prompt_eval_count":8,"eval_count":5}`, "ollama-ok", "Bearer secret"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.URL.Path != tt.path {
					t.Fatalf("path = %q, want %q", r.URL.Path, tt.path)
				}
				if tt.provider == "anthropic" {
					if got := r.Header.Get("x-api-key"); got != tt.wantAuth {
						t.Fatalf("x-api-key = %q", got)
					}
				} else if tt.provider == "gemini" {
					if got := r.Header.Get("x-goog-api-key"); got != tt.wantAuth {
						t.Fatalf("x-goog-api-key = %q", got)
					}
				} else if got := r.Header.Get("Authorization"); got != tt.wantAuth {
					t.Fatalf("authorization = %q", got)
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Fatal(err)
				}
				if body["model"] != "demo" && tt.provider != "gemini" {
					t.Fatalf("model missing from request: %#v", body)
				}
				return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(tt.response)), Request: r}, nil
			})
			model, err := NewModel(tt.provider, "demo", WithBaseURL("https://provider.invalid"), WithAPIKey("secret"))
			if err != nil {
				t.Fatal(err)
			}
			model.client = &http.Client{Transport: transport}
			response, err := model.Generate(context.Background(), []engine.Message{engine.UserMsg("hello")}, nil, engine.WithMaxTokens(128))
			if err != nil {
				t.Fatal(err)
			}
			if got := response.Message.TextContent(); got != tt.wantText {
				t.Fatalf("text = %q, want %q", got, tt.wantText)
			}
			if response.Message.Usage == nil || response.Message.Usage.TotalTokens == 0 {
				t.Fatalf("usage not decoded: %#v", response.Message.Usage)
			}
			if response.Message.Usage.Provider != tt.provider || response.Message.Usage.Model != "demo" {
				t.Fatalf("usage provenance missing: %#v", response.Message.Usage)
			}
		})
	}
}

func TestNativeHTTPAdapterDropsTransportControlHeaders(t *testing.T) {
	model, _ := NewModel("openai", "demo", WithBaseURL("https://provider.invalid"), WithProviderExtra(map[string]any{"headers": map[string]any{"Cookie": "secret", "Sec-Fetch-Site": "cross-site", "X-Trace": "ok"}}))
	model.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Cookie") != "" || r.Header.Get("Sec-Fetch-Site") != "" {
			t.Fatalf("forbidden headers escaped filter: %#v", r.Header)
		}
		if r.Header.Get("X-Trace") != "ok" {
			t.Fatalf("safe custom header missing: %#v", r.Header)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"choices":[{"message":{"content":"ok"}}]}`)), Request: r}, nil
	})}
	if _, err := model.Generate(context.Background(), []engine.Message{engine.UserMsg("hello")}, nil); err != nil {
		t.Fatal(err)
	}
}

func TestNativeHTTPAdapterClassifiesRateLimit(t *testing.T) {
	model, _ := NewModel("openai", "demo", WithBaseURL("https://provider.invalid"))
	model.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusTooManyRequests, Body: io.NopCloser(strings.NewReader("slow down")), Header: make(http.Header), Request: r}, nil
	})}
	_, err := model.Generate(context.Background(), []engine.Message{engine.UserMsg("hello")}, nil)
	if err == nil || !engine.IsFailoverEligible(err) || !strings.Contains(err.Error(), "429") {
		t.Fatalf("rate limit classification failed: %v", err)
	}
}
