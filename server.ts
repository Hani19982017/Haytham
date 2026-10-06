import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
import { Socket } from 'net';
import { apiRouter } from './server/routes/api.js';

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

async function ensureDatabaseRunning(): Promise<void> {
  const isDbOpen = await checkPort(5432);
  if (!isDbOpen) {
    console.log('[Database] PostgreSQL port 5432 is not open. Launching embedded PGlite server...');
    const serverScript = path.resolve(__dirname, 'node_modules/.bin/pglite-server');
    const pgliteProc = spawn('node', [serverScript, '-d', './postgres_data', '-p', '5432', '-m', '50'], {
      detached: true,
      stdio: 'ignore',
    });
    pgliteProc.unref();

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (await checkPort(5432)) {
        console.log('[Database] PostgreSQL port 5432 is now active.');
        return;
      }
    }
    console.warn('[Database] Could not confirm port 5432 within timeout.');
  } else {
    console.log('[Database] PostgreSQL port 5432 is active.');
  }
}

async function startServer() {
  await ensureDatabaseRunning();

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

  app.use(express.json({ limit: '10mb' }));

  // Mount API Router
  app.use('/api', apiRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
