import { prisma } from '../db/prisma.js';
import { NotificationItem } from '../../src/types/index.js';
import { Prisma, PrismaClient } from '@prisma/client';
import { INITIAL_NOTIFICATIONS } from '../data/store.js';

/** The signed-in user, as resolved from the request (see getCaller in routes/api.ts). */
export interface NotificationCaller {
  id: string;
  email?: string;
  studentId?: string;
  advisorId?: string;
  instructorId?: string;
}

const LIST_LIMIT = 50;
const newestFirst = (a: NotificationItem, b: NotificationItem) => b.createdAt.localeCompare(a.createdAt);

/**
 * Notifications are personal: every read and update is scoped to the ids that
 * belong to the signed-in user. PostgreSQL is used when it is reachable; the
 * in-memory store (seeded from the same data) is the fallback.
 */
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

  /**
   * Every id a notification for this user can be addressed to: the user id and
   * the linked student / advisor / instructor ids. In the database notifications
   * are stored against the User row; in memory they keep the id they were sent to.
   */
  public static async recipientKeys(caller: NotificationCaller): Promise<string[]> {
    const keys = new Set<string>();
    for (const key of [caller.id, caller.studentId, caller.advisorId, caller.instructorId]) {
      if (key) keys.add(key);
    }
    try {
      const user = await prisma.user.findFirst({
        where: { OR: [{ id: caller.id }, ...(caller.email ? [{ email: caller.email }] : [])] },
        include: {
          student: { select: { id: true } },
          advisor: { select: { id: true } },
          instructor: { select: { id: true } },
        },
      });
      if (user) {
        keys.add(user.id);
        if (user.student) keys.add(user.student.id);
        if (user.advisor) keys.add(user.advisor.id);
        if (user.instructor) keys.add(user.instructor.id);
      }
    } catch {
      // Database unavailable: the ids carried by the session are enough for the in-memory store.
    }
    return [...keys];
  }

  /** The signed-in user's notifications, newest first. */
  public static async listFor(caller: NotificationCaller): Promise<NotificationItem[]> {
    const keys = await this.recipientKeys(caller);
    try {
      const rows = await prisma.notification.findMany({
        where: { recipientId: { in: keys } },
        orderBy: { createdAt: 'desc' },
        take: LIST_LIMIT,
      });
      return rows.map(r => this.mapToDomain(r));
    } catch (err: any) {
      console.warn('[NotificationRepository] DB list fallback:', err?.message || err);
    }
    return INITIAL_NOTIFICATIONS.filter(n => keys.includes(n.recipientId)).sort(newestFirst).slice(0, LIST_LIMIT);
  }

  /** Mark one of the caller's notifications as read. Returns false if it is not theirs. */
  public static async markRead(id: string, caller: NotificationCaller): Promise<boolean> {
    const keys = await this.recipientKeys(caller);
    try {
      const res = await prisma.notification.updateMany({
        where: { id, recipientId: { in: keys } },
        data: { read: true },
      });
      return res.count > 0;
    } catch {
      const found = INITIAL_NOTIFICATIONS.find(n => n.id === id && keys.includes(n.recipientId));
      if (found) found.read = true;
      return Boolean(found);
    }
  }

  /** Mark all of the caller's notifications as read. Returns how many changed. */
  public static async markAllRead(caller: NotificationCaller): Promise<number> {
    const keys = await this.recipientKeys(caller);
    try {
      const res = await prisma.notification.updateMany({
        where: { recipientId: { in: keys }, read: false },
        data: { read: true },
      });
      return res.count;
    } catch {
      let changed = 0;
      for (const n of INITIAL_NOTIFICATIONS) {
        if (!n.read && keys.includes(n.recipientId)) {
          n.read = true;
          changed += 1;
        }
      }
      return changed;
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

  /**
   * Send a notification. `recipientId` may be a user, student, advisor or
   * instructor id; in the database it is stored against the matching User row.
   */
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
      const userId = await this.resolveUserId(client, data.recipientId);
      if (!userId) throw new Error(`No user found for notification recipient "${data.recipientId}"`);

      const row = await client.notification.create({
        data: {
          recipientId: userId,
          type: data.type,
          titleAr: data.titleAr,
          titleEn: data.titleEn,
          messageAr: data.messageAr,
          messageEn: data.messageEn,
          read: false,
        },
      });

      return this.mapToDomain(row);
    } catch (err: any) {
      console.warn('[NotificationRepository] DB createNotification fallback:', err?.message || err);
      const newNotif: NotificationItem = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

  /**
   * Send a notification only once per event: `id` identifies the event (e.g. a
   * student reaching their absence limit in a course). Returns null if it was
   * already sent.
   */
  public static async createOnce(
    id: string,
    data: { recipientId: string; type: string; titleAr: string; titleEn: string; messageAr: string; messageEn: string }
  ): Promise<NotificationItem | null> {
    try {
      if (await prisma.notification.findUnique({ where: { id }, select: { id: true } })) return null;
      const userId = await this.resolveUserId(prisma, data.recipientId);
      if (!userId) throw new Error(`No user found for notification recipient "${data.recipientId}"`);
      const row = await prisma.notification.create({
        data: { id, recipientId: userId, type: data.type, titleAr: data.titleAr, titleEn: data.titleEn, messageAr: data.messageAr, messageEn: data.messageEn, read: false },
      });
      return this.mapToDomain(row);
    } catch (err: any) {
      if (err?.code === 'P2002') return null; // sent meanwhile
      if (INITIAL_NOTIFICATIONS.some(n => n.id === id)) return null;
      const item: NotificationItem = { id, ...data, type: data.type as any, createdAt: new Date().toISOString(), read: false };
      INITIAL_NOTIFICATIONS.unshift(item);
      return item;
    }
  }

  private static async resolveUserId(client: Prisma.TransactionClient | PrismaClient, recipientId: string): Promise<string | null> {
    if (!recipientId) return null;
    const user = await client.user.findUnique({ where: { id: recipientId }, select: { id: true } });
    if (user) return user.id;
    const student = await client.student.findFirst({
      where: { OR: [{ id: recipientId }, { studentCode: recipientId }] },
      select: { userId: true },
    });
    if (student) return student.userId;
    const advisor = await client.advisor.findUnique({ where: { id: recipientId }, select: { userId: true } });
    if (advisor) return advisor.userId;
    const instructor = await client.instructor.findUnique({ where: { id: recipientId }, select: { userId: true } });
    return instructor?.userId ?? null;
  }

  /**
   * Insert the starting notifications (built from the academic data) into the
   * database, each addressed to its User row. Existing rows are left alone, so
   * re-seeding keeps what users have already read.
   */
  public static async seedDefaults(client: PrismaClient = prisma, items: NotificationItem[] = INITIAL_NOTIFICATIONS): Promise<number> {
    const users = await client.user.findMany({ select: { id: true } });
    const students = await client.student.findMany({ select: { id: true, userId: true } });
    const advisors = await client.advisor.findMany({ select: { id: true, userId: true } });
    const instructors = await client.instructor.findMany({ select: { id: true, userId: true } });

    const userIds = new Set(users.map(u => u.id));
    const ownerOf = new Map<string, string>([...students, ...advisors, ...instructors].map(x => [x.id, x.userId]));

    const data = items.flatMap(n => {
      const userId = userIds.has(n.recipientId) ? n.recipientId : ownerOf.get(n.recipientId);
      if (!userId) return [];
      return [
        {
          id: n.id,
          recipientId: userId,
          type: n.type,
          titleAr: n.titleAr,
          titleEn: n.titleEn,
          messageAr: n.messageAr,
          messageEn: n.messageEn,
          read: n.read,
          createdAt: new Date(n.createdAt),
        },
      ];
    });

    if (!data.length) return 0;
    const res = await client.notification.createMany({ data, skipDuplicates: true });
    return res.count;
  }
}
