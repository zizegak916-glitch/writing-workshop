package web

import (
	"bytes"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	httpBridgeRoutePrefix          = "/api/http-bridge/"
	httpBridgeTokenHeader          = "X-WW-Bridge-Token"
	defaultHTTPBridgeMaxBody       = int64(16 << 20)
	defaultHTTPBridgeMaxConcurrent = 4
	defaultHTTPBridgeTimeout       = 10 * time.Minute
)

var httpBridgeTargetName = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

type httpBridge struct {
	targets      map[string]*url.URL
	token        string
	maxBodyBytes int64
	client       *http.Client
	slots        chan struct{}
}

func newHTTPBridgeFromEnv() (*httpBridge, error) {
	rawTargets := strings.TrimSpace(os.Getenv("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS"))
	token := strings.TrimSpace(os.Getenv("WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN"))
	if rawTargets == "" && token == "" {
		return nil, nil
	}
	if rawTargets == "" || token == "" {
		return nil, errors.New("HTTP bridge requires both WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS and WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN")
	}
	if len(token) < 24 {
		return nil, errors.New("WRITING_WORKSHOP_HTTP_BRIDGE_TOKEN must contain at least 24 characters")
	}

	var configured map[string]string
	if err := json.Unmarshal([]byte(rawTargets), &configured); err != nil {
		return nil, fmt.Errorf("parse WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS as JSON object: %w", err)
	}
	if len(configured) == 0 {
		return nil, errors.New("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS must contain at least one named target")
	}
	if len(configured) > 16 {
		return nil, errors.New("WRITING_WORKSHOP_HTTP_BRIDGE_TARGETS supports at most 16 named targets")
	}

	targets := make(map[string]*url.URL, len(configured))
	for name, rawTarget := range configured {
		if !httpBridgeTargetName.MatchString(name) {
			return nil, fmt.Errorf("HTTP bridge target name %q must match %s", name, httpBridgeTargetName.String())
		}
		target, err := parseHTTPBridgeTarget(rawTarget)
		if err != nil {
			return nil, fmt.Errorf("HTTP bridge target %q: %w", name, err)
		}
		targets[name] = target
	}

	maxBodyBytes, err := envInt64("WRITING_WORKSHOP_HTTP_BRIDGE_MAX_BYTES", defaultHTTPBridgeMaxBody, 1024, 128<<20)
	if err != nil {
		return nil, err
	}
	maxConcurrent, err := envInt64("WRITING_WORKSHOP_HTTP_BRIDGE_MAX_CONCURRENT", defaultHTTPBridgeMaxConcurrent, 1, 64)
	if err != nil {
		return nil, err
	}
	timeoutMS, err := envInt64("WRITING_WORKSHOP_HTTP_BRIDGE_TIMEOUT_MS", defaultHTTPBridgeTimeout.Milliseconds(), 5000, int64((30 * time.Minute).Milliseconds()))
	if err != nil {
		return nil, err
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = time.Duration(timeoutMS) * time.Millisecond
	return &httpBridge{
		targets:      targets,
		token:        token,
		maxBodyBytes: maxBodyBytes,
		client: &http.Client{
			Transport: transport,
			// ResponseHeaderTimeout limits a silent upstream before headers. A
			// fixed Client.Timeout would corrupt healthy long-lived SSE streams.
			Timeout: 0,
		},
		slots: make(chan struct{}, int(maxConcurrent)),
	}, nil
}

func parseHTTPBridgeTarget(raw string) (*url.URL, error) {
	target, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return nil, err
	}
	if target.Scheme != "http" && target.Scheme != "https" {
		return nil, errors.New("target must use http:// or https://")
	}
	if target.Host == "" {
		return nil, errors.New("target host is required")
	}
	if target.User != nil {
		return nil, errors.New("target URL must not contain embedded credentials")
	}
	if target.RawQuery != "" || target.Fragment != "" {
		return nil, errors.New("target URL must not contain a query or fragment")
	}
	target.Path = strings.TrimRight(target.Path, "/")
	target.RawPath = ""
	return target, nil
}

func envInt64(name string, fallback, minimum, maximum int64) (int64, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be an integer between %d and %d", name, minimum, maximum)
	}
	return value, nil
}

func (b *httpBridge) serveHTTP(w http.ResponseWriter, r *http.Request) {
	if b == nil {
		httpError(w, errors.New("HTTP compatibility bridge is disabled"), http.StatusNotFound)
		return
	}
	if !bridgeTokenEqual(r.Header.Get(httpBridgeTokenHeader), b.token) {
		w.Header().Set("WWW-Authenticate", "WW-Bridge")
		httpError(w, errors.New("HTTP bridge token is missing or invalid"), http.StatusUnauthorized)
		return
	}
	targetName, suffix, err := bridgeTargetAndPath(r.URL.Path)
	if err != nil {
		httpError(w, err, http.StatusBadRequest)
		return
	}
	base, ok := b.targets[targetName]
	if !ok {
		httpError(w, fmt.Errorf("HTTP bridge target %q is not configured", targetName), http.StatusNotFound)
		return
	}
	if hasUnsafePathSegment(suffix) {
		httpError(w, errors.New("HTTP bridge path contains an unsafe segment"), http.StatusBadRequest)
		return
	}
	if r.ContentLength > b.maxBodyBytes {
		httpError(w, fmt.Errorf("HTTP bridge request exceeds %d bytes", b.maxBodyBytes), http.StatusRequestEntityTooLarge)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, b.maxBodyBytes+1))
	if err != nil {
		httpError(w, fmt.Errorf("read HTTP bridge request: %w", err), http.StatusBadRequest)
		return
	}
	if int64(len(body)) > b.maxBodyBytes {
		httpError(w, fmt.Errorf("HTTP bridge request exceeds %d bytes", b.maxBodyBytes), http.StatusRequestEntityTooLarge)
		return
	}
	select {
	case b.slots <- struct{}{}:
		defer func() { <-b.slots }()
	default:
		w.Header().Set("Retry-After", "2")
		httpError(w, errors.New("HTTP bridge concurrency limit reached"), http.StatusTooManyRequests)
		return
	}

	upstreamURL := *base
	upstreamURL.Path = joinURLPath(base.Path, suffix)
	upstreamURL.RawQuery = r.URL.RawQuery
	request, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL.String(), bytes.NewReader(body))
	if err != nil {
		httpError(w, fmt.Errorf("prepare HTTP bridge request: %w", err), http.StatusBadRequest)
		return
	}
	copyBridgeRequestHeaders(request.Header, r.Header)

	client := *b.client
	client.CheckRedirect = func(next *http.Request, previous []*http.Request) error {
		if len(previous) >= 5 {
			return errors.New("HTTP bridge stopped after 5 redirects")
		}
		if !sameURLOrigin(next.URL, base) || !urlWithinBridgeTarget(next.URL, base) {
			return errors.New("HTTP bridge rejected a redirect outside the configured target")
		}
		return nil
	}
	response, err := client.Do(request)
	if err != nil {
		httpError(w, fmt.Errorf("HTTP bridge target %q request failed: %w", targetName, err), http.StatusBadGateway)
		return
	}
	defer response.Body.Close()

	copyBridgeResponseHeaders(w.Header(), response.Header)
	w.Header().Set("X-Writing-Workshop-Bridge", targetName)
	w.WriteHeader(response.StatusCode)
	if err := copyBridgeResponse(w, response.Body); err != nil {
		writeBridgeStreamError(w, response.Header.Get("Content-Type"))
	}
}

func bridgeTokenEqual(provided, expected string) bool {
	provided = strings.TrimSpace(provided)
	if provided == "" || len(provided) != len(expected) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func bridgeTargetAndPath(requestPath string) (string, string, error) {
	remainder := strings.TrimPrefix(requestPath, httpBridgeRoutePrefix)
	if remainder == requestPath || remainder == "" {
		return "", "", errors.New("HTTP bridge URL must include a configured target name")
	}
	parts := strings.SplitN(remainder, "/", 2)
	if !httpBridgeTargetName.MatchString(parts[0]) {
		return "", "", errors.New("HTTP bridge target name is invalid")
	}
	suffix := "/"
	if len(parts) == 2 && parts[1] != "" {
		suffix += parts[1]
	}
	return parts[0], suffix, nil
}

func hasUnsafePathSegment(value string) bool {
	for _, segment := range strings.Split(value, "/") {
		if segment == "." || segment == ".." {
			return true
		}
	}
	return false
}

func joinURLPath(base, suffix string) string {
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(suffix, "/")
}

func sameURLOrigin(left, right *url.URL) bool {
	return strings.EqualFold(left.Scheme, right.Scheme) && strings.EqualFold(left.Host, right.Host)
}

func urlWithinBridgeTarget(candidate, target *url.URL) bool {
	basePath := strings.TrimRight(target.Path, "/")
	if basePath == "" {
		return true
	}
	return candidate.Path == basePath || strings.HasPrefix(candidate.Path, basePath+"/")
}

func copyBridgeRequestHeaders(destination, source http.Header) {
	for name, values := range source {
		if bridgeRequestHeaderBlocked(name) {
			continue
		}
		for _, value := range values {
			destination.Add(name, value)
		}
	}
}

func bridgeRequestHeaderBlocked(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	if lower == strings.ToLower(httpBridgeTokenHeader) || lower == "cookie" || lower == "origin" || lower == "referer" ||
		lower == "host" || lower == "forwarded" || lower == "x-real-ip" || lower == "cf-connecting-ip" ||
		lower == "true-client-ip" || strings.HasPrefix(lower, "x-forwarded-") ||
		strings.HasPrefix(lower, "proxy-") || strings.HasPrefix(lower, "sec-") {
		return true
	}
	return hopByHopHeader(lower)
}

func copyBridgeResponseHeaders(destination, source http.Header) {
	for name, values := range source {
		lower := strings.ToLower(strings.TrimSpace(name))
		if lower == "set-cookie" || strings.HasPrefix(lower, "access-control-") || hopByHopHeader(lower) {
			continue
		}
		for _, value := range values {
			destination.Add(name, value)
		}
	}
}

func hopByHopHeader(lower string) bool {
	switch lower {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func copyBridgeResponse(w http.ResponseWriter, source io.Reader) error {
	buffer := make([]byte, 32<<10)
	flusher, canFlush := w.(http.Flusher)
	for {
		count, err := source.Read(buffer)
		if count > 0 {
			if _, writeErr := w.Write(buffer[:count]); writeErr != nil {
				return nil
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

func writeBridgeStreamError(w http.ResponseWriter, contentType string) {
	payload, _ := json.Marshal(map[string]any{"error": map[string]string{"message": "HTTP bridge upstream stream ended unexpectedly"}})
	lower := strings.ToLower(contentType)
	switch {
	case strings.Contains(lower, "text/event-stream"):
		_, _ = fmt.Fprintf(w, "\nevent: error\ndata: %s\n\n", payload)
	case strings.Contains(lower, "ndjson"):
		_, _ = fmt.Fprintf(w, "%s\n", payload)
	default:
		return
	}
	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}
}
