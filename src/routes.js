import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import path from 'path';
import { User, RefreshSession, Measurement, Workout, Exam } from './models.js';
import { storage } from './storage.js';
import { examSchema, measurementSchema, paginationSchema, parseRequest, profileSchema, workoutSchema } from './validation.js';
import { createCrudRouter } from './crud-router.js';

const FILE_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, f, cb) => {
    const extension = path.extname(f.originalname).toLowerCase();
    if (!FILE_TYPES[f.mimetype]?.includes(extension)) {
      const error = Object.assign(new Error('Formato de arquivo não permitido'), { status: 400, code: 'INVALID_FILE_TYPE' });
      return cb(error);
    }
    cb(null, true);
  },
});

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const verifyUploadedFile = wrap(async (req, res, next) => {
  if (!req.file) return next();
  let detected;
  try { detected = await fileTypeFromBuffer(req.file.buffer); } catch { detected = undefined; }
  const extension = path.extname(req.file.originalname).toLowerCase();
  if (!detected || detected.mime !== req.file.mimetype || !FILE_TYPES[detected.mime]?.includes(extension)) {
    return res.status(400).json({ error: 'O conteúdo do arquivo não corresponde a um formato permitido' });
  }
  next();
});
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const sign = (u) => jwt.sign({ sub: u.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
const dummyPasswordHash = bcrypt.hashSync('invalid-login-placeholder', 12);
const cookieSameSite = process.env.COOKIE_SAME_SITE || 'lax';
const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || cookieSameSite === 'none',
  sameSite: cookieSameSite,
};
const sessionCookie = {
  ...cookieBase,
  path: '/api',
  maxAge: 15 * 60 * 1000,
};
const refreshCookie = { ...cookieBase, path: '/api/auth', maxAge: 7 * 24 * 60 * 60 * 1000 };
const csrfCookie = { ...cookieBase, httpOnly: false, path: '/api', maxAge: 7 * 24 * 60 * 60 * 1000 };
const hashRefreshToken = (token) => createHash('sha256').update(token).digest('hex');
const newRefreshToken = () => randomBytes(48).toString('base64url');
const setSessionCookies = (res, user, refreshToken) => {
  res.cookie('session', sign(user), sessionCookie);
  res.cookie('refresh', refreshToken, refreshCookie);
};
const createRefreshSession = async (user) => {
  const token = newRefreshToken();
  await RefreshSession.create({ user: user._id, tokenHash: hashRefreshToken(token), expiresAt: new Date(Date.now() + refreshCookie.maxAge) });
  return token;
};
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, heightCm: u.heightCm, goalWeightKg: u.goalWeightKg });
const notFound = (res) => res.status(404).json({ error: 'Registro não encontrado' });
const credentialsSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(128) });

const router = Router();

// ---------- Autenticação ----------
router.get('/auth/csrf', (_req, res) => {
  const token = randomBytes(32).toString('base64url');
  res.cookie('csrf', token, csrfCookie);
  res.json({ token });
});

router.post('/auth/register', wrap(async (req, res) => {
  const parsed = credentialsSchema.extend({ name: z.string().trim().min(1).max(100) }).safeParse(req.body);
  const registrationError = 'Não foi possível criar a conta. Verifique os dados informados.';
  if (!parsed.success) return res.status(400).json({ error: registrationError });
  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email })) return res.status(400).json({ error: registrationError });
  let user;
  try {
    user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: registrationError });
    throw error;
  }
  setSessionCookies(res, user, await createRefreshSession(user));
  res.status(201).json({ user: pub(user) });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Informe e-mail e senha válidos' });
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash || dummyPasswordHash);
  if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  setSessionCookies(res, user, await createRefreshSession(user));
  res.json({ user: pub(user) });
}));

router.post('/auth/refresh', wrap(async (req, res) => {
  if (!req.cookies?.refresh) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  const nextToken = newRefreshToken();
  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash: hashRefreshToken(req.cookies.refresh), expiresAt: { $gt: new Date() } },
    { tokenHash: hashRefreshToken(nextToken), expiresAt: new Date(Date.now() + refreshCookie.maxAge) },
    { new: true },
  );
  if (!session) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  const user = await User.findById(session.user);
  if (!user) {
    await RefreshSession.deleteOne({ _id: session._id });
    return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
  setSessionCookies(res, user, nextToken);
  res.json({ user: pub(user) });
}));

router.post('/auth/logout', wrap(async (req, res) => {
  if (req.cookies?.refresh) await RefreshSession.deleteOne({ tokenHash: hashRefreshToken(req.cookies.refresh) });
  res.clearCookie('session', { ...cookieBase, path: '/api' });
  res.clearCookie('refresh', { ...cookieBase, path: '/api/auth' });
  res.status(204).end();
}));

router.use((req, res, next) => {
  try {
    req.userId = jwt.verify(req.cookies?.session, process.env.JWT_SECRET).sub;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  }
});
router.use(wrap(async (req, res, next) => {
  if (!await User.exists({ _id: req.userId })) return res.status(401).json({ error: 'Sessão inválida' });
  next();
}));

router.get('/me', wrap(async (req, res) => {
  const u = await User.findById(req.userId);
  u ? res.json(pub(u)) : res.status(401).json({ error: 'Sessão inválida' });
}));
router.put('/me', wrap(async (req, res) => {
  const parsed = parseRequest(profileSchema, pick(req.body, ['name', 'heightCm', 'goalWeightKg']));
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const u = await User.findByIdAndUpdate(req.userId, parsed.data, { new: true, runValidators: true });
  res.json(pub(u));
}));
router.get('/me/export', wrap(async (req, res) => {
  const [user, measurements, workouts, ownedExams] = await Promise.all([
    User.findById(req.userId).select('name email heightCm goalWeightKg createdAt'),
    Measurement.find({ user: req.userId }).sort({ date: 1 }),
    Workout.find({ user: req.userId }).sort({ date: 1 }),
    Exam.find({ user: req.userId }).sort({ date: 1 }),
  ]);
  res.json({
    exportedAt: new Date().toISOString(),
    profile: user,
    measurements,
    workouts,
    exams: ownedExams.map((exam) => ({
      ...exam.toObject(),
      file: exam.file ? { original: exam.file.original, mimetype: exam.file.mimetype } : undefined,
    })),
  });
}));
router.delete('/me', wrap(async (req, res) => {
  const ownedExams = await Exam.find({ user: req.userId }).select('file.stored');
  await Promise.all([
    Measurement.deleteMany({ user: req.userId }),
    Workout.deleteMany({ user: req.userId }),
    Exam.deleteMany({ user: req.userId }),
    RefreshSession.deleteMany({ user: req.userId }),
  ]);
  await User.deleteOne({ _id: req.userId });
  await Promise.allSettled(ownedExams.filter((exam) => exam.file?.stored).map((exam) => storage.remove(exam.file.stored)));
  res.clearCookie('session', { ...cookieBase, path: '/api' });
  res.clearCookie('refresh', { ...cookieBase, path: '/api/auth' });
  res.clearCookie('csrf', { ...cookieBase, httpOnly: false, path: '/api' });
  res.status(204).end();
}));

// ---------- CRUD genérico (pesos e treinos) ----------
router.use('/measurements', createCrudRouter(Measurement, measurementSchema));
router.use('/workouts', createCrudRouter(Workout, workoutSchema));

// ---------- Exames (itens + arquivo opcional) ----------
const exams = Router();
exams.get('/', wrap(async (req, res) => {
  const pagination = paginationSchema.safeParse(req.query);
  if (!pagination.success) return res.status(400).json({ error: 'Parâmetros de paginação inválidos' });
  const { page, limit } = pagination.data;
  const query = { user: req.userId };
  const [items, total] = await Promise.all([
    Exam.find(query).sort({ date: 1 }).skip((page - 1) * limit).limit(limit),
    Exam.countDocuments(query),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

exams.post('/', upload.single('file'), verifyUploadedFile, wrap(async (req, res) => {
  let items;
  try { items = JSON.parse(req.body.items || '[]'); } catch { return res.status(400).json({ error: 'Itens do exame inválidos' }); }
  const parsed = parseRequest(examSchema, { date: req.body.date, lab: req.body.lab, items });
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const stored = req.file ? await storage.save(req.file) : undefined;
  const file = req.file && { stored, original: path.basename(req.file.originalname), mimetype: req.file.mimetype };
  try {
    res.status(201).json(await Exam.create({ user: req.userId, ...parsed.data, file }));
  } catch (error) {
    if (stored) await storage.remove(stored).catch(() => {});
    throw error;
  }
}));

exams.put('/:id', upload.single('file'), verifyUploadedFile, wrap(async (req, res) => {
  const existing = await Exam.findOne({ _id: req.params.id, user: req.userId });
  if (!existing) return notFound(res);

  let items;
  if (req.body.items !== undefined) {
    try { items = JSON.parse(req.body.items || '[]'); } catch { return res.status(400).json({ error: 'Itens do exame inválidos' }); }
  }

  const parsed = parseRequest(examSchema, { date: req.body.date, lab: req.body.lab, items }, true);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const update = parsed.data;
  let stored;
  if (req.file) {
    stored = await storage.save(req.file);
    update.file = { stored, original: path.basename(req.file.originalname), mimetype: req.file.mimetype };
  }

  try {
    const updated = await Exam.findOneAndUpdate({ _id: req.params.id, user: req.userId }, update, { new: true, runValidators: true });
    if (!updated) {
      if (stored) await storage.remove(stored).catch(() => {});
      return notFound(res);
    }
    if (stored && existing.file?.stored) storage.remove(existing.file.stored).catch(() => {});
    res.json(updated);
  } catch (error) {
    if (stored) await storage.remove(stored).catch(() => {});
    throw error;
  }
}));

exams.get('/:id/file', wrap(async (req, res, next) => {
  const e = await Exam.findOne({ _id: req.params.id, user: req.userId });
  if (!e?.file?.stored) return notFound(res);
  const file = await storage.open(e.file.stored);
  res.type(e.file.mimetype);
  file.on('error', () => {
    if (!res.headersSent) next(new Error('Falha ao ler arquivo armazenado'));
    else res.destroy();
  });
  file.pipe(res);
}));

exams.delete('/:id', wrap(async (req, res) => {
  const e = await Exam.findOneAndDelete({ _id: req.params.id, user: req.userId });
  if (!e) return notFound(res);
  if (e.file?.stored) await storage.remove(e.file.stored).catch(() => {});
  res.status(204).end();
}));
router.use('/exams', exams);

export default router;
