import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveTeamContext } from "@/lib/team-context";
import { ProjectDetail } from "@/components/dashboard/projects/project-detail";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const ctx = await resolveTeamContext(clerkId);
  if (!ctx) redirect("/sign-in");

  const project = await prisma.project.findFirst({
    where: {
      id,
      OR: [{ teamId: ctx.teamId }, { userId: ctx.userId, teamId: null }],
    },
    include: {
      apiKeys: {
        select: {
          id: true,
          name: true,
          prefix: true,
          isActive: true,
          lastUsedAt: true,
          scopes: true,
        },
        orderBy: { createdAt: "desc" },
      },
      budget: {
        select: {
          maxTokensPerDay: true,
          maxTokensPerMonth: true,
          maxCostPerDay: true,
          maxCostPerMonth: true,
        },
      },
    },
  });

  if (!project) notFound();

  // Usage stats — last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const usageAgg = await prisma.usageLog.aggregate({
    where: { projectId: id, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { totalTokens: true, costUsd: true },
  });

  const stats = {
    requests: usageAgg._count._all,
    tokens: usageAgg._sum.totalTokens ?? 0,
    cost: usageAgg._sum.costUsd ?? 0,
  };

  return (
    <ProjectDetail
      project={{
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        color: project.color,
        isActive: project.isActive,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      }}
      apiKeys={project.apiKeys.map((k) => ({
        ...k,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      }))}
      budget={project.budget}
      stats={stats}
    />
  );
}
