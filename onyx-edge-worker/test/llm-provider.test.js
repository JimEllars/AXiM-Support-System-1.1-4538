import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callAIWithFailover } from '../src/ai/llmClient';

global.fetch = vi.fn();

describe('callAIWithFailover', () => {
  const options = {
    systemPrompt: 'System',
    userPrompt: 'User',
    responseFormatJson: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Test 1: DeepSeek returns 200 OK -> verify successful response tagged with provider: "deepseek"', async () => {
    const env = { DEEPSEEK_API_KEY: 'deepseek-key' };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'DeepSeek response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      })
    });

    const res = await callAIWithFailover(options, env);
    expect(res.provider).toBe('deepseek');
    expect(res.content).toBe('DeepSeek response');
    expect(res.failoverTriggered).toBe(false);
  });

  it('Test 2: DeepSeek returns 500 / times out -> verify automatic fallback to Anthropic with failoverTriggered: true', async () => {
    const env = { DEEPSEEK_API_KEY: 'deepseek-key', ANTHROPIC_API_KEY: 'anthropic-key' };

    // DeepSeek fails
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    // Anthropic succeeds
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Anthropic response' }],
        usage: { input_tokens: 15, output_tokens: 25 }
      })
    });

    const res = await callAIWithFailover(options, env);
    expect(res.provider).toBe('anthropic');
    expect(res.content).toBe('Anthropic response');
    expect(res.failoverTriggered).toBe(true);
  });

  it('Test 3: Both providers fail -> verify graceful fallback response without 500 edge crash', async () => {
    const env = { DEEPSEEK_API_KEY: 'deepseek-key', ANTHROPIC_API_KEY: 'anthropic-key' };

    // DeepSeek fails
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    // Anthropic fails
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    const res = await callAIWithFailover(options, env);
    expect(res.provider).toBe('offline-fallback');
    expect(res.failoverTriggered).toBe(true);
    expect(res.content).toContain('offline fallback');
  });
});
