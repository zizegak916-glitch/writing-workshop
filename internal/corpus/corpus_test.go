package corpus

import (
	"bytes"
	"strings"
	"testing"

	"golang.org/x/text/encoding/simplifiedchinese"
)

func TestParseAnalyzeDoesNotRetainSourceText(t *testing.T) {
	text := "第一章 风起\n" + strings.Repeat("他推开门，看见雨线压过长街。\n“先进去。”她说。\n他没有回答，只把伞递了过去。\n", 40)
	source, normalized, err := Parse("reference.txt", strings.NewReader(text), true)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	profile := Analyze(source, normalized)
	if profile.Source.TextStored {
		t.Fatal("source text must not be retained")
	}
	if profile.Metrics.Paragraphs < 100 || profile.Metrics.DialogueRatio <= 0 {
		t.Fatalf("unexpected metrics: %+v", profile.Metrics)
	}
	if len(profile.Rules) == 0 || len(profile.AntiRules) == 0 {
		t.Fatalf("expected rules and anti-rules: %+v", profile)
	}
}

func TestParseRequiresAuthorizationAndDeduplicates(t *testing.T) {
	text := strings.Repeat("一段用于测试的虚构文本。\n", 50)
	if _, _, err := Parse("sample.md", strings.NewReader(text), false); err == nil {
		t.Fatal("authorization must be explicit")
	}
	source, normalized, err := Parse("sample.md", strings.NewReader(text), true)
	if err != nil {
		t.Fatal(err)
	}
	archive := Archive{Version: 1}
	if !UpsertProfile(&archive, Analyze(source, normalized)) {
		t.Fatal("first insert should be new")
	}
	if UpsertProfile(&archive, Analyze(source, normalized)) {
		t.Fatal("same hash should update, not duplicate")
	}
	if len(archive.Profiles) != 1 {
		t.Fatalf("profiles=%d", len(archive.Profiles))
	}
}

func TestBuildProposalIsCandidateAndRollbackable(t *testing.T) {
	profile := Profile{Source: Source{ID: "corpus-demo"}, Metrics: Metrics{AverageParagraphRunes: 32, DialogueRatio: .3, ShortParagraphRatio: .5, ParagraphVariation: .9}}
	proposal := BuildProposal([]Profile{profile}, []string{"润色", "润色", "节奏", strings.Repeat("过长", 100)})
	if proposal.Status != "candidate" || proposal.RollbackHint == "" {
		t.Fatalf("proposal must be reversible: %+v", proposal)
	}
	for _, forbidden := range []string{"模仿某作者", "自动覆盖"} {
		if strings.Contains(proposal.Addendum, forbidden) {
			t.Fatalf("unsafe proposal: %s", proposal.Addendum)
		}
	}
	if len(proposal.TargetSkills) != 2 {
		t.Fatalf("target skills must be deduplicated and bounded: %#v", proposal.TargetSkills)
	}
	if proposal.Method != "equal-source-guidance-v3" || proposal.SkillAddenda["节奏"] == proposal.SkillAddenda["润色"] {
		t.Fatalf("proposal must be consensus-based and skill-specific: %+v", proposal)
	}
}

func TestAnalyzeRecognizesCommonChapterFormatsAndInlineDialogue(t *testing.T) {
	text := strings.Join([]string{
		"001、雨夜",
		"他推开门，她在身后说：“先别进去。”",
		"风从走廊尽头压过来。",
		"第二章 灯下",
		"“你看见了吗？”他停住脚步。",
		"她没有回答。",
		"Chapter 3 Return",
		"门忽然自己开了！",
	}, "\n") + "\n" + strings.Repeat("他往前走了一步。\n", 40)
	source, normalized, err := Parse("chapters.txt", strings.NewReader(text), true)
	if err != nil {
		t.Fatal(err)
	}
	profile := Analyze(source, normalized)
	if profile.Metrics.Chapters != 3 {
		t.Fatalf("chapters=%d", profile.Metrics.Chapters)
	}
	if profile.Metrics.DialogueTurns < 2 || profile.Metrics.DialogueRatio <= 0 {
		t.Fatalf("dialogue metrics=%+v", profile.Metrics)
	}
	if profile.Summary == "" || len(profile.GuidanceCards) < 4 || profile.Metrics.MedianParagraphRunes == 0 {
		t.Fatalf("incomplete guidance profile: %+v", profile)
	}
}

func TestBuildProposalUsesEqualSourceMedianAndFlagsConflict(t *testing.T) {
	profiles := []Profile{
		{Source: Source{ID: "a"}, Metrics: Metrics{AverageParagraphRunes: 20, DialogueRatio: .1}},
		{Source: Source{ID: "b"}, Metrics: Metrics{AverageParagraphRunes: 80, DialogueRatio: .5}},
		{Source: Source{ID: "c"}, Metrics: Metrics{AverageParagraphRunes: 40, DialogueRatio: .3}},
	}
	p := BuildProposal(profiles, []string{"对白"})
	if !strings.Contains(p.Addendum, "约 40 字") || len(p.Warnings) < 2 {
		t.Fatalf("unexpected consensus proposal: %+v", p)
	}
}

func TestPhraseAnalysisUsesBoundedSample(t *testing.T) {
	text := strings.Repeat("甲乙丙丁戊己庚辛", phraseSampleRunes/4) + strings.Repeat("终章节奏", 2000)
	frequencies := topPhraseFrequencies(text, 4, 8, 4)
	if len(frequencies) == 0 || len(frequencies) > 8 {
		t.Fatalf("unexpected bounded frequencies: %#v", frequencies)
	}
}

func TestParseDecodesGB18030AndCleansDownloadedNovelNoise(t *testing.T) {
	chapter := "第一章 雨夜（求月票）\n\n第一章 雨夜\n<!--adv2-->\n请登陆www.qidian.com，章节更多，支持作者，支持正版阅读！\n" + strings.Repeat("他推开门，她按住门说：“先别进去。”\n", 20)
	text := strings.Repeat(chapter, 8)
	encoded, err := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte(text))
	if err != nil {
		t.Fatal(err)
	}
	source, clean, err := Parse("download.txt", bytes.NewReader(encoded), true)
	if err != nil {
		t.Fatal(err)
	}
	if source.Cleaning.Encoding != "gb18030" || source.Cleaning.AdLines < 8 || source.Cleaning.HTMLLines < 8 || source.Cleaning.DuplicateHeadingLines < 8 {
		t.Fatalf("unexpected cleaning report: %+v", source.Cleaning)
	}
	if strings.Contains(clean, "qidian.com") || strings.Contains(clean, "adv2") || strings.Contains(clean, "求月票") {
		t.Fatalf("download pollution survived cleaning: %q", clean[:min(300, len(clean))])
	}
	profile := Analyze(source, clean)
	if !strings.Contains(profile.Summary, "清洗") || profile.Metrics.Chapters != 8 {
		t.Fatalf("cleaning must feed the profile: %+v", profile)
	}
}
