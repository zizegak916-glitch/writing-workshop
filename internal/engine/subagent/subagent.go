// Package subagent implements isolated delegated runs for Writing Workshop.
// Each run gets a fresh transcript and optional context manager while sharing
// only explicitly supplied tools and model access.
package subagent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	engine "github.com/zizegak916-glitch/writing-workshop/internal/engine"
	"github.com/zizegak916-glitch/writing-workshop/internal/engine/schema"
)

type Config struct {
	Name, Description, SystemPrompt, SystemPromptMode string
	Model                                             engine.ChatModel
	Tools                                             []engine.Tool
	MaxTurns                                          int
	ThinkingLevel                                     engine.ThinkingLevel
	MaxRetries                                        int
	ToolsAreIdempotent                                bool
	StopAfterTools                                    []string
	StopAfterToolResult                               func(string, json.RawMessage) bool
	OnMessage                                         func(agentName, task string, msg engine.AgentMessage)
	ContextManager                                    engine.ContextManager
	ContextManagerFactory                             func(engine.ChatModel) engine.ContextManager
	ConvertToLLM                                      func([]engine.AgentMessage) []engine.Message
	StopGuardFactory                                  func(agentName, task string) engine.StopGuard
}

type Tool struct {
	mu       sync.RWMutex
	agents   map[string]Config
	thinking map[string]engine.ThinkingLevel
}

func New(agents ...Config) *Tool {
	t := &Tool{agents: make(map[string]Config, len(agents)), thinking: map[string]engine.ThinkingLevel{}}
	for _, cfg := range agents {
		if cfg.Name != "" {
			t.agents[cfg.Name] = cfg
		}
	}
	return t
}

func (t *Tool) Name() string  { return "subagent" }
func (t *Tool) Label() string { return "委派创作代理" }
func (t *Tool) Description() string {
	return "把一个明确任务委派给隔离上下文中的规划、写作或审阅代理，并等待结果。"
}
func (t *Tool) Schema() map[string]any {
	return schema.Object(
		schema.Property("agent", schema.String("代理名称，必须来自可用代理列表")).Required(),
		schema.Property("task", schema.String("完整、可独立执行的任务")).Required(),
	)
}

func (t *Tool) AgentConfig(name string) (Config, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	cfg, ok := t.agents[name]
	return cfg, ok
}
func (t *Tool) SetThinkingLevel(name string, level engine.ThinkingLevel) {
	t.mu.Lock()
	t.thinking[name] = level
	t.mu.Unlock()
}

func (t *Tool) Execute(ctx context.Context, raw json.RawMessage) (json.RawMessage, error) {
	var input struct {
		Agent string `json:"agent"`
		Task  string `json:"task"`
	}
	if err := json.Unmarshal(raw, &input); err != nil {
		return nil, fmt.Errorf("invalid subagent parameters: %w", err)
	}
	if input.Agent == "" || input.Task == "" {
		return nil, errors.New("subagent agent and task are required")
	}
	cfg, ok := t.AgentConfig(input.Agent)
	if !ok {
		result, _ := json.Marshal(map[string]string{"error": "unknown agent: " + input.Agent})
		return result, nil
	}
	if cfg.Model == nil {
		result, _ := json.Marshal(map[string]string{"error": "agent model is not configured: " + input.Agent})
		return result, nil
	}

	t.mu.RLock()
	level, overridden := t.thinking[input.Agent]
	t.mu.RUnlock()
	if !overridden {
		level = cfg.ThinkingLevel
	}
	mgr := cfg.ContextManager
	if cfg.ContextManagerFactory != nil {
		mgr = cfg.ContextManagerFactory(cfg.Model)
	}
	stopRule := func(name string, result json.RawMessage) bool {
		if cfg.StopAfterToolResult != nil && cfg.StopAfterToolResult(name, result) {
			return true
		}
		for _, terminal := range cfg.StopAfterTools {
			if name == terminal {
				return true
			}
		}
		return false
	}
	onMessage := func(msg engine.AgentMessage) {
		if cfg.OnMessage != nil {
			cfg.OnMessage(cfg.Name, input.Task, msg)
		}
	}
	agent := engine.NewAgent(
		engine.WithModel(cfg.Model), engine.WithSystemPrompt(cfg.SystemPrompt),
		engine.WithTools(cfg.Tools...), engine.WithMaxTurns(cfg.MaxTurns),
		engine.WithMaxRetries(cfg.MaxRetries), engine.WithToolsAreIdempotent(cfg.ToolsAreIdempotent),
		engine.WithThinkingLevel(level), engine.WithContextManager(mgr),
		engine.WithOnMessage(onMessage), engine.WithStopAfterToolResult(stopRule),
	)
	if cfg.StopGuardFactory != nil {
		agent = engine.NewAgent(engine.WithModel(cfg.Model), engine.WithSystemPrompt(cfg.SystemPrompt), engine.WithTools(cfg.Tools...), engine.WithMaxTurns(cfg.MaxTurns), engine.WithMaxRetries(cfg.MaxRetries), engine.WithToolsAreIdempotent(cfg.ToolsAreIdempotent), engine.WithThinkingLevel(level), engine.WithContextManager(mgr), engine.WithOnMessage(onMessage), engine.WithStopGuard(cfg.StopGuardFactory(cfg.Name, input.Task)), engine.WithStopAfterToolResult(stopRule))
	}
	if err := agent.Prompt(ctx, input.Task); err != nil {
		return nil, err
	}
	agent.WaitForIdle()
	state := agent.State()
	if state.Error != "" && state.Error != engine.ErrMaxTurns.Error() {
		result, _ := json.Marshal(map[string]string{"error": state.Error})
		return result, nil
	}
	final := ""
	for i := len(state.Messages) - 1; i >= 0; i-- {
		if state.Messages[i].GetRole() == engine.RoleAssistant && state.Messages[i].TextContent() != "" {
			final = state.Messages[i].TextContent()
			break
		}
	}
	result, _ := json.Marshal(map[string]any{"agent": input.Agent, "task": input.Task, "result": final, "messages": len(state.Messages), "status": "completed"})
	return result, nil
}
