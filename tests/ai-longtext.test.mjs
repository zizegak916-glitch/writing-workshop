import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../web/static/js/ai-task-contract.js');
await import('../web/static/js/api-adapter.js');

const contract = globalThis.WWAITaskContract;
const adapter = globalThis.WWApiAdapter;
const tasks = contract.list();
assert.equal(tasks.length, 58, 'every Prompt Skill and every non-Skill AI feature must be registered');
assert.equal(tasks.filter(task => task.id.startsWith('skill.')).length, 32);
const workbenchSource = readFileSync(new URL('../web/static/js/workbench.js', import.meta.url), 'utf8');
assert.match(workbenchSource, /summarize:\(\{taskId,prompt\}\)=>callAITaskStream\(/, 'long-book memory updates must use the streaming transport');

const longText = Array.from({ length: 5000 }, (_, index) => `第${index + 1}段：雨落在旧站台上，他核对门牌后才继续往前走；这段内容用于验证长文本不会在请求适配层被静默截断。`).join('\n');
assert.ok(longText.length >= 250000, 'simulation fixture must be a genuinely long Chinese document');

const originalFetch = globalThis.fetch;
const requests = [];
try {
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const user = body.messages?.find(message => message.role === 'user')?.content
      ?? body.input?.find(message => message.role === 'user')?.content;
    assert.equal(user, longText, 'the full long document must reach the transport body unchanged');
    requests.push({ url: String(url), bridgeToken: options.headers['X-WW-Bridge-Token'], stream: !!body.stream, maxTokens: body.max_tokens, chars: user.length });
    if (body.stream) {
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"长"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"文"}}]}\n\n'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        }
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '长文模拟通过' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const config = {
    protocol: 'openai-chat',
    model: 'simulated-long-context',
    baseUrl: 'http://192.0.2.40:8317/v1',
    bridgeUrl: 'https://bridge.example/api/http-bridge/longtext',
    bridgeToken: 'longtext-bridge-token-for-simulation',
    pageProtocol: 'https:',
    timeout: 5000
  };
  const messages = [{ role: 'system', content: '模拟测试，不调用外部模型。' }, { role: 'user', content: longText }];
  for (const task of tasks) {
    const recorded = contract.record(task.id, longText, messages[0].content, false);
    assert.equal(recorded.id, task.id);
    const result = await adapter.request(config, messages, { maxTokens: task.maxTokens });
    assert.equal(result.text, '长文模拟通过', `${task.id} request path failed`);

    contract.record(task.id, longText, messages[0].content, true);
    const streamed = await adapter.stream(config, messages, { maxTokens: task.maxTokens });
    assert.equal(streamed.text, '长文', `${task.id} stream path failed`);
  }
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(requests.length, tasks.length * 2);
assert.equal(requests.filter(request => request.stream).length, tasks.length);
assert.ok(requests.every(request => request.chars === longText.length));
assert.ok(requests.every(request => request.url === 'https://bridge.example/api/http-bridge/longtext/v1/chat/completions'));
assert.ok(requests.every(request => request.bridgeToken === 'longtext-bridge-token-for-simulation'));
assert.ok(tasks.filter(task => task.maxTokens >= 8192).length >= 10, 'long-form transformations must not keep the old 2k output ceiling');
assert.ok(tasks.filter(task => task.id.startsWith('memory.')).every(task => task.minTimeoutMs >= 300000), 'long-book memory tasks need a long-request timeout floor');

console.log(`AI long-text bridge simulation OK: ${tasks.length} registered features × request/stream, ${longText.length.toLocaleString()} chars each, no external model called.`);
