/**
 * Unit Tests for Audit Logging
 *
 * These tests verify the correctness of the audit logging system,
 * including audit log creation, querying with filters, and pagination.
 *
 * Validates Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logAudit, getAuditLogs } from "@/lib/audit";
import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogPagination,
} from "@/lib/audit";

// Mock Prisma client
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe("Audit Logging Unit Tests", () => {
  let mockPrismaAuditLog: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Get the mocked prisma instance
    const { prisma } = await import("@/lib/prisma");
    mockPrismaAuditLog = prisma.auditLog as unknown as {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test Suite: logAudit function
   * Validates: Requirements 9.1, 9.2
   */
  describe("logAudit", () => {
    it("should create audit log with all required fields", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        userId: "user_123",
        actorId: "admin_456",
        resource: "user",
        action: "user.created",
        resourceId: "user_123",
        success: true,
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      };

      mockPrismaAuditLog.create.mockResolvedValue({
        id: "audit_1",
        ...entry,
        createdAt: new Date(),
      });

      // Act
      await logAudit(entry);

      // Assert
      expect(mockPrismaAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: entry.userId,
          actorId: entry.actorId,
          resource: entry.resource,
          action: entry.action,
          resourceId: entry.resourceId,
          oldValue: undefined,
          newValue: undefined,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          success: entry.success,
          error: undefined,
        },
      });
    });

    it("should create audit log with minimal required fields", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        resource: "webhook",
        action: "webhook.signature_failed",
        success: false,
        error: "Invalid signature",
      };

      mockPrismaAuditLog.create.mockResolvedValue({
        id: "audit_2",
        ...entry,
        createdAt: new Date(),
      });

      // Act
      await logAudit(entry);

      // Assert
      expect(mockPrismaAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: undefined,
          actorId: undefined,
          resource: entry.resource,
          action: entry.action,
          resourceId: undefined,
          oldValue: undefined,
          newValue: undefined,
          ipAddress: undefined,
          userAgent: undefined,
          success: entry.success,
          error: entry.error,
        },
      });
    });

    it("should create audit log with oldValue and newValue", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        userId: "user_123",
        actorId: "admin_456",
        resource: "user",
        action: "user.updated",
        resourceId: "user_123",
        oldValue: { email: "old@example.com", name: "Old Name" },
        newValue: { email: "new@example.com", name: "New Name" },
        success: true,
      };

      mockPrismaAuditLog.create.mockResolvedValue({
        id: "audit_3",
        ...entry,
        createdAt: new Date(),
      });

      // Act
      await logAudit(entry);

      // Assert
      expect(mockPrismaAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: entry.userId,
          actorId: entry.actorId,
          resource: entry.resource,
          action: entry.action,
          resourceId: entry.resourceId,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          ipAddress: undefined,
          userAgent: undefined,
          success: entry.success,
          error: undefined,
        },
      });
    });

    it("should handle database errors gracefully without throwing", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        resource: "user",
        action: "user.created",
        success: true,
      };

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockPrismaAuditLog.create.mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Act & Assert - should not throw
      await expect(logAudit(entry)).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to create audit log:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should create audit log for user deletion", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        userId: "user_123",
        actorId: "admin_456",
        resource: "user",
        action: "user.deleted",
        resourceId: "user_123",
        success: true,
        ipAddress: "192.168.1.1",
      };

      mockPrismaAuditLog.create.mockResolvedValue({
        id: "audit_4",
        ...entry,
        createdAt: new Date(),
      });

      // Act
      await logAudit(entry);

      // Assert
      expect(mockPrismaAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "user.deleted",
          resource: "user",
          success: true,
        }),
      });
    });

    it("should create audit log for access denial", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        userId: "user_123",
        resource: "admin",
        action: "access.denied",
        resourceId: "/admin/users",
        success: false,
        error: "Insufficient permissions",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      };

      mockPrismaAuditLog.create.mockResolvedValue({
        id: "audit_5",
        ...entry,
        createdAt: new Date(),
      });

      // Act
      await logAudit(entry);

      // Assert
      expect(mockPrismaAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "access.denied",
          success: false,
          error: "Insufficient permissions",
        }),
      });
    });

    it("should create audit log for role grant", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        userId: "user_123",
        actorId: "admin_456",
        resource: "role",
        action: "role.granted",
        resourceId: "role_admin",
        newValue: { roleId: "role_admin", roleName: "ADMIN" },
        success: true,
      };

      mockPrismaAuditLog.create.mockResolvedValue({
        id: "audit_6",
        ...entry,
        createdAt: new Date(),
      });

      // Act
      await logAudit(entry);

      // Assert
      expect(mockPrismaAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "role.granted",
          resource: "role",
          newValue: entry.newValue,
        }),
      });
    });

    it("should create audit log for role revoke", async () => {
      // Arrange
      const entry: AuditLogEntry = {
        userId: "user_123",
        actorId: "admin_456",
        resource: "role",
        action: "role.revoked",
        resourceId: "role_admin",
        oldValue: { roleId: "role_admin", roleName: "ADMIN" },
        success: true,
      };

      mockPrismaAuditLog.create.mockResolvedValue({
        id: "audit_7",
        ...entry,
        createdAt: new Date(),
      });

      // Act
      await logAudit(entry);

      // Assert
      expect(mockPrismaAuditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrismaAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "role.revoked",
          resource: "role",
          oldValue: entry.oldValue,
        }),
      });
    });
  });

  /**
   * Test Suite: getAuditLogs function - Filtering
   * Validates: Requirements 9.3, 9.4
   */
  describe("getAuditLogs - Filtering", () => {
    it("should query audit logs with userId filter", async () => {
      // Arrange
      const filters: AuditLogFilters = {
        userId: "user_123",
      };
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      const mockLogs = [
        {
          id: "audit_1",
          userId: "user_123",
          actorId: null,
          resource: "user",
          action: "user.created",
          resourceId: "user_123",
          oldValue: null,
          newValue: null,
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          success: true,
          error: null,
          createdAt: new Date(),
          user: {
            id: "user_123",
            email: "user@example.com",
            name: "Test User",
          },
        },
      ];

      mockPrismaAuditLog.findMany.mockResolvedValue(mockLogs);
      mockPrismaAuditLog.count.mockResolvedValue(1);

      // Act
      const result = await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user_123",
        },
        skip: 0,
        take: 50,
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
      });
      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.totalPages).toBe(1);
    });

    it("should query audit logs with resource filter", async () => {
      // Arrange
      const filters: AuditLogFilters = {
        resource: "user",
      };
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            resource: "user",
          },
        }),
      );
    });

    it("should query audit logs with action filter", async () => {
      // Arrange
      const filters: AuditLogFilters = {
        action: "user.created",
      };
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            action: "user.created",
          },
        }),
      );
    });

    it("should query audit logs with date range filter (startDate only)", async () => {
      // Arrange
      const startDate = new Date("2024-01-01");
      const filters: AuditLogFilters = {
        startDate,
      };
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: startDate,
            },
          },
        }),
      );
    });

    it("should query audit logs with date range filter (endDate only)", async () => {
      // Arrange
      const endDate = new Date("2024-12-31");
      const filters: AuditLogFilters = {
        endDate,
      };
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              lte: endDate,
            },
          },
        }),
      );
    });

    it("should query audit logs with date range filter (both startDate and endDate)", async () => {
      // Arrange
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      const filters: AuditLogFilters = {
        startDate,
        endDate,
      };
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
      );
    });

    it("should query audit logs with multiple filters combined", async () => {
      // Arrange
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");
      const filters: AuditLogFilters = {
        userId: "user_123",
        resource: "user",
        action: "user.created",
        startDate,
        endDate,
      };
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: "user_123",
            resource: "user",
            action: "user.created",
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        }),
      );
    });

    it("should query audit logs with no filters", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });

  /**
   * Test Suite: getAuditLogs function - Pagination
   * Validates: Requirement 9.5
   */
  describe("getAuditLogs - Pagination", () => {
    it("should paginate audit logs correctly (page 1)", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 20,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(100);

      // Act
      const result = await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0, // (1 - 1) * 20
          take: 20,
        }),
      );
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(5); // 100 / 20
    });

    it("should paginate audit logs correctly (page 2)", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 2,
        pageSize: 20,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(100);

      // Act
      const result = await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (2 - 1) * 20
          take: 20,
        }),
      );
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(5);
    });

    it("should paginate audit logs correctly (last page)", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 5,
        pageSize: 20,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(100);

      // Act
      const result = await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 80, // (5 - 1) * 20
          take: 20,
        }),
      );
      expect(result.page).toBe(5);
      expect(result.totalPages).toBe(5);
    });

    it("should handle partial last page correctly", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 20,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(95);

      // Act
      const result = await getAuditLogs(filters, pagination);

      // Assert
      expect(result.total).toBe(95);
      expect(result.totalPages).toBe(5); // Math.ceil(95 / 20) = 5
    });

    it("should use default pagination when not provided", async () => {
      // Arrange
      const filters: AuditLogFilters = {};

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(100);

      // Act
      const result = await getAuditLogs(filters);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50, // Default pageSize
        }),
      );
      expect(result.page).toBe(1); // Default page
      expect(result.pageSize).toBe(50);
    });

    it("should handle custom page size", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 10,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(100);

      // Act
      const result = await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
      expect(result.pageSize).toBe(10);
      expect(result.totalPages).toBe(10); // 100 / 10
    });

    it("should order audit logs by createdAt descending", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            createdAt: "desc",
          },
        }),
      );
    });

    it("should include user relation in query", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      await getAuditLogs(filters, pagination);

      // Assert
      expect(mockPrismaAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
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
      );
    });

    it("should handle empty result set", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockResolvedValue(0);

      // Act
      const result = await getAuditLogs(filters, pagination);

      // Assert
      expect(result.logs).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  /**
   * Test Suite: getAuditLogs function - Error Handling
   */
  describe("getAuditLogs - Error Handling", () => {
    it("should throw error when database query fails", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockPrismaAuditLog.findMany.mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Act & Assert
      await expect(getAuditLogs(filters, pagination)).rejects.toThrow(
        "Failed to retrieve audit logs",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to query audit logs:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("should throw error when count query fails", async () => {
      // Arrange
      const filters: AuditLogFilters = {};
      const pagination: AuditLogPagination = {
        page: 1,
        pageSize: 50,
      };

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockPrismaAuditLog.findMany.mockResolvedValue([]);
      mockPrismaAuditLog.count.mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Act & Assert
      await expect(getAuditLogs(filters, pagination)).rejects.toThrow(
        "Failed to retrieve audit logs",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to query audit logs:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
