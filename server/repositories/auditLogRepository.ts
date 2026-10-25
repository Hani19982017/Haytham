import { prisma } from '../db/prisma.js';
import { AuditLogItem, UserRole } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';
import { INITIAL_AUDIT_LOGS } from '../data/store.js';

export class AuditLogRepository {
  public static mapToDomain(row: any): AuditLogItem {
    let beforeObj: any = undefined;
    let afterObj: any = undefined;
    try {
      if (row.before) beforeObj = typeof row.before === 'string' ? JSON.parse(row.before) : row.before;
    } catch {}
    try {
      if (row.after) afterObj = typeof row.after === 'string' ? JSON.parse(row.after) : row.after;
    } catch {}

    return {
      id: row.id,
      userId: row.userId || 'system',
      userName: row.userName,
      userRole: row.userRole as UserRole,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      timestamp: row.timestamp ? (typeof row.timestamp === 'string' ? row.timestamp : row.timestamp.toISOString()) : new Date().toISOString(),
      detailsAr: row.detailsAr,
      detailsEn: row.detailsEn,
      before: beforeObj,
      after: afterObj,
    };
  }

  public static async listRecent(limit: number = 100): Promise<AuditLogItem[]> {
    try {
      const rows = await prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      if (rows && rows.length > 0) {
        return rows.map(r => this.mapToDomain(r));
      }
    } catch (err) {
      console.warn('[AuditLogRepository] DB listRecent fallback:', err);
    }
    return INITIAL_AUDIT_LOGS.slice(0, limit);
  }

  public static async getAll(): Promise<AuditLogItem[]> {
    return this.listRecent(500);
  }

  public static async createLog(
    entry: {
      userId?: string;
      userName: string;
      userRole: UserRole;
      action: string;
      entity: string;
      entityId: string;
      detailsAr: string;
      detailsEn: string;
      before?: any;
      after?: any;
    },
    tx?: Prisma.TransactionClient
  ): Promise<AuditLogItem> {
    try {
      const client = tx || prisma;
      let validUserId: string | null = null;
      if (entry.userId) {
        try {
          const u = await client.user.findUnique({ where: { id: entry.userId } });
          if (u) validUserId = u.id;
        } catch {}
      }

      const row = await client.auditLog.create({
        data: {
          userId: validUserId || undefined,
          userName: entry.userName,
          userRole: entry.userRole,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          detailsAr: entry.detailsAr,
          detailsEn: entry.detailsEn,
          before: entry.before ? JSON.stringify(entry.before) : null,
          after: entry.after ? JSON.stringify(entry.after) : null,
        },
      });

      return this.mapToDomain(row);
    } catch (err) {
      console.warn('[AuditLogRepository] DB createLog fallback:', err);
      const newLog: AuditLogItem = {
        id: `log_${Date.now()}`,
        userId: entry.userId || 'system',
        userName: entry.userName,
        userRole: entry.userRole,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        timestamp: new Date().toISOString(),
        detailsAr: entry.detailsAr,
        detailsEn: entry.detailsEn,
        before: entry.before,
        after: entry.after,
      };
      INITIAL_AUDIT_LOGS.unshift(newLog);
      return newLog;
    }
  }
}
