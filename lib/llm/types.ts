export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GatewayRequest {
  model: string;
  prompt?: string; // for /complete
  messages?: Message[]; // for /chat
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  projectId?: string;
}

export interface GatewayResponse {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  content: string;
  finishReason: string;
  latencyMs: number;
  stream?: ReadableStream;
}

export class ProviderError extends Error {
  provider: string;
  status: number;
  message: string;
  retryable: boolean; // true for 5xx/timeout, false for 4xx

  constructor(
    provider: string,
    status: number,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.message = message;
    this.retryable = retryable;
  }
}
