package static

import "embed"

// Files embeds the writing workshop static application.
//
//go:embed *.html *.js *.json css/*.css js/*.js icons/*.svg parts/*.html
var Files embed.FS
