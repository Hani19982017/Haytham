import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

let rawUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable';
if (!rawUrl.includes('pgbouncer=true')) {
  rawUrl += (rawUrl.includes('?') ? '&' : '?') + 'pgbouncer=true';
}
const databaseUrl = rawUrl;

export const prisma: PrismaClient =
  global.prismaGlobal ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.prismaGlobal = prisma;
}

export async function checkDatabaseConnection(): Promise<{ connected: boolean; latencyMs: number; error?: string }> {
  const start = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1;`;
    const latencyMs = Math.round(performance.now() - start);
    return { connected: true, latencyMs };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Math.round(performance.now() - start),
      error: err.message || 'Cannot reach database server',
    };
  }
}
