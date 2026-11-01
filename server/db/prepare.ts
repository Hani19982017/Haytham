import { execSync } from 'child_process';
import { prisma } from './prisma.js';

/**
 * Create any missing tables and columns from prisma/schema.prisma. Does nothing
 * when the database already matches, and refuses changes that would delete data.
 */
export function pushSchema(): void {
  execSync('npx prisma db push --skip-generate', {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    timeout: 180_000,
  });
}

/**
 * Get a PostgreSQL database ready for the app: create the tables, and load the
 * demo data the first time (when it is empty).
 *
 * A new database (Render, Docker, or PostgreSQL installed on the computer) has
 * no tables; without this step every query fails and the app quietly runs on
 * its in-memory copy of the demo data, so nothing is saved.
 *
 * Returns false when the database cannot be used.
 */
export async function prepareDatabase(
  options: { push?: () => void | Promise<void>; seed?: () => Promise<void> } = {}
): Promise<boolean> {
  try {
    await (options.push ?? pushSchema)();
    console.log('[Database] Tables are in place.');
  } catch (err: any) {
    const detail = String(err?.stderr || err?.stdout || err?.message || err)
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(-4)
      .join(' | ');
    console.warn(`[Database] Could not create or update the tables, so the app is using its in-memory demo data. ${detail}`);
    return false;
  }

  try {
    const [users, courses] = await Promise.all([prisma.user.count(), prisma.course.count()]);
    if (users === 0 && courses === 0) {
      console.log('[Database] New, empty database: loading the demo data…');
      const seed = options.seed ?? (async () => (await import('../../prisma/seed.js')).seedDatabase());
      await seed();
      console.log('[Database] Demo data loaded.');
    }
    return true;
  } catch (err: any) {
    console.warn('[Database] Could not load the demo data:', err?.message || err);
    return false;
  }
}
