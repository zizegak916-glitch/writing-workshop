// Package tools contains repository-owned deterministic tools used by the Go
// engine. They do not call a model and are safe to test independently.
package tools

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type EditTool struct{ WorkDir string }

func NewEdit(workDir string, _ any, _ ...any) *EditTool { return &EditTool{WorkDir: workDir} }

func (t *EditTool) Execute(_ context.Context, raw json.RawMessage) (json.RawMessage, error) {
	var input struct {
		Path       string `json:"path"`
		FilePath   string `json:"file_path"`
		OldText    string `json:"old_text"`
		OldString  string `json:"old_string"`
		NewText    string `json:"new_text"`
		NewString  string `json:"new_string"`
		ReplaceAll bool   `json:"replace_all"`
	}
	if err := json.Unmarshal(raw, &input); err != nil {
		return nil, err
	}
	path := input.FilePath
	if path == "" {
		path = input.Path
	}
	old := input.OldString
	if old == "" {
		old = input.OldText
	}
	newText := input.NewString
	if input.NewString == "" && input.NewText != "" {
		newText = input.NewText
	}
	if path == "" || old == "" {
		return nil, errors.New("file_path and old_string are required")
	}
	absRoot, err := filepath.Abs(t.WorkDir)
	if err != nil {
		return nil, err
	}
	target, err := filepath.Abs(filepath.Join(absRoot, filepath.Clean(path)))
	if err != nil {
		return nil, err
	}
	if target != absRoot && !strings.HasPrefix(target, absRoot+string(os.PathSeparator)) {
		return nil, errors.New("edit path escapes project root")
	}
	data, err := os.ReadFile(target)
	if err != nil {
		return nil, err
	}
	bom := []byte{}
	if len(data) >= 3 && string(data[:3]) == "\xef\xbb\xbf" {
		bom = append(bom, data[:3]...)
		data = data[3:]
	}
	original := string(data)
	crlf := strings.Contains(original, "\r\n")
	normalized := strings.ReplaceAll(original, "\r\n", "\n")
	old = strings.ReplaceAll(old, "\r\n", "\n")
	newText = strings.ReplaceAll(newText, "\r\n", "\n")
	count := strings.Count(normalized, old)
	if count == 0 {
		return nil, errors.New("old_string not found in file")
	}
	if count > 1 && !input.ReplaceAll {
		return nil, fmt.Errorf("old_string occurs %d times; set replace_all=true or provide a unique match", count)
	}
	updated := strings.Replace(normalized, old, newText, 1)
	replaced := 1
	if input.ReplaceAll {
		updated = strings.ReplaceAll(normalized, old, newText)
		replaced = count
	}
	if crlf {
		updated = strings.ReplaceAll(updated, "\n", "\r\n")
	}
	out := append(bom, []byte(updated)...)
	info, err := os.Stat(target)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(target, out, info.Mode().Perm()); err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"path": path, "replacements": replaced, "bytes_before": len(original), "bytes_after": len(updated), "diff": simpleDiff(old, newText)})
}

func simpleDiff(old, newText string) string {
	return "--- before\n+++ after\n-" + strings.ReplaceAll(old, "\n", "\n-") + "\n+" + strings.ReplaceAll(newText, "\n", "\n+")
}
