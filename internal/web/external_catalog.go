package web

import (
	"fmt"
	"net/http"
	"strings"
)

// externalCatalogItem is a reviewed pointer to an upstream project. It is not
// an executable plugin. Importing one only creates a disabled capability record.
type externalCatalogItem struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Kind        string   `json:"kind"`
	Source      string   `json:"source"`
	License     string   `json:"license"`
	Maintainer  string   `json:"maintainer"`
	Description string   `json:"description"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags,omitempty"`
	Package     string   `json:"package,omitempty"`
	Example     string   `json:"example,omitempty"`
	Permissions []string `json:"permissions,omitempty"`
	Risks       []string `json:"risks,omitempty"`
	Status      string   `json:"status"`
	VerifiedAt  string   `json:"verified_at"`
}

func curatedExternalCatalog() []externalCatalogItem {
	const verified = "2026-07-28"
	return []externalCatalogItem{
		{
			ID: "openai-agent-skills", Name: "OpenAI Agent Skills", Kind: "agent-skill-catalog",
			Source: "https://github.com/openai/skills", License: "按具体 skill 的 LICENSE.txt", Maintainer: "OpenAI",
			Description: "官方 Agent Skills 示例与目录。应逐项查看 SKILL.md、脚本和许可证，再决定是否使用。",
			Category:    "utility", Tags: []string{"agent-skills", "catalog"}, Status: "official-catalog", VerifiedAt: verified,
			Permissions: []string{"由具体 skill 声明"}, Risks: []string{"目录不是统一许可证", "不得整库自动安装或执行"},
		},
		{
			ID: "anthropic-agent-skills", Name: "Anthropic Skills", Kind: "agent-skill-catalog",
			Source: "https://github.com/anthropics/skills", License: "按具体 skill 检查；并非全部同一许可证", Maintainer: "Anthropic",
			Description: "公开的 Agent Skills 示例集合，可用于研究技能结构与渐进式上下文加载。",
			Category:    "utility", Tags: []string{"agent-skills", "catalog"}, Status: "official-catalog", VerifiedAt: verified,
			Permissions: []string{"由具体 skill 声明"}, Risks: []string{"部分目录不是开源许可证", "导入前必须逐项审查"},
		},
		{
			ID: "skillport", Name: "SkillPort", Kind: "agent-skill-tool",
			Source: "https://github.com/gotalab/skillport", License: "MIT", Maintainer: "gotalab",
			Description: "面向 Agent Skills 的本地 CLI / MCP 索引与校验工具，适合先搜索元数据、需要时再加载全文。",
			Category:    "utility", Tags: []string{"agent-skills", "validation", "mcp"}, Package: "skillport",
			Example: "按上游 README 固定版本安装；先执行 validate，再连接 MCP。", Status: "community", VerifiedAt: verified,
			Permissions: []string{"读取本地 skills 目录", "作为 MCP 进程运行"}, Risks: []string{"API 仍可能变化", "运行前固定版本并审查目录权限"},
		},
		{
			ID: "mcp-registry", Name: "Official MCP Registry", Kind: "mcp-registry",
			Source: "https://github.com/modelcontextprotocol/registry", License: "Apache-2.0", Maintainer: "Model Context Protocol",
			Description: "官方 MCP 服务器注册表的预览实现，用于发现来源；注册并不等于 Writing Workshop 已信任或可执行。",
			Category:    "utility", Tags: []string{"mcp", "registry"}, Status: "official-preview", VerifiedAt: verified,
			Permissions: []string{"仅作为来源索引"}, Risks: []string{"注册表仍处于 preview", "条目需要独立威胁建模"},
		},
		{
			ID: "mcp-filesystem", Name: "MCP Filesystem（参考实现）", Kind: "mcp-server",
			Source: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem", License: "MIT", Maintainer: "Model Context Protocol",
			Description: "对明确允许的目录提供文件读写。仅适合隔离目录与最小权限实验。",
			Category:    "utility", Tags: []string{"mcp", "filesystem"}, Package: "@modelcontextprotocol/server-filesystem",
			Example: "npx -y @modelcontextprotocol/server-filesystem@<固定版本> /path/to/allowed/files", Status: "official-reference", VerifiedAt: verified,
			Permissions: []string{"读取允许目录", "写入允许目录"}, Risks: []string{"官方明确说明参考服务器不面向生产", "目录范围配置错误可能暴露或改写文件"},
		},
		{
			ID: "mcp-git", Name: "MCP Git（参考实现）", Kind: "mcp-server",
			Source: "https://github.com/modelcontextprotocol/servers/tree/main/src/git", License: "MIT", Maintainer: "Model Context Protocol",
			Description: "读取和操作指定 Git 仓库的参考 MCP 服务器。",
			Category:    "utility", Tags: []string{"mcp", "git"}, Package: "mcp-server-git",
			Example: "uvx mcp-server-git --repository /path/to/repository", Status: "official-reference", VerifiedAt: verified,
			Permissions: []string{"读取指定仓库", "执行受支持的 Git 操作"}, Risks: []string{"官方明确说明参考服务器不面向生产", "写操作必须另行确认和隔离"},
		},
		{
			ID: "mcp-memory", Name: "MCP Memory（参考实现）", Kind: "mcp-server",
			Source: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory", License: "MIT", Maintainer: "Model Context Protocol",
			Description: "知识图谱式持久记忆参考实现，可用于研究显式记忆边界。",
			Category:    "research", Tags: []string{"mcp", "memory"}, Package: "@modelcontextprotocol/server-memory",
			Example: "npx -y @modelcontextprotocol/server-memory@<固定版本>", Status: "official-reference", VerifiedAt: verified,
			Permissions: []string{"读写其记忆存储"}, Risks: []string{"官方明确说明参考服务器不面向生产", "不得把私稿或密钥写入未经隔离的共享存储"},
		},
		{
			ID: "mcp-fetch", Name: "MCP Fetch（参考实现）", Kind: "mcp-server",
			Source: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch", License: "MIT", Maintainer: "Model Context Protocol",
			Description: "抓取网页并转换为适合模型读取的内容，仅作为有网络权限工具的参考。",
			Category:    "research", Tags: []string{"mcp", "fetch", "research"}, Package: "mcp-server-fetch",
			Example: "uvx mcp-server-fetch", Status: "official-reference", VerifiedAt: verified,
			Permissions: []string{"访问网络"}, Risks: []string{"官方明确说明参考服务器不面向生产", "需要 SSRF、来源可信度和内容注入防护"},
		},
		{
			ID: "openwriter", Name: "OpenWriter", Kind: "mcp-writing-app",
			Source: "https://github.com/travsteward/openwriter", License: "MIT", Maintainer: "travsteward",
			Description: "Markdown 原生的代理写作界面，提供 MCP、版本历史和变更接受/拒绝交互，可作为工作流设计参考。",
			Category:    "drafting", Tags: []string{"writing", "markdown", "mcp"}, Status: "community", VerifiedAt: verified,
			Permissions: []string{"按其部署配置读写文档"}, Risks: []string{"独立应用，不是 Writing Workshop 内置 Skill", "接入前需单独审查部署和数据边界"},
		},
	}
}

func (s *Server) handleExternalCatalog(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, map[string]any{
			"items":            curatedExternalCatalog(),
			"execution_policy": "metadata-only",
			"notice":           "导入只登记为停用能力，不下载、不安装、不执行第三方代码。",
		})
	case http.MethodPost:
		var req struct {
			ID string `json:"id"`
		}
		if err := readJSON(r, &req); err != nil {
			httpError(w, err, http.StatusBadRequest)
			return
		}
		var selected *externalCatalogItem
		for _, item := range curatedExternalCatalog() {
			if item.ID == strings.TrimSpace(req.ID) {
				copy := item
				selected = &copy
				break
			}
		}
		if selected == nil {
			httpError(w, fmt.Errorf("external catalog item %q not found", req.ID), http.StatusNotFound)
			return
		}
		permissions := append([]string{}, selected.Permissions...)
		permissions = append(permissions, "Writing Workshop 不下载、不安装、不执行此来源")
		capability := capabilityManifest{
			ID: "external-" + selected.ID, Name: selected.Name, Type: "skill", Version: "upstream",
			Source: selected.Source, License: selected.License, Author: selected.Maintainer,
			Description: selected.Description + "（当前仅登记元数据）",
			Category:    selected.Category, Tags: selected.Tags, Entry: "external:" + selected.Kind,
			Output: "external", Permissions: permissions, Enabled: false,
		}
		saved, err := s.upsertCapability(capability)
		if err != nil {
			respond(w, nil, err)
			return
		}
		writeJSON(w, map[string]any{
			"imported": true, "capability": saved,
			"notice": "已登记为停用能力；没有下载或执行第三方代码。",
		})
	}
}
