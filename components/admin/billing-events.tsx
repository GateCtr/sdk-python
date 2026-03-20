import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BillingEvent {
  id: string;
  action: string;
  userId: string;
  userEmail: string | null;
  createdAt: Date;
}

interface BillingEventsProps {
  events: BillingEvent[];
}

function eventVariant(
  action: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (action.includes("upgraded") || action.includes("activated"))
    return "default";
  if (action.includes("failed") || action.includes("canceled"))
    return "destructive";
  if (action.includes("trial")) return "secondary";
  return "outline";
}

export function BillingEvents({ events }: BillingEventsProps) {
  const t = useTranslations("adminBilling");

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b border-border px-5 py-4">
        <CardTitle className="text-sm font-semibold text-foreground">
          {t("events.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {(["action", "user", "timestamp"] as const).map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    {t(`events.table.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    {t("events.empty")}
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Badge
                        variant={eventVariant(event.action)}
                        className="font-mono text-xs"
                      >
                        {event.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {event.userEmail ?? `${event.userId.slice(0, 8)}\u2026`}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
