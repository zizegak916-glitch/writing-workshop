package web

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/zizegak916-glitch/writing-workshop/internal/bootstrap"
	"github.com/zizegak916-glitch/writing-workshop/internal/engine"
)

type resolvedAIProvider struct {
	Key      string
	Model    string
	Config   bootstrap.ProviderConfig
	Protocol string
}

func (s *Server) resolveAIProvider(provider, modelName string) (resolvedAIProvider, error) {
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
		return resolvedAIProvider{}, fmt.Errorf("provider %q is not configured", provider)
	}
	if pc.APIKey == "" {
		pc.APIKey = providerAPIKeyFromEnv(provider)
	}
	if modelName == "" {
		return resolvedAIProvider{}, fmt.Errorf("provider %q is missing a model", provider)
	}
	return resolvedAIProvider{
		Key:      provider,
		Model:    modelName,
		Config:   pc,
		Protocol: inferProviderProtocol(provider, pc),
	}, nil
}

func inferProviderProtocol(provider string, pc bootstrap.ProviderConfig) string {
	if protocol := strings.ToLower(strings.TrimSpace(pc.Protocol)); protocol != "" && protocol != "auto" {
		switch protocol {
		case "openai-chat", "openai-responses", "anthropic", "ollama":
			return protocol
		}
	}
	base := strings.ToLower(strings.TrimSpace(pc.BaseURL))
	providerType := strings.ToLower(strings.TrimSpace(pc.Type))
	provider = strings.ToLower(strings.TrimSpace(provider))
	switch {
	case providerType == "anthropic", providerType == "claude", provider == "anthropic", provider == "claude",
		strings.Contains(base, "/messages"):
		return "anthropic"
	case providerType == "ollama", provider == "ollama", strings.Contains(base, "/api/chat"):
		return "ollama"
	case providerType == "responses", strings.Contains(base, "/responses"):
		return "openai-responses"
	default:
		return "openai-chat"
	}
}

func useRawProvider(provider resolvedAIProvider) bool {
	protocol := strings.ToLower(strings.TrimSpace(provider.Config.Protocol))
	authMode := strings.ToLower(strings.TrimSpace(provider.Config.AuthMode))
	baseURL := strings.ToLower(strings.TrimRight(strings.TrimSpace(provider.Config.BaseURL), "/"))
	if parsed, err := url.Parse(baseURL); err == nil {
		baseURL = strings.TrimRight(parsed.Path, "/")
	}
	if provider.Config.ExactEndpoint || len(provider.Config.ExtraBody) > 0 ||
		provider.Protocol == "openai-responses" ||
		strings.HasSuffix(baseURL, "/chat/completions") ||
		strings.HasSuffix(baseURL, "/responses") ||
		strings.HasSuffix(baseURL, "/messages") ||
		strings.HasSuffix(baseURL, "/api/chat") {
		return true
	}
	if protocol != "" && protocol != "auto" {
		return true
	}
	if authMode != "" && authMode != "auto" {
		return true
	}
	headers, _ := provider.Config.Extra["headers"].(map[string]any)
	return len(headers) > 0
}

func (s *Server) generateAI(ctx context.Context, provider, modelName string, messages []engine.Message) (string, *engine.Usage, string, string, error) {
	resolved, err := s.resolveAIProvider(provider, modelName)
	if err != nil {
		return "", nil, "", "", err
	}
	text, usage, err := s.generateResolvedAI(ctx, resolved, messages)
	return text, usage, resolved.Key, resolved.Model, err
}

func (s *Server) generateResolvedAI(ctx context.Context, resolved resolvedAIProvider, messages []engine.Message) (string, *engine.Usage, error) {
	if useRawProvider(resolved) {
		text, usage, err := rawProviderRequest(ctx, resolved, messages, false, nil)
		return text, usage, err
	}
	model, _, _, err := s.aiModel(resolved.Key, resolved.Model)
	if err != nil {
		return "", nil, err
	}
	resp, err := model.Generate(ctx, messages, nil)
	if err != nil {
		return "", nil, err
	}
	return resp.Message.TextContent(), resp.Message.Usage, nil
}

func applyAIRequestOptions(resolved resolvedAIProvider, req aiRequest) resolvedAIProvider {
	if strings.TrimSpace(resolved.Config.BaseURL) == "" {
		return resolved
	}
	extra := make(map[string]any, len(resolved.Config.ExtraBody)+2)
	for key, value := range resolved.Config.ExtraBody {
		extra[key] = value
	}
	if req.MaxTokens > 0 {
		maxTokens := min(req.MaxTokens, 65536)
		key := "max_tokens"
		if resolved.Protocol == "openai-responses" {
			key = "max_output_tokens"
		}
		if _, exists := extra[key]; !exists {
			extra[key] = maxTokens
		}
	}
	if req.Mode == "longbook-memory" && isOfficialDeepSeekProvider(resolved) {
		if _, exists := extra["thinking"]; !exists {
			extra["thinking"] = map[string]any{"type": "disabled"}
		}
	}
	resolved.Config.ExtraBody = extra
	return resolved
}

func isOfficialDeepSeekProvider(provider resolvedAIProvider) bool {
	if strings.EqualFold(strings.TrimSpace(provider.Key), "deepseek") {
		return true
	}
	u, err := url.Parse(strings.TrimSpace(provider.Config.BaseURL))
	return err == nil && strings.EqualFold(u.Hostname(), "api.deepseek.com")
}

func rawProviderRequest(ctx context.Context, provider resolvedAIProvider, messages []engine.Message, stream bool, onDelta func(string)) (string, *engine.Usage, error) {
	endpoint, err := rawProviderEndpoint(provider.Config.BaseURL, provider.Protocol, provider.Config.ExactEndpoint)
	if err != nil {
		return "", nil, err
	}
	body := rawProviderBody(provider, messages, stream)
	payload, err := json.Marshal(body)
	if err != nil {
		return "", nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", nil, err
	}
	headers, err := rawProviderHeaders(provider)
	if err != nil {
		return "", nil, err
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("request provider %q: %w", provider.Key, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
		return "", nil, fmt.Errorf("provider %q returned HTTP %d: %s", provider.Key, resp.StatusCode, upstreamMessage(data, resp.Status))
	}
	if stream && resp.Body != nil && !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "application/json") {
		return readRawProviderStream(resp.Body, onDelta)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, err
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		return "", nil, fmt.Errorf("provider %q returned invalid JSON: %w", provider.Key, err)
	}
	if err := rawProviderError(decoded); err != nil {
		return "", nil, err
	}
	text := rawResponseText(decoded)
	if strings.TrimSpace(text) == "" {
		return "", rawUsage(decoded), fmt.Errorf("provider %q: %s", provider.Key, rawMissingTextMessage(decoded, false, false, ""))
	}
	if onDelta != nil {
		onDelta(text)
	}
	return text, rawUsage(decoded), nil
}

func rawProviderEndpoint(baseURL, protocol string, exactEndpoint bool) (string, error) {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		return "", fmt.Errorf("provider Base URL is required")
	}
	u, err := url.Parse(baseURL)
	if err != nil || u.Scheme == "" || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("provider Base URL must be an http(s) URL")
	}
	if exactEndpoint {
		return u.String(), nil
	}
	path := strings.TrimRight(u.Path, "/")
	if strings.HasSuffix(path, "/chat/completions") || strings.HasSuffix(path, "/responses") ||
		strings.HasSuffix(path, "/messages") || strings.HasSuffix(path, "/api/chat") {
		u.Path = path
		return u.String(), nil
	}
	suffix := "chat/completions"
	switch protocol {
	case "openai-responses":
		suffix = "responses"
	case "anthropic":
		suffix = "messages"
	case "ollama":
		suffix = "api/chat"
	}
	if protocol == "ollama" {
		u.Path = path + "/" + suffix
	} else if path == "" || path == "/" {
		u.Path = "/v1/" + suffix
	} else {
		u.Path = path + "/" + suffix
	}
	return u.String(), nil
}

func rawProviderHeaders(provider resolvedAIProvider) (map[string]string, error) {
	headers := map[string]string{
		"Content-Type": "application/json",
		"Accept":       "application/json, text/event-stream, application/x-ndjson",
	}
	authMode := strings.ToLower(strings.TrimSpace(provider.Config.AuthMode))
	if authMode == "" || authMode == "auto" {
		if provider.Config.APIKey == "" {
			authMode = "none"
		} else if provider.Protocol == "anthropic" {
			authMode = "x-api-key"
		} else {
			authMode = "bearer"
		}
	}
	switch authMode {
	case "bearer":
		if provider.Config.APIKey == "" {
			return nil, fmt.Errorf("provider %q requires an API key for Bearer authentication", provider.Key)
		}
		headers["Authorization"] = "Bearer " + provider.Config.APIKey
	case "x-api-key":
		if provider.Config.APIKey == "" {
			return nil, fmt.Errorf("provider %q requires an API key for x-api-key authentication", provider.Key)
		}
		headers["x-api-key"] = provider.Config.APIKey
	case "none":
	default:
		return nil, fmt.Errorf("provider %q has unsupported auth mode %q", provider.Key, authMode)
	}
	if provider.Protocol == "anthropic" {
		headers["anthropic-version"] = "2023-06-01"
	}
	if extra, ok := provider.Config.Extra["headers"].(map[string]any); ok {
		for name, value := range extra {
			name = strings.TrimSpace(name)
			if isForbiddenCustomHeader(name) {
				return nil, fmt.Errorf("custom header %q is not allowed", name)
			}
			headers[name] = fmt.Sprint(value)
		}
	}
	return headers, nil
}

func isForbiddenCustomHeader(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	switch name {
	case "", "connection", "content-length", "cookie", "host", "origin", "referer", "transfer-encoding", "upgrade", "via":
		return true
	}
	return strings.HasPrefix(name, "proxy-") || strings.HasPrefix(name, "sec-")
}

func rawProviderBody(provider resolvedAIProvider, messages []engine.Message, stream bool) map[string]any {
	rawMessages := make([]map[string]any, 0, len(messages))
	system := make([]string, 0, 1)
	for _, message := range messages {
		text := message.TextContent()
		if message.Role == engine.RoleSystem && provider.Protocol == "anthropic" {
			system = append(system, text)
			continue
		}
		rawMessages = append(rawMessages, map[string]any{
			"role":    rawProviderRole(message.Role),
			"content": text,
		})
	}
	body := map[string]any{"model": provider.Model, "stream": stream}
	switch provider.Protocol {
	case "openai-responses":
		body["input"] = rawMessages
		body["max_output_tokens"] = 2000
	case "anthropic":
		body["messages"] = rawMessages
		body["max_tokens"] = 2000
		if len(system) > 0 {
			body["system"] = strings.Join(system, "\n\n")
		}
	default:
		body["messages"] = rawMessages
		if provider.Protocol == "openai-chat" {
			body["max_tokens"] = 2000
		}
	}
	for key, value := range provider.Config.ExtraBody {
		if key == "model" || key == "messages" || key == "input" || key == "stream" {
			continue
		}
		if value == nil {
			delete(body, key)
			continue
		}
		body[key] = value
	}
	return body
}

func rawProviderRole(role engine.Role) string {
	switch role {
	case engine.RoleAssistant:
		return "assistant"
	case engine.RoleSystem:
		return "system"
	case engine.RoleTool:
		return "tool"
	default:
		return "user"
	}
}

func readRawProviderStream(reader io.Reader, onDelta func(string)) (string, *engine.Usage, error) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64<<10), 8<<20)
	var text strings.Builder
	var usage *engine.Usage
	var sseData []string
	sawReasoning := false
	finishReason := ""
	consume := func(payload string) error {
		payload = strings.TrimSpace(payload)
		if payload == "" || payload == "[DONE]" {
			return nil
		}
		var decoded map[string]any
		if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
			return nil
		}
		if err := rawProviderError(decoded); err != nil {
			return err
		}
		if current := rawUsage(decoded); current != nil {
			usage = current
		}
		if rawResponseReasoningText(decoded) != "" {
			sawReasoning = true
		}
		if reason := rawFinishReason(decoded); reason != "" {
			finishReason = reason
		}
		delta := rawStreamDelta(decoded)
		if delta != "" {
			text.WriteString(delta)
			if onDelta != nil {
				onDelta(delta)
			}
		}
		if text.Len() == 0 {
			if final := rawResponseText(decoded); final != "" {
				text.WriteString(final)
				if onDelta != nil {
					onDelta(final)
				}
			}
		}
		return nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			if len(sseData) > 0 {
				if err := consume(strings.Join(sseData, "\n")); err != nil {
					return text.String(), usage, err
				}
				sseData = sseData[:0]
			}
			continue
		}
		if strings.HasPrefix(line, "data:") {
			sseData = append(sseData, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
			continue
		}
		if strings.HasPrefix(line, "event:") || strings.HasPrefix(line, ":") {
			continue
		}
		if err := consume(line); err != nil {
			return text.String(), usage, err
		}
	}
	if len(sseData) > 0 {
		if err := consume(strings.Join(sseData, "\n")); err != nil {
			return text.String(), usage, err
		}
	}
	if err := scanner.Err(); err != nil {
		return text.String(), usage, err
	}
	if strings.TrimSpace(text.String()) == "" {
		return "", usage, errors.New(rawMissingTextMessage(nil, true, sawReasoning, finishReason))
	}
	return text.String(), usage, nil
}

func rawStreamDelta(data map[string]any) string {
	if choices, ok := data["choices"].([]any); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]any); ok {
			if delta, ok := choice["delta"].(map[string]any); ok {
				return rawContentText(delta["content"])
			}
		}
	}
	eventType, _ := data["type"].(string)
	switch eventType {
	case "response.output_text.delta":
		return rawContentText(data["delta"])
	case "content_block_delta":
		if delta, ok := data["delta"].(map[string]any); ok {
			return rawContentText(delta["text"])
		}
	}
	if message, ok := data["message"].(map[string]any); ok {
		return rawContentText(message["content"])
	}
	return rawContentText(data["response"])
}

func rawResponseText(data map[string]any) string {
	if choices, ok := data["choices"].([]any); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]any); ok {
			if message, ok := choice["message"].(map[string]any); ok {
				if text := rawContentText(message["content"]); text != "" {
					return text
				}
			}
			if delta, ok := choice["delta"].(map[string]any); ok {
				if text := rawContentText(delta["content"]); text != "" {
					return text
				}
			}
			if text := rawContentText(choice["text"]); text != "" {
				return text
			}
		}
	}
	if text := rawContentText(data["output_text"]); text != "" {
		return text
	}
	if output, ok := data["output"].([]any); ok {
		var parts []string
		for _, item := range output {
			if object, ok := item.(map[string]any); ok {
				if content, ok := object["content"].([]any); ok {
					for _, block := range content {
						if value, ok := block.(map[string]any); ok {
							parts = append(parts, rawContentText(value["text"]))
						}
					}
				}
			}
		}
		if text := strings.Join(parts, ""); text != "" {
			return text
		}
	}
	if text := rawContentText(data["content"]); text != "" {
		return text
	}
	if message, ok := data["message"].(map[string]any); ok {
		if text := rawContentText(message["content"]); text != "" {
			return text
		}
	}
	for _, key := range []string{"response", "data", "result", "body", "completion"} {
		if nested, ok := data[key].(map[string]any); ok {
			if text := rawResponseText(nested); text != "" {
				return text
			}
		}
	}
	return rawContentText(data["response"])
}

func rawContentText(value any) string {
	switch value := value.(type) {
	case string:
		return value
	case []any:
		var parts []string
		for _, item := range value {
			switch item := item.(type) {
			case string:
				parts = append(parts, item)
			case map[string]any:
				parts = append(parts, rawContentText(firstAny(item["text"], item["content"])))
			}
		}
		return strings.Join(parts, "")
	case map[string]any:
		for _, key := range []string{"text", "content", "output_text", "value"} {
			if text := rawContentText(value[key]); text != "" {
				return text
			}
		}
		return ""
	default:
		return ""
	}
}

func rawResponseReasoningText(data map[string]any) string {
	if data == nil {
		return ""
	}
	if choices, ok := data["choices"].([]any); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]any); ok {
			for _, key := range []string{"message", "delta"} {
				if block, ok := choice[key].(map[string]any); ok {
					if text := rawContentText(block["reasoning_content"]); text != "" {
						return text
					}
				}
			}
		}
	}
	if text := rawContentText(data["reasoning_content"]); text != "" {
		return text
	}
	for _, key := range []string{"response", "data", "result", "body", "completion"} {
		if nested, ok := data[key].(map[string]any); ok {
			if text := rawResponseReasoningText(nested); text != "" {
				return text
			}
		}
	}
	return ""
}

func rawFinishReason(data map[string]any) string {
	if data == nil {
		return ""
	}
	if choices, ok := data["choices"].([]any); ok && len(choices) > 0 {
		if choice, ok := choices[0].(map[string]any); ok {
			if reason := strings.TrimSpace(fmt.Sprint(choice["finish_reason"])); reason != "" && reason != "<nil>" {
				return reason
			}
		}
	}
	for _, key := range []string{"finish_reason", "stop_reason"} {
		if reason := strings.TrimSpace(fmt.Sprint(data[key])); reason != "" && reason != "<nil>" {
			return reason
		}
	}
	for _, key := range []string{"response", "data", "result", "body", "completion"} {
		if nested, ok := data[key].(map[string]any); ok {
			if reason := rawFinishReason(nested); reason != "" {
				return reason
			}
		}
	}
	return ""
}

func rawMissingTextMessage(data map[string]any, streaming, sawReasoning bool, finishReason string) string {
	if data != nil {
		sawReasoning = sawReasoning || rawResponseReasoningText(data) != ""
		if finishReason == "" {
			finishReason = rawFinishReason(data)
		}
	}
	if sawReasoning {
		suffix := ""
		if finishReason != "" {
			suffix = fmt.Sprintf(" (finish_reason=%s)", finishReason)
		}
		return "model returned reasoning but no final text" + suffix + "; disable thinking or raise the output limit"
	}
	if finishReason == "length" {
		return "model reached the output limit before producing usable text (finish_reason=length)"
	}
	if streaming {
		return "provider stream ended without recognized final text; verify that the relay preserves content deltas"
	}
	return "provider returned no recognized text; verify the selected protocol and relay response envelope"
}

func rawUsage(data map[string]any) *engine.Usage {
	usage, ok := data["usage"].(map[string]any)
	if !ok {
		if response, ok := data["response"].(map[string]any); ok {
			usage, _ = response["usage"].(map[string]any)
		}
	}
	if len(usage) == 0 {
		if message, ok := data["message"].(map[string]any); ok {
			usage, _ = message["usage"].(map[string]any)
		}
	}
	if len(usage) == 0 {
		return nil
	}
	input := intAny(firstAny(usage["prompt_tokens"], usage["input_tokens"], usage["prompt_eval_count"]))
	output := intAny(firstAny(usage["completion_tokens"], usage["output_tokens"], usage["eval_count"]))
	total := intAny(usage["total_tokens"])
	if total == 0 {
		total = input + output
	}
	return &engine.Usage{Input: input, Output: output, TotalTokens: total}
}

func rawProviderError(data map[string]any) error {
	value, ok := data["error"]
	if !ok || value == nil {
		return nil
	}
	switch value := value.(type) {
	case string:
		return fmt.Errorf("provider error: %s", value)
	case map[string]any:
		return fmt.Errorf("provider error: %s", rawContentText(firstAny(value["message"], value["type"])))
	default:
		return fmt.Errorf("provider returned an error")
	}
}

func upstreamMessage(data []byte, fallback string) string {
	var decoded map[string]any
	if json.Unmarshal(data, &decoded) == nil {
		if value := decoded["error"]; value != nil {
			switch value := value.(type) {
			case string:
				return value
			case map[string]any:
				if message := rawContentText(value["message"]); message != "" {
					return message
				}
			}
		}
		if message := rawContentText(decoded["message"]); message != "" {
			return message
		}
	}
	if text := strings.TrimSpace(string(data)); text != "" {
		if len(text) > 600 {
			text = text[:600]
		}
		return text
	}
	return fallback
}

func firstAny(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func intAny(value any) int {
	switch value := value.(type) {
	case float64:
		return int(value)
	case int:
		return value
	case json.Number:
		n, _ := value.Int64()
		return int(n)
	default:
		return 0
	}
}
