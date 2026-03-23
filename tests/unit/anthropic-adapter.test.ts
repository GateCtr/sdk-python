/**
 * Unit Tests — Anthropic LLM Adapter
 * Task 15.3 from business-modules-core spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lLMProviderConfig: {
      findUnique: vi.fn().mockResolvedValue(null), // use defaults
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── System message translation ────────────────────────────────────────────────

describe("Anthropic adapter — system message translation", () => {
  it("extracts system messages into the top-level system parameter", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg_1",
        model: "claude-3-opus-20240229",
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    await chat(
      {
        model: "claude-3-opus-20240229",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" },
        ],
      },
      "sk-ant-test",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    // system field must be set at top level
    expect(body.system).toBe("You are a helpful assistant.");
    // messages array must NOT contain the system message
    expect(body.messages).not.toContainEqual(
      expect.objectContaining({ role: "system" }),
    );
  });

  it("concatenates multiple system messages with newline", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg_2",
        model: "claude-3-opus-20240229",
        content: [{ type: "text", text: "OK" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 20, output_tokens: 3 },
      }),
    });

    await chat(
      {
        model: "claude-3-opus-20240229",
        messages: [
          { role: "system", content: "Rule 1: Be concise." },
          { role: "system", content: "Rule 2: Be accurate." },
          { role: "user", content: "Hello" },
        ],
      },
      "sk-ant-test",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.system).toBe("Rule 1: Be concise.\nRule 2: Be accurate.");
  });

  it("omits system field when no system messages present", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg_3",
        model: "claude-3-opus-20240229",
        content: [{ type: "text", text: "Hi" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 2 },
      }),
    });

    await chat(
      {
        model: "claude-3-opus-20240229",
        messages: [{ role: "user", content: "Hello" }],
      },
      "sk-ant-test",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.system).toBeUndefined();
  });
});

// ── Role mapping ──────────────────────────────────────────────────────────────

describe("Anthropic adapter — role mapping", () => {
  it("maps user messages to role 'user'", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg_4",
        model: "claude-3-opus-20240229",
        content: [{ type: "text", text: "Answer" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 8, output_tokens: 4 },
      }),
    });

    await chat(
      {
        model: "claude-3-opus-20240229",
        messages: [{ role: "user", content: "What is 2+2?" }],
      },
      "sk-ant-test",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toBe("What is 2+2?");
  });

  it("maps assistant messages to role 'assistant'", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg_5",
        model: "claude-3-opus-20240229",
        content: [{ type: "text", text: "Continued" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 15, output_tokens: 6 },
      }),
    });

    await chat(
      {
        model: "claude-3-opus-20240229",
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
          { role: "user", content: "Continue" },
        ],
      },
      "sk-ant-test",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.messages[1].role).toBe("assistant");
    expect(body.messages[1].content).toBe("Hi there!");
  });

  it("preserves message order after system extraction", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "msg_6",
        model: "claude-3-opus-20240229",
        content: [{ type: "text", text: "Done" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 20, output_tokens: 5 },
      }),
    });

    await chat(
      {
        model: "claude-3-opus-20240229",
        messages: [
          { role: "system", content: "Be helpful." },
          { role: "user", content: "First" },
          { role: "assistant", content: "Response" },
          { role: "user", content: "Second" },
        ],
      },
      "sk-ant-test",
    );

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.messages).toHaveLength(3);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[1].role).toBe("assistant");
    expect(body.messages[2].role).toBe("user");
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("Anthropic adapter — error handling", () => {
  it("throws ProviderError with retryable=true on 500", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ error: { message: "Server error" } }),
    });

    await expect(
      chat(
        {
          model: "claude-3-opus-20240229",
          messages: [{ role: "user", content: "Hi" }],
        },
        "sk-ant-test",
      ),
    ).rejects.toMatchObject({ retryable: true, status: 500 });
  });

  it("throws ProviderError with retryable=false on 400", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ error: { message: "Invalid request" } }),
    });

    await expect(
      chat(
        {
          model: "claude-3-opus-20240229",
          messages: [{ role: "user", content: "Hi" }],
        },
        "sk-ant-test",
      ),
    ).rejects.toMatchObject({ retryable: false, status: 400 });
  });

  it("returns stream response when stream=true", async () => {
    const { chat } = await import("@/lib/llm/anthropic");

    const mockStream = new ReadableStream();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    });

    const result = await chat(
      {
        model: "claude-3-opus-20240229",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      },
      "sk-ant-test",
    );

    expect(result.stream).toBeDefined();
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.totalTokens).toBe(0);
  });
});
