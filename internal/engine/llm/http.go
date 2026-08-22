// Package llm provides Writing Workshop's native HTTP model adapters. It uses
// only net/http and the repository's own message protocol; no agent framework
// or vendor SDK is required.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	engine "github.com/zizegak916-glitch/writing-workshop/internal/engine"
)

type Support int

const (
	SupportUnknown Support = iota
	SupportNo
	SupportYes
)

type ModelInfo struct {
	Name         string   `json:"name"`
	Provider     string   `json:"provider"`
	Version      string   `json:"version"`
	MaxTokens    int      `json:"max_tokens"`
	ContextSize  int      `json:"context_size"`
	Capabilities []string `json:"capabilities"`
}
type ThinkingCapabilities struct {
	Supported, Disable          Support
	Efforts                     []engine.ThinkingLevel
	BudgetTokens, IncludeOutput Support
	Notes                       []string
}
type ToolCapabilities struct {
	Calls, ParallelCalls, StrictSchema, Choice, MultimodalResults Support
	RequiresAdjacency                                             bool
	RoundTripSignatures, HostedProviderTools                      Support
}
type StructuredCapabilities struct {
	JSONObject, JSONSchema, Strict Support
	PromptOnly                     bool
}
type StreamingCapabilities struct{ Supported, Usage, ReasoningDeltas, ToolCallDeltas, NativeResponses, IdleTimeout Support }
type UsageCapabilities struct{ InputTokens, OutputTokens, TotalTokens, ReasoningTokens, CacheReadTokens, CacheWriteTokens Support }
type Capabilities struct {
	Provider, Model string
	Thinking        ThinkingCapabilities
	Tools           ToolCapabilities
	Structured      StructuredCapabilities
	Streaming       StreamingCapabilities
	Usage           UsageCapabilities
}
type CapabilityProvider interface{ Capabilities() Capabilities }

type ThinkingPolicy struct{ Available []engine.ThinkingLevel }

func (p ThinkingPolicy) Allows(level engine.ThinkingLevel) bool {
	for _, item := range p.Available {
		if item == level {
			return true
		}
	}
	return false
}
func (p ThinkingPolicy) Resolve(level engine.ThinkingLevel) (engine.ThinkingLevel, bool) {
	level = engine.NormalizeThinkingLevel(level)
	if level == "" {
		return "", true
	}
	if p.Allows(level) {
		return level, true
	}
	if len(p.Available) > 0 {
		return p.Available[len(p.Available)-1], false
	}
	return "", false
}
func ThinkingPolicyFor(model any) ThinkingPolicy {
	if source, ok := model.(CapabilityProvider); ok {
		return source.Capabilities().ThinkingPolicy()
	}
	return ThinkingPolicy{Available: []engine.ThinkingLevel{engine.ThinkingOff, engine.ThinkingLow, engine.ThinkingMedium, engine.ThinkingHigh}}
}
func (c Capabilities) ThinkingPolicy() ThinkingPolicy {
	available := c.Thinking.Efforts
	if len(available) == 0 && c.Thinking.Supported != SupportNo {
		available = []engine.ThinkingLevel{engine.ThinkingOff, engine.ThinkingLow, engine.ThinkingMedium, engine.ThinkingHigh}
	}
	return ThinkingPolicy{Available: available}
}

type modelConfig struct {
	apiKey, baseURL             string
	idleTimeout, requestTimeout time.Duration
	providerExtra, extra        map[string]any
}
type ModelOption func(*modelConfig)

func WithAPIKey(v string) ModelOption { return func(c *modelConfig) { c.apiKey = v } }
func WithBaseURL(v string) ModelOption {
	return func(c *modelConfig) { c.baseURL = strings.TrimRight(strings.TrimSpace(v), "/") }
}
func WithStreamIdleTimeout(v time.Duration) ModelOption {
	return func(c *modelConfig) { c.idleTimeout = v }
}
func WithRequestTimeout(v time.Duration) ModelOption {
	return func(c *modelConfig) { c.requestTimeout = v }
}
func WithProviderExtra(v map[string]any) ModelOption {
	return func(c *modelConfig) { c.providerExtra = cloneMap(v) }
}
func WithExtra(v map[string]any) ModelOption { return func(c *modelConfig) { c.extra = cloneMap(v) } }

type HTTPModel struct {
	provider, model, baseURL, apiKey string
	client                           *http.Client
	providerExtra, extra             map[string]any
	idleTimeout                      time.Duration
}

var knownProviders = map[string]bool{
	"openai": true, "openrouter": true, "anthropic": true, "gemini": true,
	"google": true, "ollama": true, "deepseek": true, "groq": true,
	"mistral": true, "xai": true, "together": true, "siliconflow": true,
	"moonshot": true, "zhipu": true, "minimax": true, "bedrock": true,
}

func IsProviderRegistered(name string) bool {
	return knownProviders[strings.ToLower(strings.TrimSpace(name))]
}
func RegisteredProviders() []string {
	out := make([]string, 0, len(knownProviders))
	for name := range knownProviders {
		out = append(out, name)
	}
	return out
}

func NewModel(provider, model string, opts ...ModelOption) (*HTTPModel, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	model = strings.TrimSpace(model)
	if provider == "" || model == "" {
		return nil, errors.New("provider and model are required")
	}
	cfg := modelConfig{requestTimeout: 10 * time.Minute, idleTimeout: 5 * time.Minute}
	for _, opt := range opts {
		opt(&cfg)
	}
	if cfg.baseURL == "" {
		cfg.baseURL = defaultBaseURL(provider)
	}
	if _, err := url.ParseRequestURI(cfg.baseURL); err != nil {
		return nil, fmt.Errorf("invalid base URL: %w", err)
	}
	return &HTTPModel{provider: provider, model: model, baseURL: cfg.baseURL, apiKey: cfg.apiKey, client: &http.Client{Timeout: cfg.requestTimeout}, providerExtra: cfg.providerExtra, extra: cfg.extra, idleTimeout: cfg.idleTimeout}, nil
}

func (m *HTTPModel) Info() ModelInfo {
	return ModelInfo{Name: m.model, Provider: m.provider, Capabilities: []string{"chat", "tools", "http"}}
}
func (m *HTTPModel) ProviderName() string { return m.provider }
func (m *HTTPModel) SupportsTools() bool  { return true }
func (m *HTTPModel) Capabilities() Capabilities {
	return Capabilities{Provider: m.provider, Model: m.model, Thinking: ThinkingCapabilities{Supported: SupportYes, Disable: SupportYes, Efforts: []engine.ThinkingLevel{engine.ThinkingOff, engine.ThinkingLow, engine.ThinkingMedium, engine.ThinkingHigh}}, Tools: ToolCapabilities{Calls: SupportYes, ParallelCalls: SupportYes, Choice: SupportYes, RequiresAdjacency: true}, Structured: StructuredCapabilities{JSONObject: SupportYes, JSONSchema: SupportUnknown}, Streaming: StreamingCapabilities{Supported: SupportNo, Usage: SupportYes}, Usage: UsageCapabilities{InputTokens: SupportYes, OutputTokens: SupportYes, TotalTokens: SupportYes}}
}

func (m *HTTPModel) Generate(ctx context.Context, messages []engine.Message, tools []engine.ToolSpec, opts ...engine.CallOption) (*engine.LLMResponse, error) {
	config := engine.ResolveCallConfig(opts)
	switch m.protocol() {
	case "anthropic":
		return m.generateAnthropic(ctx, messages, tools, config)
	case "gemini":
		return m.generateGemini(ctx, messages, tools, config)
	case "ollama":
		return m.generateOllama(ctx, messages, tools, config)
	default:
		return m.generateOpenAI(ctx, messages, tools, config)
	}
}

func (m *HTTPModel) GenerateStream(ctx context.Context, messages []engine.Message, tools []engine.ToolSpec, opts ...engine.CallOption) (<-chan engine.StreamEvent, error) {
	// The native adapter keeps a single, deterministic decoder for every
	// protocol. It returns the final provider response through the stream API;
	// the web BYOK transport has its own true-SSE path for interactive Pages.
	out := make(chan engine.StreamEvent, 2)
	go func() {
		defer close(out)
		resp, err := m.Generate(ctx, messages, tools, opts...)
		if err != nil {
			out <- engine.StreamEvent{Type: engine.StreamEventError, Err: err}
			return
		}
		if text := resp.Message.TextContent(); text != "" {
			out <- engine.StreamEvent{Type: engine.StreamEventTextDelta, Delta: text, Message: resp.Message}
		}
		out <- engine.StreamEvent{Type: engine.StreamEventDone, Message: resp.Message, StopReason: resp.Message.StopReason}
	}()
	return out, nil
}

func (m *HTTPModel) protocol() string {
	switch m.provider {
	case "anthropic":
		return "anthropic"
	case "gemini", "google":
		return "gemini"
	case "ollama":
		return "ollama"
	default:
		return "openai"
	}
}

func (m *HTTPModel) generateOpenAI(ctx context.Context, messages []engine.Message, tools []engine.ToolSpec, cfg engine.CallConfig) (*engine.LLMResponse, error) {
	body := cloneMap(m.extra)
	body["model"] = m.model
	body["messages"] = openAIMessages(messages)
	body["stream"] = false
	if cfg.MaxTokens > 0 {
		body["max_tokens"] = cfg.MaxTokens
	}
	if cfg.JSONMode {
		body["response_format"] = map[string]any{"type": "json_object"}
	}
	if len(tools) > 0 {
		body["tools"] = openAITools(tools)
		if cfg.ToolChoice != nil {
			body["tool_choice"] = cfg.ToolChoice
		}
	}
	var raw struct {
		Choices []struct {
			Message struct {
				Content   any    `json:"content"`
				Reasoning string `json:"reasoning_content"`
				ToolCalls []struct {
					ID, Type string
					Function struct{ Name, Arguments string } `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
			Finish string `json:"finish_reason"`
		} `json:"choices"`
		Error any `json:"error"`
	}
	// Usage is decoded through a secondary map because compatible providers use
	// several different token field layouts.
	payload, err := m.request(ctx, http.MethodPost, endpoint(m.baseURL, "/chat/completions"), body, nil)
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, fmt.Errorf("decode OpenAI response: %w", err)
	}
	if len(raw.Choices) == 0 {
		return nil, errors.New("OpenAI-compatible response contains no choices")
	}
	choice := raw.Choices[0]
	blocks := []engine.ContentBlock{}
	if choice.Message.Reasoning != "" {
		blocks = append(blocks, engine.ThinkingBlock(choice.Message.Reasoning))
	}
	if text := normalizeContent(choice.Message.Content); text != "" {
		blocks = append(blocks, engine.TextBlock(text))
	}
	for _, call := range choice.Message.ToolCalls {
		args := json.RawMessage(call.Function.Arguments)
		invalid := !json.Valid(args)
		rawText := ""
		parseErr := ""
		if invalid {
			rawText = call.Function.Arguments
			args = json.RawMessage("{}")
			parseErr = "invalid JSON arguments"
		}
		blocks = append(blocks, engine.ToolCallBlock(engine.ToolCall{ID: call.ID, Name: call.Function.Name, Args: args, ArgsInvalid: invalid, ArgsRawText: rawText, ArgsParseError: parseErr}))
	}
	usage := decodeUsage(payload, "prompt_tokens", "completion_tokens", "total_tokens")
	m.stampUsage(usage)
	return &engine.LLMResponse{Message: engine.Message{Role: engine.RoleAssistant, Content: blocks, StopReason: finishReason(choice.Finish, len(choice.Message.ToolCalls) > 0), Usage: usage, Timestamp: time.Now()}}, nil
}

func (m *HTTPModel) generateAnthropic(ctx context.Context, messages []engine.Message, tools []engine.ToolSpec, cfg engine.CallConfig) (*engine.LLMResponse, error) {
	body := cloneMap(m.extra)
	body["model"] = m.model
	body["max_tokens"] = max(1024, cfg.MaxTokens)
	system, chat := anthropicMessages(messages)
	if system != "" {
		body["system"] = system
	}
	body["messages"] = chat
	if len(tools) > 0 {
		converted := make([]map[string]any, 0, len(tools))
		for _, tool := range tools {
			converted = append(converted, map[string]any{"name": tool.Name, "description": tool.Description, "input_schema": tool.Parameters})
		}
		body["tools"] = converted
	}
	headers := map[string]string{"anthropic-version": "2023-06-01"}
	payload, err := m.request(ctx, http.MethodPost, endpoint(m.baseURL, "/messages"), body, headers)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Content []struct {
			Type, Text, Thinking, ID, Name string
			Input                          json.RawMessage
		} `json:"content"`
		Stop  string `json:"stop_reason"`
		Usage struct {
			Input  int `json:"input_tokens"`
			Output int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, fmt.Errorf("decode Anthropic response: %w", err)
	}
	blocks := []engine.ContentBlock{}
	for _, item := range raw.Content {
		switch item.Type {
		case "text":
			blocks = append(blocks, engine.TextBlock(item.Text))
		case "thinking":
			blocks = append(blocks, engine.ThinkingBlock(item.Thinking))
		case "tool_use":
			blocks = append(blocks, engine.ToolCallBlock(engine.ToolCall{ID: item.ID, Name: item.Name, Args: item.Input}))
		}
	}
	usage := &engine.Usage{Provider: m.provider, Model: m.model, Input: raw.Usage.Input, Output: raw.Usage.Output, TotalTokens: raw.Usage.Input + raw.Usage.Output}
	return &engine.LLMResponse{Message: engine.Message{Role: engine.RoleAssistant, Content: blocks, StopReason: finishReason(raw.Stop, hasCalls(blocks)), Usage: usage, Timestamp: time.Now()}}, nil
}

func (m *HTTPModel) generateGemini(ctx context.Context, messages []engine.Message, tools []engine.ToolSpec, cfg engine.CallConfig) (*engine.LLMResponse, error) {
	body := cloneMap(m.extra)
	body["contents"] = geminiMessages(messages)
	generation := map[string]any{}
	if cfg.MaxTokens > 0 {
		generation["maxOutputTokens"] = cfg.MaxTokens
	}
	if len(generation) > 0 {
		body["generationConfig"] = generation
	}
	if len(tools) > 0 {
		declarations := make([]map[string]any, 0, len(tools))
		for _, tool := range tools {
			declarations = append(declarations, map[string]any{"name": tool.Name, "description": tool.Description, "parameters": tool.Parameters})
		}
		body["tools"] = []map[string]any{{"functionDeclarations": declarations}}
	}
	base := strings.TrimRight(m.baseURL, "/")
	path := fmt.Sprintf("/models/%s:generateContent", url.PathEscape(m.model))
	target := endpoint(base, path)
	payload, err := m.request(ctx, http.MethodPost, target, body, map[string]string{"x-goog-api-key": ""})
	if err != nil {
		return nil, err
	}
	var raw struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text         string `json:"text"`
					FunctionCall *struct {
						Name string          `json:"name"`
						Args json.RawMessage `json:"args"`
					} `json:"functionCall"`
				} `json:"parts"`
			} `json:"content"`
			Finish string `json:"finishReason"`
		} `json:"candidates"`
		Usage struct{ Prompt, Candidates, Total int } `json:"usageMetadata"`
	}
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, fmt.Errorf("decode Gemini response: %w", err)
	}
	if len(raw.Candidates) == 0 {
		return nil, errors.New("Gemini response contains no candidates")
	}
	blocks := []engine.ContentBlock{}
	for i, part := range raw.Candidates[0].Content.Parts {
		if part.Text != "" {
			blocks = append(blocks, engine.TextBlock(part.Text))
		}
		if part.FunctionCall != nil {
			blocks = append(blocks, engine.ToolCallBlock(engine.ToolCall{ID: fmt.Sprintf("gemini-%d-%d", time.Now().UnixNano(), i), Name: part.FunctionCall.Name, Args: part.FunctionCall.Args}))
		}
	}
	usage := decodeGeminiUsage(payload)
	m.stampUsage(usage)
	return &engine.LLMResponse{Message: engine.Message{Role: engine.RoleAssistant, Content: blocks, StopReason: finishReason(raw.Candidates[0].Finish, hasCalls(blocks)), Usage: usage, Timestamp: time.Now()}}, nil
}

func (m *HTTPModel) generateOllama(ctx context.Context, messages []engine.Message, tools []engine.ToolSpec, cfg engine.CallConfig) (*engine.LLMResponse, error) {
	body := cloneMap(m.extra)
	body["model"] = m.model
	body["messages"] = openAIMessages(messages)
	body["stream"] = false
	if len(tools) > 0 {
		body["tools"] = openAITools(tools)
	}
	if cfg.MaxTokens > 0 {
		options, _ := body["options"].(map[string]any)
		if options == nil {
			options = map[string]any{}
		}
		options["num_predict"] = cfg.MaxTokens
		body["options"] = options
	}
	payload, err := m.request(ctx, http.MethodPost, endpoint(m.baseURL, "/api/chat"), body, nil)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Message struct {
			Content, Thinking string
			ToolCalls         []struct {
				Function struct {
					Name      string
					Arguments json.RawMessage
				}
			} `json:"tool_calls"`
		} `json:"message"`
		PromptEvalCount, EvalCount int
	}
	if err := json.Unmarshal(payload, &raw); err != nil {
		return nil, fmt.Errorf("decode Ollama response: %w", err)
	}
	blocks := []engine.ContentBlock{}
	if raw.Message.Thinking != "" {
		blocks = append(blocks, engine.ThinkingBlock(raw.Message.Thinking))
	}
	if raw.Message.Content != "" {
		blocks = append(blocks, engine.TextBlock(raw.Message.Content))
	}
	for i, call := range raw.Message.ToolCalls {
		blocks = append(blocks, engine.ToolCallBlock(engine.ToolCall{ID: fmt.Sprintf("ollama-%d-%d", time.Now().UnixNano(), i), Name: call.Function.Name, Args: call.Function.Arguments}))
	}
	usage := decodeOllamaUsage(payload)
	m.stampUsage(usage)
	return &engine.LLMResponse{Message: engine.Message{Role: engine.RoleAssistant, Content: blocks, StopReason: finishReason("stop", hasCalls(blocks)), Usage: usage, Timestamp: time.Now()}}, nil
}

func (m *HTTPModel) request(ctx context.Context, method, target string, body map[string]any, headers map[string]string) ([]byte, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, target, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	m.applyAuth(req)
	for key, value := range headers {
		if value != "" {
			req.Header.Set(key, value)
		}
	}
	applyExtraHeaders(req, m.providerExtra)
	resp, err := m.client.Do(req)
	if err != nil {
		return nil, &engine.ProviderError{Kind: "network", Err: err}
	}
	defer resp.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		kind := "provider"
		if resp.StatusCode == 429 {
			kind = "rate_limit"
		} else if resp.StatusCode == 408 || resp.StatusCode == 504 {
			kind = "timeout"
		}
		return nil, &engine.ProviderError{Kind: kind, Err: fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))}
	}
	return payload, nil
}

func (m *HTTPModel) applyAuth(req *http.Request) {
	if m.apiKey == "" {
		return
	}
	switch m.protocol() {
	case "anthropic":
		req.Header.Set("x-api-key", m.apiKey)
	case "gemini":
		req.Header.Set("x-goog-api-key", m.apiKey)
	default:
		req.Header.Set("Authorization", "Bearer "+m.apiKey)
	}
}
func (m *HTTPModel) stampUsage(usage *engine.Usage) {
	if usage == nil {
		return
	}
	usage.Provider = m.provider
	usage.Model = m.model
}
func defaultBaseURL(provider string) string {
	switch provider {
	case "openai":
		return "https://api.openai.com/v1"
	case "openrouter":
		return "https://openrouter.ai/api/v1"
	case "anthropic":
		return "https://api.anthropic.com/v1"
	case "gemini", "google":
		return "https://generativelanguage.googleapis.com/v1beta"
	case "ollama":
		return "http://127.0.0.1:11434"
	case "deepseek":
		return "https://api.deepseek.com/v1"
	case "groq":
		return "https://api.groq.com/openai/v1"
	case "xai":
		return "https://api.x.ai/v1"
	default:
		return "https://api.openai.com/v1"
	}
}
func endpoint(base, path string) string {
	base = strings.TrimRight(base, "/")
	if strings.HasSuffix(base, path) {
		return base
	}
	if path == "/chat/completions" && strings.HasSuffix(base, "/chat") {
		return base + "/completions"
	}
	return base + path
}
func cloneMap(in map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range in {
		out[k] = v
	}
	return out
}
func applyExtraHeaders(req *http.Request, extra map[string]any) {
	headers, ok := extra["headers"].(map[string]any)
	if !ok {
		return
	}
	for key, value := range headers {
		if isForbiddenHeader(key) {
			continue
		}
		req.Header.Set(key, fmt.Sprint(value))
	}
}
func isForbiddenHeader(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	switch name {
	case "", "connection", "content-length", "cookie", "host", "origin", "referer", "transfer-encoding", "upgrade", "via":
		return true
	}
	return strings.HasPrefix(name, "proxy-") || strings.HasPrefix(name, "sec-")
}
func openAIMessages(messages []engine.Message) []map[string]any {
	out := make([]map[string]any, 0, len(messages))
	for _, msg := range messages {
		item := map[string]any{"role": string(msg.Role)}
		if msg.Role == engine.RoleTool {
			item["content"] = msg.TextContent()
			if id, ok := msg.Metadata["tool_call_id"].(string); ok {
				item["tool_call_id"] = id
			}
			out = append(out, item)
			continue
		}
		item["content"] = msg.TextContent()
		calls := msg.ToolCalls()
		if len(calls) > 0 {
			toolCalls := make([]map[string]any, 0, len(calls))
			for _, call := range calls {
				toolCalls = append(toolCalls, map[string]any{"id": call.ID, "type": "function", "function": map[string]any{"name": call.Name, "arguments": string(call.Args)}})
			}
			item["tool_calls"] = toolCalls
		}
		out = append(out, item)
	}
	return out
}
func openAITools(tools []engine.ToolSpec) []map[string]any {
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		fn := map[string]any{"name": tool.Name, "description": tool.Description, "parameters": tool.Parameters}
		if tool.Strict != nil {
			fn["strict"] = *tool.Strict
		}
		out = append(out, map[string]any{"type": "function", "function": fn})
	}
	return out
}
func anthropicMessages(messages []engine.Message) (string, []map[string]any) {
	var system []string
	out := []map[string]any{}
	for _, msg := range messages {
		if msg.Role == engine.RoleSystem {
			system = append(system, msg.TextContent())
			continue
		}
		role := string(msg.Role)
		if role == "tool" {
			role = "user"
		}
		content := []map[string]any{}
		if msg.Role == engine.RoleTool {
			id, _ := msg.Metadata["tool_call_id"].(string)
			content = append(content, map[string]any{"type": "tool_result", "tool_use_id": id, "content": msg.TextContent()})
		} else {
			if text := msg.TextContent(); text != "" {
				content = append(content, map[string]any{"type": "text", "text": text})
			}
			for _, call := range msg.ToolCalls() {
				var input any
				_ = json.Unmarshal(call.Args, &input)
				content = append(content, map[string]any{"type": "tool_use", "id": call.ID, "name": call.Name, "input": input})
			}
		}
		out = append(out, map[string]any{"role": role, "content": content})
	}
	return strings.Join(system, "\n\n"), out
}
func geminiMessages(messages []engine.Message) []map[string]any {
	out := []map[string]any{}
	for _, msg := range messages {
		role := "user"
		if msg.Role == engine.RoleAssistant {
			role = "model"
		}
		parts := []map[string]any{}
		if text := msg.TextContent(); text != "" {
			parts = append(parts, map[string]any{"text": text})
		}
		for _, call := range msg.ToolCalls() {
			var args any
			_ = json.Unmarshal(call.Args, &args)
			parts = append(parts, map[string]any{"functionCall": map[string]any{"name": call.Name, "args": args}})
		}
		if len(parts) > 0 {
			out = append(out, map[string]any{"role": role, "parts": parts})
		}
	}
	return out
}
func normalizeContent(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case []any:
		var parts []string
		for _, item := range x {
			if m, ok := item.(map[string]any); ok {
				if text, ok := m["text"].(string); ok {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "")
	default:
		return ""
	}
}
func finishReason(raw string, tools bool) engine.StopReason {
	if tools || strings.Contains(strings.ToLower(raw), "tool") {
		return engine.StopReasonToolUse
	}
	return engine.StopReasonStop
}
func hasCalls(blocks []engine.ContentBlock) bool {
	for _, b := range blocks {
		if b.Type == engine.ContentToolCall {
			return true
		}
	}
	return false
}
func decodeUsage(payload []byte, inKey, outKey, totalKey string) *engine.Usage {
	var root map[string]any
	_ = json.Unmarshal(payload, &root)
	m, _ := root["usage"].(map[string]any)
	in := number(m[inKey])
	out := number(m[outKey])
	total := number(m[totalKey])
	if total == 0 {
		total = in + out
	}
	return &engine.Usage{Input: in, Output: out, TotalTokens: total}
}
func decodeGeminiUsage(payload []byte) *engine.Usage {
	var root map[string]any
	_ = json.Unmarshal(payload, &root)
	m, _ := root["usageMetadata"].(map[string]any)
	in := number(m["promptTokenCount"])
	out := number(m["candidatesTokenCount"])
	total := number(m["totalTokenCount"])
	if total == 0 {
		total = in + out
	}
	return &engine.Usage{Input: in, Output: out, TotalTokens: total}
}
func decodeOllamaUsage(payload []byte) *engine.Usage {
	var root map[string]any
	_ = json.Unmarshal(payload, &root)
	in := number(root["prompt_eval_count"])
	out := number(root["eval_count"])
	return &engine.Usage{Input: in, Output: out, TotalTokens: in + out}
}
func number(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case json.Number:
		i, _ := n.Int64()
		return int(i)
	default:
		return 0
	}
}
