import { prisma } from '../db/prisma.js';
import { AuditLogItem, UserRole } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';

export class AuditLogRepository {
  public static mapToDomain(row: any): AuditLogItem {
    let beforeObj: any = undefined;
    let afterObj: any = undefined;
    try {
      if (row.before) beforeObj = JSON.parse(row.before);
    } catch {}
    try {
      if (row.after) afterObj = JSON.parse(row.after);
    } catch {}

    return {
      id: row.id,
      userId: row.userId || 'system',
      userName: row.userName,
      userRole: row.userRole as UserRole,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      timestamp: row.timestamp.toISOString(),
      detailsAr: row.detailsAr,
      detailsEn: row.detailsEn,
      before: beforeObj,
      after: afterObj,
    };
  }

  public static async listRecent(limit: number = 100): Promise<AuditLogItem[]> {
    const rows = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return rows.map(r => this.mapToDomain(r));
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
        userId: validUserId,
        userName: entry.userName,
        userRole: entry.userRole as any,
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
  }
}
