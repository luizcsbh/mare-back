import { Router } from 'express';
import { paginationSchema, parseRequest } from './validation.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

export function createCrudRouter(Model, schema) {
  const router = Router();

  router.get('/', wrap(async (req, res) => {
    const pagination = paginationSchema.safeParse(req.query);
    if (!pagination.success) return res.status(400).json({ error: 'Parâmetros de paginação inválidos' });
    const { page, limit } = pagination.data;
    const query = { user: req.userId };
    const [items, total] = await Promise.all([
      Model.find(query).sort({ date: 1 }).skip((page - 1) * limit).limit(limit),
      Model.countDocuments(query),
    ]);
    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  }));

  router.post('/', wrap(async (req, res) => {
    const parsed = parseRequest(schema, req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    res.status(201).json(await Model.create({ ...parsed.data, user: req.userId }));
  }));

  router.put('/:id', wrap(async (req, res) => {
    const parsed = parseRequest(schema, req.body, true);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const record = await Model.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      parsed.data,
      { new: true, runValidators: true },
    );
    return record ? res.json(record) : res.status(404).json({ error: 'Registro não encontrado' });
  }));

  router.delete('/:id', wrap(async (req, res) => {
    const record = await Model.findOneAndDelete({ _id: req.params.id, user: req.userId });
    return record ? res.status(204).end() : res.status(404).json({ error: 'Registro não encontrado' });
  }));

  return router;
}