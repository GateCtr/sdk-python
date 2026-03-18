"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Mail,
  CheckCircle,
  Clock,
  Filter,
  Send,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  useCase: string | null;
  position: number;
  status: "WAITING" | "INVITED" | "JOINED";
  createdAt: string;
}

export default function AdminWaitlistPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "WAITING" | "INVITED" | "JOINED"
  >("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
      });

      if (filter !== "all") {
        params.append("status", filter);
      }

      const response = await fetch(`/api/waitlist?${params}`);

      if (response.status === 403) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      const data = await response.json();

      setEntries(data.entries);
      setTotal(data.pagination.total);
      setSelectedIds(new Set());
    } catch (error) {
      console.error("Failed to fetch waitlist:", error);
      setMessage({ type: "error", text: "Failed to load waitlist entries" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === waitingEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(waitingEntries.map((e) => e.id)));
    }
  };

  const handleBatchInvite = async () => {
    if (selectedIds.size === 0) return;

    setInviting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/waitlist/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryIds: Array.from(selectedIds),
          expiryDays: 7,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({
          type: "success",
          text: `Successfully invited ${data.invited} user${data.invited !== 1 ? "s" : ""}${data.failed > 0 ? `, ${data.failed} failed` : ""}`,
        });
        fetchEntries();
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to send invites",
        });
      }
    } catch (error) {
      console.error("Invite error:", error);
      setMessage({ type: "error", text: "Failed to send invites" });
    } finally {
      setInviting(false);
    }
  };

  const handleSingleInvite = async (entryId: string) => {
    setInviting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/waitlist/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryIds: [entryId],
          expiryDays: 7,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: "success", text: "Invite sent successfully" });
        fetchEntries();
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to send invite",
        });
      }
    } catch (error) {
      console.error("Invite error:", error);
      setMessage({ type: "error", text: "Failed to send invite" });
    } finally {
      setInviting(false);
    }
  };

  const waitingEntries = entries.filter((e) => e.status === "WAITING");

  const getStatusBadge = (status: string) => {
    const variants = {
      WAITING: "outline" as const,
      INVITED: "secondary" as const,
      JOINED: "default" as const,
    };

    const icons = {
      WAITING: <Clock className="w-3 h-3 mr-1" />,
      INVITED: <Mail className="w-3 h-3 mr-1" />,
      JOINED: <CheckCircle className="w-3 h-3 mr-1" />,
    };

    return (
      <Badge
        variant={variants[status as keyof typeof variants]}
        className="flex items-center w-fit"
      >
        {icons[status as keyof typeof icons]}
        {status}
      </Badge>
    );
  };

  const stats = [
    {
      title: "Total Entries",
      value: total,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Waiting",
      value: entries.filter((e) => e.status === "WAITING").length,
      icon: Clock,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      title: "Invited",
      value: entries.filter((e) => e.status === "INVITED").length,
      icon: Mail,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Joined",
      value: entries.filter((e) => e.status === "JOINED").length,
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-100 dark:bg-green-900/20",
    },
  ];

  // Show unauthorized message if not admin
  if (unauthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Access Denied</CardTitle>
            <CardDescription>
              You don&apos;t have permission to access this page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              This page is restricted to administrators only. Please contact
              your system administrator if you believe you should have access.
            </p>
            <Button onClick={() => router.push("/")} className="w-full">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">
            Waitlist Management
          </h1>
          <p className="text-muted-foreground">
            Manage and invite users from the waitlist
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">
                      {stat.title}
                    </p>
                    <p className="text-3xl font-bold text-foreground">
                      {stat.value}
                    </p>
                  </div>
                  <div
                    className={`w-12 h-12 rounded-lg ${stat.bgColor} flex items-center justify-center`}
                  >
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alert Messages */}
        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <p>{message.text}</p>
          </Alert>
        )}

        {/* Main Table Card */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Waitlist Entries</CardTitle>
                <CardDescription>
                  View and manage all waitlist submissions
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Select
                  value={filter}
                  onValueChange={(value) => setFilter(value as typeof filter)}
                >
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Entries</SelectItem>
                    <SelectItem value="WAITING">Waiting</SelectItem>
                    <SelectItem value="INVITED">Invited</SelectItem>
                    <SelectItem value="JOINED">Joined</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="w-full sm:w-auto"
                  onClick={handleBatchInvite}
                  disabled={selectedIds.size === 0 || inviting}
                >
                  {inviting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Invite Selected ({selectedIds.size})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {filter === "WAITING" || filter === "all" ? (
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={
                            waitingEntries.length > 0 &&
                            selectedIds.size === waitingEntries.length
                          }
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-border"
                          disabled={waitingEntries.length === 0}
                        />
                      </th>
                    ) : null}
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Position
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                      Company
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                      Use Case
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          Loading...
                        </div>
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No entries found
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-muted/50 transition-colors"
                      >
                        {filter === "WAITING" || filter === "all" ? (
                          <td className="px-4 py-4 whitespace-nowrap">
                            {entry.status === "WAITING" && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(entry.id)}
                                onChange={() => toggleSelection(entry.id)}
                                className="w-4 h-4 rounded border-border"
                              />
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <Badge variant="outline" className="font-mono">
                            #{entry.position}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                          {entry.email}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-muted-foreground hidden md:table-cell">
                          {entry.name || "-"}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-muted-foreground hidden lg:table-cell">
                          {entry.company || "-"}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-muted-foreground hidden lg:table-cell">
                          {entry.useCase || "-"}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {getStatusBadge(entry.status)}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-muted-foreground hidden sm:table-cell">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm">
                          {entry.status === "WAITING" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSingleInvite(entry.id)}
                              disabled={inviting}
                            >
                              <Mail className="w-3 h-3 mr-1" />
                              Invite
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!loading && entries.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing page {page} of entries
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPage(page + 1)}
                    disabled={entries.length < 50}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
