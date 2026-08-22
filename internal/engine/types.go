// Package engine is Writing Workshop's provider-neutral agent runtime.
//
// It deliberately lives inside this repository: message semantics, tool
// execution, context projection and run control are product code rather than a
// renamed external dependency.
package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

type ContentType string

const (
	ContentText     ContentType = "text"
	ContentThinking ContentType = "thinking"
	ContentToolCall ContentType = "tool_call"
)

type ContentBlock struct {
	Type     ContentType `json:"type"`
	Text     string      `json:"text,omitempty"`
	Thinking string      `json:"thinking,omitempty"`
	ToolCall *ToolCall   `json:"tool_call,omitempty"`
	ToolName string      `json:"tool_name,omitempty"`
}

func TextBlock(text string) ContentBlock { return ContentBlock{Type: ContentText, Text: text} }
func ThinkingBlock(text string) ContentBlock {
	return ContentBlock{Type: ContentThinking, Thinking: text}
}
func ToolCallBlock(call ToolCall) ContentBlock {
	return ContentBlock{Type: ContentToolCall, ToolCall: &call}
}

type StopReason string

const (
	StopReasonStop    StopReason = "stop"
	StopReasonToolUse StopReason = "tool_use"
	StopReasonError   StopReason = "error"
	StopReasonAborted StopReason = "aborted"
)

type ToolCall struct {
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	Args             json.RawMessage `json:"args"`
	ArgsInvalid      bool            `json:"args_invalid,omitempty"`
	ArgsRawText      string          `json:"args_raw_text,omitempty"`
	ArgsParseError   string          `json:"args_parse_error,omitempty"`
	ThoughtSignature string          `json:"thought_signature,omitempty"`
}

type Cost struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	CacheRead  float64 `json:"cache_read"`
	CacheWrite float64 `json:"cache_write"`
	Total      float64 `json:"total"`
}

func (c *Cost) Add(other *Cost) {
	if c == nil || other == nil {
		return
	}
	c.Input += other.Input
	c.Output += other.Output
	c.CacheRead += other.CacheRead
	c.CacheWrite += other.CacheWrite
	c.Total += other.Total
}

type Usage struct {
	Provider    string `json:"provider,omitempty"`
	Model       string `json:"model,omitempty"`
	Input       int    `json:"input"`
	Output      int    `json:"output"`
	CacheRead   int    `json:"cache_read"`
	CacheWrite  int    `json:"cache_write"`
	TotalTokens int    `json:"total_tokens"`
	Cost        *Cost  `json:"cost,omitempty"`
}

func (u *Usage) Add(other *Usage) {
	if u == nil || other == nil {
		return
	}
	u.Input += other.Input
	u.Output += other.Output
	u.CacheRead += other.CacheRead
	u.CacheWrite += other.CacheWrite
	u.TotalTokens += other.TotalTokens
	if other.Cost != nil {
		if u.Cost == nil {
			u.Cost = &Cost{}
		}
		u.Cost.Add(other.Cost)
	}
}

type Message struct {
	Role       Role           `json:"role"`
	Content    []ContentBlock `json:"content"`
	StopReason StopReason     `json:"stop_reason,omitempty"`
	Usage      *Usage         `json:"usage,omitempty"`
	Metadata   map[string]any `json:"metadata,omitempty"`
	Timestamp  time.Time      `json:"timestamp"`
}

func (m Message) GetRole() Role           { return m.Role }
func (m Message) GetTimestamp() time.Time { return m.Timestamp }
func (m Message) ThinkingContent() string {
	var parts []string
	for _, block := range m.Content {
		if block.Type == ContentThinking && block.Thinking != "" {
			parts = append(parts, block.Thinking)
		}
	}
	return strings.Join(parts, "")
}
func (m Message) TextContent() string {
	var parts []string
	for _, block := range m.Content {
		if block.Type == ContentText && block.Text != "" {
			parts = append(parts, block.Text)
		}
	}
	return strings.Join(parts, "")
}
func (m Message) HasToolCalls() bool { return len(m.ToolCalls()) > 0 }
func (m Message) ToolCalls() []ToolCall {
	var calls []ToolCall
	for _, block := range m.Content {
		if block.Type == ContentToolCall && block.ToolCall != nil {
			calls = append(calls, *block.ToolCall)
		}
	}
	return calls
}
func (m Message) IsEmpty() bool { return len(m.Content) == 0 }

func message(role Role, text string) Message {
	return Message{Role: role, Content: []ContentBlock{TextBlock(text)}, Timestamp: time.Now()}
}
func SystemMsg(text string) Message { return message(RoleSystem, text) }
func UserMsg(text string) Message   { return message(RoleUser, text) }
func ToolResultMsg(id string, content json.RawMessage, failed bool) Message {
	meta := map[string]any{"tool_call_id": id, "is_error": failed}
	return Message{Role: RoleTool, Content: []ContentBlock{TextBlock(string(content))}, Metadata: meta, Timestamp: time.Now()}
}

type AgentMessage interface {
	GetRole() Role
	GetTimestamp() time.Time
	TextContent() string
	ThinkingContent() string
	HasToolCalls() bool
}

func CollectMessages(messages []AgentMessage) []Message {
	out := make([]Message, 0, len(messages))
	for _, item := range messages {
		if msg, ok := item.(Message); ok {
			out = append(out, msg)
		}
	}
	return out
}

func ToAgentMessages(messages []Message) []AgentMessage {
	out := make([]AgentMessage, len(messages))
	for i := range messages {
		out[i] = messages[i]
	}
	return out
}

type ToolSpec struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	Parameters   any    `json:"parameters"`
	DeferLoading bool   `json:"defer_loading,omitempty"`
	Strict       *bool  `json:"strict,omitempty"`
}

type Tool interface {
	Name() string
	Description() string
	Schema() map[string]any
	Execute(context.Context, json.RawMessage) (json.RawMessage, error)
}

type funcTool struct {
	name, description string
	schema            map[string]any
	execute           ToolExecuteFunc
}

func NewFuncTool(name, description string, schema map[string]any, execute ToolExecuteFunc) Tool {
	return &funcTool{name: name, description: description, schema: schema, execute: execute}
}
func (t *funcTool) Name() string           { return t.name }
func (t *funcTool) Description() string    { return t.description }
func (t *funcTool) Schema() map[string]any { return t.schema }
func (t *funcTool) Execute(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	return t.execute(ctx, raw)
}

type CallConfig struct {
	MaxTokens    int
	Thinking     ThinkingLevel
	JSONMode     bool
	ToolChoice   any
	SessionID    string
	ResponseSpec any
}
type CallOption func(*CallConfig)

func ResolveCallConfig(opts []CallOption) CallConfig {
	var cfg CallConfig
	for _, opt := range opts {
		opt(&cfg)
	}
	return cfg
}
func WithMaxTokens(tokens int) CallOption         { return func(c *CallConfig) { c.MaxTokens = tokens } }
func WithThinking(level ThinkingLevel) CallOption { return func(c *CallConfig) { c.Thinking = level } }
func WithJSONMode() CallOption                    { return func(c *CallConfig) { c.JSONMode = true } }
func WithToolChoice(choice any) CallOption        { return func(c *CallConfig) { c.ToolChoice = choice } }
func WithCallSessionID(id string) CallOption      { return func(c *CallConfig) { c.SessionID = id } }

type ChatModel interface {
	Generate(context.Context, []Message, []ToolSpec, ...CallOption) (*LLMResponse, error)
	GenerateStream(context.Context, []Message, []ToolSpec, ...CallOption) (<-chan StreamEvent, error)
	SupportsTools() bool
}

type LLMResponse struct{ Message Message }
type LLMRequest struct {
	Messages []Message
	Tools    []ToolSpec
}

type StreamEventType string

const (
	StreamEventTextDelta     StreamEventType = "text_delta"
	StreamEventThinkingDelta StreamEventType = "thinking_delta"
	StreamEventToolCallEnd   StreamEventType = "tool_call_end"
	StreamEventDone          StreamEventType = "done"
	StreamEventError         StreamEventType = "error"
)

type StreamEvent struct {
	Type              StreamEventType
	ContentIndex      int
	Delta             string
	Message           Message
	CompletedToolCall *ToolCall
	StopReason        StopReason
	Err               error
}

type ThinkingLevel string

const (
	ThinkingOff     ThinkingLevel = "off"
	ThinkingMinimal ThinkingLevel = "minimal"
	ThinkingLow     ThinkingLevel = "low"
	ThinkingMedium  ThinkingLevel = "medium"
	ThinkingHigh    ThinkingLevel = "high"
	ThinkingXHigh   ThinkingLevel = "xhigh"
	ThinkingMax     ThinkingLevel = "max"
)

func NormalizeThinkingLevel(level ThinkingLevel) ThinkingLevel {
	return ThinkingLevel(strings.ToLower(strings.TrimSpace(string(level))))
}

type SwappableModel struct {
	mu    sync.RWMutex
	model ChatModel
}

func NewSwappableModel(model ChatModel) *SwappableModel { return &SwappableModel{model: model} }
func (m *SwappableModel) Current() ChatModel            { m.mu.RLock(); defer m.mu.RUnlock(); return m.model }
func (m *SwappableModel) Swap(next ChatModel)           { m.mu.Lock(); m.model = next; m.mu.Unlock() }
func (m *SwappableModel) Generate(ctx context.Context, msgs []Message, tools []ToolSpec, opts ...CallOption) (*LLMResponse, error) {
	return m.Current().Generate(ctx, msgs, tools, opts...)
}
func (m *SwappableModel) GenerateStream(ctx context.Context, msgs []Message, tools []ToolSpec, opts ...CallOption) (<-chan StreamEvent, error) {
	return m.Current().GenerateStream(ctx, msgs, tools, opts...)
}
func (m *SwappableModel) SupportsTools() bool {
	return m.Current() != nil && m.Current().SupportsTools()
}

type ProviderError struct {
	Kind string
	Err  error
}

func (e *ProviderError) Error() string {
	if e.Err == nil {
		return e.Kind
	}
	return e.Kind + ": " + e.Err.Error()
}
func (e *ProviderError) Unwrap() error { return e.Err }

var ErrProviderStreamIdle = errors.New("provider stream idle")

func IsFailoverEligible(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) {
		return false
	}
	kind := FailoverReason(err)
	return kind == "rate_limit" || kind == "timeout" || kind == "stream_idle" || kind == "network"
}
func FailoverReason(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	if errors.Is(err, ErrProviderStreamIdle) {
		return "stream_idle"
	}
	var pe *ProviderError
	if errors.As(err, &pe) && pe.Kind != "" {
		return pe.Kind
	}
	text := strings.ToLower(err.Error())
	switch {
	case strings.Contains(text, "429"), strings.Contains(text, "rate limit"):
		return "rate_limit"
	case strings.Contains(text, "timeout"), strings.Contains(text, "deadline"):
		return "timeout"
	case strings.Contains(text, "connection"), strings.Contains(text, "network"):
		return "network"
	default:
		return "provider"
	}
}
func ClassifyProvider(err error) string { return FailoverReason(err) }
func IsStreamIdleMessage(text string) bool {
	return strings.Contains(strings.ToLower(text), "stream idle")
}

type ToolExecuteFunc func(context.Context, json.RawMessage) (json.RawMessage, error)
type ToolMiddleware func(context.Context, ToolCall, ToolExecuteFunc) (json.RawMessage, error)
type GateRequest struct {
	Tool      Tool
	Call      ToolCall
	ToolLabel string
	Preview   json.RawMessage
}
type GateDecision struct {
	Allowed bool
	Reason  string
}
type ToolGate func(context.Context, GateRequest) (*GateDecision, error)

type StopTrigger string
type StopInfo struct {
	TurnIndex int
	Message   Message
	Trigger   StopTrigger
}
type StopDecision struct {
	Allow         bool
	InjectMessage string
	Escalate      bool
}
type StopGuard func(context.Context, StopInfo) StopDecision

type ContextUsage struct {
	Tokens, ContextWindow int
	Percent               float64
	UsageTokens           int
	TrailingTokens        int
}
type ContextSnapshot struct {
	BaselineUsage, Usage *ContextUsage
	Scope                string
	TranscriptMessages   int
	ActiveMessages       int
	SummaryMessages      int
	ToolMessages         int
	ClearedToolResults   int
	TrimmedTextBlocks    int
	LastStrategy         string
	LastChanged          bool
	LastCompactedCount   int
	LastKeptCount        int
	LastSplitTurn        bool
}
type ContextProjection struct {
	Messages       []AgentMessage
	Usage          *ContextUsage
	CommitMessages []AgentMessage
	ShouldCommit   bool
}
type CompactReason string
type ContextCommitResult struct {
	Messages                  []AgentMessage
	Usage                     *ContextUsage
	Changed                   bool
	Strategy                  string
	CompactedCount, KeptCount int
	SplitTurn                 bool
}
type ContextRecoveryResult struct {
	View, CommitMessages      []AgentMessage
	Usage                     *ContextUsage
	Changed, ShouldCommit     bool
	Strategy                  string
	CompactedCount, KeptCount int
	SplitTurn                 bool
}
type ContextManager interface {
	Project(context.Context, []AgentMessage) (ContextProjection, error)
	Compact(context.Context, []AgentMessage, CompactReason) (ContextCommitResult, error)
	RecoverOverflow(context.Context, []AgentMessage, error) (ContextRecoveryResult, error)
	Sync([]AgentMessage)
	Usage() *ContextUsage
	Snapshot() *ContextSnapshot
}

type EventType string

const (
	EventTurnStart      EventType = "turn_start"
	EventMessageUpdate  EventType = "message_update"
	EventMessageEnd     EventType = "message_end"
	EventToolExecStart  EventType = "tool_exec_start"
	EventToolExecUpdate EventType = "tool_exec_update"
	EventToolExecEnd    EventType = "tool_exec_end"
	EventRetry          EventType = "retry"
	EventError          EventType = "error"
)

type DeltaKind string

const (
	DeltaText     DeltaKind = "text"
	DeltaThinking DeltaKind = "thinking"
	DeltaToolCall DeltaKind = "tool_call"
)

type ProgressPayloadKind string

const (
	ProgressContext     ProgressPayloadKind = "context"
	ProgressThinking    ProgressPayloadKind = "thinking"
	ProgressToolStart   ProgressPayloadKind = "tool_start"
	ProgressToolDelta   ProgressPayloadKind = "tool_delta"
	ProgressToolEnd     ProgressPayloadKind = "tool_end"
	ProgressToolError   ProgressPayloadKind = "tool_error"
	ProgressRetry       ProgressPayloadKind = "retry"
	ProgressTurnCounter ProgressPayloadKind = "turn_counter"
)

type ProgressPayload struct {
	Kind                                           ProgressPayloadKind `json:"kind"`
	Agent, Tool, Summary, Delta, Thinking, Message string
	Turn, Attempt, MaxRetries                      int
	IsError                                        bool
	Args, Meta                                     json.RawMessage
	DeltaKind                                      DeltaKind
}
type RetryInfo struct {
	Attempt, MaxRetries int
	Delay               time.Duration
	Err                 error
}
type Event struct {
	Type                    EventType
	Message                 AgentMessage
	Delta                   string
	DeltaKind               DeltaKind
	ToolID, Tool, ToolLabel string
	Args, Result            json.RawMessage
	Progress                *ProgressPayload
	IsError                 bool
	Err                     error
	RetryInfo               *RetryInfo
	UpdateKind              ToolExecUpdateKind
	Preview                 json.RawMessage
	ToolResults             []ToolResult
	NewMessages             []AgentMessage
	Summary                 *RunSummary
}

type ToolExecUpdateKind string

const (
	ToolExecUpdatePreview  ToolExecUpdateKind = "preview"
	ToolExecUpdateProgress ToolExecUpdateKind = "progress"
)

type ToolResult struct {
	ToolCallID, Tool string
	Result           json.RawMessage
	IsError          bool
}
type RunSummary struct {
	Turns, ToolCalls int
	StopReason       StopReason
	Usage            Usage
}

type AgentState struct {
	SystemPrompt     string
	Messages         []AgentMessage
	Tools            []Tool
	IsRunning        bool
	StreamMessage    AgentMessage
	PendingToolCalls map[string]struct{}
	TotalUsage       Usage
	Error            string
}
type InjectDisposition string
type InjectResult struct{ Disposition InjectDisposition }

func providerFailure(kind string, status int, body string) error {
	return &ProviderError{Kind: kind, Err: fmt.Errorf("HTTP %d: %s", status, strings.TrimSpace(body))}
}
