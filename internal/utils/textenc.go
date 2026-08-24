package utils

import (
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	xunicode "golang.org/x/text/encoding/unicode"
)

// DecodeText 把用户提供的文本文件字节解码为 UTF-8：非法 UTF-8 时按 GB18030
// （GBK 超集）转码——网络流传的中文小说 txt 大量为 GBK 编码，直接当 UTF-8 读
// 全是乱码。非 GBK 的字节序列会被解码器替换为 U+FFFD（本就是乱码，由调用方的
// 零命中兜底报错引导用户）。最后剥离 UTF-8 BOM（否则行首匹配会带上它）。
func DecodeText(data []byte) string {
	text, _ := DecodeTextWithEncoding(data)
	return text
}

// DecodeTextWithEncoding returns normalized UTF-8 text and the decoder that
// won. The encoding label is persisted in corpus cleaning reports so a user can
// tell whether a downloaded novel was UTF-8, UTF-16 or GB18030/GBK.
func DecodeTextWithEncoding(data []byte) (string, string) {
	if len(data) >= 2 && data[0] == 0xff && data[1] == 0xfe {
		if decoded, err := xunicode.UTF16(xunicode.LittleEndian, xunicode.ExpectBOM).NewDecoder().Bytes(data); err == nil {
			return strings.TrimPrefix(string(decoded), "\uFEFF"), "utf-16le"
		}
	}
	if len(data) >= 2 && data[0] == 0xfe && data[1] == 0xff {
		if decoded, err := xunicode.UTF16(xunicode.BigEndian, xunicode.ExpectBOM).NewDecoder().Bytes(data); err == nil {
			return strings.TrimPrefix(string(decoded), "\uFEFF"), "utf-16be"
		}
	}
	if utf8.Valid(data) {
		return strings.TrimPrefix(string(data), "\uFEFF"), "utf-8"
	}
	if decoded, err := simplifiedchinese.GB18030.NewDecoder().Bytes(data); err == nil {
		return strings.TrimPrefix(string(decoded), "\uFEFF"), "gb18030"
	}
	return strings.TrimPrefix(string(data), "\uFEFF"), "utf-8-replacement"
}
