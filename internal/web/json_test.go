package web

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadJSONRejectsTrailingValues(t *testing.T) {
	req := httptest.NewRequest("POST", "/", strings.NewReader(`{"name":"one"} {"name":"two"}`))
	var payload map[string]any
	if err := readJSON(req, &payload); err == nil {
		t.Fatal("expected trailing JSON value to be rejected")
	}
}

func TestReadJSONRejectsOversizedBody(t *testing.T) {
	body := `{"value":"` + strings.Repeat("x", maxJSONBody) + `"}`
	req := httptest.NewRequest("POST", "/", strings.NewReader(body))
	var payload map[string]any
	if err := readJSON(req, &payload); err == nil {
		t.Fatal("expected oversized JSON body to be rejected")
	}
}
