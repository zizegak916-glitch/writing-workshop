#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate a professional UI mockup for AI Writing Workshop app."""

from PIL import Image, ImageDraw, ImageFont
import os
import sys

# Dimensions
W, H = 1200, 800

# Colors
BG = "#0d0f14"
CARD = "#1e2330"
CARD2 = "#252b3b"
CARD3 = "#2a3145"
ACCENT = "#6c9bff"
ACCENT_DIM = "#3d5a9e"
TEXT = "#e0e6f0"
TEXT_DIM = "#8892a8"
TEXT_DIMMER = "#5a6478"
BORDER = "#2a3145"
DIVIDER = "#1a1f2c"
GREEN = "#4ecb71"
ORANGE = "#e8a64c"

# Layout
TOPBAR_H = 48
SIDEBAR_W = 220
AIPANEL_W = 300
EDITOR_X = SIDEBAR_W
EDITOR_W = W - SIDEBAR_W - AIPANEL_W
EDITOR_Y = TOPBAR_H
EDITOR_H = H - TOPBAR_H - 52

def load_font(size, bold=False):
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc",
        "/system/fonts/NotoSansCJK-Regular.ttc",
        "/system/fonts/NotoSansSC-Regular.otf",
        "/data/data/com.termux/files/usr/share/fonts/NotoSansCJK-Regular.ttc",
        "/data/data/com.termux/files/usr/share/fonts/DroidSansFallbackFull.ttf",
        "/system/fonts/DroidSansFallback.ttf",
        "/system/fonts/NotoSansSC-Regular.otf",
    ]
    if bold:
        bold_cands = [p.replace("Regular", "Bold") for p in candidates]
        candidates = bold_cands + candidates
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    # Try default
    try:
        return ImageFont.truetype("arial.ttf", size)
    except Exception:
        return ImageFont.load_default()

font_sm = load_font(12)
font_md = load_font(14)
font_lg = load_font(16)
font_xl = load_font(18, bold=True)
font_title = load_font(20, bold=True)
font_editor = load_font(15)

img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

def rrect(x, y, w, h, r=6, fill=None, outline=None, width=1):
    if fill:
        draw.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill)
    if outline:
        draw.rounded_rectangle([x, y, x+w, y+h], radius=r, outline=outline, width=width)

def txt(x, y, text, color=TEXT, font=font_md):
    draw.text((x, y), text, fill=color, font=font)

# === TOP BAR ===
draw.rectangle([0, 0, W, TOPBAR_H], fill="#141822")
draw.line([0, TOPBAR_H, W, TOPBAR_H], fill=BORDER, width=1)

txt(16, 13, "\u2726", ACCENT, font_xl)
txt(38, 14, "AI \u5199\u4f5c\u5de5\u574a", ACCENT, font_title)

rrect(200, 10, 220, 28, r=6, fill=CARD, outline=BORDER)
txt(212, 15, "\U0001f4c1 \u4ed9\u8def\u6f2b\u6f2b \u00b7 \u957f\u7bc7\u4fee\u4ed9\u5c0f\u8bf4", TEXT, font_sm)

stats_data = [
    ("\u603b\u5b57\u6570", "128,456", TEXT),
    ("\u4eca\u65e5", "+2,340", GREEN),
    ("\u7ae0\u8282", "32/50", TEXT_DIM),
]
sx = 660
for label, value, color in stats_data:
    txt(sx, 12, label, TEXT_DIMMER, font_sm)
    txt(sx + 42, 12, value, color, font_md)
    sx += 140

for i, icon in enumerate(["\u2699", "\U0001f464", "\U0001f514"]):
    ox = W - 40 - i * 36
    draw.text((ox, 14), icon, fill=TEXT_DIM, font=font_lg)

# === LEFT SIDEBAR ===
draw.rectangle([0, TOPBAR_H, SIDEBAR_W, H], fill="#111622")
draw.line([SIDEBAR_W, TOPBAR_H, SIDEBAR_W, H], fill=BORDER, width=1)

tabs = [
    ("\u25c7", "\u5927\u7eb2", True),
    ("\U0001f4c4", "\u7ae0\u8282", False),
    ("\U0001f464", "\u4eba\u7269", False),
    ("\U0001f4dd", "\u7b14\u8bb0", False),
]
ty = TOPBAR_H + 12
for icon, label, active in tabs:
    color = ACCENT if active else TEXT_DIM
    if active:
        rrect(8, ty, SIDEBAR_W - 16, 36, r=6, fill=CARD)
    txt(18, ty + 9, icon, color, font_md)
    txt(40, ty + 9, label, color, font_lg)
    ty += 42

draw.line([12, ty + 4, SIDEBAR_W - 12, ty + 4], fill=DIVIDER, width=1)
ty += 16

txt(16, ty, "\u5377\u4e00 \u00b7 \u521d\u5165\u4ed9\u9014", TEXT_DIM, font_sm)
ty += 22
chapters = [
    "\u7b2c\u4e00\u7ae0 \u5c11\u5e74\u51fa\u5c71\u6751",
    "\u7b2c\u4e8c\u7ae0 \u7075\u6839\u6d4b\u8bd5",
    "\u7b2c\u4e09\u7ae0 \u62dc\u5165\u9752\u4e91\u5b97",
    "\u7b2c\u56db\u7ae0 \u5916\u95e8\u5f1f\u5b50",
    "\u7b2c\u4e94\u7ae0 \u521d\u6b21\u4fee\u70bc",
    "\u7b2c\u516d\u7ae0 \u7075\u836f\u56ed",
]
for i, ch in enumerate(chapters):
    active = (i == 0)
    color = TEXT if active else TEXT_DIM
    if active:
        rrect(8, ty - 2, SIDEBAR_W - 16, 24, r=4, fill=CARD2)
    txt(18, ty, ch, color, font_sm)
    ty += 26

ty += 8
txt(16, ty, "\u5377\u4e8c \u00b7 \u70bc\u6c14\u4e4b\u8def", TEXT_DIM, font_sm)
ty += 22
for i in range(3):
    txt(18, ty, "\u7b2c{}\u7ae0 ...".format(i + 7), TEXT_DIMMER, font_sm)
    ty += 26

# === CENTER EDITOR ===
draw.rectangle([EDITOR_X, EDITOR_Y, EDITOR_X + EDITOR_W, TOPBAR_H + EDITOR_H], fill=BG)

ch_y = EDITOR_Y + 16
txt(EDITOR_X + 24, ch_y, "\u7b2c\u4e00\u7ae0  \u5c11\u5e74\u51fa\u5c71\u6751", TEXT, font_title)
draw.line([EDITOR_X + 24, ch_y + 30, EDITOR_X + EDITOR_W - 24, ch_y + 30], fill=DIVIDER, width=1)

editor_content_y = ch_y + 44
editor_x = EDITOR_X + 24

lines = [
    "    \u9752\u5c71\u9547\u5750\u843d\u5728\u82cd\u832b\u7fa4\u5c71\u4e4b\u95f4\uff0c\u9547\u5b50\u4e0d\u5927\uff0c\u5374\u4e5f\u6709\u767e\u6765\u6237\u4eba\u5bb6\u3002\u9547\u5916\u6709",
    "\u4e00\u6761\u6e05\u6f88\u7684\u5c0f\u6eaa\uff0c\u6eaa\u6c34\u6f7a\u6f7a\uff0c\u56db\u5b63\u4e0d\u7edd\u3002\u6eaa\u8fb9\u957f\u7740\u51e0\u68f5\u8001\u67f3\u6811\uff0c\u679d\u6761\u5782",
    "\u5165\u6c34\u4e2d\uff0c\u5728\u5fae\u98ce\u4e2d\u8f7b\u8f7b\u6447\u66f3\u3002",
    "",
    "    \u5c11\u5e74\u9646\u5c18\u5750\u5728\u6eaa\u8fb9\u7684\u4e00\u5757\u9752\u77f3\u4e0a\uff0c\u624b\u91cc\u6367\u7740\u4e00\u5377\u6cdb\u9ec4\u7684\u53e4\u7c4d\u3002\u4ed6\u4eca\u5e74",
    "\u5341\u516d\u5c81\uff0c\u8eab\u6750\u4fee\u957f\uff0c\u9762\u5bb9\u6e05\u79c0\uff0c\u4e00\u53cc\u773c\u775b\u660e\u4eae\u800c\u6df1\u9082\u3002\u867d\u7136\u7a7f\u7740\u7c97\u5e03\u9ebb",
    "\u8863\uff0c\u5374\u63a9\u76d6\u4e0d\u4f4f\u90a3\u80a1\u4e0e\u751f\u4ff1\u6765\u7684\u7075\u6c14\u3002",
    "",
    "    \u201c\u9646\u5c18\uff01\u53c8\u5728\u770b\u4e66\uff01\u201d\u4e00\u4e2a\u82cd\u8001\u7684\u58f0\u97f3\u4ece\u9547\u5b50\u91cc\u4f20\u6765\u3002",
    "",
    "    \u5c11\u5e74\u62ac\u8d77\u5934\uff0c\u770b\u89c1\u4e00\u4e2a\u767d\u53d1\u8001\u8005\u6b63\u67f1\u7740\u62d0\u6756\uff0c\u7f13\u6b65\u8d70\u6765\u3002\u90a3\u662f\u9547\u4e0a",
    "\u7684\u738b\u8001\u5148\u751f\uff0c\u4e5f\u662f\u9646\u5c18\u7684\u542f\u8499\u6069\u5e08\u3002",
    "",
    "    \u201c\u5148\u751f\uff0c\u6211\u5728\u770b\u300a\u4fee\u4ed9\u6742\u8bb0\u300b\uff0c\u91cc\u9762\u8bb0\u8f7d\u4e86\u597d\u591a\u4ed9\u4eba\u7684\u6545\u4e8b\u3002\u201d\u9646\u5c18",
    "\u7ad9\u8d77\u8eab\u6765\uff0c\u606d\u656c\u5730\u884c\u4e86\u4e00\u793c\uff0c\u773c\u4e2d\u95ea\u70c1\u7740\u5411\u5f80\u7684\u5149\u8292\u3002",
    "",
    "    \u738b\u8001\u5148\u751f\u8d70\u5230\u4ed6\u8eab\u8fb9\uff0c\u770b\u4e86\u770b\u90a3\u672c\u53e4\u7c4d\uff0c\u5fae\u5fae\u6447\u5934\uff1a\u201c\u8fd9\u4e9b\u4e0d\u8fc7\u662f",
    "\u524d\u4eba\u7f16\u64b0\u7684\u6545\u4e8b\u7f62\u4e86\u3002\u4fee\u4ed9\u4e4b\u8def\uff0c\u865a\u65e0\u7f25\u7f08\uff0c\u4f60\u8fd8\u662f\u8e0f\u8e0f\u5b9e\u5b9e\u8bfb\u4e66\uff0c",
    "\u5c06\u6765\u8003\u53d6\u529f\u540d\u624d\u662f\u6b63\u9014\u3002\u201d",
    "",
    "    \u9646\u5c18\u6ca1\u6709\u53cd\u9a73\uff0c\u53ea\u662f\u5c06\u53e4\u7c4d\u5c0f\u5fc3\u5730\u6536\u597d\u3002\u4ed6\u77e5\u9053\u5148\u751f\u662f\u4e3a\u4ed6\u597d\uff0c\u4f46",
    "\u5fc3\u4e2d\u90a3\u9897\u4fee\u4ed9\u7684\u79cd\u5b50\uff0c\u65e9\u5df2\u6df1\u6df1\u624e\u4e0b\u4e86\u6839\u3002",
]

ly = editor_content_y
for text in lines:
    if text == "":
        ly += 8
        continue
    txt(editor_x, ly, text, TEXT, font_editor)
    ly += 24

# Cursor
cursor_x = editor_x + 200
cursor_y = ly - 4
draw.line([cursor_x, cursor_y, cursor_x, cursor_y + 18], fill=ACCENT, width=2)

# === AI QUICK TOOLS BAR ===
bar_y = TOPBAR_H + EDITOR_H
draw.rectangle([EDITOR_X, bar_y, EDITOR_X + EDITOR_W, H], fill="#141822")
draw.line([EDITOR_X, bar_y, EDITOR_X + EDITOR_W, bar_y], fill=BORDER, width=1)

tools = [
    ("\u2713", "\u7ea0\u9519", ACCENT),
    ("\u00b6", "\u81ea\u52a8\u6807\u9898", ACCENT),
    ("\u25c7", "\u5b9e\u65f6\u7075\u611f", ACCENT),
    ("\u2295", "\u8d44\u6599\u641c\u7d22", ACCENT),
    ("\u25b7", "\u964dAI\u7387", ORANGE),
    ("\u2295", "\u67e5AI", GREEN),
]

tx = EDITOR_X + 16
ty_bar = bar_y + 10
for icon, label, color in tools:
    tw = len(label) * 14 + 36
    rrect(tx, ty_bar, tw, 30, r=6, fill=CARD2, outline=BORDER)
    txt(tx + 8, ty_bar + 7, icon, color, font_md)
    txt(tx + 26, ty_bar + 7, label, TEXT, font_sm)
    tx += tw + 8

# === RIGHT AI PANEL ===
panel_x = W - AIPANEL_W
draw.rectangle([panel_x, TOPBAR_H, W, H], fill="#111622")
draw.line([panel_x, TOPBAR_H, panel_x, H], fill=BORDER, width=1)

txt(panel_x + 16, TOPBAR_H + 12, "\u2726 AI \u667a\u80fd\u52a9\u624b", ACCENT, font_xl)
draw.line([panel_x + 12, TOPBAR_H + 40, W - 12, TOPBAR_H + 40], fill=DIVIDER, width=1)

# Section: Basic
txt(panel_x + 16, TOPBAR_H + 52, "\u57fa\u7840", TEXT_DIM, font_sm)
ay = TOPBAR_H + 72

basic_cats = [
    ("\u25c7", "\u57fa\u7840\u6a21\u5f0f", "\u57fa\u7840\u5199\u4f5c\u8f85\u52a9"),
    ("\u2191", "\u6269\u5199", "\u6269\u5c55\u4e30\u5bcc\u5185\u5bb9"),
    ("\u2193", "\u7f29\u5199", "\u7cbe\u7b80\u538b\u7f29\u6587\u672c"),
    ("\u21bb", "\u7eed\u5199", "\u667a\u80fd\u7eed\u5199\u4e0b\u6587"),
    ("\u2192", "\u6539\u5199", "\u53d8\u6362\u8868\u8fbe\u65b9\u5f0f"),
    ("\u229e", "\u5927\u7eb2\u751f\u6210", "\u81ea\u52a8\u751f\u6210\u5927\u7eb2"),
]

for i in range(0, len(basic_cats), 2):
    for j in range(2):
        idx = i + j
        if idx >= len(basic_cats):
            break
        icon, name, desc = basic_cats[idx]
        bx = panel_x + 12 + j * 142
        bw = 134
        rrect(bx, ay, bw, 50, r=6, fill=CARD, outline=BORDER)
        txt(bx + 10, ay + 6, icon, ACCENT, font_lg)
        txt(bx + 30, ay + 5, name, TEXT, font_md)
        txt(bx + 10, ay + 28, desc, TEXT_DIMMER, font_sm)
    ay += 58

# Section: Description
ay += 6
draw.line([panel_x + 12, ay, W - 12, ay], fill=DIVIDER, width=1)
ay += 8
txt(panel_x + 16, ay, "\u63cf\u5199", TEXT_DIM, font_sm)
ay += 18

desc_cats = [
    ("\U0001f30a", "\u73af\u5883\u63cf\u5199", "\u573a\u666f\u73af\u5883\u523b\u753b"),
    ("\U0001f464", "\u4eba\u7269\u63cf\u5199", "\u4eba\u7269\u5916\u8c8c\u5fc3\u7406"),
    ("\u2694", "\u6218\u6597\u63cf\u5199", "\u6218\u6597\u52a8\u4f5c\u573a\u9762"),
    ("\U0001f4ad", "\u5fc3\u7406\u63cf\u5199", "\u89d2\u8272\u5185\u5fc3\u72ec\u767d"),
]

for i in range(0, len(desc_cats), 2):
    for j in range(2):
        idx = i + j
        if idx >= len(desc_cats):
            break
        icon, name, desc = desc_cats[idx]
        bx = panel_x + 12 + j * 142
        bw = 134
        rrect(bx, ay, bw, 50, r=6, fill=CARD, outline=BORDER)
        txt(bx + 10, ay + 6, icon, ACCENT, font_lg)
        txt(bx + 30, ay + 5, name, TEXT, font_md)
        txt(bx + 10, ay + 28, desc, TEXT_DIMMER, font_sm)
    ay += 58

# Section: Style
ay += 6
draw.line([panel_x + 12, ay, W - 12, ay], fill=DIVIDER, width=1)
ay += 8
txt(panel_x + 16, ay, "\u98ce\u683c\u4e0e\u5206\u6790", TEXT_DIM, font_sm)
ay += 18

style_cats = [
    ("\U0001f3a8", "\u98ce\u683c\u8f6c\u6362", "\u6539\u53d8\u5199\u4f5c\u98ce\u683c"),
    ("\U0001f4ca", "\u6587\u672c\u5206\u6790", "\u5206\u6790\u6587\u672c\u8d28\u91cf"),
    ("\U0001f50d", "\u67e5\u91cd\u68c0\u6d4b", "\u68c0\u6d4b\u91cd\u590d\u5185\u5bb9"),
    ("\u26a1", "\u964dAI\u7387", "\u964d\u4f4eAI\u75d5\u8ff9"),
]

for i in range(0, len(style_cats), 2):
    for j in range(2):
        idx = i + j
        if idx >= len(style_cats):
            break
        icon, name, desc = style_cats[idx]
        bx = panel_x + 12 + j * 142
        bw = 134
        rrect(bx, ay, bw, 50, r=6, fill=CARD, outline=BORDER)
        c = ACCENT if j == 0 else GREEN
        txt(bx + 10, ay + 6, icon, c, font_lg)
        txt(bx + 30, ay + 5, name, TEXT, font_md)
        txt(bx + 10, ay + 28, desc, TEXT_DIMMER, font_sm)
    ay += 58

# Recent operations
ay += 10
draw.line([panel_x + 12, ay, W - 12, ay], fill=DIVIDER, width=1)
ay += 8
txt(panel_x + 16, ay, "\u6700\u8fd1\u64cd\u4f5c", TEXT_DIM, font_sm)
ay += 20

history = [
    ("\u21bb \u7eed\u5199", "\u5df2\u751f\u6210 320 \u5b57", "2 \u5206\u949f\u524d"),
    ("\u2191 \u6269\u5199", "\u73af\u5883\u63cf\u5199\u6269\u5c55", "15 \u5206\u949f\u524d"),
    ("\u2713 \u7ea0\u9519", "\u4fee\u6b63 3 \u5904\u9519\u8bef", "1 \u5c0f\u65f6\u524d"),
]
for icon_text, desc, time_str in history:
    rrect(panel_x + 12, ay, AIPANEL_W - 24, 30, r=4, fill=CARD)
    txt(panel_x + 20, ay + 7, icon_text, ACCENT, font_sm)
    txt(panel_x + 90, ay + 7, desc, TEXT, font_sm)
    txt(W - 70, ay + 7, time_str, TEXT_DIMMER, font_sm)
    ay += 36

# Save
output_dir = "/data/data/com.termux/files/home/writing-pages"
os.makedirs(output_dir, exist_ok=True)
output_path = os.path.join(output_dir, "showcase-dark.png")
img.save(output_path, "PNG")
print("Saved: {} ({}x{})".format(output_path, W, H))
