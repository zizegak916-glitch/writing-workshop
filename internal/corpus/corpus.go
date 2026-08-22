// Package corpus turns user-authorized reference fiction into aggregate,
// inspectable writing signals. It never stores the imported source text and it
// produces candidate Prompt Skill diffs rather than an author-impersonation
// prompt.
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
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const MaxSourceBytes int64 = 20 << 20

type Source struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Format     string    `json:"format"`
	Bytes      int       `json:"bytes"`
	SHA256     string    `json:"sha256"`
	ImportedAt time.Time `json:"imported_at"`
	Authorized bool      `json:"authorized"`
	TextStored bool      `json:"text_stored"`
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
	AverageSentenceRunes  float64            `json:"average_sentence_runes"`
	ParagraphVariation    float64            `json:"paragraph_variation"`
	DialogueRatio         float64            `json:"dialogue_ratio"`
	ShortParagraphRatio   float64            `json:"short_paragraph_ratio"`
	LongSentenceRatio     float64            `json:"long_sentence_ratio"`
	ExpositionMarkerRatio float64            `json:"exposition_marker_ratio"`
	PunctuationPerK       map[string]float64 `json:"punctuation_per_1000"`
	SentenceStarters      []Frequency        `json:"sentence_starters"`
	RepeatedPhrases       []Frequency        `json:"repeated_phrases"`
}

type Profile struct {
	Source        Source   `json:"source"`
	Metrics       Metrics  `json:"metrics"`
	Rules         []string `json:"rules"`
	AntiRules     []string `json:"anti_rules"`
	EvidenceGrade string   `json:"evidence_grade"`
	Warnings      []string `json:"warnings"`
}

type Proposal struct {
	ID           string    `json:"id"`
	SourceIDs    []string  `json:"source_ids"`
	TargetSkills []string  `json:"target_skills"`
	Addendum     string    `json:"addendum"`
	Rules        []string  `json:"rules"`
	CreatedAt    time.Time `json:"created_at"`
	Status       string    `json:"status"`
	RollbackHint string    `json:"rollback_hint"`
}

type Archive struct {
	Version   int        `json:"version"`
	Profiles  []Profile  `json:"profiles"`
	Proposals []Proposal `json:"proposals"`
	UpdatedAt time.Time  `json:"updated_at"`
}

var chapterPattern = regexp.MustCompile(`(?m)^\s*(?:第[零一二三四五六七八九十百千万两0-9]+[章节卷回]|chapter\s+\d+)`)
var sentenceSplit = regexp.MustCompile(`[。！？!?…]+`)
var explanationMarkers = []string{"这意味着", "也就是说", "显然", "毫无疑问", "事实上", "因为", "所以", "原来", "换言之"}

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
	switch ext {
	case ".txt", ".md", ".markdown":
		text = string(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf}))
	case ".docx":
		text, err = parseDOCX(data)
	default:
		return Source{}, "", fmt.Errorf("不支持的语料格式 %q", ext)
	}
	if err != nil {
		return Source{}, "", err
	}
	text = normalize(text)
	if utf8.RuneCountInString(text) < 200 {
		return Source{}, "", errors.New("有效正文不足 200 字，无法形成可信校准")
	}
	hash := sha256.Sum256(data)
	sha := hex.EncodeToString(hash[:])
	source := Source{ID: "corpus-" + sha[:12], Name: filepath.Base(name), Format: strings.TrimPrefix(ext, "."), Bytes: len(data), SHA256: sha, ImportedAt: time.Now().UTC(), Authorized: true, TextStored: false}
	return source, text, nil
}

func Analyze(source Source, text string) Profile {
	paragraphs := splitParagraphs(text)
	sentences := splitSentences(text)
	runes := utf8.RuneCountInString(text)
	metrics := Metrics{Runes: runes, Chapters: len(chapterPattern.FindAllStringIndex(text, -1)), Paragraphs: len(paragraphs), Sentences: len(sentences), PunctuationPerK: map[string]float64{}}
	if metrics.Chapters == 0 {
		metrics.Chapters = 1
	}
	var paragraphTotal, sentenceTotal int
	var shortParas, longSentences, dialogueRunes, exposition int
	lengths := make([]int, 0, len(paragraphs))
	for _, p := range paragraphs {
		n := utf8.RuneCountInString(p)
		paragraphTotal += n
		lengths = append(lengths, n)
		if n <= 35 {
			shortParas++
		}
		if isDialogue(p) {
			dialogueRunes += n
		}
	}
	for _, s := range sentences {
		n := utf8.RuneCountInString(s)
		sentenceTotal += n
		if n >= 55 {
			longSentences++
		}
		for _, marker := range explanationMarkers {
			if strings.Contains(s, marker) {
				exposition++
				break
			}
		}
	}
	metrics.AverageParagraphRunes = ratio(paragraphTotal, len(paragraphs))
	metrics.AverageSentenceRunes = ratio(sentenceTotal, len(sentences))
	metrics.ShortParagraphRatio = ratio(shortParas, len(paragraphs))
	metrics.LongSentenceRatio = ratio(longSentences, len(sentences))
	metrics.DialogueRatio = ratio(dialogueRunes, max(1, runes))
	metrics.ExpositionMarkerRatio = ratio(exposition, len(sentences))
	metrics.ParagraphVariation = coefficientVariation(lengths)
	for _, mark := range []string{"，", "。", "！", "？", "；", "：", "……", "——"} {
		metrics.PunctuationPerK[mark] = float64(strings.Count(text, mark)) * 1000 / float64(max(1, runes))
	}
	metrics.SentenceStarters = topFrequencies(sentenceStarters(sentences), 8, 2)
	metrics.RepeatedPhrases = topPhraseFrequencies(text, 4, 8, 4)
	profile := Profile{Source: source, Metrics: metrics, EvidenceGrade: evidenceGrade(runes, len(paragraphs)), AntiRules: []string{"不得要求模型模仿、复刻或冒充具体作者", "不得把语料中的专名、情节、句子或连续表达写入新稿", "所有规则只能作为候选差分，由用户确认后应用"}}
	profile.Rules = deriveRules(metrics)
	if profile.EvidenceGrade != "strong" {
		profile.Warnings = append(profile.Warnings, "样本量不足以形成稳定风格结论；当前建议只作为弱证据")
	}
	profile.Warnings = append(profile.Warnings, "仅保存哈希与聚合指标，不保存导入正文")
	return profile
}

func BuildProposal(profiles []Profile, skills []string) Proposal {
	skills = normalizeSkills(skills)
	unique := map[string]bool{}
	var rules, ids []string
	for _, profile := range profiles {
		ids = append(ids, profile.Source.ID)
		for _, rule := range profile.Rules {
			if !unique[rule] {
				unique[rule] = true
				rules = append(rules, rule)
			}
		}
	}
	sort.Strings(rules)
	var b strings.Builder
	b.WriteString("\n\n【本地语料校准候选】\n")
	for _, rule := range rules {
		b.WriteString("- ")
		b.WriteString(rule)
		b.WriteByte('\n')
	}
	b.WriteString("- 不复刻来源作品的专名、情节、句子或作者身份；若规则与项目设定冲突，以项目设定和用户本次指令为准。")
	b.WriteString("\n【/本地语料校准候选】")
	h := sha256.Sum256([]byte(strings.Join(ids, "|") + strings.Join(skills, "|") + b.String()))
	return Proposal{ID: "refine-" + hex.EncodeToString(h[:])[:12], SourceIDs: ids, TargetSkills: append([]string(nil), skills...), Addendum: b.String(), Rules: rules, CreatedAt: time.Now().UTC(), Status: "candidate", RollbackHint: "在 Prompt Skill 管理中恢复应用前版本，或从项目备份还原 prompt_overrides。"}
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
	for range 12 {
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
