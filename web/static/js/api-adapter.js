(function (root, factory) {
  const adapter = factory();
  if (typeof module === 'object' && module.exports) module.exports = adapter;
  root.WWApiAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const PROTOCOLS = new Set(['auto', 'openai-chat', 'openai-responses', 'anthropic', 'ollama']);
  const AUTH_MODES = new Set(['auto', 'bearer', 'x-api-key', 'none']);
  const FORBIDDEN_HEADERS = new Set([
    'connection', 'content-length', 'cookie', 'host', 'origin', 'referer',
    'transfer-encoding', 'upgrade', 'via'
  ]);

  function cleanProtocol(value) {
    const protocol = String(value || 'auto').trim().toLowerCase();
    return PROTOCOLS.has(protocol) ? protocol : 'auto';
  }

  function inferProtocol(config) {
    const explicit = cleanProtocol(config.protocol);
    if (explicit !== 'auto') return explicit;
    const type = String(config.type || '').toLowerCase();
    const provider = String(config.provider || '').toLowerCase();
    const base = String(config.baseUrl || '').toLowerCase();
    if (type === 'anthropic' || type === 'claude' || provider === 'claude' || /\/messages(?:[?#]|$)/.test(base)) return 'anthropic';
    if (type === 'ollama' || provider === 'ollama' || /\/api\/chat(?:[?#]|$)/.test(base)) return 'ollama';
    if (type === 'responses' || /\/responses(?:[?#]|$)/.test(base)) return 'openai-responses';
    return 'openai-chat';
  }

  function protocolType(protocol) {
    switch (cleanProtocol(protocol)) {
      case 'anthropic': return 'anthropic';
      case 'ollama': return 'ollama';
      default: return 'openai';
    }
  }

  function endpointSuffix(protocol) {
    switch (protocol) {
      case 'anthropic': return 'messages';
      case 'openai-responses': return 'responses';
      case 'ollama': return 'api/chat';
      default: return 'chat/completions';
    }
  }

  function normalizeEndpoint(baseUrl, protocolValue, fallbackUrl) {
    const protocol = cleanProtocol(protocolValue) === 'auto'
      ? inferProtocol({ baseUrl, protocol: protocolValue })
      : cleanProtocol(protocolValue);
    const raw = String(baseUrl || fallbackUrl || '').trim();
    if (!raw) throw new Error('缺少 Base URL');

    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      throw new Error('Base URL 不是有效的 http(s) 地址');
    }
    if (!/^https?:$/.test(url.protocol)) throw new Error('Base URL 只支持 http:// 或 https://');

    const path = url.pathname.replace(/\/+$/, '');
    if (/\/(?:chat\/completions|responses|messages|api\/chat)$/.test(path)) {
      url.pathname = path;
      return url.toString();
    }

    const suffix = endpointSuffix(protocol);
    if (protocol === 'ollama') {
      url.pathname = (path || '') + '/' + suffix;
    } else if (!path || path === '/') {
      url.pathname = '/v1/' + suffix;
    } else {
      url.pathname = path + '/' + suffix;
    }
    return url.toString();
  }

  function parseCustomHeaders(value) {
    if (!value) return {};
    let parsed = value;
    if (typeof value === 'string') {
      const source = value.trim();
      if (!source) return {};
      try {
        parsed = JSON.parse(source);
      } catch (_) {
        throw new Error('自定义请求头必须是 JSON 对象');
      }
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('自定义请求头必须是 JSON 对象');
    }
    const headers = {};
    for (const [name, rawValue] of Object.entries(parsed)) {
      const key = String(name || '').trim();
      const lower = key.toLowerCase();
      if (!key || FORBIDDEN_HEADERS.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-')) {
        throw new Error('不允许覆盖请求头：' + (key || '空名称'));
      }
      if (rawValue == null) continue;
      headers[key] = String(rawValue);
    }
    return headers;
  }

  function resolveAuthMode(config, protocol) {
    const requested = String(config.authMode || 'auto').trim().toLowerCase();
    if (AUTH_MODES.has(requested) && requested !== 'auto') return requested;
    if (!config.key) return 'none';
    return protocol === 'anthropic' ? 'x-api-key' : 'bearer';
  }

  function buildHeaders(config, protocol, streaming) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: streaming ? 'text/event-stream, application/x-ndjson, application/json' : 'application/json'
    };
    const authMode = resolveAuthMode(config, protocol);
    if (authMode === 'bearer') headers.Authorization = 'Bearer ' + String(config.key || '');
    if (authMode === 'x-api-key') headers['x-api-key'] = String(config.key || '');
    if (protocol === 'anthropic') {
      headers['anthropic-version'] = String(config.anthropicVersion || '2023-06-01');
      if (config.browserDirect !== false) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    }
    return { ...headers, ...parseCustomHeaders(config.customHeaders) };
  }

  function compactMessages(messages) {
    return (Array.isArray(messages) ? messages : [])
      .filter(message => message && message.role && message.content != null)
      .map(message => ({ role: String(message.role), content: message.content }));
  }

  function buildBody(config, messages, options) {
    const protocol = inferProtocol(config);
    const model = String(config.model || '').trim();
    if (!model) throw new Error('缺少模型名称');
    const stream = !!options.stream;
    const maxTokens = Number(options.maxTokens || config.maxTokens || 2000);
    const allMessages = compactMessages(messages);
    const systemParts = allMessages
      .filter(message => message.role === 'system')
      .map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content));
    const nonSystem = allMessages.filter(message => message.role !== 'system');

    if (protocol === 'anthropic') {
      const body = { model, max_tokens: maxTokens, messages: nonSystem, stream };
      if (systemParts.length) body.system = systemParts.join('\n\n');
      return body;
    }
    if (protocol === 'openai-responses') {
      const body = { model, input: allMessages, max_output_tokens: maxTokens, stream };
      return body;
    }
    if (protocol === 'ollama') {
      return { model, messages: allMessages, stream };
    }
    return { model, max_tokens: maxTokens, messages: allMessages, stream };
  }

  function contentText(value) {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return '';
    return value.map(item => {
      if (typeof item === 'string') return item;
      return item?.text || item?.content || '';
    }).join('');
  }

  function parseResponse(data) {
    if (typeof data === 'string') return data;
    const choice = data?.choices?.[0]?.message?.content;
    if (choice != null) return contentText(choice);
    if (typeof data?.output_text === 'string') return data.output_text;
    if (Array.isArray(data?.output)) {
      const text = data.output.flatMap(item => item?.content || []).map(item => item?.text || '').join('');
      if (text) return text;
    }
    if (Array.isArray(data?.content)) {
      const text = data.content.map(item => item?.text || '').join('');
      if (text) return text;
    }
    if (data?.message?.content != null) return contentText(data.message.content);
    if (typeof data?.response === 'string') return data.response;
    if (typeof data?.text === 'string') return data.text;
    return '';
  }

  function parseUsage(data) {
    const usage = data?.usage;
    if (!usage) return null;
    const input = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.prompt_eval_count ?? 0);
    const output = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.eval_count ?? 0);
    return input || output ? { input, output } : null;
  }

  function upstreamErrorText(data, fallback) {
    if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 600);
    const error = data?.error;
    if (typeof error === 'string') return error.slice(0, 600);
    if (error?.message) return String(error.message).slice(0, 600);
    if (data?.message) return String(data.message).slice(0, 600);
    return fallback;
  }

  async function responseData(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch (_) { return text; }
  }

  function networkError(error) {
    if (error?.name === 'AbortError') return new Error('请求超时或已中断');
    if (error instanceof TypeError) {
      return new Error('网络请求失败：请检查地址、DNS/代理、HTTPS 与 CORS。Pages 直连时，目标服务必须允许当前站点跨域访问。');
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  function requestId(response) {
    return response.headers.get('x-request-id') || response.headers.get('request-id') || response.headers.get('cf-ray') || '';
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = Math.max(1000, Number(timeoutMs || 60000));
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      throw networkError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(config, messages, options) {
    const protocol = inferProtocol(config);
    const url = normalizeEndpoint(config.baseUrl, protocol, config.fallbackUrl);
    const headers = buildHeaders(config, protocol, false);
    const body = buildBody(config, messages, { ...options, stream: false });
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, config.timeoutMs || config.timeout);
    const data = await responseData(response);
    if (!response.ok || data?.error) {
      const id = requestId(response);
      const detail = upstreamErrorText(data, response.statusText || '上游接口返回错误');
      throw new Error('HTTP ' + response.status + ': ' + detail + (id ? '（请求 ID：' + id + '）' : ''));
    }
    const text = parseResponse(data);
    if (!text) throw new Error('接口返回成功，但没有识别到文本内容；请检查协议类型是否选对');
    return { text, usage: parseUsage(data), data, endpoint: url, protocol };
  }

  function streamDelta(data) {
    if (!data || typeof data !== 'object') return '';
    const choice = data.choices?.[0];
    if (choice?.delta?.content != null) return contentText(choice.delta.content);
    if (data.type === 'response.output_text.delta') return data.delta || '';
    if (data.type === 'content_block_delta') return data.delta?.text || '';
    if (data.message?.content != null) return contentText(data.message.content);
    if (typeof data.response === 'string') return data.response;
    return '';
  }

  function parseStreamRecord(record) {
    const source = String(record || '').trim();
    if (!source) return null;
    const dataLines = source.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim());
    const payload = dataLines.length ? dataLines.join('\n') : source;
    if (!payload || payload === '[DONE]') return { done: true, delta: '', data: null };
    try {
      const data = JSON.parse(payload);
      return { done: !!data.done, delta: streamDelta(data), usage: parseUsage(data), data };
    } catch (_) {
      return null;
    }
  }

  async function stream(config, messages, options) {
    const protocol = inferProtocol(config);
    const url = normalizeEndpoint(config.baseUrl, protocol, config.fallbackUrl);
    const headers = buildHeaders(config, protocol, true);
    const body = buildBody(config, messages, { ...options, stream: true });
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, config.timeoutMs || config.timeout);
    if (!response.ok) {
      const data = await responseData(response);
      const id = requestId(response);
      const detail = upstreamErrorText(data, response.statusText || '上游接口返回错误');
      throw new Error('HTTP ' + response.status + ': ' + detail + (id ? '（请求 ID：' + id + '）' : ''));
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.body || contentType.includes('application/json') && !contentType.includes('ndjson')) {
      const data = await responseData(response);
      const text = parseResponse(data);
      if (!text) throw new Error('接口返回成功，但没有识别到文本内容；请检查协议类型是否选对');
      if (options.onChunk) options.onChunk(text);
      return { text, usage: parseUsage(data), data, endpoint: url, protocol };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage = null;
    const sse = contentType.includes('text/event-stream');

    function consume(record) {
      const parsed = parseStreamRecord(record);
      if (!parsed) return;
      if (parsed.usage) usage = parsed.usage;
      if (parsed.delta) {
        text += parsed.delta;
        if (options.onChunk) options.onChunk(parsed.delta);
      }
    }

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const separator = sse ? /\r?\n\r?\n/ : /\r?\n/;
      const records = buffer.split(separator);
      buffer = records.pop() || '';
      records.forEach(consume);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!text) throw new Error('流式连接已结束，但没有识别到文本增量；可尝试关闭流式或切换协议类型');
    return { text, usage, endpoint: url, protocol };
  }

  return {
    cleanProtocol,
    inferProtocol,
    protocolType,
    normalizeEndpoint,
    parseCustomHeaders,
    resolveAuthMode,
    buildHeaders,
    buildBody,
    parseResponse,
    parseUsage,
    parseStreamRecord,
    request,
    stream
  };
});
