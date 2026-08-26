package web

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBackendMemoryCRUDAndRunContext(t *testing.T) {
	server, mux := newTestServer(t)
	body := bytes.NewBufferString(`{"id":"memory-browser-idempotent-test","project":"验收项目","category":"style","title":"对白规则","content":"对白必须改变信息或关系。","source":"calibration","scope":"project","enabled":true}`)
	req := httptest.NewRequest(http.MethodPost, "/api/memories", body)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("save status=%d body=%s", rec.Code, rec.Body.String())
	}
	var saved struct {
		Memory backendMemory `json:"memory"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	if saved.Memory.ID != "memory-browser-idempotent-test" || saved.Memory.Source != "calibration" {
		t.Fatalf("unexpected memory: %+v", saved.Memory)
	}

	updateBody := bytes.NewBufferString(`{"id":"` + saved.Memory.ID + `","project":"验收项目","category":"rule","title":"对白规则·修订","content":"对白必须改变信息、关系或行动。","source":"calibration","scope":"project","enabled":true}`)
	req = httptest.NewRequest(http.MethodPut, "/api/memories", updateBody)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("update status=%d body=%s", rec.Code, rec.Body.String())
	}
	var updated struct {
		Memory backendMemory `json:"memory"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Memory.ID != saved.Memory.ID || updated.Memory.Category != "rule" || updated.Memory.Content != "对白必须改变信息、关系或行动。" {
		t.Fatalf("unexpected updated memory: %+v", updated.Memory)
	}

	context := server.backendMemoryContext(runRequest{Context: map[string]any{"project_name": "验收项目"}})
	if !strings.Contains(context, "对白必须改变信息、关系或行动") || !strings.Contains(context, "calibration") || strings.Contains(context, "对白必须改变信息或关系。") {
		t.Fatalf("memory missing from run context: %q", context)
	}

	req = httptest.NewRequest(http.MethodGet, "/api/memories", nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "对白规则·修订") {
		t.Fatalf("list status=%d body=%s", rec.Code, rec.Body.String())
	}
	var listed struct {
		Memories []backendMemory `json:"memories"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &listed); err != nil {
		t.Fatal(err)
	}
	if len(listed.Memories) != 1 {
		t.Fatalf("update must not duplicate backend memory: %+v", listed.Memories)
	}

	req = httptest.NewRequest(http.MethodDelete, "/api/memories?id="+saved.Memory.ID, nil)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("delete status=%d body=%s", rec.Code, rec.Body.String())
	}
}
