export interface LLMRequestOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
}

export interface LLMResponse {
  content: string;
  provider: 'deepseek' | 'anthropic' | 'offline-fallback';
  model: string;
  latencyMs: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
  failoverTriggered: boolean;
  failoverReason?: string;
}

export async function callAIWithFailover(
  options: LLMRequestOptions,
  env: any
): Promise<LLMResponse> {
  const deepseekModel = env.DEEPSEEK_MODEL || 'deepseek-chat';
  const anthropicModel = env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

  const startTime = Date.now();
  let failoverTriggered = false;
  let failoverReason = '';

  // 1. Try DeepSeek first
  if (env.DEEPSEEK_API_KEY) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const payload: any = {
        model: deepseekModel,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt }
        ],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature ?? 0.5
      };

      if (options.responseFormatJson) {
        payload.response_format = { type: 'json_object' };
        payload.messages[0].content += " You must output ONLY valid JSON.";
      }

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`DeepSeek API error: HTTP ${response.status}`);
      }

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('DeepSeek returned empty or invalid response structure');
      }

      // Basic JSON validation if requested
      if (options.responseFormatJson) {
        try {
          JSON.parse(content);
        } catch (e) {
          throw new Error('DeepSeek returned invalid JSON');
        }
      }

      return {
        content: content,
        provider: 'deepseek',
        model: deepseekModel,
        latencyMs: Date.now() - startTime,
        tokensUsed: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0
        },
        failoverTriggered: false
      };
    } catch (error: any) {
      console.warn(`DeepSeek primary failed: ${error.message}. Triggering failover.`);
      failoverTriggered = true;
      failoverReason = error.message;
    }
  } else {
    failoverTriggered = true;
    failoverReason = 'DEEPSEEK_API_KEY not configured';
  }

  // 2. Fallback to Anthropic
  if (failoverTriggered && env.ANTHROPIC_API_KEY) {
    const fallbackStartTime = Date.now();
    try {
      const payload: any = {
        model: anthropicModel,
        system: options.systemPrompt + (options.responseFormatJson ? ' You must output ONLY valid JSON.' : ''),
        messages: [
          { role: 'user', content: options.userPrompt }
        ],
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature ?? 0.5
      };

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: HTTP ${response.status}`);
      }

      const data: any = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        throw new Error('Anthropic returned empty or invalid response structure');
      }

      if (options.responseFormatJson) {
        try {
          JSON.parse(content);
        } catch (e) {
          throw new Error('Anthropic returned invalid JSON');
        }
      }

      return {
        content: content,
        provider: 'anthropic',
        model: anthropicModel,
        latencyMs: Date.now() - startTime,
        tokensUsed: {
          prompt: data.usage?.input_tokens || 0,
          completion: data.usage?.output_tokens || 0,
          total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        },
        failoverTriggered: true,
        failoverReason: failoverReason
      };
    } catch (error: any) {
      console.error(`Anthropic fallback failed: ${error.message}`);
    }
  }

  // 3. Graceful Degraded Fallback
  console.warn("Both LLM providers failed or are unconfigured. Returning offline fallback.");

  let fallbackContent = options.responseFormatJson
    ? JSON.stringify({
        priority: "medium",
        sentiment: "neutral",
        category: "general",
        confidence: 0,
        draft_reply: "I am currently operating in offline fallback mode due to connectivity issues. Please stand by."
      })
    : "I am currently operating in offline fallback mode due to connectivity issues. Please stand by while a human agent reviews this.";

  return {
    content: fallbackContent,
    provider: 'offline-fallback',
    model: 'fallback',
    latencyMs: Date.now() - startTime,
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    failoverTriggered: true,
    failoverReason: 'All providers failed'
  };
}
