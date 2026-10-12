import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { timingSafeEqual } from 'crypto';
import mongoose from 'mongoose';
import routes from './routes.js';
import { logger } from './logger.js';

const app = express();
const configuredOrigins = process.env.CLIENT_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean) || [];
if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  throw new Error('CLIENT_ORIGIN deve conter a origem HTTPS do frontend em produção');
}
const isHttpsOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.origin === origin;
  } catch {
    return false;
  }
};
if (process.env.NODE_ENV === 'production' && configuredOrigins.some((origin) => !isHttpsOrigin(origin))) {
  throw new Error('CLIENT_ORIGIN deve conter somente origens HTTPS válidas, sem caminhos');
}
const allowedOrigins = configuredOrigins.length ? configuredOrigins : ['http://localhost:5173'];
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use((req, res, next) => {
  const isApiRequest = req.path === '/api' || req.path.startsWith('/api/');
  const origin = req.headers.origin;
  if (isApiRequest && ((process.env.NODE_ENV === 'production' && !origin) || (origin && !allowedOrigins.includes(origin)))) {
    return res.status(403).json({ error: 'Origem não autorizada' });
  }
  next();
});
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookieToken = req.cookies?.csrf;
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken) return res.status(403).json({ error: 'Token CSRF ausente' });
  const cookieBytes = Buffer.from(cookieToken);
  const headerBytes = Buffer.from(headerToken);
  if (cookieBytes.length !== headerBytes.length || !timingSafeEqual(cookieBytes, headerBytes)) {
    return res.status(403).json({ error: 'Token CSRF inválido' });
  }
  next();
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1 && Boolean(process.env.JWT_SECRET);
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/exams', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api', routes);

app.use((err, _req, res, _next) => {
  const bad = ['ValidationError', 'CastError'].includes(err.name) || ['LIMIT_FILE_SIZE', 'INVALID_FILE_TYPE'].includes(err.code);
  if (!bad) logger.error({ errorName: err.name, errorCode: err.code }, 'Request failed');
  res.status(bad ? 400 : err.status || 500).json({ error: bad ? err.message : 'Erro interno do servidor' });
});

const port = process.env.PORT || 3001;
app.listen(port, () => logger.info({ port }, 'API listening'));
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI).catch(() => logger.error('MongoDB indisponível; API não está pronta'));
} else {
  logger.error('MONGODB_URI não configurada; API não está pronta');
}
