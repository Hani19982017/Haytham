import { spawn } from 'child_process';
import { createRequire } from 'module';
import { prisma } from './prisma.js';
import { INITIAL_ACADEMIC_RULES } from '../data/store.js';

const require = createRequire(import.meta.url);

/** How long creating the tables may take before we give up and stay on in-memory data. */
const PUSH_TIMEOUT_MS = 120_000;

const seconds = (since: number) => `${((Date.now() - since) / 1000).toFixed(1)} s`;

/**
 * Create any missing tables and columns from prisma/schema.prisma. Does nothing
 * when the database already matches, and refuses changes that would delete data.
 *
 * Runs the Prisma CLI as its own process with a time limit (no shell, no npx,
 * no update check), so it can never hold up the server.
 */
export function pushSchema(timeoutMs = PUSH_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    let cli: string;
    try {
      cli = require.resolve('prisma/build/index.js');
    } catch (err) {
      reject(err);
      return;
    }
    const child = spawn(process.execPath, [cli, 'db', 'push', '--skip-generate'], {
      env: { ...process.env, CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(Object.assign(new Error(`prisma db push did not finish within ${Math.round(timeoutMs / 1000)} s`), { stderr: output }));
    }, timeoutMs);
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`prisma db push exited with code ${code}`), { stderr: output }));
    });
  });
}

/**
 * Get a PostgreSQL database ready for the app: create the tables, and load the
 * demo data the first time (when it is empty) or when an earlier load was cut
 * off. Loading only adds missing rows, so data in use is never overwritten.
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
  const started = Date.now();
  console.log('[Database] Creating or updating the tables…');
  try {
    await (options.push ?? (() => pushSchema()))();
    console.log(`[Database] Tables are in place (${seconds(started)}).`);
  } catch (err: any) {
    const detail = String(err?.stderr || err?.stdout || err?.message || err)
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(-4)
      .join(' | ');
    console.warn(`[Database] Could not create or update the tables, so the app is using its in-memory demo data. ${err?.message || ''} ${detail}`);
    return false;
  }

  try {
    const [users, courses, rules] = await Promise.all([prisma.user.count(), prisma.course.count(), prisma.academicRule.count()]);
    const empty = users === 0 && courses === 0;
    // The seed writes the bylaw rules last and the app cannot delete them, so fewer
    // rules than the demo data has mean an earlier load stopped part-way (e.g. a host
    // restarted the server) or the database was loaded by an older version of the app.
    const unfinished = !empty && rules < INITIAL_ACADEMIC_RULES.length;
    if (empty || unfinished) {
      const seedStarted = Date.now();
      console.log(
        empty
          ? '[Database] New, empty database: loading the demo data…'
          : '[Database] The demo data is incomplete or from an older version: adding what is missing…'
      );
      const seed = options.seed ?? (async () => (await import('../../prisma/seed.js')).seedDatabase());
      await seed();
      console.log(`[Database] Demo data loaded (${seconds(seedStarted)}).`);
    }
    return true;
  } catch (err: any) {
    console.warn('[Database] Could not load the demo data:', err?.message || err);
    return false;
  }
}
