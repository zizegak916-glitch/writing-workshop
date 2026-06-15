#!/usr/bin/env python3
"""AI Writing Workshop — API Proxy Server
Relays API requests from the browser to avoid CORS restrictions.
Supports: OpenAI, Anthropic, Gemini, DeepSeek, and all OpenAI-compatible providers.
"""
import json, os, sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError

PORT = int(os.environ.get('PROXY_PORT', 8091))

class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress request logs

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != '/proxy':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            data = json.loads(body)
            url = data.get('url', '')
            headers = data.get('headers', {})
            payload = json.dumps(data.get('body', {})).encode()

            req = Request(url, data=payload, method='POST')
            for k, v in headers.items():
                req.add_header(k, v)
            req.add_header('Content-Type', 'application/json')

            try:
                with urlopen(req, timeout=120) as resp:
                    result = json.loads(resp.read())
                    self._json_response(200, result)
            except HTTPError as e:
                err_body = e.read().decode('utf-8', errors='replace')
                try:
                    err_json = json.loads(err_body)
                except:
                    err_json = {'error': {'message': err_body[:500], 'code': e.code}}
                self._json_response(e.code, err_json)
        except Exception as e:
            self._json_response(500, {'error': {'message': str(e)[:500]}})

    def _json_response(self, code, data):
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

if __name__ == '__main__':
    print(f'🔀 API Proxy running on http://localhost:{PORT}')
    server = HTTPServer(('0.0.0.0', PORT), ProxyHandler)
    server.serve_forever()
