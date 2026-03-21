import type { GatewayRequest } from "@/lib/llm/types";

/**
 * Model Router — selects the optimal model based on cost/performance.
 * Stub implementation: returns the requested model unchanged until routing logic is built.
 * Pro plan feature.
 */
export async function route(
  request: GatewayRequest,
): Promise<{ model: string; routed: boolean }> {
  // TODO: implement scoring logic (complexity, cost, latency targets)
  return { model: request.model, routed: false };
}
