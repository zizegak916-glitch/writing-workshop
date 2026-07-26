package web

import "net/http"

// runtimeExtension is deliberately disabled in the community build. It keeps
// one internal mount point for an optional deployment-specific service layer
// without coupling the local-first workbench to accounts or remote storage.
type runtimeExtension interface {
	Mount(*http.ServeMux)
}

type disabledRuntimeExtension struct{}

func (disabledRuntimeExtension) Mount(*http.ServeMux) {}
