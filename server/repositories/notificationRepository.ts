import { prisma } from '../db/prisma.js';
import { NotificationItem } from '../../src/types/index.js';
import { Prisma } from '@prisma/client';
import { INITIAL_NOTIFICATIONS } from '../data/store.js';

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
      createdAt: row.createdAt ? (typeof row.createdAt === 'string' ? row.createdAt : row.createdAt.toISOString()) : new Date().toISOString(),
      read: row.read,
    };
  }

  public static async listForRecipient(recipientId?: string): Promise<NotificationItem[]> {
    try {
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

      if (rows) {
        return rows.map(r => this.mapToDomain(r));
      }
    } catch (err) {
      console.warn('[NotificationRepository] DB listForRecipient fallback:', err);
    }

    // Memory fallback
    if (!recipientId || recipientId === 'ALL') {
      return INITIAL_NOTIFICATIONS;
    }
    return INITIAL_NOTIFICATIONS.filter(n => n.recipientId === recipientId || n.recipientId === 'ALL' || n.recipientId === 'user_student' || n.recipientId === 'stu_omar');
  }

  public static async markRead(id: string): Promise<void> {
    try {
      await prisma.notification.update({
        where: { id },
        data: { read: true },
      });
    } catch {
      const found = INITIAL_NOTIFICATIONS.find(n => n.id === id);
      if (found) found.read = true;
    }
  }

  public static async create(
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
    return this.createNotification(data, tx);
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
    try {
      const client = tx || prisma;

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
          recipientId: finalUserId || data.recipientId || 'user_admin',
          type: data.type,
          titleAr: data.titleAr,
          titleEn: data.titleEn,
          messageAr: data.messageAr,
          messageEn: data.messageEn,
          read: false,
        },
      });

      return this.mapToDomain(row);
    } catch (err) {
      console.warn('[NotificationRepository] DB createNotification fallback:', err);
      const newNotif: NotificationItem = {
        id: `notif_${Date.now()}`,
        recipientId: data.recipientId,
        type: data.type as any,
        titleAr: data.titleAr,
        titleEn: data.titleEn,
        messageAr: data.messageAr,
        messageEn: data.messageEn,
        createdAt: new Date().toISOString(),
        read: false,
      };
      INITIAL_NOTIFICATIONS.unshift(newNotif);
      return newNotif;
    }
  }
}
