import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

await import(pathToFileURL(path.resolve('web/static/js/api-adapter.js')).href);
const A = globalThis.WWApiAdapter;

assert.ok(A, 'adapter must register on globalThis');

assert.equal(
  A.normalizeEndpoint('https://relay.example', 'openai-chat'),
  'https://relay.example/v1/chat/completions'
);
assert.equal(
  A.normalizeEndpoint('https://relay.example/v1', 'openai-responses'),
  'https://relay.example/v1/responses'
);
assert.equal(
  A.normalizeEndpoint('https://relay.example/anthropic/v1', 'anthropic'),
  'https://relay.example/anthropic/v1/messages'
);
assert.equal(
  A.normalizeEndpoint('http://127.0.0.1:11434', 'ollama'),
  'http://127.0.0.1:11434/api/chat'
);
assert.equal(
  A.normalizeEndpoint('https://relay.example/custom/chat/completions?route=cn', 'openai-chat'),
  'https://relay.example/custom/chat/completions?route=cn'
);

assert.equal(A.inferProtocol({ type: 'anthropic' }), 'anthropic');
assert.equal(A.inferProtocol({ baseUrl: 'http://localhost:11434/api/chat' }), 'ollama');
assert.equal(A.inferProtocol({ protocol: 'openai-responses' }), 'openai-responses');

assert.deepEqual(
  A.buildHeaders({ key: '', authMode: 'none', customHeaders: '{"X-Route":"cn"}' }, 'ollama', false),
  { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Route': 'cn' }
);
assert.throws(
  () => A.parseCustomHeaders('{"Host":"evil.example"}'),
  /不允许覆盖请求头/
);

const messages = [
  { role: 'system', content: '只回答结果' },
  { role: 'user', content: '测试' }
];
assert.deepEqual(
  A.buildBody({ protocol: 'anthropic', model: 'claude-test' }, messages, { stream: true, maxTokens: 64 }),
  {
    model: 'claude-test',
    max_tokens: 64,
    messages: [{ role: 'user', content: '测试' }],
    stream: true,
    system: '只回答结果'
  }
);
assert.deepEqual(
  A.buildBody({ protocol: 'openai-responses', model: 'gpt-test' }, messages, { stream: false, maxTokens: 64 }),
  { model: 'gpt-test', input: messages, max_output_tokens: 64, stream: false }
);
assert.deepEqual(
  A.buildBody({ protocol: 'ollama', model: 'qwen-test' }, messages, { stream: true }),
  { model: 'qwen-test', messages, stream: true }
);

assert.equal(A.parseResponse({ choices: [{ message: { content: 'chat ok' } }] }), 'chat ok');
assert.equal(A.parseResponse({ output_text: 'responses ok' }), 'responses ok');
assert.equal(A.parseResponse({ content: [{ type: 'text', text: 'anthropic ok' }] }), 'anthropic ok');
assert.equal(A.parseResponse({ message: { content: 'ollama ok' } }), 'ollama ok');
assert.deepEqual(A.parseUsage({ message: { usage: { input_tokens: 9, output_tokens: 2 } } }), { input: 9, output: 2 });

assert.equal(
  A.parseStreamRecord('data: {"choices":[{"delta":{"content":"甲"}}]}').delta,
  '甲'
);
assert.equal(
  A.parseStreamRecord('data: {"type":"response.output_text.delta","delta":"乙"}').delta,
  '乙'
);
assert.equal(
  A.parseStreamRecord('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"丙"}}').delta,
  '丙'
);
assert.equal(
  A.parseStreamRecord('{"message":{"content":"丁"},"done":false}').delta,
  '丁'
);

const originalFetch = globalThis.fetch;
try {
  const chunks = [];
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"真"}}]}\n\n'));
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"流"}}]}\n\n'));
      controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
      controller.close();
    }
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const streamed = await A.stream(
    { protocol: 'openai-chat', model: 'stream-test', baseUrl: 'https://relay.example/v1', timeout: 2000 },
    messages,
    { onChunk: chunk => chunks.push(chunk) }
  );
  assert.equal(streamed.text, '真流');
  assert.deepEqual(chunks, ['真', '流']);

  globalThis.fetch = async () => new Response(
    'data: {"type":"response.completed","response":{"output_text":"完整回退","usage":{"input_tokens":5,"output_tokens":2}}}\n\n',
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
  const finalOnly = await A.stream(
    { protocol: 'openai-responses', model: 'stream-test', baseUrl: 'https://relay.example/v1', timeout: 2000 },
    messages,
    {}
  );
  assert.equal(finalOnly.text, '完整回退');
  assert.deepEqual(finalOnly.usage, { input: 5, output: 2 });

  globalThis.fetch = async (_url, options) => new Response(new ReadableStream({
    start(controller) {
      options.signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
    }
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(
    A.request(
      { protocol: 'openai-chat', model: 'timeout-test', baseUrl: 'https://relay.example/v1', timeout: 1000 },
      messages,
      {}
    ),
    /超时或已中断/
  );
  await assert.rejects(
    A.stream(
      { protocol: 'openai-chat', model: 'stream-test', baseUrl: 'https://relay.example/v1', timeout: 1000 },
      messages,
      {}
    ),
    /超时或已中断/
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('API adapter contract OK: endpoints, auth, request bodies, response formats, true stream deltas and whole-stream timeout.');
