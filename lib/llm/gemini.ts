import type { GatewayRequest, GatewayResponse, Message } from "@/lib/llm/types";
import { ProviderError } from "@/lib/llm/types";
import { prisma } from "@/lib/prisma";

async function getConfig(): Promise<{ baseUrl: string; timeout: number }> {
  const config = await prisma.lLMProviderConfig.findUnique({
    where: { provider: "gemini" },
  });
  return {
    baseUrl:
      config?.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta",
    timeout: config?.defaultTimeout ?? 30000,
  };
}

async function handleProviderError(res: Response): Promise<never> {
  let message = res.statusText;
  try {
    const body = await res.json();
    message = body.error?.message ?? message;
  } catch {}
  throw new ProviderError("gemini", res.status, message, res.status >= 500);
}

function translateMessages(messages: Message[]): {
  systemInstruction: { parts: { text: string }[] } | undefined;
  contents: { role: "user" | "model"; parts: { text: string }[] }[];
} {
  const systemParts: string[] = [];
  const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini supports systemInstruction natively since v1beta — no need for [System]: hack
      systemParts.push(msg.content);
    } else if (msg.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: msg.content }] });
    } else {
      contents.push({ role: "user", parts: [{ text: msg.content }] });
    }
  }

  return {
    systemInstruction:
      systemParts.length > 0
        ? { parts: [{ text: systemParts.join("\n") }] }
        : undefined,
    contents,
  };
}

// Route complete() through chat() — Gemini uses generateContent for both single-turn and multi-turn.
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
  const endpoint = params.stream
    ? `${baseUrl}/models/${params.model}:streamGenerateContent?key=${apiKey}`
    : `${baseUrl}/models/${params.model}:generateContent?key=${apiKey}`;
  const startTime = Date.now();

  const { systemInstruction, contents } = translateMessages(
    params.messages ?? [],
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: params.maxTokens,
        temperature: params.temperature,
      },
    };

    if (systemInstruction !== undefined) {
      body.systemInstruction = systemInstruction;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      await handleProviderError(res);
    }

    if (params.stream) {
      return {
        id: `gemini-${Date.now()}`,
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
      id: `gemini-${Date.now()}`,
      model: params.model,
      promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      content: response.candidates[0]?.content?.parts[0]?.text ?? "",
      finishReason:
        response.candidates[0]?.finishReason?.toLowerCase() ?? "stop",
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError("gemini", 408, "Request timeout", true);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
