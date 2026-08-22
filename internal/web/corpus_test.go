package web

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCorpusUploadRequiresAuthorizationAndStoresOnlyProfile(t *testing.T) {
	_, mux := newTestServer(t)
	build := func(authorized bool) (*bytes.Buffer, string) {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		if authorized {
			_ = writer.WriteField("authorized", "true")
		}
		part, _ := writer.CreateFormFile("files", "sample.txt")
		_, _ = part.Write([]byte(strings.Repeat("第一章\n他走进雨里。\n“回来。”她说。\n", 30)))
		_ = writer.Close()
		return body, writer.FormDataContentType()
	}
	body, contentType := build(false)
	req := httptest.NewRequest(http.MethodPost, "/api/corpus", body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("unauthorized status=%d body=%s", rec.Code, rec.Body.String())
	}
	body, contentType = build(true)
	req = httptest.NewRequest(http.MethodPost, "/api/corpus", body)
	req.Header.Set("Content-Type", contentType)
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("upload status=%d body=%s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "他走进雨里") {
		t.Fatal("response must not retain source text")
	}
	if !strings.Contains(rec.Body.String(), `"text_stored":false`) {
		t.Fatalf("privacy flag missing: %s", rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodPost, "/api/corpus/refinements", bytes.NewBufferString(`{"target_skills":["润色","节奏"]}`))
	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("proposal status=%d body=%s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result["applied"] != false {
		t.Fatalf("proposal must not auto-apply: %#v", result)
	}
}
