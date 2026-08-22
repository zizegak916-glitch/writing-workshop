package engine

import (
	"context"
	"encoding/json"
	"sync"
	"testing"
	"time"
)

type scriptedModel struct {
	mu       sync.Mutex
	turn     int
	requests [][]Message
	first    Message
	second   Message
}

func (m *scriptedModel) SupportsTools() bool { return true }
func (m *scriptedModel) Generate(ctx context.Context, messages []Message, _ []ToolSpec, _ ...CallOption) (*LLMResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.requests = append(m.requests, append([]Message(nil), messages...))
	result := m.first
	if m.turn > 0 {
		result = m.second
	}
	m.turn++
	return &LLMResponse{Message: result}, nil
}
func (m *scriptedModel) GenerateStream(ctx context.Context, messages []Message, tools []ToolSpec, opts ...CallOption) (<-chan StreamEvent, error) {
	resp, err := m.Generate(ctx, messages, tools, opts...)
	if err != nil {
		return nil, err
	}
	out := make(chan StreamEvent, 1)
	out <- StreamEvent{Type: StreamEventDone, Message: resp.Message}
	close(out)
	return out, nil
}

func assistant(blocks ...ContentBlock) Message {
	return Message{Role: RoleAssistant, Content: blocks, Timestamp: time.Now()}
}

func TestAgentKeepsToolResultAdjacentBeforeSteering(t *testing.T) {
	model := &scriptedModel{
		first:  assistant(ToolCallBlock(ToolCall{ID: "call-1", Name: "write", Args: json.RawMessage(`{"value":"x"}`)})),
		second: assistant(TextBlock("done")),
	}
	tool := NewFuncTool("write", "test", map[string]any{"type": "object"}, func(context.Context, json.RawMessage) (json.RawMessage, error) {
		return json.RawMessage(`{"ok":true}`), nil
	})
	var agent *Agent
	agent = NewAgent(
		WithModel(model),
		WithTools(tool),
		WithMiddlewares(func(ctx context.Context, call ToolCall, next ToolExecuteFunc) (json.RawMessage, error) {
			result, err := next(ctx, call.Args)
			agent.Steer(UserMsg("host instruction"))
			return result, err
		}),
	)
	if err := agent.Prompt(context.Background(), "start"); err != nil {
		t.Fatal(err)
	}
	agent.WaitForIdle()
	if len(model.requests) != 2 {
		t.Fatalf("requests = %d, want 2", len(model.requests))
	}
	request := model.requests[1]
	if len(request) < 4 {
		t.Fatalf("second request too short: %#v", request)
	}
	got := []Role{request[len(request)-3].Role, request[len(request)-2].Role, request[len(request)-1].Role}
	want := []Role{RoleAssistant, RoleTool, RoleUser}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("message order = %v, want %v", got, want)
		}
	}
}

func TestAgentToolGateRejectsWithoutExecuting(t *testing.T) {
	model := &scriptedModel{
		first:  assistant(ToolCallBlock(ToolCall{ID: "call-1", Name: "danger", Args: json.RawMessage(`{}`)})),
		second: assistant(TextBlock("stopped")),
	}
	executed := false
	tool := NewFuncTool("danger", "test", map[string]any{}, func(context.Context, json.RawMessage) (json.RawMessage, error) {
		executed = true
		return json.RawMessage(`{"ok":true}`), nil
	})
	agent := NewAgent(WithModel(model), WithTools(tool), WithToolGate(func(context.Context, GateRequest) (*GateDecision, error) {
		return &GateDecision{Allowed: false, Reason: "denied by policy"}, nil
	}))
	if err := agent.Prompt(context.Background(), "start"); err != nil {
		t.Fatal(err)
	}
	agent.WaitForIdle()
	if executed {
		t.Fatal("rejected tool was executed")
	}
	found := false
	for _, msg := range CollectMessages(agent.Messages()) {
		if msg.Role == RoleTool && msg.TextContent() == `{"error":"denied by policy"}` {
			found = true
		}
	}
	if !found {
		t.Fatalf("gate rejection not recorded: %#v", agent.Messages())
	}
}

func TestAgentAccumulatesModelUsage(t *testing.T) {
	model := &scriptedModel{first: assistant(TextBlock("done"))}
	model.first.Usage = &Usage{Input: 10, Output: 4, TotalTokens: 14}
	agent := NewAgent(WithModel(model))
	if err := agent.Prompt(context.Background(), "start"); err != nil {
		t.Fatal(err)
	}
	agent.WaitForIdle()
	if got := agent.TotalUsage().TotalTokens; got != 14 {
		t.Fatalf("total usage = %d, want 14", got)
	}
}
