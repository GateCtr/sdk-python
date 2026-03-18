import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Audit action types for security-relevant events
 */
export type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "role.granted"
  | "role.revoked"
  | "access.denied"
  | "webhook.signature_failed";

/**
 * Audit log entry interface for creating audit records
 */
export interface AuditLogEntry {
  userId?: string;
  actorId?: string;
  resource: string;
  action: string;
  resourceId?: string;
  oldValue?: Prisma.JsonValue;
  newValue?: Prisma.JsonValue;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
}

/**
 * Filters for querying audit logs
 */
export interface AuditLogFilters {
  userId?: string;
  resource?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Pagination parameters for audit log queries
 */
export interface AuditLogPagination {
  page: number;
  pageSize: number;
}

/**
 * Result of audit log query with pagination
 */
export interface AuditLogResult {
  logs: Array<{
    id: string;
    userId: string | null;
    actorId: string | null;
    resource: string;
    action: string;
    resourceId: string | null;
    oldValue: Prisma.JsonValue | null;
    newValue: Prisma.JsonValue | null;
    ipAddress: string | null;
    userAgent: string | null;
    success: boolean;
    error: string | null;
    createdAt: Date;
    user: {
      id: string;
      email: string;
      name: string | null;
    } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Create an audit log entry in the database
 *
 * @param entry - Audit log entry data
 * @returns Promise resolving to the created audit log record
 *
 * @example
 * await logAudit({
 *   userId: 'user_123',
 *   actorId: 'admin_456',
 *   resource: 'user',
 *   action: 'user.created',
 *   resourceId: 'user_123',
 *   success: true,
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...'
 * });
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        actorId: entry.actorId,
        resource: entry.resource,
        action: entry.action,
        resourceId: entry.resourceId,
        oldValue: entry.oldValue
          ? JSON.parse(JSON.stringify(entry.oldValue))
          : undefined,
        newValue: entry.newValue
          ? JSON.parse(JSON.stringify(entry.newValue))
          : undefined,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        success: entry.success,
        error: entry.error,
      },
    });
  } catch (error) {
    // Log error but don't throw - audit logging should not break application flow
    console.error("Failed to create audit log:", error);
  }
}

/**
 * Query audit logs with filtering and pagination
 *
 * @param filters - Optional filters for querying audit logs
 * @param pagination - Pagination parameters (page number and page size)
 * @returns Promise resolving to paginated audit log results
 *
 * @example
 * const result = await getAuditLogs(
 *   { userId: 'user_123', action: 'user.created' },
 *   { page: 1, pageSize: 20 }
 * );
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {},
  pagination: AuditLogPagination = { page: 1, pageSize: 50 },
): Promise<AuditLogResult> {
  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;

  // Build where clause from filters
  const where: Prisma.AuditLogWhereInput = {};

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.resource) {
    where.resource = filters.resource;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.createdAt.lte = filters.endDate;
    }
  }

  try {
    // Execute query with pagination
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    console.error("Failed to query audit logs:", error);
    throw new Error("Failed to retrieve audit logs");
  }
}
