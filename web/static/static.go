package static

import "embed"

// Files embeds the writing workshop static application.
//
//go:embed *.html css/*.css js/*.js icons/*.svg
var Files embed.FS
