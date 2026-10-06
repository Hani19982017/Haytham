import { prisma } from '../db/prisma.js';
import { NotificationItem } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';

export class NotificationRepository {
  public static mapToDomain(row: any): NotificationItem {
    return {
      id: row.id,
      recipientId: row.recipientId,
      type: row.type as any,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      messageAr: row.messageAr,
      messageEn: row.messageEn,
      createdAt: row.createdAt.toISOString(),
      read: row.read,
    };
  }

  public static async listForRecipient(recipientId?: string): Promise<NotificationItem[]> {
    const where: Prisma.NotificationWhereInput = {};
    if (recipientId) {
      where.OR = [
        { recipientId },
        { recipientId: 'ALL' },
      ];
    }

    const rows = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return rows.map(r => this.mapToDomain(r));
  }

  public static async markRead(id: string): Promise<void> {
    await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  public static async createNotification(
    data: {
      recipientId: string;
      type: string;
      titleAr: string;
      titleEn: string;
      messageAr: string;
      messageEn: string;
    },
    tx?: Prisma.TransactionClient
  ): Promise<NotificationItem> {
    const client = tx || prisma;

    // Check if recipient is a valid User, or if it's an Advisor/Student ID, resolve to user ID
    let finalUserId: string | null = null;
    const directUser = await client.user.findUnique({ where: { id: data.recipientId } });
    if (directUser) {
      finalUserId = directUser.id;
    } else {
      const adv = await client.advisor.findUnique({ where: { id: data.recipientId } });
      if (adv) finalUserId = adv.userId;
      else {
        const stu = await client.student.findUnique({ where: { id: data.recipientId } });
        if (stu) finalUserId = stu.userId;
      }
    }

    const row = await client.notification.create({
      data: {
        recipientId: finalUserId || 'user_admin',
        type: data.type,
        titleAr: data.titleAr,
        titleEn: data.titleEn,
        messageAr: data.messageAr,
        messageEn: data.messageEn,
        read: false,
      },
    });

    return this.mapToDomain(row);
  }
}
