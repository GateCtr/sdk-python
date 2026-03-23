/**
 * Unit Tests — Context Optimizer
 * Task 15.1 from business-modules-core spec
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { optimize, estimateTokens } from "@/lib/optimizer";
import type { GatewayRequest } from "@/lib/llm/types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    optimizationLog: { create: vi.fn().mockResolvedValue({}) },
    optimizationRule: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

beforeEach(() => vi.clearAllMocks());

// ── Stage 1: Whitespace normalization ─────────────────────────────────────────

describe("Stage 1: Whitespace normalization", () => {
  it("collapses multiple spaces into one", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "hello   world" }],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).toBe("hello world");
    expect(result.techniques).toContain("whitespace_normalization");
  });

  it("collapses multiple tabs into one space", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "hello\t\tworld" }],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).toBe("hello world");
  });

  it("normalizes CRLF to LF", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "line1\r\nline2" }],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).toBe("line1\nline2");
  });

  it("strips leading and trailing whitespace", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "  hello world  " }],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).toBe("hello world");
  });

  it("normalizes the prompt field too", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      prompt: "  hello   world  ",
    };
    const result = await optimize(req);
    expect(result.request.prompt).toBe("hello world");
  });

  it("savedTokens > 0 when whitespace is removed", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "a" + " ".repeat(100) + "b" }],
    };
    const result = await optimize(req);
    expect(result.savedTokens).toBeGreaterThan(0);
  });
});

// ── Stage 2: Duplicate deduplication ─────────────────────────────────────────

describe("Stage 2: Duplicate message deduplication", () => {
  it("removes exact duplicate messages, keeping last occurrence", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "What is 2+2?" },
        { role: "user", content: "What is 2+2?" },
      ],
    };
    const result = await optimize(req);
    expect(result.request.messages).toHaveLength(1);
    expect(result.techniques).toContain("deduplication");
  });

  it("preserves unique messages", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "First message" },
        { role: "assistant", content: "First response" },
        { role: "user", content: "Second message" },
      ],
    };
    const result = await optimize(req);
    expect(result.request.messages).toHaveLength(3);
  });

  it("treats same content with different roles as distinct", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hello" },
      ],
    };
    const result = await optimize(req);
    expect(result.request.messages).toHaveLength(2);
  });

  it("deduplication reduces savedTokens correctly", async () => {
    const longContent =
      "This is a repeated message with enough content to matter.";
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "user", content: longContent },
        { role: "user", content: longContent },
        { role: "user", content: longContent },
      ],
    };
    const result = await optimize(req);
    expect(result.savedTokens).toBeGreaterThan(0);
    expect(result.request.messages).toHaveLength(1);
  });
});

// ── Stage 3: Semantic pruning ─────────────────────────────────────────────────

describe("Stage 3: Semantic pruning", () => {
  it("removes filler phrase 'Certainly!'", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "assistant", content: "Certainly! Here is the answer." },
      ],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).not.toMatch(/^Certainly/i);
    expect(result.techniques).toContain("semantic_pruning");
  });

  it("removes 'As an AI language model,' prefix", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        {
          role: "assistant",
          content: "As an AI language model, I can help you with that.",
        },
      ],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).not.toMatch(
      /As an AI language model/i,
    );
  });

  it("removes 'I'm here to help' filler", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "assistant", content: "I'm here to help. The answer is 42." },
      ],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).not.toMatch(
      /I'm here to help/i,
    );
  });

  it("removes 'Feel free to ask' closing filler", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        {
          role: "assistant",
          content: "The answer is 42. Feel free to ask if you need more help.",
        },
      ],
    };
    const result = await optimize(req);
    expect(result.request.messages![0].content).not.toMatch(
      /Feel free to ask/i,
    );
  });
});

// ── Stage 4: System prompt compression ───────────────────────────────────────

describe("Stage 4: System prompt compression", () => {
  it("applies normalization to system messages", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are   a helpful   assistant." },
        { role: "user", content: "Hello" },
      ],
    };
    const result = await optimize(req);
    const systemMsg = result.request.messages!.find((m) => m.role === "system");
    expect(systemMsg?.content).toBe("You are a helpful assistant.");
  });

  it("truncates long system prompts to ~80% of original length", async () => {
    // Build a system prompt > 500 chars with no filler (so only truncation applies)
    const longSystem = "A".repeat(600);
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "system", content: longSystem },
        { role: "user", content: "Hello" },
      ],
    };
    const result = await optimize(req);
    const systemMsg = result.request.messages!.find((m) => m.role === "system");
    expect(systemMsg!.content.length).toBeLessThan(longSystem.length);
    expect(result.techniques).toContain("system_compression");
  });

  it("does not truncate short system prompts (≤500 chars)", async () => {
    const shortSystem = "You are a helpful assistant.";
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [
        { role: "system", content: shortSystem },
        { role: "user", content: "Hello" },
      ],
    };
    const result = await optimize(req);
    const systemMsg = result.request.messages!.find((m) => m.role === "system");
    expect(systemMsg?.content).toBe(shortSystem);
  });
});

// ── General invariants ────────────────────────────────────────────────────────

describe("General optimizer invariants", () => {
  it("savedTokens is always non-negative", async () => {
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };
    const result = await optimize(req);
    expect(result.savedTokens).toBeGreaterThanOrEqual(0);
  });

  it("returns original request on error (never throws)", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.optimizationRule.findMany).mockRejectedValueOnce(
      new Error("DB down"),
    );
    const req: GatewayRequest = {
      model: "gpt-4",
      messages: [{ role: "user", content: "Hello" }],
    };
    await expect(optimize(req)).resolves.toBeDefined();
  });

  it("estimateTokens returns a positive integer for non-empty strings", () => {
    expect(estimateTokens("hello")).toBeGreaterThan(0);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(100))).toBeGreaterThan(0);
    // result must be an integer
    expect(Number.isInteger(estimateTokens("a".repeat(100)))).toBe(true);
  });
});
