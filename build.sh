#!/bin/bash
# build.sh — Merge modular files back into single index.html for GitHub Pages
# Usage: bash build.sh

set -euo pipefail
cd "$(dirname "$0")"

OUT="index.html"
echo "🔨 Building $OUT ..."

# Header (everything before first <style>)
cat > "$OUT" << 'HEADER'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>AI 写作工坊</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;510&family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
HEADER

# CSS (inline, two blocks like original)
echo "<style>" >> "$OUT"
cat css/main.css >> "$OUT"
echo "</style>" >> "$OUT"
echo "<style>" >> "$OUT"
cat css/privacy.css >> "$OUT"
echo "</style>" >> "$OUT"
echo "</head>" >> "$OUT"
echo "<body>" >> "$OUT"

# SVG icons (inline)
cat icons/sprite.svg >> "$OUT"
echo "" >> "$OUT"

# HTML body (inline)
cat parts/body.html >> "$OUT"

# JS (inline, order matches original)
echo "<script>" >> "$OUT"
for f in js/db.js js/state.js js/i18n.js js/app.js js/editor.js js/project.js js/ai.js js/ui.js js/settings.js; do
    if [ -f "$f" ]; then
        cat "$f" >> "$OUT"
        echo "" >> "$OUT"
    else
        echo "⚠️  Missing: $f"
    fi
done
echo "</script>" >> "$OUT"

echo "</body>" >> "$OUT"
echo "</html>" >> "$OUT"

# Report
SIZE=$(wc -c < "$OUT")
LINES=$(wc -l < "$OUT")
echo "✅ Built $OUT: $SIZE bytes, $LINES lines"
