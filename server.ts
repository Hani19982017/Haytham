import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
import { Socket } from 'net';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { apiRouter } from './server/routes/api.js';
import { buildSeedNotifications } from './server/data/seedNotifications.js';
import { NotificationRepository } from './server/repositories/notificationRepository.js';
import { StudentRepository } from './server/repositories/studentRepository.js';
import { OfferingRepository } from './server/repositories/offeringRepository.js';
import { CourseRepository } from './server/repositories/courseRepository.js';
import { AcademicRuleRepository } from './server/repositories/academicRuleRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function checkPort(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new Socket();
    s.connect(port, host, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => {
      s.destroy();
      resolve(false);
    });
  });
}

const hasCustomDatabaseUrl = Boolean(process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable';
}

async function ensureDatabaseRunning(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  const isRemote = dbUrl && !dbUrl.includes('127.0.0.1') && !dbUrl.includes('localhost');
  
  if (isRemote) {
    console.log('[Database] Remote PostgreSQL DATABASE_URL detected. Connecting directly to cloud database.');
    return;
  }

  // In production (e.g. Render / Cloud), never spawn embedded PGlite subprocess to stay within 512MB RAM limit
  if (process.env.NODE_ENV === 'production') {
    if (!hasCustomDatabaseUrl) {
      console.warn('[Database] WARNING: DATABASE_URL environment variable is missing on Render. Please configure DATABASE_URL in Environment.');
    }
    console.log('[Database] Production environment detected. Skipping local embedded PGlite server.');
    return;
  }

  const isDbOpen = await checkPort(5432);
  if (!isDbOpen) {
    console.log('[Database] PostgreSQL port 5432 is not open. Launching embedded PGlite server...');
    const serverScript = path.resolve(__dirname, 'node_modules/@electric-sql/pglite-socket/dist/scripts/server.js');
    const pgliteProc = spawn('node', [serverScript, '-d', 'memory://', '-p', '5432', '-m', '50'], {
      detached: true,
      stdio: 'ignore',
    });
    pgliteProc.unref();

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkPort(5432)) {
        console.log('[Database] PostgreSQL port 5432 is now active.');
        try {
          const { execSync } = await import('child_process');
          // Pass DATABASE_URL through env (the inline `VAR=value cmd` form only works in bash, not on Windows).
          execSync('npx prisma db push --skip-generate', {
            stdio: 'ignore',
            env: { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable' },
          });
          const { seedDatabase } = await import('./prisma/seed.js');
          await seedDatabase();
          console.log('[Database] Schema pushed and database seeded successfully.');
        } catch (seedErr) {
          console.warn('[Database] Seed note:', seedErr);
        }
        return;
      }
    }
    console.warn('[Database] Could not confirm port 5432 within timeout.');
  } else {
    console.log('[Database] PostgreSQL port 5432 is active.');
  }
}

/**
 * Give every account its starting notifications in the database (built from the
 * data that is there now). Safe on every start: existing rows and their read
 * state are kept. Without a database the in-memory notifications are used.
 */
async function ensureStartingNotifications(): Promise<void> {
  try {
    const [students, offerings, courses, rules] = await Promise.all([
      StudentRepository.listAll(),
      OfferingRepository.listAll(),
      CourseRepository.listAll(),
      AcademicRuleRepository.listAll(),
    ]);
    const added = await NotificationRepository.seedDefaults(
      undefined,
      buildSeedNotifications({ students, offerings, courses, rules })
    );
    if (added) console.log(`[Notifications] Added ${added} starting notifications.`);
  } catch (err: any) {
    console.warn('[Notifications] Database not available; using in-memory notifications.', err?.message || '');
  }
}

async function startServer() {
  await ensureDatabaseRunning();
  await ensureStartingNotifications();

  const app = express();

  // Strict port resolution: Applet must run on port 3000
  let PORT = 3000;
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    PORT = parseInt(process.argv[portArgIndex + 1], 10);
  } else if (process.env.APP_PORT) {
    PORT = parseInt(process.env.APP_PORT, 10);
  } else if (process.env.PORT && process.env.PORT !== '8080') {
    PORT = parseInt(process.env.PORT, 10);
  } else {
    PORT = 3000;
  }

  const isProd = process.env.NODE_ENV === 'production';

  // Security: CORS configured for production and local development
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || !isProd) return callback(null, true);
        const configuredOrigins = process.env.CORS_ORIGIN
          ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
          : [];
        if (configuredOrigins.length === 0 || configuredOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true); // Fallback to allow preview and subdomains
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Mount API Router under both /api/v1 (RESTful standards) and /api (compatibility)
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // Health check endpoint
  app.get(['/api/health', '/api/v1/health'], (req, res) => {
    res.json({
      status: 'HEALTHY',
      service: 'Smart Academic Advisor University Core',
      version: '2.5.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  if (!isProd) {
    // Vite Dev Server middleware mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Smart Academic Advisor] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
