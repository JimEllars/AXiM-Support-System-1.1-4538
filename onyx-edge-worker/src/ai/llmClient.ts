export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  reasoning_content?: string;
  reasoningContent?: string;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface LLMRequestOptions {
  systemPrompt?: string;
  userPrompt?: string;
  messages?: ChatMessage[];
  taskType?: 'fast' | 'reasoning' | 'json' | 'tools';
  temperature?: number;
  maxTokens?: number;
  responseFormatJson?: boolean;
  userId?: string;
  tools?: any[];
  thinking?: { type: 'enabled' | 'disabled'; reasoningEffort?: 'low' | 'high' | 'max' };
}

export interface LLMResponse {
  content: string;
  provider: 'deepseek' | 'anthropic' | 'workers-ai' | 'offline-fallback';
  model: string;
  latencyMs: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
    promptCacheHitTokens?: number;
    promptCacheMissTokens?: number;
    cacheHitRatio?: number; // (hit / total_prompt) * 100
  };
  reasoningContent?: string;
  toolCalls?: any[];
  failoverTriggered: boolean;
  failoverReason?: string;
}

export async function callAIWithFailover(
  options: LLMRequestOptions,
  env: any
): Promise<LLMResponse> {
  const deepseekModel = env.DEEPSEEK_MODEL || (options.taskType === 'reasoning' ? 'deepseek-v4-pro' : 'deepseek-flash');
  const anthropicModel = env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  const defaultUserId = options.userId || "axim-system-default";

  const startTime = Date.now();
  let failoverTriggered = false;
  let failoverReason = '';

  // 1. Try DeepSeek first
  if (env.DEEPSEEK_API_KEY) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Construct message sequence preserving reasoning_content on assistant turns
      let requestMessages: any[] = [];

      if (options.messages && options.messages.length > 0) {
        requestMessages = options.messages.map((m) => {
          const msg: any = { role: m.role, content: m.content ?? "" };

          if (m.role === 'assistant') {
            const reasoning = m.reasoning_content || m.reasoningContent;
            if (reasoning) {
              msg.reasoning_content = reasoning;
            }
          }

          if (m.tool_calls) msg.tool_calls = m.tool_calls;
          if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
          if (m.name) msg.name = m.name;
          return msg;
        });
      } else {
        requestMessages = [
          { role: 'system', content: options.systemPrompt || '' },
          { role: 'user', content: options.userPrompt || '' }
        ];
      }

      const payload: any = {
        model: deepseekModel,
        messages: requestMessages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature ?? 0.5,
        user_id: defaultUserId
      };

      if (options.responseFormatJson) {
         payload.response_format = { type: 'json_object' };
         const sysPrompt = options.systemPrompt || '';
         const usrPrompt = options.userPrompt || '';
         if (!sysPrompt.toLowerCase().includes("json") && !usrPrompt.toLowerCase().includes("json")) {
             if(payload.messages[0].role === 'system') {
               payload.messages[0].content += " You must output ONLY valid JSON.";
             }
         }
      }

      if (options.tools) {
        payload.tools = options.tools.map(tool => {
            if (tool.function && tool.function.parameters) {
                 return {
                     type: tool.type || "function",
                     function: {
                         name: tool.function.name,
                         description: tool.function.description,
                         parameters: {
                             ...tool.function.parameters,
                             additionalProperties: false
                         },
                         strict: true
                     }
                 };
            }
            return tool;
        });
      }

      // Concurrency retry loop
      let response: Response;
      let attempt = 0;
      const maxRetries = 2;

            const deepseekUrl = options.tools && options.tools.length > 0
        ? 'https://api.deepseek.com/beta/chat/completions'
        : 'https://api.deepseek.com/chat/completions';

      while (true) {
          response = await fetch(deepseekUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify(payload),
            signal: controller.signal as any
          });

          if (response.status === 429) {
              const errBody = await response.text();
              if (errBody.includes("insufficient_balance")) {
                  throw new Error("DeepSeek insufficient balance (HTTP 402/429)");
              }
              if (attempt >= maxRetries) {
                  throw new Error(`DeepSeek API error: HTTP 429 (Concurrency limit exceeded after ${maxRetries} retries)`);
              }
              attempt++;
              const delayMs = Math.floor(Math.random() * 200) + 100 * Math.pow(2, attempt);
              await new Promise(r => setTimeout(r, delayMs));
          } else {
              break;
          }
      }


      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`DeepSeek API error: HTTP ${response.status}`);
      }

      const data: any = await response.json();
      const choice = data.choices?.[0];
      const message = choice?.message;
      const content = message?.content;
      const reasoningContent = message?.reasoning_content;
      const toolCalls = message?.tool_calls;

      if (!content && !toolCalls) {
        throw new Error('DeepSeek returned empty or invalid response structure');
      }

      // Basic JSON validation if requested
      if (options.responseFormatJson && content) {
        try {
          JSON.parse(content);
        } catch (e) {
          throw new Error('DeepSeek returned invalid JSON');
        }
      }

      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || 0;
      const promptCacheHitTokens = data.usage?.prompt_cache_hit_tokens || 0;
      const promptCacheMissTokens = data.usage?.prompt_cache_miss_tokens || 0;

      let cacheHitRatio = undefined;
      if (promptTokens > 0) {
          cacheHitRatio = (promptCacheHitTokens / promptTokens) * 100;
      }

      return {
        content: content || '',
        provider: 'deepseek',
        model: deepseekModel,
        latencyMs: Date.now() - startTime,
        tokensUsed: {
          prompt: promptTokens,
          completion: completionTokens,
          total: totalTokens,
          promptCacheHitTokens,
          promptCacheMissTokens,
          cacheHitRatio
        },
        reasoningContent,
        toolCalls,
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

      if (options.tools) {
        payload.tools = options.tools;
      }

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

      let content = '';
      let toolCalls = undefined;

      if (data.content) {
        const textBlock = data.content.find((block: any) => block.type === 'text');
        if (textBlock) {
          content = textBlock.text;
        }

        const toolUseBlocks = data.content.filter((block: any) => block.type === 'tool_use');
        if (toolUseBlocks.length > 0) {
          toolCalls = toolUseBlocks.map((block: any) => ({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input)
            }
          }));
        }
      }

      if (!content && !toolCalls) {
        throw new Error('Anthropic returned empty or invalid response structure');
      }

      if (options.responseFormatJson && content) {
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
        toolCalls,
        failoverTriggered: true,
        failoverReason: failoverReason
      };
    } catch (error: any) {
      console.error(`Anthropic fallback failed: ${error.message}`);
      failoverReason += ` | Anthropic failed: ${error.message}`;
    }
  }

  // 3. Tertiary - Cloudflare Workers AI
  if (env.AI) {
    try {
      const payload = {
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt }
        ]
      };

      if (options.responseFormatJson) {
         const sysPrompt = options.systemPrompt || '';
         const usrPrompt = options.userPrompt || '';
         if (!sysPrompt.toLowerCase().includes("json") && !usrPrompt.toLowerCase().includes("json")) {
             payload.messages[0].content += " You must output ONLY valid JSON.";
         }
      }

      const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", payload);

      let content = response.response;

      if (options.responseFormatJson && content) {
        try {
          JSON.parse(content);
        } catch (e) {
          // Attempt basic extraction if wrapped in markdown
          const match = content.match(/```json\s*([\s\S]*?)\s*```/);
          if (match) {
             content = match[1];
             JSON.parse(content);
          } else {
            throw new Error('Workers AI returned invalid JSON');
          }
        }
      }

      return {
        content: content || '',
        provider: 'workers-ai',
        model: "@cf/meta/llama-3.1-8b-instruct",
        latencyMs: Date.now() - startTime,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        failoverTriggered: true,
        failoverReason: failoverReason
      };
    } catch (error: any) {
      console.error(`Workers AI fallback failed: ${error.message}`);
      failoverReason += ` | Workers AI failed: ${error.message}`;
    }
  }

  // 4. Graceful Degraded Fallback
  console.warn("All LLM providers failed or are unconfigured. Returning offline fallback.");

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
    failoverReason: 'All providers failed: ' + failoverReason
  };
}
