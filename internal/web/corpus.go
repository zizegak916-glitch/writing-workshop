package web

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/zizegak916-glitch/writing-workshop/internal/corpus"
)

func (s *Server) corpusPath() string {
	return filepath.Join(s.store.Dir(), ".writing-workshop", "corpus", "index.json")
}

func (s *Server) handleCorpus(w http.ResponseWriter, r *http.Request) {
	archive, err := corpus.Load(s.corpusPath())
	if err != nil {
		respond(w, nil, err)
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, archive)
	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, 64<<20)
		if err := r.ParseMultipartForm(64 << 20); err != nil {
			httpError(w, fmt.Errorf("解析语料上传: %w", err), http.StatusBadRequest)
			return
		}
		if r.MultipartForm != nil {
			defer r.MultipartForm.RemoveAll()
		}
		authorized := strings.EqualFold(r.FormValue("authorized"), "true") || r.FormValue("authorized") == "1"
		if !authorized {
			httpError(w, errors.New("必须勾选：我有权分析这些文本"), http.StatusBadRequest)
			return
		}
		files := r.MultipartForm.File["files"]
		if len(files) == 0 {
			files = r.MultipartForm.File["file"]
		}
		if len(files) == 0 {
			httpError(w, errors.New("没有收到 TXT、Markdown 或 DOCX 文件"), http.StatusBadRequest)
			return
		}
		if len(files) > 20 {
			httpError(w, errors.New("一次最多分析 20 个文件"), http.StatusBadRequest)
			return
		}
		profiles := make([]corpus.Profile, 0, len(files))
		duplicates := []string{}
		for _, header := range files {
			file, err := header.Open()
			if err != nil {
				httpError(w, err, http.StatusBadRequest)
				return
			}
			source, text, err := corpus.Parse(header.Filename, file, true)
			file.Close()
			if err != nil {
				httpError(w, fmt.Errorf("%s: %w", header.Filename, err), http.StatusBadRequest)
				return
			}
			profile := corpus.Analyze(source, text)
			if !corpus.UpsertProfile(&archive, profile) {
				duplicates = append(duplicates, header.Filename)
			}
			profiles = append(profiles, profile)
		}
		if err := corpus.Save(s.corpusPath(), archive); err != nil {
			respond(w, nil, err)
			return
		}
		writeJSON(w, map[string]any{"saved": true, "profiles": profiles, "duplicates": duplicates, "text_stored": false})
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			httpError(w, errors.New("id is required"), http.StatusBadRequest)
			return
		}
		kept := archive.Profiles[:0]
		deleted := false
		for _, profile := range archive.Profiles {
			if profile.Source.ID == id {
				deleted = true
				continue
			}
			kept = append(kept, profile)
		}
		archive.Profiles = kept
		if !deleted {
			httpError(w, os.ErrNotExist, http.StatusNotFound)
			return
		}
		if err := corpus.Save(s.corpusPath(), archive); err != nil {
			respond(w, nil, err)
			return
		}
		writeJSON(w, map[string]any{"deleted": true, "id": id})
	}
}

func (s *Server) handleCorpusRefinements(w http.ResponseWriter, r *http.Request) {
	archive, err := corpus.Load(s.corpusPath())
	if err != nil {
		respond(w, nil, err)
		return
	}
	var input struct {
		SourceIDs    []string `json:"source_ids"`
		TargetSkills []string `json:"target_skills"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&input); err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	wanted := map[string]bool{}
	for _, id := range input.SourceIDs {
		wanted[id] = true
	}
	profiles := []corpus.Profile{}
	for _, profile := range archive.Profiles {
		if len(wanted) == 0 || wanted[profile.Source.ID] {
			profiles = append(profiles, profile)
		}
	}
	if len(profiles) == 0 {
		httpError(w, errors.New("没有可用于校准的语料档案"), http.StatusBadRequest)
		return
	}
	proposal := corpus.BuildProposal(profiles, input.TargetSkills)
	archive.Proposals = append(archive.Proposals, proposal)
	if len(archive.Proposals) > 100 {
		archive.Proposals = append([]corpus.Proposal(nil), archive.Proposals[len(archive.Proposals)-100:]...)
	}
	if err := corpus.Save(s.corpusPath(), archive); err != nil {
		respond(w, nil, err)
		return
	}
	writeJSON(w, map[string]any{"proposal": proposal, "applied": false, "notice": "候选差分尚未写入 Prompt Skill；请在前端预览并确认。"})
}
