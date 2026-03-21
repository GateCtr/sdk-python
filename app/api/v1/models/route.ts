import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

function requestId(): string {
  return randomBytes(8).toString("hex");
}

export async function GET() {
  const rid = requestId();
  const headers = { "X-GateCtr-Request-Id": rid };

  const models = await prisma.modelCatalog.findMany({
    where: {
      isActive: true,
      provider: { isActive: true },
    },
    select: {
      modelId: true,
      displayName: true,
      contextWindow: true,
      capabilities: true,
      provider: {
        select: { provider: true },
      },
    },
    orderBy: [{ provider: { provider: "asc" } }, { modelId: "asc" }],
  });

  const result = models.map((m) => ({
    modelId: m.modelId,
    displayName: m.displayName,
    provider: m.provider.provider,
    contextWindow: m.contextWindow,
    capabilities: m.capabilities,
  }));

  return NextResponse.json(result, { headers });
}
