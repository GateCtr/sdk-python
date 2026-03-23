"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface ActiveTeam {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  role: string;
  plan: string;
}

export interface TeamMembership {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  role: string;
}

export function useActiveTeam() {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();

  const query = useQuery<ActiveTeam | null>({
    queryKey: ["active-team", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/v1/teams/active");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isLoaded && !!user,
    staleTime: 1000 * 60 * 5,
  });

  const teamsQuery = useQuery<TeamMembership[]>({
    queryKey: ["teams", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/v1/teams");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isLoaded && !!user,
    staleTime: 1000 * 60 * 5,
  });

  async function switchTeam(teamId: string) {
    await fetch("/api/v1/teams/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    queryClient.invalidateQueries({ queryKey: ["active-team", user?.id] });
  }

  return {
    activeTeam: query.data ?? null,
    isLoading: query.isLoading,
    teams: teamsQuery.data ?? [],
    switchTeam,
  };
}
