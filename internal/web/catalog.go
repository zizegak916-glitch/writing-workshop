package web

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

type customCategory struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Description string `json:"description,omitempty"`
	Scope       string `json:"scope"`
	ReadOnly    bool   `json:"read_only,omitempty"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

type categoriesFile struct {
	Categories []customCategory `json:"categories"`
}

type skillPack struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Category    string   `json:"category,omitempty"`
	SkillIDs    []string `json:"skill_ids"`
	Enabled     bool     `json:"enabled"`
	ReadOnly    bool     `json:"read_only,omitempty"`
	CreatedAt   string   `json:"created_at,omitempty"`
	UpdatedAt   string   `json:"updated_at,omitempty"`
}

type skillPacksFile struct {
	Packs []skillPack `json:"packs"`
}

var errReadOnlyCatalogItem = errors.New("read_only catalog item cannot be changed")
var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *Server) handleCategories(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := s.loadCategories()
		respond(w, map[string]any{"categories": list}, err)
	case http.MethodPost, http.MethodPut:
		var req customCategory
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		saved, err := s.upsertCategory(req)
		if errors.Is(err, errReadOnlyCatalogItem) {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		respond(w, map[string]any{"saved": err == nil, "category": saved}, err)
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			httpError(w, fmt.Errorf("id is required"), http.StatusBadRequest)
			return
		}
		err := s.deleteCategory(id)
		if errors.Is(err, errReadOnlyCatalogItem) {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		respond(w, map[string]any{"deleted": err == nil, "id": id}, err)
	}
}

func (s *Server) handleSkillPacks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := s.loadSkillPacks()
		respond(w, map[string]any{"packs": list}, err)
	case http.MethodPost, http.MethodPut:
		var req skillPack
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		saved, err := s.upsertSkillPack(req)
		if errors.Is(err, errReadOnlyCatalogItem) {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		writeJSON(w, map[string]any{"saved": true, "pack": saved})
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			httpError(w, fmt.Errorf("id is required"), http.StatusBadRequest)
			return
		}
		err := s.deleteSkillPack(id)
		if errors.Is(err, errReadOnlyCatalogItem) {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		respond(w, map[string]any{"deleted": err == nil, "id": id}, err)
	}
}

func defaultCategories() []customCategory {
	return []customCategory{
		{ID: "planning", Name: "规划", Color: "#3155D9", Scope: "all", ReadOnly: true},
		{ID: "drafting", Name: "写作", Color: "#7BD8B2", Scope: "all", ReadOnly: true},
		{ID: "revision", Name: "修订", Color: "#F26B5B", Scope: "all", ReadOnly: true},
		{ID: "continuity", Name: "连续性", Color: "#A98DE8", Scope: "all", ReadOnly: true},
		{ID: "research", Name: "资料", Color: "#F2B544", Scope: "all", ReadOnly: true},
		{ID: "utility", Name: "工具", Color: "#8FC7EF", Scope: "capability", ReadOnly: true},
	}
}

func defaultSkillPacks() []skillPack {
	return []skillPack{
		{ID: "longform-planning", Name: "长篇规划校准", Description: "大纲拆分、连续性校准与角色声音联合检查。", Category: "planning", SkillIDs: []string{"builtin-outline", "builtin-continuity", "builtin-character-voice"}, Enabled: true, ReadOnly: true},
		{ID: "chapter-revision", Name: "章节修订", Description: "改写、场景节奏和连续性三项串联为一次候选。", Category: "revision", SkillIDs: []string{"builtin-rewrite", "builtin-scene-pacing", "builtin-continuity"}, Enabled: true, ReadOnly: true},
		{ID: "character-dialogue", Name: "角色与对白", Description: "聚焦角色声音，同时检查事实与动机是否连续。", Category: "drafting", SkillIDs: []string{"builtin-character-voice", "builtin-continuity"}, Enabled: true, ReadOnly: true},
	}
}

func (s *Server) loadCategories() ([]customCategory, error) {
	var file categoriesFile
	if err := readJSONFile(s.categoriesPath(), &file); err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	seen := map[string]bool{}
	out := append([]customCategory{}, defaultCategories()...)
	for _, item := range out { seen[item.ID] = true }
	for _, item := range file.Categories {
		item.ID = sanitizeID(item.ID)
		if item.ID != "" && !seen[item.ID] { out = append(out, item); seen[item.ID] = true }
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *Server) loadUserCategories() ([]customCategory, error) {
	var file categoriesFile
	if err := readJSONFile(s.categoriesPath(), &file); err != nil {
		if os.IsNotExist(err) { return nil, nil }
		return nil, err
	}
	return file.Categories, nil
}

func (s *Server) upsertCategory(item customCategory) (customCategory, error) {
	if item.ReadOnly { return customCategory{}, errReadOnlyCatalogItem }
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" { return customCategory{}, fmt.Errorf("name is required") }
	item.ID = sanitizeID(firstNonEmpty(item.ID, item.Name))
	if item.ID == "" { item.ID = "category-" + strconv36(time.Now().UnixNano()) }
	for _, builtin := range defaultCategories() {
		if builtin.ID == item.ID { return customCategory{}, errReadOnlyCatalogItem }
	}
	if !hexColor.MatchString(item.Color) { item.Color = "#8FC7EF" }
	item.Scope = normalizeCategoryScope(item.Scope)
	now := time.Now().Format(time.RFC3339)
	item.UpdatedAt = now
	list, err := s.loadUserCategories()
	if err != nil { return customCategory{}, err }
	replaced := false
	for i := range list {
		if list[i].ID == item.ID {
			item.CreatedAt = firstNonEmpty(item.CreatedAt, list[i].CreatedAt)
			list[i], replaced = item, true
			break
		}
	}
	if !replaced { item.CreatedAt = now; list = append(list, item) }
	return item, s.saveCategories(list)
}

func (s *Server) deleteCategory(id string) error {
	id = sanitizeID(id)
	for _, item := range defaultCategories() { if item.ID == id { return errReadOnlyCatalogItem } }
	list, err := s.loadUserCategories(); if err != nil { return err }
	out := list[:0]
	for _, item := range list { if item.ID != id { out = append(out, item) } }
	return s.saveCategories(out)
}

func (s *Server) loadSkillPacks() ([]skillPack, error) {
	var file skillPacksFile
	if err := readJSONFile(s.skillPacksPath(), &file); err != nil && !os.IsNotExist(err) { return nil, err }
	seen := map[string]bool{}
	out := append([]skillPack{}, defaultSkillPacks()...)
	for _, item := range out { seen[item.ID] = true }
	for _, item := range file.Packs {
		item.ID = sanitizeID(item.ID)
		if item.ID != "" && !seen[item.ID] { out = append(out, item); seen[item.ID] = true }
	}
	return out, nil
}

func (s *Server) loadUserSkillPacks() ([]skillPack, error) {
	var file skillPacksFile
	if err := readJSONFile(s.skillPacksPath(), &file); err != nil {
		if os.IsNotExist(err) { return nil, nil }
		return nil, err
	}
	return file.Packs, nil
}

func (s *Server) upsertSkillPack(item skillPack) (skillPack, error) {
	if item.ReadOnly { return skillPack{}, errReadOnlyCatalogItem }
	item.Name = strings.TrimSpace(item.Name)
	if item.Name == "" { return skillPack{}, fmt.Errorf("name is required") }
	item.ID = sanitizeID(firstNonEmpty(item.ID, item.Name))
	if item.ID == "" { item.ID = "pack-" + strconv36(time.Now().UnixNano()) }
	for _, builtin := range defaultSkillPacks() { if builtin.ID == item.ID { return skillPack{}, errReadOnlyCatalogItem } }
	item.SkillIDs = uniqueIDs(item.SkillIDs)
	if len(item.SkillIDs) == 0 { return skillPack{}, fmt.Errorf("skill_ids is required") }
	capabilities, err := s.loadCapabilities(); if err != nil { return skillPack{}, err }
	available := map[string]bool{}
	for _, capability := range capabilities {
		if capability.Enabled && capability.Type != "backend" && capability.Type != "project" { available[capability.ID] = true }
	}
	for _, id := range item.SkillIDs {
		if !available[id] { return skillPack{}, fmt.Errorf("skill %q not found or disabled", id) }
	}
	item.Category = sanitizeID(item.Category)
	now := time.Now().Format(time.RFC3339); item.UpdatedAt = now
	list, err := s.loadUserSkillPacks(); if err != nil { return skillPack{}, err }
	replaced := false
	for i := range list {
		if list[i].ID == item.ID { item.CreatedAt = firstNonEmpty(item.CreatedAt, list[i].CreatedAt); list[i], replaced = item, true; break }
	}
	if !replaced { item.CreatedAt = now; list = append(list, item) }
	return item, s.saveSkillPacks(list)
}

func (s *Server) deleteSkillPack(id string) error {
	id = sanitizeID(id)
	for _, item := range defaultSkillPacks() { if item.ID == id { return errReadOnlyCatalogItem } }
	list, err := s.loadUserSkillPacks(); if err != nil { return err }
	out := list[:0]
	for _, item := range list { if item.ID != id { out = append(out, item) } }
	return s.saveSkillPacks(out)
}

func (s *Server) saveCategories(list []customCategory) error {
	return writeCatalogJSON(s.categoriesPath(), categoriesFile{Categories: list})
}

func (s *Server) saveSkillPacks(list []skillPack) error {
	return writeCatalogJSON(s.skillPacksPath(), skillPacksFile{Packs: list})
}

func writeCatalogJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil { return err }
	data, err := json.MarshalIndent(value, "", "  "); if err != nil { return err }
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

func (s *Server) categoriesPath() string { return filepath.Join(s.store.Dir(), ".ainovel", "categories.json") }
func (s *Server) skillPacksPath() string { return filepath.Join(s.store.Dir(), ".ainovel", "skill-packs.json") }

func normalizeCategoryScope(scope string) string {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "project", "capability", "memory", "all": return strings.ToLower(strings.TrimSpace(scope))
	default: return "all"
	}
}

func uniqueIDs(ids []string) []string {
	seen := map[string]bool{}; out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = sanitizeID(id); if id == "" || seen[id] { continue }
		seen[id] = true; out = append(out, id)
	}
	return out
}
