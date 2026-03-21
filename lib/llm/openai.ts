import type { GatewayRequest, GatewayResponse } from "@/lib/llm/types";
import { ProviderError } from "@/lib/llm/types";
import { prisma } from "@/lib/prisma";

async function getConfig(): Promise<{ baseUrl: string; timeout: number }> {
  const config = await prisma.lLMProviderConfig.findUnique({
    where: { provider: "openai" },
  });
  return {
    baseUrl: config?.baseUrl ?? "https://api.openai.com/v1",
    timeout: config?.defaultTimeout ?? 30000,
  };
}

async function handleProviderError(
  res: Response,
  provider: string,
): Promise<never> {
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body.error?.message ?? message;
  } catch {}
  throw new ProviderError(provider, res.status, message, res.status >= 500);
}

// All current OpenAI models (GPT-4.1, GPT-5, o3, o4-mini) are chat-only.
// The legacy /completions endpoint is deprecated — route complete() through /chat/completions.
export async function complete(
  params: GatewayRequest,
  apiKey: string,
): Promise<GatewayResponse> {
  const messages = params.messages ?? [
    { role: "user" as const, content: params.prompt ?? "" },
  ];
  return chat({ ...params, messages }, apiKey);
}

export async function chat(
  params: GatewayRequest,
  apiKey: string,
): Promise<GatewayResponse> {
  const { baseUrl, timeout } = await getConfig();
  const url = `${baseUrl}/chat/completions`;
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        // o3/o4-mini (reasoning models) require max_completion_tokens; GPT-4.1/GPT-5 accept both.
        // Send max_completion_tokens as the canonical field — OpenAI maps max_tokens as an alias
        // for non-reasoning models, so this is safe across the full current model lineup.
        max_completion_tokens: params.maxTokens,
        temperature: params.temperature,
        stream: params.stream,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      await handleProviderError(res, "openai");
    }

    if (params.stream) {
      return {
        id: "",
        model: params.model,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        content: "",
        finishReason: "stop",
        latencyMs: Date.now() - startTime,
        stream: res.body as ReadableStream,
      };
    }

    const response = await res.json();
    return {
      id: response.id,
      model: response.model,
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
      content: response.choices[0].message.content ?? "",
      finishReason: response.choices[0].finish_reason ?? "stop",
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError("openai", 408, "Request timeout", true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
