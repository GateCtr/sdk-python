import { Queue } from "bullmq";
import IORedis from "ioredis";

// Shared IORedis connection for BullMQ queues
export const redisConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // required by BullMQ
  retryStrategy: (times) => {
    if (times >= 10) return null; // stop retrying after 10 attempts
    return Math.min(times * 1000, 30000); // exponential backoff up to 30s
  },
});

// BullMQ shared options — skipVersionCheck suppresses the volatile-lru warning
// on managed Redis plans (Redis.io Hobby, Upstash, etc.) that don't allow
// changing the eviction policy to "noeviction".
export const bullmqDefaults = { skipVersionCheck: true } as const;

export interface WebhookJobData {
  webhookId?: string; // undefined = fan-out to all user webhooks
  userId: string;
  event: string;
  payload: Record<string, unknown>;
  deliveryId?: string;
}

export interface AnalyticsJobData {
  userId: string;
  projectId?: string;
  apiKeyId?: string;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  savedTokens: number;
  costUsd: number;
  latencyMs: number;
  statusCode: number;
  optimized: boolean;
  routed: boolean;
  fallback: boolean;
  ipAddress?: string;
}

export interface DailyReportJobData {
  date: string; // "YYYY-MM-DD" — the day to aggregate (yesterday)
}

export interface EmailJobData {
  type: "team_invitation";
  to: string;
  inviteeName?: string;
  inviterName: string;
  teamName: string;
  role: string;
  acceptUrl: string;
  expiryDays?: number;
  locale?: "en" | "fr";
}

export interface HealthJobData {
  triggeredAt: string; // ISO timestamp
}

export const webhooksQueue = new Queue<WebhookJobData>("webhooks", {
  connection: redisConnection,
  ...bullmqDefaults,
  defaultJobOptions: {
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

export const analyticsQueue = new Queue<AnalyticsJobData>("analytics", {
  connection: redisConnection,
  ...bullmqDefaults,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "fixed", delay: 2000 },
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 10000 },
  },
});

export const dailyReportQueue = new Queue<DailyReportJobData>("daily-report", {
  connection: redisConnection,
  ...bullmqDefaults,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: { count: 90 },
    removeOnFail: { count: 30 },
  },
});

export const emailQueue = new Queue<EmailJobData>("emails", {
  connection: redisConnection,
  ...bullmqDefaults,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { count: 2000 },
    removeOnFail: { count: 5000 },
  },
});

export const healthQueue = new Queue<HealthJobData>("health", {
  connection: redisConnection,
  ...bullmqDefaults,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});
