// Package context implements Writing Workshop's context projection and
// compaction pipeline. It is intentionally provider-neutral and keeps the
// transcript separate from the prompt view so a compression failure never
// destroys the user's conversation history.
package context

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	engine "github.com/zizegak916-glitch/writing-workshop/internal/engine"
)

type Budget struct {
	Tokens    int
	Window    int
	Threshold int
	Reserve   int
}

type SummaryInfo struct {
	TokensBefore   int
	TokensAfter    int
	MessagesBefore int
	MessagesAfter  int
	CompactedCount int
	KeptCount      int
	IsSplitTurn    bool
	IsIncremental  bool
	SummaryLen     int
	Duration       time.Duration
	ReadFiles      []string
	ModifiedFiles  []string
}

type StrategyResult struct {
	Applied     bool
	TokensSaved int
	Name        string
	Info        *SummaryInfo
}

type Strategy interface {
	Name() string
	Apply(context.Context, []engine.AgentMessage, []engine.AgentMessage, Budget) ([]engine.AgentMessage, StrategyResult, error)
}

type forceStrategy interface {
	ForceApply(context.Context, []engine.AgentMessage, []engine.AgentMessage, Budget) ([]engine.AgentMessage, StrategyResult, error)
}

type ContextSummary struct {
	Summary       string
	TokensBefore  int
	ReadFiles     []string
	ModifiedFiles []string
	Timestamp     time.Time
}

func (c ContextSummary) GetRole() engine.Role    { return engine.RoleSystem }
func (c ContextSummary) GetTimestamp() time.Time { return c.Timestamp }
func (c ContextSummary) TextContent() string     { return c.Summary }
func (c ContextSummary) ThinkingContent() string { return "" }
func (c ContextSummary) HasToolCalls() bool      { return false }

func EstimateTokens(msg engine.AgentMessage) int {
	if msg == nil {
		return 0
	}
	// A provider-neutral estimate cannot exactly match every tokenizer. Four
	// UTF-8 bytes per token is stable enough for projection; the configured
	// reserve is the deliberate safety margin.
	text := msg.TextContent() + msg.ThinkingContent()
	bytes := len(text)
	estimate := (bytes + 3) / 4
	return estimate + 8
}

func EstimateTotal(msgs []engine.AgentMessage) int {
	total := 0
	for _, msg := range msgs {
		total += EstimateTokens(msg)
	}
	return total
}

func ContextConvertToLLM(msgs []engine.AgentMessage) []engine.Message {
	out := make([]engine.Message, 0, len(msgs))
	for _, item := range msgs {
		switch msg := item.(type) {
		case engine.Message:
			out = append(out, msg)
		case ContextSummary:
			out = append(out, engine.SystemMsg("<context-summary>\n"+msg.Summary+"\n</context-summary>"))
		}
	}
	return out
}

func ContextEstimateAdapter(msgs []engine.AgentMessage) (int, int, int) {
	tokens := EstimateTotal(msgs)
	return tokens, 0, tokens
}

type EngineConfig struct {
	ContextWindow          int
	ReserveTokens          int
	Strategies             []Strategy
	CommitOnProject        bool
	OnProject              func(RewriteEvent)
	OnRecover              func(RewriteEvent)
	MaxConsecutiveFailures int
}

type RewriteEvent struct {
	Reason       string
	Strategy     string
	Changed      bool
	Committed    bool
	TokensBefore int
	TokensAfter  int
	Info         *SummaryInfo
	Steps        []RewriteStep
	Failures     int
}

type RewriteStep struct {
	Name         string
	Applied      bool
	TokensBefore int
	TokensAfter  int
}

type ContextEngine struct {
	mu              sync.RWMutex
	window          int
	reserve         int
	strategies      []Strategy
	commitOnProject bool
	onProject       func(RewriteEvent)
	onRecover       func(RewriteEvent)
	maxFailures     int
	failures        int
	baseline        []engine.AgentMessage
	active          []engine.AgentMessage
	snapshot        engine.ContextSnapshot
}

func NewEngine(cfg EngineConfig) *ContextEngine {
	if cfg.ContextWindow <= 0 {
		cfg.ContextWindow = 128000
	}
	if cfg.ReserveTokens <= 0 {
		cfg.ReserveTokens = max(4096, cfg.ContextWindow/10)
	}
	if cfg.MaxConsecutiveFailures <= 0 {
		cfg.MaxConsecutiveFailures = 3
	}
	return &ContextEngine{
		window: cfg.ContextWindow, reserve: cfg.ReserveTokens,
		strategies:      append([]Strategy(nil), cfg.Strategies...),
		commitOnProject: cfg.CommitOnProject, onProject: cfg.OnProject,
		onRecover: cfg.OnRecover, maxFailures: cfg.MaxConsecutiveFailures,
	}
}

func NewDefaultEngine(model engine.ChatModel, contextWindow int) *ContextEngine {
	return NewEngine(EngineConfig{ContextWindow: contextWindow, Strategies: []Strategy{
		NewToolResultMicrocompact(ToolResultMicrocompactConfig{}),
		NewLightTrim(LightTrimConfig{}),
		NewFullSummary(FullSummaryConfig{Model: model}),
	}})
}

func (e *ContextEngine) SetProjectHook(fn func(RewriteEvent)) {
	e.mu.Lock()
	e.onProject = fn
	e.mu.Unlock()
}
func (e *ContextEngine) SetRecoverHook(fn func(RewriteEvent)) {
	e.mu.Lock()
	e.onRecover = fn
	e.mu.Unlock()
}
func (e *ContextEngine) SetContextWindow(n int) {
	if n > 0 {
		e.mu.Lock()
		e.window = n
		e.mu.Unlock()
	}
}
func (e *ContextEngine) SetReserveTokens(n int) {
	if n >= 0 {
		e.mu.Lock()
		e.reserve = n
		e.mu.Unlock()
	}
}
func (e *ContextEngine) ContextWindow() int { e.mu.RLock(); defer e.mu.RUnlock(); return e.window }
func (e *ContextEngine) ConsecutiveFailures() int {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.failures
}

func (e *ContextEngine) Project(ctx context.Context, msgs []engine.AgentMessage) (engine.ContextProjection, error) {
	view, event, err := e.rewrite(ctx, msgs, false, "project")
	if err != nil {
		return engine.ContextProjection{}, err
	}
	e.mu.Lock()
	e.baseline = cloneMessages(msgs)
	e.active = cloneMessages(view)
	e.updateSnapshot(event)
	commit := event.Changed && e.commitOnProject
	if commit {
		e.baseline = cloneMessages(view)
	}
	hook := e.onProject
	e.mu.Unlock()
	if event.Changed && hook != nil {
		event.Committed = commit
		hook(event)
	}
	return engine.ContextProjection{Messages: view, Usage: usage(view, e.ContextWindow()), CommitMessages: view, ShouldCommit: commit}, nil
}

func (e *ContextEngine) Compact(ctx context.Context, msgs []engine.AgentMessage, _ engine.CompactReason) (engine.ContextCommitResult, error) {
	view, event, err := e.rewrite(ctx, msgs, true, "compact")
	if err != nil {
		return engine.ContextCommitResult{}, err
	}
	e.Sync(view)
	return engine.ContextCommitResult{Messages: view, Usage: usage(view, e.ContextWindow()), Changed: event.Changed, Strategy: event.Strategy, CompactedCount: infoCompacted(event.Info), KeptCount: infoKept(event.Info), SplitTurn: infoSplit(event.Info)}, nil
}

func (e *ContextEngine) RecoverOverflow(ctx context.Context, msgs []engine.AgentMessage, _ error) (engine.ContextRecoveryResult, error) {
	view, event, err := e.rewrite(ctx, msgs, true, "overflow")
	if err != nil {
		return engine.ContextRecoveryResult{}, err
	}
	e.Sync(view)
	e.mu.RLock()
	hook := e.onRecover
	e.mu.RUnlock()
	if event.Changed && hook != nil {
		event.Committed = true
		hook(event)
	}
	return engine.ContextRecoveryResult{View: view, CommitMessages: view, Usage: usage(view, e.ContextWindow()), Changed: event.Changed, ShouldCommit: event.Changed, Strategy: event.Strategy, CompactedCount: infoCompacted(event.Info), KeptCount: infoKept(event.Info), SplitTurn: infoSplit(event.Info)}, nil
}

func (e *ContextEngine) rewrite(ctx context.Context, msgs []engine.AgentMessage, force bool, reason string) ([]engine.AgentMessage, RewriteEvent, error) {
	e.mu.RLock()
	window, reserve, failures, limit := e.window, e.reserve, e.failures, e.maxFailures
	strategies := append([]Strategy(nil), e.strategies...)
	e.mu.RUnlock()
	before := EstimateTotal(msgs)
	event := RewriteEvent{Reason: reason, TokensBefore: before, TokensAfter: before}
	if !force && failures >= limit {
		event.Reason = "circuit_breaker"
		event.Failures = failures
		return cloneMessages(msgs), event, nil
	}
	threshold := max(1, window-reserve)
	view := cloneMessages(msgs)
	budget := Budget{Tokens: before, Window: window, Threshold: threshold, Reserve: reserve}
	for _, strategy := range strategies {
		if ctx.Err() != nil {
			return nil, event, ctx.Err()
		}
		stepBefore := EstimateTotal(view)
		var next []engine.AgentMessage
		var result StrategyResult
		var err error
		if force {
			if forced, ok := strategy.(forceStrategy); ok {
				next, result, err = forced.ForceApply(ctx, msgs, view, budget)
			} else {
				next, result, err = strategy.Apply(ctx, msgs, view, Budget{Tokens: max(stepBefore, threshold+1), Window: window, Threshold: threshold, Reserve: reserve})
			}
		} else {
			next, result, err = strategy.Apply(ctx, msgs, view, Budget{Tokens: stepBefore, Window: window, Threshold: threshold, Reserve: reserve})
		}
		if err != nil {
			e.mu.Lock()
			e.failures++
			e.mu.Unlock()
			return nil, event, fmt.Errorf("context strategy %s: %w", strategy.Name(), err)
		}
		if next != nil {
			view = next
		}
		stepAfter := EstimateTotal(view)
		event.Steps = append(event.Steps, RewriteStep{Name: strategy.Name(), Applied: result.Applied, TokensBefore: stepBefore, TokensAfter: stepAfter})
		if result.Applied {
			event.Changed = true
			event.Strategy = result.Name
			event.Info = result.Info
		}
		budget.Tokens = stepAfter
		if stepAfter <= threshold {
			break
		}
	}
	event.TokensAfter = EstimateTotal(view)
	e.mu.Lock()
	e.failures = 0
	e.mu.Unlock()
	return view, event, nil
}

func (e *ContextEngine) Sync(msgs []engine.AgentMessage) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.baseline = cloneMessages(msgs)
	e.active = cloneMessages(msgs)
	e.updateSnapshot(RewriteEvent{})
}

func (e *ContextEngine) Usage() *engine.ContextUsage {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return usage(e.active, e.window)
}
func (e *ContextEngine) Snapshot() *engine.ContextSnapshot {
	e.mu.RLock()
	defer e.mu.RUnlock()
	copy := e.snapshot
	copy.BaselineUsage = usage(e.baseline, e.window)
	copy.Usage = usage(e.active, e.window)
	return &copy
}
func (e *ContextEngine) ConvertToLLM(msgs []engine.AgentMessage) []engine.Message {
	return ContextConvertToLLM(msgs)
}
func (e *ContextEngine) EstimateContext(msgs []engine.AgentMessage) (int, int, int) {
	return ContextEstimateAdapter(msgs)
}

func (e *ContextEngine) updateSnapshot(ev RewriteEvent) {
	e.snapshot = engine.ContextSnapshot{Scope: "native", TranscriptMessages: len(e.baseline), ActiveMessages: len(e.active), LastStrategy: ev.Strategy, LastChanged: ev.Changed}
	for _, msg := range e.active {
		switch value := msg.(type) {
		case ContextSummary:
			e.snapshot.SummaryMessages++
		case engine.Message:
			if value.Role == engine.RoleTool {
				e.snapshot.ToolMessages++
			}
		}
	}
	if ev.Info != nil {
		e.snapshot.LastCompactedCount = ev.Info.CompactedCount
		e.snapshot.LastKeptCount = ev.Info.KeptCount
		e.snapshot.LastSplitTurn = ev.Info.IsSplitTurn
	}
}

type LightTrimConfig struct{ KeepRecent, TextThreshold, PreserveHead, PreserveTail int }
type LightTrimStrategy struct{ cfg LightTrimConfig }

func NewLightTrim(cfg LightTrimConfig) *LightTrimStrategy {
	if cfg.KeepRecent <= 0 {
		cfg.KeepRecent = 8
	}
	if cfg.TextThreshold <= 0 {
		cfg.TextThreshold = 12000
	}
	if cfg.PreserveHead <= 0 {
		cfg.PreserveHead = 1200
	}
	if cfg.PreserveTail <= 0 {
		cfg.PreserveTail = 1200
	}
	return &LightTrimStrategy{cfg: cfg}
}
func (s *LightTrimStrategy) Name() string { return "light_trim" }
func (s *LightTrimStrategy) Apply(_ context.Context, _ []engine.AgentMessage, view []engine.AgentMessage, budget Budget) ([]engine.AgentMessage, StrategyResult, error) {
	if budget.Tokens <= budget.Threshold {
		return view, StrategyResult{Name: s.Name()}, nil
	}
	out := cloneMessages(view)
	changed := false
	limit := max(0, len(out)-s.cfg.KeepRecent)
	for i := 0; i < limit; i++ {
		msg, ok := out[i].(engine.Message)
		if !ok {
			continue
		}
		for j, block := range msg.Content {
			if block.Type != engine.ContentText || len([]rune(block.Text)) <= s.cfg.TextThreshold {
				continue
			}
			r := []rune(block.Text)
			head, tail := min(s.cfg.PreserveHead, len(r)), min(s.cfg.PreserveTail, len(r))
			msg.Content[j].Text = string(r[:head]) + "\n…[本地上下文裁剪]…\n" + string(r[len(r)-tail:])
			changed = true
		}
		out[i] = msg
	}
	after := EstimateTotal(out)
	return out, StrategyResult{Applied: changed, TokensSaved: max(0, budget.Tokens-after), Name: s.Name()}, nil
}

type ToolClassifier func(string) bool
type ToolResultMicrocompactConfig struct {
	Classifier     ToolClassifier
	KeepRecent     int
	ClearedMessage string
	IdleThreshold  time.Duration
}
type ToolResultMicrocompactStrategy struct{ cfg ToolResultMicrocompactConfig }

func NewToolResultMicrocompact(cfg ToolResultMicrocompactConfig) *ToolResultMicrocompactStrategy {
	if cfg.KeepRecent <= 0 {
		cfg.KeepRecent = 4
	}
	if cfg.ClearedMessage == "" {
		cfg.ClearedMessage = "[较早的工具结果已压缩；事实已保存在项目数据中]"
	}
	return &ToolResultMicrocompactStrategy{cfg: cfg}
}
func (s *ToolResultMicrocompactStrategy) Name() string { return "tool_result_microcompact" }
func (s *ToolResultMicrocompactStrategy) Apply(_ context.Context, _ []engine.AgentMessage, view []engine.AgentMessage, budget Budget) ([]engine.AgentMessage, StrategyResult, error) {
	if budget.Tokens <= budget.Threshold {
		return view, StrategyResult{Name: s.Name()}, nil
	}
	out := cloneMessages(view)
	remaining := s.cfg.KeepRecent
	changed := false
	for i := len(out) - 1; i >= 0; i-- {
		msg, ok := out[i].(engine.Message)
		if !ok || msg.Role != engine.RoleTool {
			continue
		}
		if remaining > 0 {
			remaining--
			continue
		}
		name, _ := msg.Metadata["tool_name"].(string)
		if s.cfg.Classifier != nil && !s.cfg.Classifier(name) {
			continue
		}
		if msg.TextContent() == s.cfg.ClearedMessage {
			continue
		}
		msg.Content = []engine.ContentBlock{engine.TextBlock(s.cfg.ClearedMessage)}
		out[i] = msg
		changed = true
	}
	after := EstimateTotal(out)
	return out, StrategyResult{Applied: changed, TokensSaved: max(0, budget.Tokens-after), Name: s.Name()}, nil
}

type PostSummaryHook func(context.Context, SummaryInfo, []engine.AgentMessage) ([]engine.AgentMessage, error)
type FullSummaryConfig struct {
	Model                                                              engine.ChatModel
	StripImages                                                        *bool
	KeepRecentTokens                                                   int
	PostSummaryHooks                                                   []PostSummaryHook
	SystemPrompt, SummaryPrompt, UpdateSummaryPrompt, TurnPrefixPrompt string
}
type FullSummaryStrategy struct{ cfg FullSummaryConfig }

func NewFullSummary(cfg FullSummaryConfig) *FullSummaryStrategy {
	if cfg.KeepRecentTokens <= 0 {
		cfg.KeepRecentTokens = 12000
	}
	return &FullSummaryStrategy{cfg: cfg}
}
func (s *FullSummaryStrategy) Name() string { return "full_summary" }
func (s *FullSummaryStrategy) Apply(ctx context.Context, transcript, view []engine.AgentMessage, budget Budget) ([]engine.AgentMessage, StrategyResult, error) {
	if budget.Tokens <= budget.Threshold {
		return view, StrategyResult{Name: s.Name()}, nil
	}
	return s.summarize(ctx, transcript, view)
}
func (s *FullSummaryStrategy) ForceApply(ctx context.Context, transcript, view []engine.AgentMessage, _ Budget) ([]engine.AgentMessage, StrategyResult, error) {
	return s.summarize(ctx, transcript, view)
}
func (s *FullSummaryStrategy) summarize(ctx context.Context, transcript, view []engine.AgentMessage) ([]engine.AgentMessage, StrategyResult, error) {
	started := time.Now()
	before := EstimateTotal(view)
	cut := suffixStart(view, s.cfg.KeepRecentTokens)
	if cut <= 0 {
		return view, StrategyResult{Name: s.Name()}, nil
	}
	prefix, kept := view[:cut], cloneMessages(view[cut:])
	summary := extractiveSummary(prefix, 6000)
	if s.cfg.Model != nil {
		system := s.cfg.SystemPrompt
		if system == "" {
			system = "把旧对话压缩成可供继续执行的事实摘要；不得编造。"
		}
		prompt := s.cfg.SummaryPrompt
		if prompt == "" {
			prompt = "保留目标、约束、决定、未完成事项和文件事实。"
		}
		input := ContextConvertToLLM(prefix)
		joined := make([]string, 0, len(input))
		for _, msg := range input {
			joined = append(joined, string(msg.Role)+": "+msg.TextContent())
		}
		resp, err := s.cfg.Model.Generate(ctx, []engine.Message{engine.SystemMsg(system), engine.UserMsg(prompt + "\n\n" + strings.Join(joined, "\n"))}, nil, engine.WithMaxTokens(4000))
		if err == nil && resp != nil && strings.TrimSpace(resp.Message.TextContent()) != "" {
			summary = strings.TrimSpace(resp.Message.TextContent())
		}
	}
	info := SummaryInfo{TokensBefore: before, MessagesBefore: len(view), CompactedCount: cut, KeptCount: len(kept), SummaryLen: utf8.RuneCountInString(summary), Duration: time.Since(started)}
	out := []engine.AgentMessage{ContextSummary{Summary: summary, TokensBefore: before, Timestamp: time.Now()}}
	for _, hook := range s.cfg.PostSummaryHooks {
		extra, err := hook(ctx, info, kept)
		if err != nil {
			return nil, StrategyResult{Name: s.Name()}, err
		}
		out = append(out, extra...)
	}
	out = append(out, kept...)
	info.MessagesAfter = len(out)
	info.TokensAfter = EstimateTotal(out)
	return out, StrategyResult{Applied: info.TokensAfter < before, TokensSaved: max(0, before-info.TokensAfter), Name: s.Name(), Info: &info}, nil
}

func extractiveSummary(msgs []engine.AgentMessage, maxRunes int) string {
	var b strings.Builder
	b.WriteString("旧上下文提要（本地抽取，未新增事实）：\n")
	for _, msg := range msgs {
		line := strings.TrimSpace(msg.TextContent())
		if line == "" {
			continue
		}
		if b.Len()+len(line) > maxRunes {
			line = string([]rune(line)[:min(400, utf8.RuneCountInString(line))])
		}
		fmt.Fprintf(&b, "- %s: %s\n", msg.GetRole(), line)
		if utf8.RuneCountInString(b.String()) >= maxRunes {
			break
		}
	}
	return b.String()
}

func suffixStart(msgs []engine.AgentMessage, keep int) int {
	total := 0
	for i := len(msgs) - 1; i >= 0; i-- {
		total += EstimateTokens(msgs[i])
		if total >= keep {
			return i
		}
	}
	return 0
}
func cloneMessages(in []engine.AgentMessage) []engine.AgentMessage {
	return append([]engine.AgentMessage(nil), in...)
}
func usage(msgs []engine.AgentMessage, window int) *engine.ContextUsage {
	tokens := EstimateTotal(msgs)
	percent := 0.0
	if window > 0 {
		percent = float64(tokens) * 100 / float64(window)
	}
	return &engine.ContextUsage{Tokens: tokens, ContextWindow: window, Percent: percent, TrailingTokens: tokens}
}
func infoCompacted(i *SummaryInfo) int {
	if i == nil {
		return 0
	}
	return i.CompactedCount
}
func infoKept(i *SummaryInfo) int {
	if i == nil {
		return 0
	}
	return i.KeptCount
}
func infoSplit(i *SummaryInfo) bool { return i != nil && i.IsSplitTurn }
