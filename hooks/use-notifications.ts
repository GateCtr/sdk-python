"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export type AlertSeverity = "info" | "warning" | "critical";

export interface InAppAlert {
  id: string;
  severity: AlertSeverity;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  rule: {
    id: string;
    name: string;
    alertType: string;
  };
}

interface NotificationsResponse {
  alerts: InAppAlert[];
}

const POLL_INTERVAL = 30_000; // 30s

export function useNotifications() {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();

  const query = useQuery<InAppAlert[]>({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/v1/notifications");
      if (!res.ok) return [];
      const data: NotificationsResponse = await res.json();
      return data.alerts ?? [];
    },
    enabled: isLoaded && !!user,
    staleTime: POLL_INTERVAL,
    refetchInterval: POLL_INTERVAL,
  });

  const alerts = query.data ?? [];
  const unreadCount = alerts.filter((a) => !a.acknowledged).length;

  async function acknowledge(id: string) {
    await fetch(`/api/v1/alerts/${id}`, { method: "PATCH" });
    queryClient.setQueryData<InAppAlert[]>(
      ["notifications", user?.id],
      (prev) =>
        prev?.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) ??
        [],
    );
  }

  async function acknowledgeAll() {
    await fetch("/api/v1/alerts/acknowledge-all", { method: "POST" });
    queryClient.setQueryData<InAppAlert[]>(
      ["notifications", user?.id],
      (prev) => prev?.map((a) => ({ ...a, acknowledged: true })) ?? [],
    );
  }

  return {
    alerts,
    unreadCount,
    isLoading: query.isLoading,
    acknowledge,
    acknowledgeAll,
    refetch: query.refetch,
  };
}
