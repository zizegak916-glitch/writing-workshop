package tools

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEditPreservesBOMAndCRLF(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "chapter.txt")
	if err := os.WriteFile(path, []byte("\xef\xbb\xbf第一行\r\n旧句\r\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	tool := NewEdit(dir, nil)
	args, _ := json.Marshal(map[string]any{"file_path": "chapter.txt", "old_string": "旧句", "new_string": "新句"})
	if _, err := tool.Execute(context.Background(), args); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(data), "\xef\xbb\xbf") || !strings.Contains(string(data), "新句\r\n") {
		t.Fatalf("encoding/newline not preserved: %q", data)
	}
}

func TestEditRejectsPathEscapeAndAmbiguousMatch(t *testing.T) {
	dir := t.TempDir()
	tool := NewEdit(dir, nil)
	outside := filepath.Join(filepath.Dir(dir), "outside.txt")
	if err := os.WriteFile(outside, []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	args, _ := json.Marshal(map[string]any{"file_path": "../outside.txt", "old_string": "secret", "new_string": "x"})
	if _, err := tool.Execute(context.Background(), args); err == nil {
		t.Fatal("path escape was accepted")
	}
	inside := filepath.Join(dir, "inside.txt")
	if err := os.WriteFile(inside, []byte("same same"), 0o600); err != nil {
		t.Fatal(err)
	}
	args, _ = json.Marshal(map[string]any{"file_path": "inside.txt", "old_string": "same", "new_string": "x"})
	if _, err := tool.Execute(context.Background(), args); err == nil {
		t.Fatal("ambiguous replacement was accepted")
	}
}
