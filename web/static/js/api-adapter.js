(function (root, factory) {
  const adapter = factory();
  if (typeof module === 'object' && module.exports) module.exports = adapter;
  root.WWApiAdapter = adapter;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  'use strict';

  const PROTOCOLS = new Set(['auto', 'openai-chat', 'openai-responses', 'anthropic', 'ollama']);
  const AUTH_MODES = new Set(['auto', 'bearer', 'x-api-key', 'none']);
  const FORBIDDEN_HEADERS = new Set([
    'cf-connecting-ip', 'connection', 'content-length', 'cookie', 'forwarded', 'host', 'origin', 'referer',
    'transfer-encoding', 'true-client-ip', 'upgrade', 'via', 'x-real-ip', 'x-ww-bridge-token'
  ]);
  const PROTECTED_BODY_FIELDS = new Set(['model', 'messages', 'input', 'system', 'stream']);
  const UNSAFE_OBJECT_FIELDS = new Set(['__proto__', 'prototype', 'constructor']);

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

  function normalizeEndpoint(baseUrl, protocolValue, fallbackUrl, exactEndpoint) {
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
    if (exactEndpoint) return url.toString();

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

  function normalizeModelsEndpoint(baseUrl, protocolValue, fallbackUrl) {
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
    let path = url.pathname.replace(/\/+$/, '');
    if (protocol === 'ollama') {
      path = path.replace(/\/api\/chat$/, '');
      url.pathname = (path || '') + '/api/tags';
    } else {
      path = path.replace(/\/(?:chat\/completions|responses|messages|api\/chat|models)$/, '');
      if (!path || path === '/') path = '/v1';
      url.pathname = path + '/models';
    }
    return url.toString();
  }

  function normalizeBridgeEndpoint(bridgeUrl, upstreamEndpoint, pageProtocol) {
    const raw = String(bridgeUrl || '').trim();
    if (!raw) return '';
    let bridge;
    let upstream;
    try {
      bridge = new URL(raw);
      upstream = new URL(upstreamEndpoint);
    } catch (_) {
      throw new Error('HTTP 兼容桥地址不是有效的 http(s) URL');
    }
    if (!/^https?:$/.test(bridge.protocol)) throw new Error('HTTP 兼容桥只支持 http:// 或 https://');
    if (bridge.search || bridge.hash) throw new Error('HTTP 兼容桥地址不能包含查询参数或片段');
    if (String(pageProtocol || globalThis.location?.protocol || '') === 'https:' && bridge.protocol !== 'https:') {
      throw new Error('HTTPS Pages 使用的兼容桥本身必须是 HTTPS');
    }
    bridge.pathname = bridge.pathname.replace(/\/+$/, '') + '/' + upstream.pathname.replace(/^\/+/, '');
    bridge.search = upstream.search;
    return bridge.toString();
  }

  function routeEndpoint(config, upstreamEndpoint) {
    const bridgeUrl = String(config.bridgeUrl || '').trim();
    if (!bridgeUrl) {
      return { endpoint: upstreamEndpoint, upstreamEndpoint: '', transport: 'direct', bridgeToken: '' };
    }
    const bridgeToken = String(config.bridgeToken || '').trim();
    if (!bridgeToken) throw new Error('已填写 HTTP 兼容桥地址，但没有填写桥访问令牌');
    return {
      endpoint: normalizeBridgeEndpoint(bridgeUrl, upstreamEndpoint, config.pageProtocol),
      upstreamEndpoint,
      transport: 'bridge',
      bridgeToken
    };
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
      if (!key || FORBIDDEN_HEADERS.has(lower) || lower.startsWith('proxy-') || lower.startsWith('sec-') || lower.startsWith('x-forwarded-')) {
        throw new Error('不允许覆盖请求头：' + (key || '空名称'));
      }
      if (rawValue == null) continue;
      headers[key] = String(rawValue);
    }
    return headers;
  }

  function parseBodyOverrides(value) {
    if (!value) return {};
    let parsed = value;
    if (typeof value === 'string') {
      const source = value.trim();
      if (!source) return {};
      try {
        parsed = JSON.parse(source);
      } catch (_) {
        throw new Error('请求体覆盖必须是 JSON 对象');
      }
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('请求体覆盖必须是 JSON 对象');
    }
    const overrides = {};
    for (const [name, bodyValue] of Object.entries(parsed)) {
      const key = String(name || '').trim();
      if (!key || UNSAFE_OBJECT_FIELDS.has(key)) throw new Error('请求体字段名称无效：' + (key || '空名称'));
      if (PROTECTED_BODY_FIELDS.has(key)) throw new Error('不允许覆盖核心请求体字段：' + key);
      overrides[key] = bodyValue;
    }
    return overrides;
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

  function applyBodyOverrides(body, value) {
    const overrides = parseBodyOverrides(value);
    for (const [key, bodyValue] of Object.entries(overrides)) {
      if (bodyValue === null) delete body[key];
      else body[key] = bodyValue;
    }
    return body;
  }

  function buildBody(config, messages, options = {}) {
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
      return applyBodyOverrides(body, config.bodyOverrides);
    }
    if (protocol === 'openai-responses') {
      const body = { model, input: allMessages, max_output_tokens: maxTokens, stream };
      return applyBodyOverrides(body, config.bodyOverrides);
    }
    if (protocol === 'ollama') {
      return applyBodyOverrides({ model, messages: allMessages, stream }, config.bodyOverrides);
    }
    return applyBodyOverrides({ model, max_tokens: maxTokens, messages: allMessages, stream }, config.bodyOverrides);
  }

  function prepareRequest(config, messages, options = {}) {
    const protocol = inferProtocol(config);
    const upstreamEndpoint = normalizeEndpoint(config.baseUrl, protocol, config.fallbackUrl, !!config.exactEndpoint);
    const pageProtocol = String(config.pageProtocol || globalThis.location?.protocol || '');
    const routed = routeEndpoint({ ...config, pageProtocol }, upstreamEndpoint);
    if (config.browserDirect !== false && routed.transport === 'direct' && pageProtocol === 'https:' && new URL(upstreamEndpoint).protocol === 'http:') {
      throw withDiagnostic(
        new Error('HTTPS Pages 不能直连 HTTP 接口：请填写 HTTPS 兼容桥，或改用 HTTPS API / 自部署工作台。'),
        { stage: 'prepare', endpoint: upstreamEndpoint, protocol }
      );
    }
    const streaming = !!options.stream;
    const customHeaderNames = Object.keys(parseCustomHeaders(config.customHeaders));
    const headers = buildHeaders(config, protocol, streaming);
    if (routed.transport === 'bridge') headers['X-WW-Bridge-Token'] = routed.bridgeToken;
    return {
      endpoint: routed.endpoint,
      upstreamEndpoint: routed.upstreamEndpoint,
      transport: routed.transport,
      protocol,
      method: 'POST',
      headers,
      body: buildBody(config, messages, { ...options, stream: streaming }),
      customHeaderNames
    };
  }

  function redactHeader(name, value) {
    const lower = String(name || '').toLowerCase();
    if (/(authorization|api[-_]?key|token|secret|cookie)/.test(lower)) {
      return lower === 'authorization' && /^Bearer\s+/i.test(String(value || '')) ? 'Bearer ••••' : '••••';
    }
    return String(value);
  }

  function inspectRequest(config, messages, options = {}) {
    const prepared = prepareRequest(config, messages, options);
    return {
      ...prepared,
      headers: Object.fromEntries(Object.entries(prepared.headers).map(([name, value]) => [name, redactHeader(name, value)])),
      headerNames: Object.keys(prepared.headers),
      bodyFields: Object.keys(prepared.body)
    };
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
    const usage = data?.usage || data?.response?.usage || data?.message?.usage;
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

  function withDiagnostic(error, meta = {}) {
    const output = error instanceof Error ? error : new Error(String(error));
    if (meta.stage && !output.stage) output.stage = meta.stage;
    if (meta.endpoint && !output.endpoint) output.endpoint = meta.endpoint;
    if (meta.protocol && !output.protocol) output.protocol = meta.protocol;
    if (meta.originalMessage && !output.originalMessage) output.originalMessage = meta.originalMessage;
    if (meta.status && !output.status) output.status = meta.status;
    if (meta.upstreamEndpoint && !output.upstreamEndpoint) output.upstreamEndpoint = meta.upstreamEndpoint;
    if (meta.transport && !output.transport) output.transport = meta.transport;
    return output;
  }

  function networkError(error, meta = {}) {
    const originalMessage = String(error?.message || error || '未知浏览器错误');
    if (error?.name === 'AbortError') {
      return withDiagnostic(new Error('请求超时或已中断'), { ...meta, stage: 'fetch', originalMessage });
    }
    if (error instanceof TypeError) {
      const customHeaderHint = meta.customHeaderNames?.length
        ? ' 本次还发送了自定义请求头：' + meta.customHeaderNames.join('、') + '；目标接口必须在预检中逐项允许它们。'
        : '';
      return withDiagnostic(
        new Error('请求未获得 HTTP 响应：浏览器在发送、预检或重定向阶段拒绝了请求。' + customHeaderHint + ' 原始错误：' + originalMessage),
        { ...meta, stage: 'fetch', originalMessage }
      );
    }
    return withDiagnostic(error, { ...meta, stage: meta.stage || 'fetch', originalMessage });
  }

  function responseError(error, meta = {}) {
    if (error?.name === 'AbortError' || error instanceof TypeError) return networkError(error, meta);
    return withDiagnostic(error, meta);
  }

  function requestId(response) {
    return response.headers.get('x-request-id') || response.headers.get('request-id') || response.headers.get('cf-ray') || '';
  }

  async function beginTimedStreamFetch(url, options, timeoutMs, meta = {}) {
    const controller = new AbortController();
    const timeout = Math.max(1000, Number(timeoutMs || 60000));
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return { response, dispose: () => clearTimeout(timer) };
    } catch (error) {
      clearTimeout(timer);
      throw networkError(error, { ...meta, endpoint: url });
    }
  }

  function parseModelList(data) {
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : data?.models);
    if (!Array.isArray(rows)) return [];
    return [...new Set(rows.map(item => {
      if (typeof item === 'string') return item.trim();
      return String(item?.id || item?.model || item?.name || '').trim();
    }).filter(Boolean))];
  }

  async function listModels(config) {
    const protocol = inferProtocol(config);
    const upstreamEndpoint = normalizeModelsEndpoint(config.baseUrl, protocol, config.fallbackUrl);
    const pageProtocol = String(config.pageProtocol || globalThis.location?.protocol || '');
    const routed = routeEndpoint({ ...config, pageProtocol }, upstreamEndpoint);
    if (config.browserDirect !== false && routed.transport === 'direct' && pageProtocol === 'https:' && new URL(upstreamEndpoint).protocol === 'http:') {
      throw withDiagnostic(
        new Error('HTTPS Pages 不能读取 HTTP 接口的模型列表：请填写 HTTPS 兼容桥。'),
        { stage: 'prepare', endpoint: upstreamEndpoint, protocol }
      );
    }
    const headers = buildHeaders(config, protocol, false);
    delete headers['Content-Type'];
    if (routed.transport === 'bridge') headers['X-WW-Bridge-Token'] = routed.bridgeToken;
    const customHeaderNames = Object.keys(parseCustomHeaders(config.customHeaders));
    const meta = { protocol, customHeaderNames, upstreamEndpoint: routed.upstreamEndpoint, transport: routed.transport };
    const timed = await beginTimedStreamFetch(routed.endpoint, { method: 'GET', headers }, config.timeoutMs || config.timeout, meta);
    try {
      const data = await responseData(timed.response);
      if (!timed.response.ok || data?.error) {
        const id = requestId(timed.response);
        const detail = upstreamErrorText(data, timed.response.statusText || '读取模型列表失败');
        throw withDiagnostic(
          new Error('HTTP ' + timed.response.status + ': ' + detail + (id ? '（请求 ID：' + id + '）' : '')),
          { ...meta, stage: 'http', endpoint: routed.endpoint, status: timed.response.status }
        );
      }
      const models = parseModelList(data);
      if (!models.length) throw withDiagnostic(new Error('接口返回成功，但没有识别到模型 ID'), { ...meta, stage: 'parse', endpoint: routed.endpoint });
      return { models, data, endpoint: routed.endpoint, upstreamEndpoint: routed.upstreamEndpoint, transport: routed.transport, protocol };
    } catch (error) {
      throw responseError(error, { ...meta, stage: 'parse', endpoint: routed.endpoint });
    } finally {
      timed.dispose();
    }
  }

  async function request(config, messages, options) {
    let prepared;
    try {
      prepared = prepareRequest(config, messages, { ...options, stream: false });
    } catch (error) {
      throw withDiagnostic(error, { stage: 'prepare' });
    }
    const { endpoint: url, upstreamEndpoint, transport, protocol, headers, body, customHeaderNames } = prepared;
    const meta = { protocol, customHeaderNames, upstreamEndpoint, transport };
    const timed = await beginTimedStreamFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, config.timeoutMs || config.timeout, meta);
    const response = timed.response;
    try {
      const data = await responseData(response);
      if (!response.ok || data?.error) {
        const id = requestId(response);
        const detail = upstreamErrorText(data, response.statusText || '上游接口返回错误');
        throw withDiagnostic(
          new Error('HTTP ' + response.status + ': ' + detail + (id ? '（请求 ID：' + id + '）' : '')),
          { ...meta, stage: 'http', endpoint: url, status: response.status }
        );
      }
      const text = parseResponse(data);
      if (!text) throw withDiagnostic(
        new Error('接口返回成功，但没有识别到文本内容；请检查协议类型是否选对'),
        { ...meta, stage: 'parse', endpoint: url }
      );
      return { text, usage: parseUsage(data), data, endpoint: url, upstreamEndpoint, transport, protocol };
    } catch (error) {
      throw responseError(error, { ...meta, stage: 'parse', endpoint: url });
    } finally {
      timed.dispose();
    }
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
      const done = !!data.done || data.type === 'response.completed' || data.type === 'message_stop';
      return { done, delta: streamDelta(data), usage: parseUsage(data), data };
    } catch (_) {
      return null;
    }
  }

  async function stream(config, messages, options) {
    let prepared;
    try {
      prepared = prepareRequest(config, messages, { ...options, stream: true });
    } catch (error) {
      throw withDiagnostic(error, { stage: 'prepare' });
    }
    const { endpoint: url, upstreamEndpoint, transport, protocol, headers, body, customHeaderNames } = prepared;
    const meta = { protocol, customHeaderNames, upstreamEndpoint, transport };
    const timed = await beginTimedStreamFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, config.timeoutMs || config.timeout, meta);
    const response = timed.response;
    try {
      if (!response.ok) {
        const data = await responseData(response);
        const id = requestId(response);
        const detail = upstreamErrorText(data, response.statusText || '上游接口返回错误');
        throw withDiagnostic(
          new Error('HTTP ' + response.status + ': ' + detail + (id ? '（请求 ID：' + id + '）' : '')),
          { ...meta, stage: 'http', endpoint: url, status: response.status }
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (!response.body || contentType.includes('application/json') && !contentType.includes('ndjson')) {
        const data = await responseData(response);
        const text = parseResponse(data);
        if (!text) throw new Error('接口返回成功，但没有识别到文本内容；请检查协议类型是否选对');
        if (options.onChunk) options.onChunk(text);
        return { text, usage: parseUsage(data), data, endpoint: url, upstreamEndpoint, transport, protocol };
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
        if (parsed.data?.error) throw new Error(upstreamErrorText(parsed.data, '上游流式请求失败'));
        if (parsed.usage) usage = parsed.usage;
        if (parsed.delta) {
          text += parsed.delta;
          if (options.onChunk) options.onChunk(parsed.delta);
        } else if (parsed.done && !text && parsed.data) {
          const finalText = parseResponse(parsed.data.response || parsed.data);
          if (finalText) {
            text = finalText;
            if (options.onChunk) options.onChunk(finalText);
          }
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
      return { text, usage, endpoint: url, upstreamEndpoint, transport, protocol };
    } catch (error) {
      throw responseError(error, { ...meta, stage: 'stream', endpoint: url });
    } finally {
      timed.dispose();
    }
  }

  return {
    cleanProtocol,
    inferProtocol,
    protocolType,
    normalizeEndpoint,
    normalizeModelsEndpoint,
    normalizeBridgeEndpoint,
    routeEndpoint,
    parseCustomHeaders,
    parseBodyOverrides,
    resolveAuthMode,
    buildHeaders,
    buildBody,
    prepareRequest,
    inspectRequest,
    parseResponse,
    parseUsage,
    parseStreamRecord,
    parseModelList,
    listModels,
    request,
    stream
  };
});
