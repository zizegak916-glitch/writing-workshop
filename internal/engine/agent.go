package engine

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

var (
	ErrMaxTurns        = errors.New("max turns reached")
	ErrContextOverflow = errors.New("context overflow")
)

const (
	CompactReasonManual   CompactReason = "manual"
	CompactReasonOverflow CompactReason = "overflow"
	StopTriggerEndTurn    StopTrigger   = "end_turn"
	StopTriggerMaxTurns   StopTrigger   = "max_turns"

	InjectSteeredCurrentRun InjectDisposition = "steered_current_run"
	InjectQueuedNextRun     InjectDisposition = "queued_next_run"
)

type AgentOption func(*Agent)

type Agent struct {
	mu                 sync.RWMutex
	model              ChatModel
	systemPrompt       string
	tools              []Tool
	maxTurns           int
	maxRetries         int
	maxToolErrors      int
	toolsAreIdempotent bool
	onMessage          func(AgentMessage)
	contextManager     ContextManager
	stopGuard          StopGuard
	middlewares        []ToolMiddleware
	toolGate           ToolGate
	stopAfterTool      func(string, json.RawMessage) bool
	thinking           ThinkingLevel
	messages           []AgentMessage
	steering           []AgentMessage
	followups          []AgentMessage
	listeners          map[uint64]func(Event)
	nextListener       uint64
	running            bool
	cancel             context.CancelFunc
	done               chan struct{}
	streamMessage      AgentMessage
	pendingTools       map[string]struct{}
	totalUsage         Usage
	lastError          string
}

func NewAgent(opts ...AgentOption) *Agent {
	a := &Agent{maxTurns: 100, listeners: map[uint64]func(Event){}, pendingTools: map[string]struct{}{}, done: closedChan()}
	for _, opt := range opts {
		opt(a)
	}
	return a
}

func WithModel(model ChatModel) AgentOption      { return func(a *Agent) { a.model = model } }
func WithSystemPrompt(prompt string) AgentOption { return func(a *Agent) { a.systemPrompt = prompt } }
func WithTools(tools ...Tool) AgentOption {
	return func(a *Agent) { a.tools = append([]Tool(nil), tools...) }
}
func WithMaxTurns(n int) AgentOption {
	return func(a *Agent) {
		if n > 0 {
			a.maxTurns = n
		}
	}
}
func WithMaxRetries(n int) AgentOption {
	return func(a *Agent) {
		if n >= 0 {
			a.maxRetries = n
		}
	}
}
func WithMaxToolErrors(n int) AgentOption {
	return func(a *Agent) {
		if n >= 0 {
			a.maxToolErrors = n
		}
	}
}
func WithToolsAreIdempotent(v bool) AgentOption       { return func(a *Agent) { a.toolsAreIdempotent = v } }
func WithOnMessage(fn func(AgentMessage)) AgentOption { return func(a *Agent) { a.onMessage = fn } }
func WithContextManager(m ContextManager) AgentOption { return func(a *Agent) { a.contextManager = m } }
func WithStopGuard(g StopGuard) AgentOption           { return func(a *Agent) { a.stopGuard = g } }
func WithMiddlewares(mw ...ToolMiddleware) AgentOption {
	return func(a *Agent) { a.middlewares = append([]ToolMiddleware(nil), mw...) }
}
func WithToolGate(g ToolGate) AgentOption { return func(a *Agent) { a.toolGate = g } }

// WithStopAfterToolResult is used by the repository-owned sub-agent executor
// to end a delegated run after a terminal persistence tool succeeds.
func WithStopAfterToolResult(fn func(string, json.RawMessage) bool) AgentOption {
	return func(a *Agent) { a.stopAfterTool = fn }
}
func WithThinkingLevel(level ThinkingLevel) AgentOption { return func(a *Agent) { a.thinking = level } }

func (a *Agent) Prompt(ctx context.Context, input string) error {
	return a.PromptMessages(ctx, UserMsg(input))
}

func (a *Agent) PromptMessages(ctx context.Context, msgs ...AgentMessage) error {
	a.mu.Lock()
	if a.running {
		a.mu.Unlock()
		return errors.New("agent is already running")
	}
	if a.model == nil {
		a.mu.Unlock()
		return errors.New("agent model is not configured")
	}
	for _, msg := range msgs {
		a.messages = append(a.messages, msg)
	}
	callbacks := a.messageCallbacksLocked(msgs)
	runCtx, cancel := context.WithCancel(ctx)
	a.cancel = cancel
	a.running = true
	a.lastError = ""
	a.done = make(chan struct{})
	a.mu.Unlock()
	for _, fn := range callbacks {
		fn()
	}
	go a.run(runCtx)
	return nil
}

func (a *Agent) Continue(ctx context.Context) error { return a.PromptMessages(ctx) }

func (a *Agent) run(ctx context.Context) {
	defer func() {
		a.mu.Lock()
		a.running = false
		a.cancel = nil
		a.streamMessage = nil
		a.pendingTools = map[string]struct{}{}
		done := a.done
		a.mu.Unlock()
		close(done)
	}()

	toolErrors := 0
	for turn := 0; turn < a.maxTurns; turn++ {
		if ctx.Err() != nil {
			return
		}
		a.emit(Event{Type: EventTurnStart, Progress: &ProgressPayload{Kind: ProgressTurnCounter, Turn: turn + 1}})

		messages, tools, err := a.requestView(ctx)
		if err != nil {
			a.fail(err)
			return
		}
		msg, err := a.generate(ctx, messages, tools, turn)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				a.fail(err)
			}
			return
		}
		a.appendMessage(msg)
		a.emit(Event{Type: EventMessageEnd, Message: msg})

		calls := msg.ToolCalls()
		if len(calls) == 0 {
			if a.flushSteering() {
				continue
			}
			if a.stopGuard != nil {
				decision := a.stopGuard(ctx, StopInfo{TurnIndex: turn + 1, Message: msg, Trigger: StopTriggerEndTurn})
				if decision.Escalate {
					a.fail(errors.New("stop guard escalated"))
					return
				}
				if !decision.Allow && decision.InjectMessage != "" {
					a.appendMessage(UserMsg(decision.InjectMessage))
					continue
				}
			}
			if a.flushFollowups() {
				continue
			}
			return
		}

		stopAfterTools := false
		for _, call := range calls {
			result, failed := a.executeTool(ctx, call)
			a.appendMessage(ToolResultMsg(call.ID, result, failed))
			// Steering is flushed only after the tool result. This preserves the
			// provider-required assistant→tool adjacency while allowing Host
			// middleware to decide the next instruction synchronously.
			a.flushSteering()
			if failed {
				toolErrors++
				if a.maxToolErrors > 0 && toolErrors >= a.maxToolErrors {
					a.fail(fmt.Errorf("tool error limit reached: %s", call.Name))
					return
				}
			}
			a.mu.RLock()
			stopRule := a.stopAfterTool
			a.mu.RUnlock()
			if !failed && stopRule != nil && stopRule(call.Name, result) {
				stopAfterTools = true
			}
		}
		if stopAfterTools {
			return
		}
	}
	a.fail(ErrMaxTurns)
}

func (a *Agent) generate(ctx context.Context, messages []Message, tools []ToolSpec, turn int) (Message, error) {
	a.mu.RLock()
	model, retries, thinking := a.model, a.maxRetries, a.thinking
	a.mu.RUnlock()
	var last error
	for attempt := 0; attempt <= retries; attempt++ {
		stream, err := model.GenerateStream(ctx, messages, tools, WithThinking(thinking))
		if err != nil {
			last = err
			if attempt < retries && IsFailoverEligible(err) {
				a.emit(Event{Type: EventRetry, RetryInfo: &RetryInfo{Attempt: attempt + 1, MaxRetries: retries, Err: err}})
				continue
			}
			return Message{}, err
		}
		var final Message
		for event := range stream {
			switch event.Type {
			case StreamEventTextDelta:
				a.emit(Event{Type: EventMessageUpdate, Delta: event.Delta, DeltaKind: DeltaText, Message: event.Message})
			case StreamEventThinkingDelta:
				a.emit(Event{Type: EventMessageUpdate, Delta: event.Delta, DeltaKind: DeltaThinking, Message: event.Message})
			case StreamEventDone:
				final = event.Message
			case StreamEventError:
				last = event.Err
			}
		}
		if last != nil {
			if attempt < retries && IsFailoverEligible(last) {
				continue
			}
			return Message{}, last
		}
		if final.Role == "" {
			return Message{}, errors.New("model stream ended without a final message")
		}
		if final.Timestamp.IsZero() {
			final.Timestamp = time.Now()
		}
		return final, nil
	}
	return Message{}, last
}

func (a *Agent) executeTool(ctx context.Context, call ToolCall) (json.RawMessage, bool) {
	a.mu.RLock()
	all := append([]Tool(nil), a.tools...)
	gate := a.toolGate
	middleware := append([]ToolMiddleware(nil), a.middlewares...)
	a.mu.RUnlock()
	var tool Tool
	for _, candidate := range all {
		if candidate.Name() == call.Name {
			tool = candidate
			break
		}
	}
	if tool == nil {
		result := json.RawMessage(fmt.Sprintf(`{"error":"unknown tool %s"}`, call.Name))
		a.emit(Event{Type: EventToolExecEnd, ToolID: call.ID, Tool: call.Name, Result: result, IsError: true})
		return result, true
	}
	label := call.Name
	if named, ok := tool.(interface{ Label() string }); ok && named.Label() != "" {
		label = named.Label()
	}
	if gate != nil {
		decision, err := gate(ctx, GateRequest{Tool: tool, Call: call, ToolLabel: label})
		if err != nil {
			result := json.RawMessage(fmt.Sprintf(`{"error":%q}`, err.Error()))
			return result, true
		}
		if decision != nil && !decision.Allowed {
			result := json.RawMessage(fmt.Sprintf(`{"error":%q}`, decision.Reason))
			a.emit(Event{Type: EventToolExecEnd, ToolID: call.ID, Tool: call.Name, ToolLabel: label, Result: result, IsError: true})
			return result, true
		}
	}
	a.mu.Lock()
	a.pendingTools[call.ID] = struct{}{}
	a.mu.Unlock()
	a.emit(Event{Type: EventToolExecStart, ToolID: call.ID, Tool: call.Name, ToolLabel: label, Args: call.Args, Progress: &ProgressPayload{Kind: ProgressToolStart, Tool: call.Name, Args: call.Args}})
	next := tool.Execute
	for i := len(middleware) - 1; i >= 0; i-- {
		mw, downstream := middleware[i], next
		next = func(runCtx context.Context, args json.RawMessage) (json.RawMessage, error) {
			nested := call
			nested.Args = args
			return mw(runCtx, nested, downstream)
		}
	}
	result, err := next(ctx, call.Args)
	if result == nil {
		result = json.RawMessage("null")
	}
	a.mu.Lock()
	delete(a.pendingTools, call.ID)
	a.mu.Unlock()
	a.emit(Event{Type: EventToolExecEnd, ToolID: call.ID, Tool: call.Name, ToolLabel: label, Args: call.Args, Result: result, IsError: err != nil, Err: err, Progress: &ProgressPayload{Kind: chooseProgress(err), Tool: call.Name, IsError: err != nil, Meta: result}})
	if err != nil {
		wrapped, _ := json.Marshal(map[string]any{"error": err.Error()})
		return wrapped, true
	}
	return result, false
}

func chooseProgress(err error) ProgressPayloadKind {
	if err != nil {
		return ProgressToolError
	}
	return ProgressToolEnd
}

func (a *Agent) requestView(ctx context.Context) ([]Message, []ToolSpec, error) {
	a.mu.RLock()
	transcript := append([]AgentMessage(nil), a.messages...)
	system, mgr := a.systemPrompt, a.contextManager
	toolSet := append([]Tool(nil), a.tools...)
	a.mu.RUnlock()
	view := transcript
	if mgr != nil {
		projection, err := mgr.Project(ctx, transcript)
		if err != nil {
			return nil, nil, err
		}
		view = projection.Messages
		if projection.ShouldCommit {
			a.mu.Lock()
			a.messages = append([]AgentMessage(nil), projection.CommitMessages...)
			a.mu.Unlock()
		}
	}
	var messages []Message
	if converter, ok := mgr.(interface {
		ConvertToLLM([]AgentMessage) []Message
	}); ok {
		messages = converter.ConvertToLLM(view)
	} else {
		messages = CollectMessages(view)
	}
	if system != "" {
		messages = append([]Message{SystemMsg(system)}, messages...)
	}
	tools := make([]ToolSpec, 0, len(toolSet))
	for _, tool := range toolSet {
		spec := ToolSpec{Name: tool.Name(), Description: tool.Description(), Parameters: tool.Schema()}
		if strict, ok := tool.(interface{ StrictSchema() bool }); ok {
			v := strict.StrictSchema()
			spec.Strict = &v
		}
		tools = append(tools, spec)
	}
	return messages, tools, nil
}

func (a *Agent) appendMessage(msg AgentMessage) {
	a.mu.Lock()
	a.messages = append(a.messages, msg)
	if concrete, ok := msg.(Message); ok && concrete.Usage != nil {
		a.totalUsage.Add(concrete.Usage)
	}
	cb := a.onMessage
	a.mu.Unlock()
	if cb != nil {
		cb(msg)
	}
}

func (a *Agent) messageCallbacksLocked(msgs []AgentMessage) []func() {
	if a.onMessage == nil {
		return nil
	}
	callbacks := make([]func(), 0, len(msgs))
	for _, msg := range msgs {
		captured := msg
		callbacks = append(callbacks, func() { a.onMessage(captured) })
	}
	return callbacks
}

func (a *Agent) flushSteering() bool {
	a.mu.Lock()
	queued := a.steering
	a.steering = nil
	a.messages = append(a.messages, queued...)
	cb := a.onMessage
	a.mu.Unlock()
	if cb != nil {
		for _, msg := range queued {
			cb(msg)
		}
	}
	return len(queued) > 0
}
func (a *Agent) flushFollowups() bool {
	a.mu.Lock()
	queued := a.followups
	a.followups = nil
	a.messages = append(a.messages, queued...)
	cb := a.onMessage
	a.mu.Unlock()
	if cb != nil {
		for _, msg := range queued {
			cb(msg)
		}
	}
	return len(queued) > 0
}

func (a *Agent) fail(err error) {
	if err == nil {
		return
	}
	a.mu.Lock()
	a.lastError = err.Error()
	a.mu.Unlock()
	a.emit(Event{Type: EventError, Err: err})
}

func (a *Agent) Subscribe(fn func(Event)) func() {
	a.mu.Lock()
	id := a.nextListener
	a.nextListener++
	a.listeners[id] = fn
	a.mu.Unlock()
	return func() { a.mu.Lock(); delete(a.listeners, id); a.mu.Unlock() }
}
func (a *Agent) emit(ev Event) {
	a.mu.RLock()
	callbacks := make([]func(Event), 0, len(a.listeners))
	for _, fn := range a.listeners {
		callbacks = append(callbacks, fn)
	}
	a.mu.RUnlock()
	for _, fn := range callbacks {
		fn(ev)
	}
}

func (a *Agent) Steer(msg AgentMessage) {
	a.mu.Lock()
	if a.running {
		a.steering = append(a.steering, msg)
	} else {
		a.messages = append(a.messages, msg)
	}
	a.mu.Unlock()
}
func (a *Agent) FollowUp(msg AgentMessage) {
	a.mu.Lock()
	a.followups = append(a.followups, msg)
	a.mu.Unlock()
}
func (a *Agent) Inject(msg AgentMessage) (InjectResult, error) {
	return a.InjectContext(context.Background(), msg)
}
func (a *Agent) InjectContext(_ context.Context, msg AgentMessage) (InjectResult, error) {
	a.mu.Lock()
	if a.running {
		a.steering = append(a.steering, msg)
		a.mu.Unlock()
		return InjectResult{Disposition: InjectSteeredCurrentRun}, nil
	}
	a.messages = append(a.messages, msg)
	a.mu.Unlock()
	return InjectResult{Disposition: InjectQueuedNextRun}, nil
}

func (a *Agent) Abort() {
	a.mu.RLock()
	cancel := a.cancel
	a.mu.RUnlock()
	if cancel != nil {
		cancel()
	}
}
func (a *Agent) AbortSilent()                         { a.Abort() }
func (a *Agent) WaitForIdle()                         { a.mu.RLock(); done := a.done; a.mu.RUnlock(); <-done }
func (a *Agent) SetThinkingLevel(level ThinkingLevel) { a.mu.Lock(); a.thinking = level; a.mu.Unlock() }
func (a *Agent) SetContextWindow(n int) {
	a.mu.RLock()
	mgr := a.contextManager
	a.mu.RUnlock()
	if setter, ok := mgr.(interface{ SetContextWindow(int) }); ok {
		setter.SetContextWindow(n)
	}
}
func (a *Agent) SetModel(model ChatModel)      { a.mu.Lock(); a.model = model; a.mu.Unlock() }
func (a *Agent) SetSystemPrompt(prompt string) { a.mu.Lock(); a.systemPrompt = prompt; a.mu.Unlock() }
func (a *Agent) SetTools(tools ...Tool) {
	a.mu.Lock()
	a.tools = append([]Tool(nil), tools...)
	a.mu.Unlock()
}

func (a *Agent) State() AgentState {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return AgentState{SystemPrompt: a.systemPrompt, Messages: append([]AgentMessage(nil), a.messages...), Tools: append([]Tool(nil), a.tools...), IsRunning: a.running, StreamMessage: a.streamMessage, PendingToolCalls: cloneSet(a.pendingTools), TotalUsage: a.totalUsage, Error: a.lastError}
}
func (a *Agent) Messages() []AgentMessage { return a.State().Messages }
func (a *Agent) SetMessages(msgs []AgentMessage) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.running {
		return errors.New("cannot replace messages while running")
	}
	a.messages = append([]AgentMessage(nil), msgs...)
	return nil
}
func (a *Agent) ClearMessages()    { _ = a.SetMessages(nil) }
func (a *Agent) TotalUsage() Usage { a.mu.RLock(); defer a.mu.RUnlock(); return a.totalUsage }
func (a *Agent) ContextUsage() *ContextUsage {
	a.mu.RLock()
	mgr := a.contextManager
	a.mu.RUnlock()
	if mgr == nil {
		return nil
	}
	return mgr.Usage()
}
func (a *Agent) BaselineContextUsage() *ContextUsage {
	snap := a.ContextSnapshot()
	if snap == nil {
		return nil
	}
	return snap.BaselineUsage
}
func (a *Agent) ContextSnapshot() *ContextSnapshot {
	a.mu.RLock()
	mgr := a.contextManager
	a.mu.RUnlock()
	if mgr == nil {
		return nil
	}
	return mgr.Snapshot()
}
func (a *Agent) ExportMessages() []Message           { return CollectMessages(a.Messages()) }
func (a *Agent) ImportMessages(msgs []Message) error { return a.SetMessages(ToAgentMessages(msgs)) }
func (a *Agent) BuildLLMMessages() ([]Message, error) {
	messages, _, err := a.requestView(context.Background())
	return messages, err
}
func (a *Agent) BuildLLMTools() []ToolSpec {
	_, tools, _ := a.requestView(context.Background())
	return tools
}

func closedChan() chan struct{} { ch := make(chan struct{}); close(ch); return ch }
func cloneSet(in map[string]struct{}) map[string]struct{} {
	out := make(map[string]struct{}, len(in))
	for key := range in {
		out[key] = struct{}{}
	}
	return out
}
