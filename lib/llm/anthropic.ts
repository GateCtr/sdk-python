import type { GatewayRequest, GatewayResponse, Message } from "@/lib/llm/types";
import { ProviderError } from "@/lib/llm/types";
import { prisma } from "@/lib/prisma";

async function getConfig(): Promise<{ baseUrl: string; timeout: number }> {
  const config = await prisma.lLMProviderConfig.findUnique({
    where: { provider: "anthropic" },
  });
  return {
    baseUrl: config?.baseUrl ?? "https://api.anthropic.com/v1",
    timeout: config?.defaultTimeout ?? 30000,
  };
}

async function handleProviderError(res: Response): Promise<never> {
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body.error?.message ?? message;
  } catch {}
  throw new ProviderError("anthropic", res.status, message, res.status >= 500);
}

function translateMessages(messages: Message[]): {
  system: string | undefined;
  anthropicMessages: { role: "user" | "assistant"; content: string }[];
} {
  const systemParts: string[] = [];
  const anthropicMessages: { role: "user" | "assistant"; content: string }[] =
    [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n") : undefined,
    anthropicMessages,
  };
}

function buildGatewayResponse(
  response: {
    id: string;
    model: string;
    content: { type: string; text: string }[];
    stop_reason?: string;
    usage: { input_tokens: number; output_tokens: number };
  },
  startTime: number,
): GatewayResponse {
  return {
    id: response.id,
    model: response.model,
    promptTokens: response.usage.input_tokens,
    completionTokens: response.usage.output_tokens,
    totalTokens: response.usage.input_tokens + response.usage.output_tokens,
    content: response.content[0]?.text ?? "",
    finishReason: response.stop_reason ?? "stop",
    latencyMs: Date.now() - startTime,
  };
}

export async function complete(
  params: GatewayRequest,
  apiKey: string,
): Promise<GatewayResponse> {
  const { baseUrl, timeout } = await getConfig();
  const url = `${baseUrl}/messages`;
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: params.model,
        messages: [{ role: "user", content: params.prompt ?? "" }],
        max_tokens: params.maxTokens ?? 1024,
        temperature: params.temperature,
        stream: params.stream,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      await handleProviderError(res);
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
    return buildGatewayResponse(response, startTime);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError("anthropic", 408, "Request timeout", true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(
  params: GatewayRequest,
  apiKey: string,
): Promise<GatewayResponse> {
  const { baseUrl, timeout } = await getConfig();
  const url = `${baseUrl}/messages`;
  const startTime = Date.now();

  const { system, anthropicMessages } = translateMessages(
    params.messages ?? [],
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const body: Record<string, unknown> = {
      model: params.model,
      messages: anthropicMessages,
      max_tokens: params.maxTokens ?? 1024,
      temperature: params.temperature,
      stream: params.stream,
    };

    if (system !== undefined) {
      body.system = system;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      await handleProviderError(res);
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
    return buildGatewayResponse(response, startTime);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError("anthropic", 408, "Request timeout", true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
