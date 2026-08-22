package context

import (
	"context"
	"strings"
	"testing"

	engine "github.com/zizegak916-glitch/writing-workshop/internal/engine"
)

func TestProjectionCompactsViewWithoutDestroyingBaseline(t *testing.T) {
	contextEngine := NewEngine(EngineConfig{
		ContextWindow: 240,
		ReserveTokens: 80,
		Strategies: []Strategy{
			NewFullSummary(FullSummaryConfig{KeepRecentTokens: 60}),
		},
	})
	messages := make([]engine.AgentMessage, 0, 12)
	for i := 0; i < 12; i++ {
		messages = append(messages, engine.UserMsg(strings.Repeat("一段需要保留事实边界的中文内容。", 12)))
	}
	projection, err := contextEngine.Project(context.Background(), messages)
	if err != nil {
		t.Fatal(err)
	}
	if len(projection.Messages) >= len(messages) {
		t.Fatalf("projection was not compacted: before=%d after=%d", len(messages), len(projection.Messages))
	}
	if projection.ShouldCommit {
		t.Fatal("default projection must not overwrite transcript")
	}
	snapshot := contextEngine.Snapshot()
	if snapshot.TranscriptMessages != len(messages) || snapshot.SummaryMessages != 1 {
		t.Fatalf("unexpected snapshot: %+v", snapshot)
	}
}

func TestToolResultMicrocompactKeepsRecentResults(t *testing.T) {
	strategy := NewToolResultMicrocompact(ToolResultMicrocompactConfig{KeepRecent: 1})
	messages := []engine.AgentMessage{
		engine.ToolResultMsg("old", []byte(`{"large":"old"}`), false),
		engine.ToolResultMsg("new", []byte(`{"large":"new"}`), false),
	}
	view, result, err := strategy.Apply(context.Background(), messages, messages, Budget{Tokens: 100, Threshold: 1})
	if err != nil {
		t.Fatal(err)
	}
	if !result.Applied {
		t.Fatal("strategy did not apply")
	}
	converted := engine.CollectMessages(view)
	if converted[0].TextContent() == `{"large":"old"}` || converted[1].TextContent() != `{"large":"new"}` {
		t.Fatalf("wrong results compacted: %#v", converted)
	}
}
