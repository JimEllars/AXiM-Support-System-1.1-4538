/**
 * Proves the consolidated streaming gateway: the frontend must always receive
 * OpenAI-shaped SSE deltas, whether DeepSeek served the stream or the request
 * failed over to Anthropic.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamAIWithFailover } from '../src/ai/llmClient.ts';

async function collect(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

function sseBody(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe('streamAIWithFailover', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the DeepSeek stream through untouched when the primary succeeds', async () => {
    const deepseekBody = sseBody([
      'data: {"choices":[{"delta":{"content":"Checking "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"logs"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);

    const fetchMock = vi.fn(async () => new Response(deepseekBody, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const stream = await streamAIWithFailover(
      { systemPrompt: 'sys', userPrompt: 'ticket' },
      { DEEPSEEK_API_KEY: 'dk', ANTHROPIC_API_KEY: 'ak' }
    );

    const text = await collect(stream);
    expect(text).toContain('Checking ');
    expect(text).toContain('logs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.deepseek.com');
  });

  it('fails over to Anthropic and normalises its SSE into OpenAI deltas', async () => {
    const anthropicBody = sseBody([
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Pitch "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"divergence"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);

    const calls = [];
    vi.stubGlobal('fetch', async (url) => {
      calls.push(String(url));
      if (String(url).includes('deepseek')) {
        return new Response('upstream boom', { status: 500 });
      }
      return new Response(anthropicBody, { status: 200 });
    });

    const stream = await streamAIWithFailover(
      { systemPrompt: 'sys', userPrompt: 'ticket' },
      { DEEPSEEK_API_KEY: 'dk', ANTHROPIC_API_KEY: 'ak' }
    );

    const text = await collect(stream);
    expect(calls.some((c) => c.includes('deepseek'))).toBe(true);
    expect(calls.some((c) => c.includes('anthropic'))).toBe(true);

    // Two deltas, in order, then the terminal sentinel.
    const deltas = text
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: {'))
      .map((chunk) => JSON.parse(chunk.slice(6)));
    expect(deltas.map((d) => d.choices[0].delta.content)).toEqual(['Pitch ', 'divergence']);
    expect(text.trim().endsWith('data: [DONE]')).toBe(true);
  });

  it('degrades to a terminal message instead of throwing when no provider answers', async () => {
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 503 }));

    const stream = await streamAIWithFailover(
      { systemPrompt: 'sys', userPrompt: 'ticket' },
      { DEEPSEEK_API_KEY: 'dk', ANTHROPIC_API_KEY: 'ak' }
    );

    const text = await collect(stream);
    expect(text).toContain('temporarily degraded');
    expect(text.trim().endsWith('data: [DONE]')).toBe(true);
  });
});
