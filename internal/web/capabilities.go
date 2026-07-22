package web

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/voocel/agentcore"
)

type capabilityManifest struct {
	ID             string         `json:"id"`
	Name           string         `json:"name"`
	Type           string         `json:"type"`
	Version        string         `json:"version"`
	Source         string         `json:"source"`
	License        string         `json:"license"`
	Author         string         `json:"author,omitempty"`
	Description    string         `json:"description,omitempty"`
	Category       string         `json:"category,omitempty"`
	Tags           []string       `json:"tags,omitempty"`
	Instructions   string         `json:"instructions,omitempty"`
	Steps          []string       `json:"steps,omitempty"`
	Entry          string         `json:"entry"`
	InputSchema    map[string]any `json:"input_schema,omitempty"`
	Output         string         `json:"output"`
	Permissions    []string       `json:"permissions,omitempty"`
	SupportsStream bool           `json:"supports_stream"`
	SupportsAbort  bool           `json:"supports_abort"`
	Enabled        bool           `json:"enabled"`
	ReadOnly       bool           `json:"read_only,omitempty"`
	CreatedAt      string         `json:"created_at,omitempty"`
	UpdatedAt      string         `json:"updated_at,omitempty"`
}

type capabilitiesFile struct {
	Capabilities []capabilityManifest `json:"capabilities"`
}

type runRequest struct {
	BackendID string         `json:"backend_id"`
	SkillIDs  []string       `json:"skill_ids"`
	Task      string         `json:"task"`
	Context   map[string]any `json:"context"`
	Params    map[string]any `json:"params"`
	Message   string         `json:"message"`
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		list, err := s.loadCapabilities()
		respond(w, map[string]any{"capabilities": list}, err)
	case http.MethodPost, http.MethodPut:
		var req capabilityManifest
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		if err := validateCapability(req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		saved, err := s.upsertCapability(req)
		respond(w, map[string]any{"saved": err == nil, "capability": saved}, err)
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			httpError(w, fmt.Errorf("id is required"), http.StatusBadRequest)
			return
		}
		err := s.deleteCapability(id)
		if errors.Is(err, errReadOnlyCapability) {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		respond(w, map[string]any{"deleted": err == nil, "id": id}, err)
	}
}

func (s *Server) handleRun(w http.ResponseWriter, r *http.Request) {
	var req runRequest
	if err := readJSON(r, &req); err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	runID := "run-" + strconv36(time.Now().UnixNano())
	ctx, cancel := context.WithCancel(r.Context())
	s.trackCapabilityRun(runID, cancel)
	defer s.untrackCapabilityRun(runID)

	if wantsStream(r, req.Params) {
		s.streamRun(ctx, w, runID, req)
		return
	}
	result, err := s.executeRun(ctx, runID, req)
	if err != nil {
		if isRunRequestError(err) {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		respond(w, nil, err)
		return
	}
	writeJSON(w, result)
}

func (s *Server) executeRun(ctx context.Context, runID string, req runRequest) (map[string]any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	caps, err := s.resolveRunCapabilities(req)
	if err != nil {
		return nil, err
	}
	task := resolveRunTask(req.Task, caps)
	input := runInputText(req)
	var output string
	switch task {
	case "ai", "generate":
		req.Message = capabilityRunMessage(input, caps)
		output, err = s.runAI(ctx, req)
	case "rewrite":
		req.Message = capabilityRunMessage(input, caps)
		output, err = s.runRewrite(ctx, req)
	case "outline", "plan":
		output = buildOutline(input)
	default:
		output = buildEcho(task, input)
	}
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"run_id":       runID,
		"task":         task,
		"backend_id":   firstNonEmpty(req.BackendID, "builtin"),
		"skill_ids":    req.SkillIDs,
		"capabilities": caps,
		"output":       output,
		"content": []map[string]any{{
			"type": "text",
			"text": output,
		}},
		"finished": true,
	}, nil
}

func (s *Server) streamRun(ctx context.Context, w http.ResponseWriter, runID string, req runRequest) {
	h, ok := w.(http.Flusher)
	if !ok {
		httpError(w, fmt.Errorf("streaming is not supported"), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	writeSSE(w, "start", map[string]any{"run_id": runID})
	h.Flush()
	result, err := s.executeRun(ctx, runID, req)
	if err != nil {
		writeSSE(w, "error", map[string]any{"run_id": runID, "error": err.Error()})
		h.Flush()
		return
	}
	text, _ := result["output"].(string)
	for _, chunk := range splitRunChunks(text, 96) {
		if err := ctx.Err(); err != nil {
			writeSSE(w, "aborted", map[string]any{"run_id": runID, "error": err.Error()})
			h.Flush()
			return
		}
		writeSSE(w, "delta", map[string]any{"run_id": runID, "text": chunk})
		h.Flush()
	}
	writeSSE(w, "done", result)
	h.Flush()
}

func (s *Server) runAI(ctx context.Context, req runRequest) (string, error) {
	message := runInputText(req)
	if strings.TrimSpace(message) == "" {
		return "", fmt.Errorf("message or context.selection is required")
	}
	model, _, _, err := s.aiModel("", "")
	if err != nil {
		return "", err
	}
	resp, err := model.Generate(ctx, []agentcore.Message{{
		Role:    agentcore.RoleUser,
		Content: []agentcore.ContentBlock{agentcore.TextBlock(message)},
	}}, nil)
	if err != nil {
		return "", err
	}
	return resp.Message.TextContent(), nil
}

func (s *Server) runRewrite(ctx context.Context, req runRequest) (string, error) {
	if wantsAI(req) {
		text := runInputText(req)
		req.Message = "请改写以下内容，保持含义但优化表达：\n\n" + text
		return s.runAI(ctx, req)
	}
	text := strings.TrimSpace(runInputText(req))
	if text == "" {
		return "", fmt.Errorf("message or context.selection is required")
	}
	return "改写建议：\n" + text + "\n\n说明：当前未启用 AI provider，已完成本地可中断执行链路验证。配置 provider 后可由后端调用模型生成真实改写。", nil
}

func (s *Server) resolveRunCapabilities(req runRequest) ([]capabilityManifest, error) {
	list, err := s.loadCapabilities()
	if err != nil {
		return nil, err
	}
	byID := map[string]capabilityManifest{}
	for _, cap := range list {
		byID[cap.ID] = cap
	}
	ids := append([]string{}, req.SkillIDs...)
	if strings.TrimSpace(req.BackendID) != "" {
		ids = append([]string{req.BackendID}, ids...)
	}
	var selected []capabilityManifest
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		cap, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("capability %q not found", id)
		}
		if !cap.Enabled {
			return nil, fmt.Errorf("capability %q is disabled", id)
		}
		selected = append(selected, cap)
	}
	return selected, nil
}

func (s *Server) loadCapabilities() ([]capabilityManifest, error) {
	path := s.capabilitiesPath()
	var file capabilitiesFile
	if err := readJSONFile(path, &file); err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
	}
	return mergeDefaultCapabilities(file.Capabilities), nil
}

func (s *Server) upsertCapability(cap capabilityManifest) (capabilityManifest, error) {
	now := time.Now().Format(time.RFC3339)
	cap.ID = capabilityID(cap)
	cap.Type = normalizeCapabilityType(cap.Type)
	cap.UpdatedAt = now
	list, err := s.loadUserCapabilities()
	if err != nil {
		return capabilityManifest{}, err
	}
	replaced := false
	for i := range list {
		if list[i].ID == cap.ID {
			if cap.CreatedAt == "" {
				cap.CreatedAt = list[i].CreatedAt
			}
			list[i] = cap
			replaced = true
			break
		}
	}
	if !replaced {
		cap.CreatedAt = now
		list = append(list, cap)
	}
	return cap, s.saveUserCapabilities(list)
}

func (s *Server) deleteCapability(id string) error {
	for _, cap := range defaultCapabilities() {
		if cap.ID == id {
			return fmt.Errorf("%w: %q", errReadOnlyCapability, id)
		}
	}
	list, err := s.loadUserCapabilities()
	if err != nil {
		return err
	}
	out := list[:0]
	for _, cap := range list {
		if cap.ID != id {
			out = append(out, cap)
		}
	}
	return s.saveUserCapabilities(out)
}

var errReadOnlyCapability = errors.New("read_only capability cannot be deleted")

func isRunRequestError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "not found") || strings.Contains(msg, "disabled") || strings.Contains(msg, "is required")
}

func (s *Server) loadUserCapabilities() ([]capabilityManifest, error) {
	var file capabilitiesFile
	if err := readJSONFile(s.capabilitiesPath(), &file); err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	return file.Capabilities, nil
}

func (s *Server) saveUserCapabilities(list []capabilityManifest) error {
	path := s.capabilitiesPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(capabilitiesFile{Capabilities: list}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o600)
}

func (s *Server) capabilitiesPath() string {
	return filepath.Join(s.store.Dir(), ".ainovel", "capabilities.json")
}

func (s *Server) trackCapabilityRun(id string, cancel context.CancelFunc) {
	s.runMu.Lock()
	defer s.runMu.Unlock()
	s.runCtx[id] = cancel
}

func (s *Server) untrackCapabilityRun(id string) {
	s.runMu.Lock()
	defer s.runMu.Unlock()
	delete(s.runCtx, id)
}

func (s *Server) abortCapabilityRuns() int {
	s.runMu.Lock()
	defer s.runMu.Unlock()
	n := 0
	for id, cancel := range s.runCtx {
		cancel()
		delete(s.runCtx, id)
		n++
	}
	return n
}

func validateCapability(cap capabilityManifest) error {
	if cap.ReadOnly {
		return fmt.Errorf("read_only capabilities are managed by the backend")
	}
	if strings.TrimSpace(cap.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if strings.TrimSpace(cap.Version) == "" {
		return fmt.Errorf("version is required")
	}
	if strings.TrimSpace(cap.Source) == "" {
		return fmt.Errorf("source is required")
	}
	if strings.TrimSpace(cap.License) == "" {
		return fmt.Errorf("license is required")
	}
	if strings.TrimSpace(cap.Entry) == "" {
		return fmt.Errorf("entry is required")
	}
	if strings.TrimSpace(cap.Output) == "" {
		return fmt.Errorf("output is required")
	}
	if strings.TrimSpace(cap.Type) == "" {
		return fmt.Errorf("type is required")
	}
	if u, err := url.Parse(cap.Source); err == nil && u.Scheme != "" {
		if u.Scheme != "https" && u.Scheme != "http" {
			return fmt.Errorf("source URL must use http or https")
		}
	}
	return nil
}

func mergeDefaultCapabilities(user []capabilityManifest) []capabilityManifest {
	seen := map[string]bool{}
	out := make([]capabilityManifest, 0, len(user)+4)
	for _, cap := range defaultCapabilities() {
		seen[cap.ID] = true
		out = append(out, cap)
	}
	for _, cap := range user {
		if cap.ID == "" {
			cap.ID = capabilityID(cap)
		}
		if seen[cap.ID] {
			continue
		}
		out = append(out, cap)
	}
	return out
}

func defaultCapabilities() []capabilityManifest {
	return []capabilityManifest{
		{
			ID: "builtin-echo", Name: "内置回显", Type: "skill", Version: "1.0.0",
			Source: "builtin://echo", License: "Apache-2.0", Entry: "builtin:echo", Output: "text",
			Category: "utility", Tags: []string{"offline", "diagnostic"},
			Description: "不调用模型，原样检查上下文与能力执行链路。",
			Steps:       []string{"接收本次任务和上下文", "回传可检查的文本结果"},
			SupportsStream: true, SupportsAbort: true, Enabled: true, ReadOnly: true,
		},
		{
			ID: "builtin-outline", Name: "内置大纲拆分", Type: "skill", Version: "1.0.0",
			Source: "builtin://outline", License: "Apache-2.0", Entry: "builtin:outline", Output: "text",
			Category: "planning", Tags: []string{"outline", "structure"},
			Description:  "把输入拆成起点、推进、转折和收束四段执行骨架。",
			Instructions: "提炼输入中的目标、冲突、关键选择与结果变化，形成可继续写作的执行大纲。",
			Steps:        []string{"识别核心目标", "拆分冲突与场景推进", "安排关键选择和代价", "给出下一步写作任务"},
			SupportsStream: true, SupportsAbort: true, Enabled: true, ReadOnly: true,
		},
		{
			ID: "builtin-rewrite", Name: "内置改写链路", Type: "skill", Version: "1.0.0",
			Source: "builtin://rewrite", License: "Apache-2.0", Entry: "builtin:rewrite", Output: "text",
			Category: "revision", Tags: []string{"rewrite", "style"},
			Description:  "保留原意与人物逻辑，生成可审阅的改写候选。",
			Instructions: "改写时保留原意、人物动机和因果关系，只优化表达、节奏与画面；不要宣称已经写入正文。",
			Steps:        []string{"读取选区与项目上下文", "识别不可改变的信息", "生成改写候选", "等待用户显式写入"},
			SupportsStream: true, SupportsAbort: true, Enabled: true, ReadOnly: true,
		},
		{
			ID: "builtin-continuity", Name: "连续性校准", Type: "skill", Version: "1.0.0",
			Source: "builtin://continuity", License: "Apache-2.0", Entry: "prompt:continuity", Output: "text",
			Category: "continuity", Tags: []string{"facts", "timeline", "causality"},
			Description: "检查人物事实、事件顺序、因果链与设定边界，只报告有上下文证据的问题。",
			Instructions: "逐项核对人物事实、事件顺序、因果链和设定边界。区分明确冲突、缺少证据与合理留白；不得凭空补设定。返回问题位置、证据和最小修改候选。",
			Steps: []string{"提取不可改变的事实", "对照当前正文与项目资料", "标记冲突和证据等级", "给出最小修改候选"},
			Permissions: []string{"context:read"},
			SupportsStream: true, SupportsAbort: true, Enabled: true, ReadOnly: true,
		},
		{
			ID: "builtin-character-voice", Name: "角色声音检查", Type: "skill", Version: "1.0.0",
			Source: "builtin://character-voice", License: "Apache-2.0", Entry: "prompt:character-voice", Output: "text",
			Category: "drafting", Tags: []string{"character", "dialogue", "voice"},
			Description: "检查对话、动作和判断是否符合已提供的人物动机与表达习惯。",
			Instructions: "只依据人物卡和当前文本检查角色声音。保留人物动机和信息差，指出串音、解释性对白与无依据转变，并提供不改变事件结果的候选。",
			Steps: []string{"读取人物卡与场景目标", "区分每个角色的措辞和行动逻辑", "定位串音或动机断点", "生成保持事件结果的候选"},
			Permissions: []string{"context:read"},
			SupportsStream: true, SupportsAbort: true, Enabled: true, ReadOnly: true,
		},
		{
			ID: "builtin-scene-pacing", Name: "场景节奏检查", Type: "skill", Version: "1.0.0",
			Source: "builtin://scene-pacing", License: "Apache-2.0", Entry: "prompt:scene-pacing", Output: "text",
			Category: "revision", Tags: []string{"scene", "pacing", "tension"},
			Description: "检查场景目标、阻力、变化与收束，避免只凭句子长短判断节奏。",
			Instructions: "按场景目标、阻力、信息变化、关键选择和结果检查节奏。保持事件顺序，不擅自增加反转；优先指出可以删减、前移或展开的位置。",
			Steps: []string{"识别场景目标和结果", "检查阻力与信息变化", "定位停滞或跳跃", "返回调整顺序和篇幅的候选"},
			Permissions: []string{"context:read"},
			SupportsStream: true, SupportsAbort: true, Enabled: true, ReadOnly: true,
		},
		{
			ID: "writing-workshop", Name: "Writing Workshop 本地后端", Type: "backend", Version: "0.1",
			Source: "https://github.com/zizegak916-glitch/writing-workshop", License: "Apache-2.0", Entry: "/api/*", Output: "json/event-stream",
			Category: "runtime", Tags: []string{"local-first", "same-origin"},
			Description: "写作工坊原生支持的同源后端，用于模型调用、项目存储、流式输出与任务中断。",
			Steps:       []string{"接收同源请求", "执行已选择能力", "流式返回候选", "接受中断信号"},
			Permissions: []string{"读取本次显式提交的上下文", "写入后端项目数据仅限用户发起的保存操作"},
			SupportsStream: true, SupportsAbort: true, Enabled: true, ReadOnly: true,
		},
	}
}

func resolveRunTask(explicit string, caps []capabilityManifest) string {
	if task := strings.ToLower(strings.TrimSpace(explicit)); task != "" {
		return task
	}
	for _, cap := range caps {
		switch strings.ToLower(strings.TrimSpace(cap.Entry)) {
		case "builtin:outline":
			return "outline"
		case "builtin:rewrite":
			return "rewrite"
		case "builtin:echo":
			return "echo"
		}
	}
	for _, cap := range caps {
		if cap.Type == "backend" || cap.Type == "project" {
			continue
		}
		if strings.TrimSpace(cap.Instructions) != "" || len(cap.Steps) > 0 {
			return "generate"
		}
	}
	return "echo"
}

func capabilityRunMessage(input string, caps []capabilityManifest) string {
	var instructions []string
	for _, cap := range caps {
		if cap.Type == "backend" || cap.Type == "project" {
			continue
		}
		instruction := strings.TrimSpace(cap.Instructions)
		if instruction == "" && len(cap.Steps) > 0 {
			var numbered []string
			for i, step := range cap.Steps {
				if step = strings.TrimSpace(step); step != "" {
					numbered = append(numbered, fmt.Sprintf("%d. %s", i+1, step))
				}
			}
			instruction = strings.Join(numbered, "\n")
		}
		if instruction != "" {
			instructions = append(instructions, fmt.Sprintf("[%s]\n%s", cap.Name, instruction))
		}
	}
	if len(instructions) == 0 {
		return input
	}
	return "【已选择能力的执行要求】\n" + strings.Join(instructions, "\n\n") + "\n\n【本次输入】\n" + input
}

func readJSONFile(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return nil
	}
	return json.Unmarshal(data, v)
}

func capabilityID(cap capabilityManifest) string {
	if id := strings.TrimSpace(cap.ID); id != "" {
		return sanitizeID(id)
	}
	return sanitizeID(cap.Type + "-" + cap.Name)
}

func sanitizeID(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if ok {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func normalizeCapabilityType(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	switch t {
	case "backend", "project", "skill", "rules", "rule", "prompt":
		return t
	default:
		return "skill"
	}
}

func runInputText(req runRequest) string {
	if strings.TrimSpace(req.Message) != "" {
		return strings.TrimSpace(req.Message)
	}
	for _, key := range []string{"selection", "text", "prompt", "content"} {
		if v, ok := req.Context[key]; ok {
			if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
				return strings.TrimSpace(s)
			}
		}
	}
	return ""
}

func wantsStream(r *http.Request, params map[string]any) bool {
	if strings.Contains(r.Header.Get("Accept"), "text/event-stream") {
		return true
	}
	if v, ok := params["stream"].(bool); ok {
		return v
	}
	return false
}

func wantsAI(req runRequest) bool {
	if v, ok := req.Params["use_ai"].(bool); ok {
		return v
	}
	return false
}

func buildEcho(task, input string) string {
	if input == "" {
		input = "未提供输入。"
	}
	return fmt.Sprintf("任务 %q 已执行。\n\n%s", task, input)
}

func buildOutline(input string) string {
	input = strings.TrimSpace(input)
	if input == "" {
		input = "未提供输入。"
	}
	return "# 大纲草案\n\n1. 起点：提炼核心目标。\n2. 推进：拆分冲突、角色和场景。\n3. 转折：安排关键选择与代价。\n4. 收束：形成下一步写作任务。\n\n原始输入：\n" + input
}

func splitRunChunks(s string, maxRunes int) []string {
	rs := []rune(s)
	if len(rs) == 0 {
		return []string{""}
	}
	var chunks []string
	for len(rs) > 0 {
		n := maxRunes
		if len(rs) < n {
			n = len(rs)
		}
		chunks = append(chunks, string(rs[:n]))
		rs = rs[n:]
	}
	return chunks
}

func strconv36(n int64) string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	if n == 0 {
		return "0"
	}
	var buf [16]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = alphabet[n%36]
		n /= 36
	}
	return string(buf[i:])
}
