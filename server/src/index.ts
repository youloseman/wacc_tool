import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the monorepo root regardless of cwd.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { apiRouter } = await import('./routes/index.ts');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1); // Railway/Nixpacks sits behind a proxy → trust X-Forwarded-For.

// Security headers. CSP disabled — React inline bootstrap and Recharts inline styles need `unsafe-inline`.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(compression());
app.use(express.json({ limit: '1mb' }));

// CORS only needed in dev (Vite on 5173 → API on 3001). In production they share origin.
if (!IS_PROD) app.use(cors());

// Per-IP rate limit on /api. 100 requests / 15 min is generous for this app.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in a few minutes.' },
});
app.use('/api', apiLimiter, apiRouter);

// Production: serve the built React app from server/src/public/ and fall back to index.html for SPA routes.
if (IS_PROD) {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Global error handler. Keep internal messages out of production responses.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: IS_PROD ? 'Something went wrong. Please try again.' : err.message,
  });
});

app.listen(PORT, () => {
  const ok = (x: unknown) => (x ? '✓ configured' : '✗ missing');
  console.log(`
+-------------------------------------------+
|  WACC Calculator Server                   |
|  Port:        ${String(PORT).padEnd(28)}|
|  Environment: ${(process.env.NODE_ENV || 'development').padEnd(28)}|
|  FRED API:    ${ok(process.env.FRED_API_KEY).padEnd(28)}|
|  FMP API:     ${ok(process.env.FMP_API_KEY).padEnd(28)}|
+-------------------------------------------+
`);
});
