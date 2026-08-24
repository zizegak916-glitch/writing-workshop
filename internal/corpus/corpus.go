// Package corpus turns user-authorized reference fiction into inspectable local
// metrics and reusable task-scoped guidance. It never stores the imported
// source text and it produces reviewable Prompt Skill candidates rather than
// an author-impersonation prompt.
package corpus

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"html"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/zizegak916-glitch/writing-workshop/internal/utils"
)

const MaxSourceBytes int64 = 20 << 20

type Source struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Format     string         `json:"format"`
	Bytes      int            `json:"bytes"`
	SHA256     string         `json:"sha256"`
	ImportedAt time.Time      `json:"imported_at"`
	Authorized bool           `json:"authorized"`
	TextStored bool           `json:"text_stored"`
	Cleaning   CleaningReport `json:"cleaning"`
}

type CleaningReport struct {
	Encoding              string  `json:"encoding"`
	EncodingConfidence    string  `json:"encoding_confidence"`
	RawRunes              int     `json:"raw_runes"`
	CleanedRunes          int     `json:"cleaned_runes"`
	RetainedRatio         float64 `json:"retained_ratio"`
	RemovedLines          int     `json:"removed_lines"`
	AdLines               int     `json:"ad_lines"`
	GarbledLines          int     `json:"garbled_lines"`
	DuplicateHeadingLines int     `json:"duplicate_heading_lines"`
	HTMLLines             int     `json:"html_lines"`
}

type Frequency struct {
	Value string `json:"value"`
	Count int    `json:"count"`
}
type Metrics struct {
	Runes                 int                `json:"runes"`
	Chapters              int                `json:"chapters"`
	Paragraphs            int                `json:"paragraphs"`
	Sentences             int                `json:"sentences"`
	AverageParagraphRunes float64            `json:"average_paragraph_runes"`
	MedianParagraphRunes  float64            `json:"median_paragraph_runes"`
	P90ParagraphRunes     float64            `json:"p90_paragraph_runes"`
	AverageSentenceRunes  float64            `json:"average_sentence_runes"`
	MedianSentenceRunes   float64            `json:"median_sentence_runes"`
	P90SentenceRunes      float64            `json:"p90_sentence_runes"`
	ParagraphVariation    float64            `json:"paragraph_variation"`
	DialogueRatio         float64            `json:"dialogue_ratio"`
	DialogueTurns         int                `json:"dialogue_turns"`
	ShortParagraphRatio   float64            `json:"short_paragraph_ratio"`
	LongSentenceRatio     float64            `json:"long_sentence_ratio"`
	ExpositionMarkerRatio float64            `json:"exposition_marker_ratio"`
	ActionSentenceRatio   float64            `json:"action_sentence_ratio"`
	SceneBreaks           int                `json:"scene_breaks"`
	ChapterHookRatio      float64            `json:"chapter_hook_ratio"`
	PunctuationPerK       map[string]float64 `json:"punctuation_per_1000"`
	SentenceStarters      []Frequency        `json:"sentence_starters"`
	RepeatedPhrases       []Frequency        `json:"repeated_phrases"`
}

type GuidanceCard struct {
	ID             string   `json:"id"`
	Title          string   `json:"title"`
	Scope          string   `json:"scope"`
	Tasks          []string `json:"tasks"`
	Instruction    string   `json:"instruction"`
	Evidence       string   `json:"evidence"`
	Counterexample string   `json:"counterexample"`
}

type Profile struct {
	Source        Source         `json:"source"`
	Metrics       Metrics        `json:"metrics"`
	Summary       string         `json:"summary"`
	GuidanceCards []GuidanceCard `json:"guidance_cards"`
	Rules         []string       `json:"rules"`
	AntiRules     []string       `json:"anti_rules"`
	EvidenceGrade string         `json:"evidence_grade"`
	Warnings      []string       `json:"warnings"`
}

type Proposal struct {
	ID           string            `json:"id"`
	SourceIDs    []string          `json:"source_ids"`
	TargetSkills []string          `json:"target_skills"`
	Addendum     string            `json:"addendum"`
	SkillAddenda map[string]string `json:"skill_addenda,omitempty"`
	Rules        []string          `json:"rules"`
	Method       string            `json:"method"`
	Warnings     []string          `json:"warnings,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
	Status       string            `json:"status"`
	RollbackHint string            `json:"rollback_hint"`
}

type Archive struct {
	Version   int        `json:"version"`
	Profiles  []Profile  `json:"profiles"`
	Proposals []Proposal `json:"proposals"`
	UpdatedAt time.Time  `json:"updated_at"`
}

var chapterPattern = regexp.MustCompile(`(?i)^(?:(?:正文\s*)?第\s*[〇零一二三四五六七八九十百千万两0-9０-９]+\s*[章卷节回部集篇](?:\s|$|[：:、.\-])|(?:chapter|chap\.?|卷)\s*[0-9０-９ivxlcdm]+(?:\s|$|[：:、.\-])|[0-9０-９]{1,5}\s*[、.．]\s*\S{1,40}|[〇零一二三四五六七八九十百千万两]{1,8}\s*[章回](?:\s|$|[：:、.\-]))`)
var numericChapterPrefixPattern = regexp.MustCompile(`^[0-9０-９]{1,6}\s*[.．、]\s*(第)`)
var htmlNoisePattern = regexp.MustCompile(`(?i)<!--.*?-->|</?(?:script|style|div|span|a|p|br|font|iframe)\b[^>]*>`)
var sentenceSplit = regexp.MustCompile(`[。！？!?…]+`)
var explanationMarkers = []string{"这意味着", "也就是说", "显然", "毫无疑问", "事实上", "因为", "所以", "原来", "换言之"}
var actionMarkers = []string{"走", "跑", "冲", "抬", "伸", "抓", "推", "拉", "转", "看", "望", "盯", "坐", "站", "起", "落", "砸", "劈", "挥", "按", "拿", "放", "退", "进", "出", "开", "关", "躲", "追", "扑", "踢", "撞", "停", "翻", "掀", "甩", "接", "握"}

func Parse(name string, r io.Reader, authorized bool) (Source, string, error) {
	if !authorized {
		return Source{}, "", errors.New("必须确认对导入文本拥有分析权限")
	}
	limited := io.LimitReader(r, MaxSourceBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return Source{}, "", err
	}
	if int64(len(data)) > MaxSourceBytes {
		return Source{}, "", fmt.Errorf("文件超过 %d MiB 限制", MaxSourceBytes>>20)
	}
	ext := strings.ToLower(filepath.Ext(name))
	var text string
	encoding := "docx"
	switch ext {
	case ".txt", ".md", ".markdown":
		text, encoding = utils.DecodeTextWithEncoding(data)
	case ".docx":
		text, err = parseDOCX(data)
	default:
		return Source{}, "", fmt.Errorf("不支持的语料格式 %q", ext)
	}
	if err != nil {
		return Source{}, "", err
	}
	text, cleaning := cleanDownloadedText(text, encoding)
	if utf8.RuneCountInString(text) < 200 {
		return Source{}, "", errors.New("有效正文不足 200 字，无法形成可信校准")
	}
	hash := sha256.Sum256(data)
	sha := hex.EncodeToString(hash[:])
	source := Source{ID: "corpus-" + sha[:12], Name: filepath.Base(name), Format: strings.TrimPrefix(ext, "."), Bytes: len(data), SHA256: sha, ImportedAt: time.Now().UTC(), Authorized: true, TextStored: false, Cleaning: cleaning}
	return source, text, nil
}

func Analyze(source Source, text string) Profile {
	lines := splitParagraphs(text)
	chapterLines := make([]int, 0)
	paragraphs := make([]string, 0, len(lines))
	for i, line := range lines {
		if isChapterHeading(line) {
			chapterLines = append(chapterLines, i)
			continue
		}
		if !isSceneBreak(line) {
			paragraphs = append(paragraphs, line)
		}
	}
	sentences := splitSentences(text)
	runes := utf8.RuneCountInString(text)
	metrics := Metrics{Runes: runes, Chapters: len(chapterLines), Paragraphs: len(paragraphs), Sentences: len(sentences), PunctuationPerK: map[string]float64{}}
	if metrics.Chapters == 0 {
		metrics.Chapters = 1
	}
	var paragraphTotal, sentenceTotal int
	var shortParas, longSentences, exposition, action int
	lengths := make([]int, 0, len(paragraphs))
	sentenceLengths := make([]int, 0, len(sentences))
	for _, p := range paragraphs {
		n := utf8.RuneCountInString(p)
		paragraphTotal += n
		lengths = append(lengths, n)
		if n <= 35 {
			shortParas++
		}
	}
	for _, s := range sentences {
		n := utf8.RuneCountInString(s)
		sentenceTotal += n
		sentenceLengths = append(sentenceLengths, n)
		if n >= 55 {
			longSentences++
		}
		for _, marker := range explanationMarkers {
			if strings.Contains(s, marker) {
				exposition++
				break
			}
		}
		for _, marker := range actionMarkers {
			if strings.Contains(s, marker) {
				action++
				break
			}
		}
	}
	dialogueRunes, dialogueTurns := dialogueStats(text)
	metrics.AverageParagraphRunes = ratio(paragraphTotal, len(paragraphs))
	metrics.MedianParagraphRunes = percentileInts(lengths, .5)
	metrics.P90ParagraphRunes = percentileInts(lengths, .9)
	metrics.AverageSentenceRunes = ratio(sentenceTotal, len(sentences))
	metrics.MedianSentenceRunes = percentileInts(sentenceLengths, .5)
	metrics.P90SentenceRunes = percentileInts(sentenceLengths, .9)
	metrics.ShortParagraphRatio = ratio(shortParas, len(paragraphs))
	metrics.LongSentenceRatio = ratio(longSentences, len(sentences))
	metrics.DialogueRatio = ratio(dialogueRunes, max(1, runes))
	metrics.DialogueTurns = dialogueTurns
	metrics.ExpositionMarkerRatio = ratio(exposition, len(sentences))
	metrics.ActionSentenceRatio = ratio(action, len(sentences))
	metrics.ParagraphVariation = coefficientVariation(lengths)
	for _, line := range lines {
		if isSceneBreak(line) {
			metrics.SceneBreaks++
		}
	}
	metrics.ChapterHookRatio = chapterHookRatio(lines, chapterLines)
	for _, mark := range []string{"，", "。", "！", "？", "；", "：", "……", "——"} {
		metrics.PunctuationPerK[mark] = float64(strings.Count(text, mark)) * 1000 / float64(max(1, runes))
	}
	metrics.SentenceStarters = topFrequencies(sentenceStarters(sentences), 8, 2)
	metrics.RepeatedPhrases = topPhraseFrequencies(text, 4, 8, 4)
	profile := Profile{Source: source, Metrics: metrics, EvidenceGrade: evidenceGrade(runes, len(paragraphs)), AntiRules: []string{"不得要求模型模仿、复刻或冒充具体作者", "不得把语料中的专名、情节、句子或连续表达写入新稿", "所有提示词修改都必须先成为候选，由用户确认后应用"}}
	cleanup := ""
	if source.Cleaning.RemovedLines > 0 {
		cleanup = fmt.Sprintf("清洗 %d 行下载站/乱码残留（广告 %d、乱码 %d、重复章名 %d、HTML %d）后，", source.Cleaning.RemovedLines, source.Cleaning.AdLines, source.Cleaning.GarbledLines, source.Cleaning.DuplicateHeadingLines, source.Cleaning.HTMLLines)
	}
	profile.Summary = fmt.Sprintf("%s识别 %d 章、%d 个正文段和 %d 轮引号对白。典型段长 %.0f 字，90%% 段落不超过约 %.0f 字；对白约占 %.0f%%。结论按场景调用，不作为整书配额。", cleanup, metrics.Chapters, metrics.Paragraphs, metrics.DialogueTurns, metrics.MedianParagraphRunes, metrics.P90ParagraphRunes, metrics.DialogueRatio*100)
	profile.GuidanceCards = deriveGuidanceCards(metrics)
	profile.Rules = deriveRules(metrics)
	if profile.EvidenceGrade != "strong" {
		profile.Warnings = append(profile.Warnings, "样本量不足以形成稳定风格结论；当前建议只作为弱证据")
	}
	if source.Cleaning.RetainedRatio > 0 && source.Cleaning.RetainedRatio < .7 {
		profile.EvidenceGrade = "weak"
		profile.Warnings = append(profile.Warnings, fmt.Sprintf("清洗后仅保留 %.0f%%，污染较重；指导已降级，建议换来源或人工抽查", source.Cleaning.RetainedRatio*100))
	}
	if metrics.Chapters == 1 && runes > 100000 {
		profile.Warnings = append(profile.Warnings, "未可靠识别章节标题；章末与章节节拍结论已降级，请检查特殊标题格式")
	}
	profile.Warnings = append(profile.Warnings, "仅保存哈希与分析档案，不保存导入正文")
	return profile
}

func BuildProposal(profiles []Profile, skills []string) Proposal {
	skills = normalizeSkills(skills)
	var ids []string
	for _, profile := range profiles {
		ids = append(ids, profile.Source.ID)
	}
	baseline, warnings := consensusMetrics(profiles)
	rules := deriveRules(baseline)
	sort.Strings(rules)
	addendum := formatAddendum(rules, warnings)
	skillAddenda := make(map[string]string, len(skills))
	for _, skill := range skills {
		skillAddenda[skill] = formatAddendum(guidanceRulesForSkill(profiles, skill, rules), warnings)
	}
	h := sha256.Sum256([]byte(strings.Join(ids, "|") + strings.Join(skills, "|") + addendum))
	return Proposal{ID: "refine-" + hex.EncodeToString(h[:])[:12], SourceIDs: ids, TargetSkills: append([]string(nil), skills...), Addendum: addendum, SkillAddenda: skillAddenda, Rules: rules, Method: "equal-source-guidance-v3", Warnings: warnings, CreatedAt: time.Now().UTC(), Status: "candidate", RollbackHint: "在 Prompt Skill 管理中恢复应用前版本，或从项目备份还原 prompt_overrides。"}
}

func consensusMetrics(profiles []Profile) (Metrics, []string) {
	if len(profiles) == 0 {
		return Metrics{}, []string{"没有可用语料档案；候选仅含安全边界"}
	}
	values := func(pick func(Metrics) float64) []float64 {
		out := make([]float64, 0, len(profiles))
		for _, p := range profiles {
			out = append(out, pick(p.Metrics))
		}
		return out
	}
	m := Metrics{
		AverageParagraphRunes: median(values(func(m Metrics) float64 { return m.AverageParagraphRunes })),
		MedianParagraphRunes:  median(values(func(m Metrics) float64 { return m.MedianParagraphRunes })),
		P90ParagraphRunes:     median(values(func(m Metrics) float64 { return m.P90ParagraphRunes })),
		AverageSentenceRunes:  median(values(func(m Metrics) float64 { return m.AverageSentenceRunes })),
		MedianSentenceRunes:   median(values(func(m Metrics) float64 { return m.MedianSentenceRunes })),
		P90SentenceRunes:      median(values(func(m Metrics) float64 { return m.P90SentenceRunes })),
		ParagraphVariation:    median(values(func(m Metrics) float64 { return m.ParagraphVariation })),
		DialogueRatio:         median(values(func(m Metrics) float64 { return m.DialogueRatio })),
		ShortParagraphRatio:   median(values(func(m Metrics) float64 { return m.ShortParagraphRatio })),
		LongSentenceRatio:     median(values(func(m Metrics) float64 { return m.LongSentenceRatio })),
		ExpositionMarkerRatio: median(values(func(m Metrics) float64 { return m.ExpositionMarkerRatio })),
		ActionSentenceRatio:   median(values(func(m Metrics) float64 { return m.ActionSentenceRatio })),
		ChapterHookRatio:      median(values(func(m Metrics) float64 { return m.ChapterHookRatio })),
	}
	var warnings []string
	dialogue := values(func(m Metrics) float64 { return m.DialogueRatio })
	paragraph := values(func(m Metrics) float64 { return m.AverageParagraphRunes })
	if spread(dialogue) > .25 {
		warnings = append(warnings, "样本对白密度分歧较大；对白比例只作宽松参考，不作为硬指标")
	}
	if spread(paragraph) > 55 {
		warnings = append(warnings, "样本段落长度分歧较大；段长规则应按场景分别验证")
	}
	return m, warnings
}

func median(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sort.Float64s(values)
	mid := len(values) / 2
	if len(values)%2 == 1 {
		return values[mid]
	}
	return (values[mid-1] + values[mid]) / 2
}
func spread(values []float64) float64 {
	if len(values) < 2 {
		return 0
	}
	sort.Float64s(values)
	return values[len(values)-1] - values[0]
}

func rulesForSkill(skill string, rules []string) []string {
	var out []string
	framing := ""
	for _, rule := range rules {
		keep := true
		switch {
		case strings.Contains(skill, "对白") || strings.Contains(skill, "角色"):
			framing = "语料指标只校准说话段与叙述段的组织；人物目标、知识边界和个人措辞优先于对白比例"
			keep = strings.Contains(rule, "对白") || strings.Contains(rule, "一句") || strings.Contains(rule, "解释")
		case strings.Contains(skill, "节奏") || strings.Contains(skill, "续写"):
			framing = "把段长和句长当作当前场景节拍的参照，只在推进停滞或跳跃处使用，不按全书均值逐段修齐"
			keep = strings.Contains(rule, "段落") || strings.Contains(rule, "推进") || strings.Contains(rule, "一句")
		case strings.Contains(skill, "润色") || strings.Contains(skill, "改写") || strings.Contains(skill, "去AI") || strings.Contains(skill, "降AI"):
			framing = "先保留当前文本已经形成的声音，只用语料信号定位机械重复、失衡句段和解释过量，不把参考样本改写成目标作者"
			keep = !strings.Contains(rule, "对白占比")
		}
		if keep {
			out = append(out, rule)
		}
	}
	if len(out) == 0 {
		out = append(out, rules...)
	}
	if framing != "" {
		out = append([]string{framing}, out...)
	}
	return out
}

func guidanceRulesForSkill(profiles []Profile, skill string, fallback []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, profile := range profiles {
		for _, card := range profile.GuidanceCards {
			matched := false
			for _, task := range card.Tasks {
				if task == skill || (strings.Contains(skill, "对白") && (task == "对话" || task == "人物")) || (strings.Contains(skill, "节奏") && task == "续写") {
					matched = true
					break
				}
			}
			instruction := strings.TrimSpace(card.Instruction)
			if !matched || instruction == "" || seen[instruction] {
				continue
			}
			seen[instruction] = true
			if strings.TrimSpace(card.Counterexample) != "" {
				instruction += "（不适用：" + strings.TrimSpace(card.Counterexample) + "）"
			}
			out = append(out, instruction)
			if len(out) == 9 {
				return out
			}
		}
	}
	if len(out) > 0 {
		return out
	}
	return rulesForSkill(skill, fallback)
}

func formatAddendum(rules, warnings []string) string {
	var b strings.Builder
	b.WriteString("\n\n【本地语料校准候选 · 真实网文指导】\n")
	for _, rule := range rules {
		b.WriteString("- ")
		b.WriteString(rule)
		b.WriteByte('\n')
	}
	for _, warning := range warnings {
		b.WriteString("- 弱约束：")
		b.WriteString(warning)
		b.WriteByte('\n')
	}
	b.WriteString("- 不复刻来源作品的专名、情节、句子或作者身份；统计锚点不是配额。若与项目设定、人物逻辑或本次指令冲突，后者优先。")
	b.WriteString("\n【/本地语料校准候选 · 真实网文指导】")
	return b.String()
}

func normalizeSkills(skills []string) []string {
	if len(skills) == 0 {
		return []string{"润色", "续写", "改写", "节奏", "对白"}
	}
	seen := map[string]bool{}
	out := make([]string, 0, min(len(skills), 64))
	for _, skill := range skills {
		skill = strings.TrimSpace(skill)
		if skill == "" || utf8.RuneCountInString(skill) > 80 || seen[skill] {
			continue
		}
		seen[skill] = true
		out = append(out, skill)
		if len(out) == 64 {
			break
		}
	}
	if len(out) == 0 {
		return []string{"润色", "续写", "改写", "节奏", "对白"}
	}
	return out
}

func Load(path string) (Archive, error) {
	var archive Archive
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return Archive{Version: 1}, nil
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
	return archive, nil
}
func Save(path string, archive Archive) error {
	archive.Version = 1
	archive.UpdatedAt = time.Now().UTC()
	data, err := json.MarshalIndent(archive, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
func UpsertProfile(archive *Archive, profile Profile) bool {
	for i := range archive.Profiles {
		if archive.Profiles[i].Source.SHA256 == profile.Source.SHA256 {
			archive.Profiles[i] = profile
			return false
		}
	}
	archive.Profiles = append(archive.Profiles, profile)
	return true
}

func parseDOCX(data []byte) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", fmt.Errorf("解析 DOCX: %w", err)
	}
	for _, file := range reader.File {
		if file.Name != "word/document.xml" {
			continue
		}
		rc, err := file.Open()
		if err != nil {
			return "", err
		}
		defer rc.Close()
		decoder := xml.NewDecoder(io.LimitReader(rc, MaxSourceBytes))
		var b strings.Builder
		for {
			token, err := decoder.Token()
			if errors.Is(err, io.EOF) {
				break
			}
			if err != nil {
				return "", err
			}
			switch value := token.(type) {
			case xml.CharData:
				b.Write([]byte(value))
			case xml.EndElement:
				if value.Name.Local == "p" {
					b.WriteByte('\n')
				}
			}
		}
		return b.String(), nil
	}
	return "", errors.New("DOCX 缺少 word/document.xml")
}

var adFragments = []string{
	"http://", "https://", "www.", "请登陆", "请登录", "请访问", "最新网址", "章节更多", "支持正版",
	"正版阅读", "手机用户", "txt全集", "txt下载", "本章未完", "点击下一页", "加入书签", "加入书架",
	"投月票", "投推荐票", "求月票", "求推荐票", "稳定更新",
}
var navigationLines = map[string]bool{
	"上一章": true, "下一章": true, "返回目录": true, "章节目录": true, "目录": true, "书页": true,
	"加入书架": true, "收藏本书": true, "投推荐票": true,
}
var mojibakeFragments = []string{"锛", "銆", "鈥", "鈫", "娴", "浣", "鍙", "鐨", "闂", "姣", "绔", "閿", "纭", "缁", "鎴", "瀹", "鏄", "鍦", "浠", "璇", "杩", "濂", "鏃", "鏈", "鐗", "姝", "绗", "澶", "灏", "锟斤拷"}
var promoWords = []string{"求", "月票", "推荐票", "加更", "感谢", "更新"}

func cleanDownloadedText(text, encoding string) (string, CleaningReport) {
	text = html.UnescapeString(strings.TrimPrefix(strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n"), "\uFEFF"))
	rawRunes := utf8.RuneCountInString(text)
	lines := strings.Split(text, "\n")
	kept := make([]string, 0, len(lines))
	previousHeading := ""
	previousWasHeading := false
	report := CleaningReport{Encoding: encoding, EncodingConfidence: "strong", RawRunes: rawRunes}
	for _, raw := range lines {
		line := strings.TrimSpace(strings.NewReplacer("\t", " ", "\u00A0", " ", "\u3000", " ", "\x00", "").Replace(raw))
		if line == "" {
			continue
		}
		if heading := canonicalChapterHeading(line); heading != "" {
			cleanHeading := trimPromoSuffix(numericChapterPrefixPattern.ReplaceAllString(line, "$1"))
			if previousWasHeading && previousHeading == canonicalChapterHeading(cleanHeading) {
				report.RemovedLines++
				report.DuplicateHeadingLines++
				continue
			}
			kept = append(kept, cleanHeading)
			previousHeading = canonicalChapterHeading(cleanHeading)
			previousWasHeading = true
			continue
		}
		previousWasHeading = false
		if htmlNoisePattern.MatchString(line) {
			report.RemovedLines++
			report.HTMLLines++
			continue
		}
		if isGarbledLine(line) {
			report.RemovedLines++
			report.GarbledLines++
			continue
		}
		if isDownloadNoise(line) {
			report.RemovedLines++
			report.AdLines++
			continue
		}
		kept = append(kept, line)
		previousHeading = ""
	}
	clean := strings.Join(kept, "\n")
	report.CleanedRunes = utf8.RuneCountInString(clean)
	report.RetainedRatio = ratio(report.CleanedRunes, max(1, report.RawRunes))
	return clean, report
}

func canonicalChapterHeading(line string) string {
	line = trimPromoSuffix(numericChapterPrefixPattern.ReplaceAllString(strings.TrimSpace(line), "$1"))
	if !isChapterHeading(line) {
		return ""
	}
	return strings.ToLower(strings.Join(strings.Fields(line), ""))
}

func trimPromoSuffix(line string) string {
	pairs := [][2]string{{"（", "）"}, {"(", ")"}, {"【", "】"}, {"[", "]"}}
	for _, pair := range pairs {
		start := strings.LastIndex(line, pair[0])
		if start < 0 || !strings.HasSuffix(line, pair[1]) {
			continue
		}
		inside := line[start+len(pair[0]) : len(line)-len(pair[1])]
		if utf8.RuneCountInString(inside) > 60 {
			continue
		}
		for _, marker := range promoWords {
			if strings.Contains(inside, marker) {
				return strings.TrimSpace(line[:start])
			}
		}
	}
	return strings.TrimSpace(line)
}

func isDownloadNoise(line string) bool {
	lower := strings.ToLower(strings.TrimSpace(line))
	if navigationLines[lower] || strings.HasPrefix(lower, "章节错误") {
		return true
	}
	for _, fragment := range adFragments {
		if strings.Contains(lower, fragment) {
			return true
		}
	}
	return false
}

func isGarbledLine(line string) bool {
	runes := max(1, utf8.RuneCountInString(line))
	replacements := strings.Count(line, "�")
	mojibake := 0
	for _, fragment := range mojibakeFragments {
		mojibake += strings.Count(line, fragment)
	}
	return float64(replacements)/float64(runes) > .015 || mojibake >= max(2, runes/18)
}

func normalize(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			out = append(out, line)
		}
	}
	return strings.Join(out, "\n")
}
func splitParagraphs(text string) []string {
	return strings.FieldsFunc(text, func(r rune) bool { return r == '\n' })
}
func splitSentences(text string) []string {
	parts := sentenceSplit.Split(text, -1)
	out := parts[:0]
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if utf8.RuneCountInString(part) >= 2 {
			out = append(out, part)
		}
	}
	return out
}
func isChapterHeading(line string) bool {
	line = strings.TrimSpace(line)
	return utf8.RuneCountInString(line) <= 70 && chapterPattern.MatchString(line)
}
func isSceneBreak(line string) bool {
	line = strings.TrimSpace(line)
	if utf8.RuneCountInString(line) < 3 {
		return false
	}
	for _, r := range line {
		if r != '*' && r != '-' && r != '—' {
			return false
		}
	}
	return true
}
func dialogueStats(text string) (int, int) {
	pairs := map[rune]rune{'“': '”', '「': '」', '『': '』', '"': '"'}
	var closing rune
	runes, turns := 0, 0
	for _, r := range text {
		if closing == 0 {
			if close, ok := pairs[r]; ok {
				closing = close
				turns++
			}
			continue
		}
		if r == closing || r == '\n' {
			closing = 0
			continue
		}
		runes++
	}
	return runes, turns
}
func percentileInts(values []int, q float64) float64 {
	if len(values) == 0 {
		return 0
	}
	copyValues := append([]int(nil), values...)
	sort.Ints(copyValues)
	q = max(0, min(1, q))
	at := float64(len(copyValues)-1) * q
	lo, hi := int(at), int(at)
	if float64(lo) < at {
		hi++
	}
	if lo == hi {
		return float64(copyValues[lo])
	}
	return float64(copyValues[lo]) + float64(copyValues[hi]-copyValues[lo])*(at-float64(lo))
}
func chapterHookRatio(lines []string, chapterLines []int) float64 {
	if len(chapterLines) < 2 {
		return 0
	}
	hooks, samples := 0, 0
	for i, start := range chapterLines {
		end := len(lines) - 1
		if i+1 < len(chapterLines) {
			end = chapterLines[i+1] - 1
		}
		for end > start && strings.TrimSpace(lines[end]) == "" {
			end--
		}
		if end <= start {
			continue
		}
		tail := strings.TrimSpace(lines[end])
		samples++
		if strings.HasSuffix(tail, "？") || strings.HasSuffix(tail, "?") || strings.HasSuffix(tail, "！") || strings.HasSuffix(tail, "!") || strings.HasSuffix(tail, "……") || strings.HasSuffix(tail, "—") || strings.Contains(tail, "忽然") || strings.Contains(tail, "没想到") || strings.Contains(tail, "就在这时") {
			hooks++
		}
	}
	return ratio(hooks, samples)
}
func isDialogue(p string) bool {
	p = strings.TrimSpace(p)
	return strings.HasPrefix(p, "“") || strings.HasPrefix(p, "\"") || strings.HasPrefix(p, "「") || strings.Count(p, "“")+strings.Count(p, "”") >= 2
}
func ratio(a, b int) float64 {
	if b <= 0 {
		return 0
	}
	return float64(a) / float64(b)
}
func coefficientVariation(values []int) float64 {
	if len(values) < 2 {
		return 0
	}
	var sum float64
	for _, v := range values {
		sum += float64(v)
	}
	mean := sum / float64(len(values))
	if mean == 0 {
		return 0
	}
	var variance float64
	for _, v := range values {
		d := float64(v) - mean
		variance += d * d
	}
	return sqrt(variance/float64(len(values))) / mean
}
func sqrt(x float64) float64 {
	if x <= 0 {
		return 0
	}
	z := x
	for i := 0; i < 12; i++ {
		z = (z + x/z) / 2
	}
	return z
}
func sentenceStarters(sentences []string) []string {
	out := make([]string, 0, len(sentences))
	for _, sentence := range sentences {
		r := []rune(strings.TrimLeftFunc(sentence, func(r rune) bool { return unicode.IsPunct(r) || unicode.IsSpace(r) }))
		if len(r) >= 2 {
			out = append(out, string(r[:min(3, len(r))]))
		}
	}
	return out
}

const phraseSampleRunes = 200_000

// topPhraseFrequencies only samples the beginning and end of a long source.
// A 20 MiB novel must not create a map entry for every possible four-rune
// window; the bounded sample keeps memory predictable while still exposing
// repeated habits from both setup and late-volume prose.
func topPhraseFrequencies(text string, width, limit, minCount int) []Frequency {
	if width <= 0 {
		return nil
	}
	half := phraseSampleRunes / 2
	first := make([]rune, 0, half)
	tail := make([]rune, half)
	tailCount := 0
	for _, r := range text {
		if unicode.IsSpace(r) || unicode.IsPunct(r) {
			continue
		}
		if len(first) < half {
			first = append(first, r)
			continue
		}
		tail[tailCount%half] = r
		tailCount++
	}
	sample := append([]rune(nil), first...)
	if tailCount > 0 {
		n := min(tailCount, half)
		start := 0
		if tailCount >= half {
			start = tailCount % half
		}
		for i := 0; i < n; i++ {
			sample = append(sample, tail[(start+i)%half])
		}
	}
	if len(sample) < width {
		return nil
	}
	counts := make(map[string]int, min(len(sample), phraseSampleRunes))
	for i := 0; i+width <= len(sample); i++ {
		counts[string(sample[i:i+width])]++
	}
	return rankFrequencies(counts, limit, minCount)
}
func topFrequencies(values []string, limit, minCount int) []Frequency {
	counts := map[string]int{}
	for _, v := range values {
		if v != "" {
			counts[v]++
		}
	}
	return rankFrequencies(counts, limit, minCount)
}
func rankFrequencies(counts map[string]int, limit, minCount int) []Frequency {
	out := make([]Frequency, 0, len(counts))
	for v, c := range counts {
		if c >= minCount {
			out = append(out, Frequency{v, c})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			return out[i].Value < out[j].Value
		}
		return out[i].Count > out[j].Count
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}
func evidenceGrade(runes, paragraphs int) string {
	switch {
	case runes >= 100000 && paragraphs >= 1000:
		return "strong"
	case runes >= 30000 && paragraphs >= 250:
		return "moderate"
	default:
		return "weak"
	}
}
func deriveRules(m Metrics) []string {
	rules := []string{fmt.Sprintf("段落长度以约 %.0f 字为统计锚点，允许场景需要优先，不机械对齐", m.AverageParagraphRunes), fmt.Sprintf("对白占比参考区间 %.0f%%–%.0f%%，按场景功能调整", max(0, m.DialogueRatio*100-8), min(100, m.DialogueRatio*100+8))}
	if m.ShortParagraphRatio >= 0.45 {
		rules = append(rules, "推进和反应节点优先用短段落断开，避免把多个动作塞进同一长段")
	}
	if m.ParagraphVariation >= 0.8 {
		rules = append(rules, "保持长短段落明显交替，用段落变化承载节奏而非堆叠形容词")
	}
	if m.LongSentenceRatio < 0.15 {
		rules = append(rules, "一句只承担一个主要动作或判断，复杂信息拆成连续推进")
	}
	if m.ExpositionMarkerRatio > 0.08 {
		rules = append(rules, "解释性连接词只在因果确需澄清时使用，能由动作或反应呈现则删去直说")
	}
	return rules
}

func deriveGuidanceCards(m Metrics) []GuidanceCard {
	medianParagraph := m.MedianParagraphRunes
	if medianParagraph == 0 {
		medianParagraph = m.AverageParagraphRunes
	}
	p90Paragraph := m.P90ParagraphRunes
	if p90Paragraph == 0 {
		p90Paragraph = medianParagraph
	}
	medianSentence := m.MedianSentenceRunes
	if medianSentence == 0 {
		medianSentence = m.AverageSentenceRunes
	}
	cards := []GuidanceCard{
		{
			ID: "rhythm", Title: "段落节拍", Scope: "场景推进与修订",
			Tasks:          []string{"润色", "改写", "扩写", "缩写", "续写", "补写", "节奏", "战斗"},
			Instruction:    fmt.Sprintf("把 %.0f 字左右视为常见段落而非目标值；动作、反应或信息发生转向时可断段，承载完整说明时允许延长，但通常不要无意超过约 %.0f 字。", medianParagraph, p90Paragraph),
			Evidence:       fmt.Sprintf("段长中位数 %.0f，90 分位 %.0f，短段占 %.0f%%。", medianParagraph, p90Paragraph, m.ShortParagraphRatio*100),
			Counterexample: "连续动作、完整对白交换或刻意压迫感需要时，不为迎合数字强行断段。",
		},
		{
			ID: "dialogue", Title: "对白组织", Scope: "对白、人物与场景",
			Tasks:          []string{"对话", "对白", "人物", "心理", "续写", "补写", "润色"},
			Instruction:    fmt.Sprintf("把对白当作行动：每轮话应改变信息、关系或下一步选择；参考文本中引号对白约占 %.0f%%，只用于判断当前场景是否失衡。", m.DialogueRatio*100),
			Evidence:       fmt.Sprintf("识别 %d 轮引号对白；同时统计段中对白，避免只识别以引号开头的段落。", m.DialogueTurns),
			Counterexample: "独处、追逐、环境压迫或意识受限的场景可以几乎没有对白。",
		},
		{
			ID: "sentence", Title: "句子负载", Scope: "表达清晰度",
			Tasks:          []string{"润色", "改写", "缩写", "降AI", "校对", "节奏"},
			Instruction:    fmt.Sprintf("常见句长约 %.0f 字；一句优先承载一个主要动作、判断或信息变化，长句必须保持指代与动作链清楚。", medianSentence),
			Evidence:       fmt.Sprintf("句长 90 分位 %.0f，长句占 %.0f%%。", m.P90SentenceRunes, m.LongSentenceRatio*100),
			Counterexample: "视角人物连续观察、思绪滑移或语势蓄积时，可以保留有控制的长句。",
		},
		{
			ID: "showing", Title: "解释与行动", Scope: "叙述密度",
			Tasks:          []string{"润色", "改写", "续写", "补写", "心理", "情感", "降AI"},
			Instruction:    "先让人物的判断、动作和后果建立因果，再决定是否需要旁白解释；解释用于补足读者无法从场面获得的关键信息。",
			Evidence:       fmt.Sprintf("解释标记句约 %.0f%%，动作动词句约 %.0f%%。", m.ExpositionMarkerRatio*100, m.ActionSentenceRatio*100),
			Counterexample: "世界规则、时间跳转或复杂计划若不说明就会误读时，应保留必要解释。",
		},
	}
	if m.Chapters >= 3 {
		cards = append(cards, GuidanceCard{
			ID: "chapter", Title: "章节收束", Scope: "续写、转折与结尾",
			Tasks:          []string{"续写", "补写", "节奏", "悬疑", "转折", "结局", "大纲"},
			Instruction:    "章节结尾落在可见变化、未完成动作、新信息或明确选择上；钩子来自因果未闭合，不靠无来源反转。",
			Evidence:       fmt.Sprintf("识别 %d 个章节标题；约 %.0f%% 的章末带问题、突变或未完成信号。", m.Chapters, m.ChapterHookRatio*100),
			Counterexample: "情绪落定、关系确认或阶段总结章节，可以安静收束，不必每章悬崖。",
		})
	}
	return cards
}
