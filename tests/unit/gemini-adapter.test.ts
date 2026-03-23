/**
 * Unit Tests — Gemini LLM Adapter
 * Task 15.4 from business-modules-core spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lLMProviderConfig: {
      findUnique: vi.fn().mockResolvedValue(null), // use defaults
    },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => vi.clearAllMocks());

// ── assistant → model role translation ───────────────────────────────────────

describe("Gemini adapter — assistant→model role translation", () => {
  const mockSuccessResponse = {
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: { parts: [{ text: "Hello!" }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    }),
  };

  it("translates 'assistant' role to 'model' in contents[]", async () => {
    const { chat } = await import("@/lib/llm/gemini");
    mockFetch.mockResolvedValueOnce(mockSuccessResponse);

    await chat(
      {
        model: "gemini-1.5-pro",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "How are you?" },
        ],
      },
      "gemini-api-key",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    // assistant → model
    expect(body.contents[1].role).toBe("model");
    expect(body.contents[1].parts[0].text).toBe("Hi there!");
  });

  it("keeps 'user' role as 'user'", async () => {
    const { chat } = await import("@/lib/llm/gemini");
    mockFetch.mockResolvedValueOnce(mockSuccessResponse);

    await chat(
      {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Hello" }],
      },
      "gemini-api-key",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.contents[0].role).toBe("user");
  });

  it("extracts system messages into systemInstruction", async () => {
    const { chat } = await import("@/lib/llm/gemini");
    mockFetch.mockResolvedValueOnce(mockSuccessResponse);

    await chat(
      {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" },
        ],
      },
      "gemini-api-key",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.systemInstruction).toBeDefined();
    expect(body.systemInstruction.parts[0].text).toBe(
      "You are a helpful assistant.",
    );
    // system message must NOT appear in contents
    expect(body.contents).not.toContainEqual(
      expect.objectContaining({ role: "system" }),
    );
  });

  it("omits systemInstruction when no system messages", async () => {
    const { chat } = await import("@/lib/llm/gemini");
    mockFetch.mockResolvedValueOnce(mockSuccessResponse);

    await chat(
      {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Hello" }],
      },
      "gemini-api-key",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.systemInstruction).toBeUndefined();
  });

  it("preserves message order: user, model, user", async () => {
    const { chat } = await import("@/lib/llm/gemini");
    mockFetch.mockResolvedValueOnce(mockSuccessResponse);

    await chat(
      {
        model: "gemini-1.5-pro",
        messages: [
          { role: "user", content: "First" },
          { role: "assistant", content: "Response" },
          { role: "user", content: "Second" },
        ],
      },
      "gemini-api-key",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.contents).toHaveLength(3);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[1].role).toBe("model");
    expect(body.contents[2].role).toBe("user");
  });
});

// ── complete() routes through chat() ─────────────────────────────────────────

describe("Gemini adapter — complete() routes through chat()", () => {
  it("wraps prompt in a user message and calls generateContent", async () => {
    const { complete } = await import("@/lib/llm/gemini");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: "Answer" }] }, finishReason: "STOP" },
        ],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 3,
          totalTokenCount: 8,
        },
      }),
    });

    const result = await complete(
      { model: "gemini-1.5-pro", prompt: "What is 2+2?" },
      "gemini-api-key",
    );

    expect(result.content).toBe("Answer");
    expect(result.promptTokens).toBe(5);
    expect(result.completionTokens).toBe(3);
    expect(result.totalTokens).toBe(8);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("Gemini adapter — error handling", () => {
  it("throws ProviderError with retryable=true on 503", async () => {
    const { chat } = await import("@/lib/llm/gemini");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      json: async () => ({ error: { message: "Overloaded" } }),
    });

    await expect(
      chat(
        {
          model: "gemini-1.5-pro",
          messages: [{ role: "user", content: "Hi" }],
        },
        "gemini-api-key",
      ),
    ).rejects.toMatchObject({ retryable: true, status: 503 });
  });

  it("throws ProviderError with retryable=false on 401", async () => {
    const { chat } = await import("@/lib/llm/gemini");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: { message: "Invalid API key" } }),
    });

    await expect(
      chat(
        {
          model: "gemini-1.5-pro",
          messages: [{ role: "user", content: "Hi" }],
        },
        "gemini-api-key",
      ),
    ).rejects.toMatchObject({ retryable: false, status: 401 });
  });

  it("returns stream response when stream=true", async () => {
    const { chat } = await import("@/lib/llm/gemini");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: new ReadableStream(),
    });

    const result = await chat(
      {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
      "gemini-api-key",
    );

    expect(result.stream).toBeDefined();
    expect(result.totalTokens).toBe(0);
  });
});
