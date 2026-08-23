package web

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type backendMemory struct {
	ID        string    `json:"id"`
	Project   string    `json:"project,omitempty"`
	Category  string    `json:"category"`
	Title     string    `json:"title,omitempty"`
	Content   string    `json:"content"`
	Source    string    `json:"source"`
	Scope     string    `json:"scope"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type backendMemoryFile struct {
	Version   int             `json:"version"`
	Memories  []backendMemory `json:"memories"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func (s *Server) memoriesPath() string {
	return filepath.Join(s.store.Dir(), ".writing-workshop", "memories.json")
}

func (s *Server) loadBackendMemories() (backendMemoryFile, error) {
	var archive backendMemoryFile
	data, err := os.ReadFile(s.memoriesPath())
	if os.IsNotExist(err) {
		return backendMemoryFile{Version: 1, Memories: []backendMemory{}}, nil
	}
	if err != nil {
		return archive, err
	}
	if err := json.Unmarshal(data, &archive); err != nil {
		return archive, err
	}
	if archive.Version == 0 {
		archive.Version = 1
	}
	if archive.Memories == nil {
		archive.Memories = []backendMemory{}
	}
	return archive, nil
}

func (s *Server) saveBackendMemories(archive backendMemoryFile) error {
	archive.Version = 1
	archive.UpdatedAt = time.Now().UTC()
	data, err := json.MarshalIndent(archive, "", "  ")
	if err != nil {
		return err
	}
	path := s.memoriesPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (s *Server) handleMemories(w http.ResponseWriter, r *http.Request) {
	s.memoryMu.Lock()
	defer s.memoryMu.Unlock()
	archive, err := s.loadBackendMemories()
	if err != nil {
		respond(w, nil, err)
		return
	}
	switch r.Method {
	case http.MethodGet:
		project := strings.TrimSpace(r.URL.Query().Get("project"))
		items := make([]backendMemory, 0, len(archive.Memories))
		for _, memory := range archive.Memories {
			if project == "" || memory.Scope == "global" || memory.Project == "" || memory.Project == project {
				items = append(items, memory)
			}
		}
		sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
		writeJSON(w, map[string]any{"memories": items, "count": len(items)})
	case http.MethodPost, http.MethodPut:
		var input struct {
			ID       string `json:"id"`
			Project  string `json:"project"`
			Category string `json:"category"`
			Title    string `json:"title"`
			Content  string `json:"content"`
			Source   string `json:"source"`
			Scope    string `json:"scope"`
			Enabled  *bool  `json:"enabled"`
		}
		if err := readJSON(r, &input); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		input.Content = strings.TrimSpace(input.Content)
		if input.Content == "" {
			httpError(w, errors.New("memory content is required"), http.StatusBadRequest)
			return
		}
		if utf8.RuneCountInString(input.Content) > 30000 || utf8.RuneCountInString(input.Title) > 200 {
			httpError(w, errors.New("memory content or title is too long"), http.StatusBadRequest)
			return
		}
		now := time.Now().UTC()
		memory := backendMemory{ID: strings.TrimSpace(input.ID), Project: strings.TrimSpace(input.Project), Category: firstNonEmpty(strings.TrimSpace(input.Category), "note"), Title: strings.TrimSpace(input.Title), Content: input.Content, Source: firstNonEmpty(strings.TrimSpace(input.Source), "manual"), Scope: firstNonEmpty(strings.TrimSpace(input.Scope), "project"), Enabled: true, CreatedAt: now, UpdatedAt: now}
		if input.Enabled != nil {
			memory.Enabled = *input.Enabled
		}
		updated := false
		if memory.ID != "" {
			for i, existing := range archive.Memories {
				if existing.ID == memory.ID {
					memory.CreatedAt = existing.CreatedAt
					archive.Memories[i] = memory
					updated = true
					break
				}
			}
		}
		if !updated {
			memory.ID = "memory-" + strconv36(now.UnixNano())
			archive.Memories = append(archive.Memories, memory)
		}
		if len(archive.Memories) > 500 {
			archive.Memories = append([]backendMemory(nil), archive.Memories[len(archive.Memories)-500:]...)
		}
		if err := s.saveBackendMemories(archive); err != nil {
			respond(w, nil, err)
			return
		}
		writeJSON(w, map[string]any{"saved": true, "memory": memory})
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			httpError(w, errors.New("id is required"), http.StatusBadRequest)
			return
		}
		kept := archive.Memories[:0]
		deleted := false
		for _, memory := range archive.Memories {
			if memory.ID == id {
				deleted = true
				continue
			}
			kept = append(kept, memory)
		}
		if !deleted {
			httpError(w, os.ErrNotExist, http.StatusNotFound)
			return
		}
		archive.Memories = kept
		if err := s.saveBackendMemories(archive); err != nil {
			respond(w, nil, err)
			return
		}
		writeJSON(w, map[string]any{"deleted": true, "id": id})
	}
}

func (s *Server) backendMemoryContext(req runRequest) string {
	s.memoryMu.Lock()
	defer s.memoryMu.Unlock()
	archive, err := s.loadBackendMemories()
	if err != nil {
		return ""
	}
	project := strings.TrimSpace(fmt.Sprint(req.Context["project_name"]))
	items := make([]backendMemory, 0, len(archive.Memories))
	for _, memory := range archive.Memories {
		if !memory.Enabled {
			continue
		}
		if memory.Scope == "global" || memory.Project == "" || project == "" || memory.Project == project {
			items = append(items, memory)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt.After(items[j].UpdatedAt) })
	if len(items) > 40 {
		items = items[:40]
	}
	var lines []string
	chars := 0
	for _, memory := range items {
		line := fmt.Sprintf("[%s · %s] %s%s", memory.Category, memory.Source, firstNonEmpty(memory.Title, "记忆"), "："+memory.Content)
		if chars+utf8.RuneCountInString(line) > 12000 {
			break
		}
		lines = append(lines, line)
		chars += utf8.RuneCountInString(line)
	}
	if len(lines) == 0 {
		return ""
	}
	return "【Go 后台记忆】\n" + strings.Join(lines, "\n")
}
