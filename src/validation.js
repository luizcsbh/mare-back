import { z } from 'zod';

const date = z.string().date();
const optionalNumber = (min, max) => z.number().min(min).max(max).nullable().optional();
const optionalText = (max) => z.string().trim().max(max).nullable().optional();

export const measurementSchema = z.object({
  date,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  weightKg: z.number().min(20).max(500),
  waistCm: optionalNumber(30, 300),
  bodyFatPct: optionalNumber(1, 80),
  muscleMassKg: optionalNumber(1, 300),
  source: optionalText(80),
  notes: optionalText(500),
});

export const workoutSchema = z.object({
  date,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  type: z.string().trim().min(1).max(80),
  minutes: z.number().int().min(1).max(600),
  distanceKm: optionalNumber(0, 1000),
  intensity: optionalNumber(1, 10),
  notes: optionalText(500),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  heightCm: optionalNumber(100, 250),
  goalWeightKg: optionalNumber(30, 300),
});

export const examItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: optionalText(80),
  category: optionalText(80),
  value: z.number().finite().nullable().optional(),
  resultText: optionalText(500),
  unit: optionalText(40),
  refMin: optionalNumber(-1_000_000_000, 1_000_000_000),
  refMax: optionalNumber(-1_000_000_000, 1_000_000_000),
  refText: optionalText(120),
  method: optionalText(120),
  notes: optionalText(500),
}).refine((item) => item.value != null || Boolean(item.resultText?.trim()), 'Informe um resultado numérico ou textual')
  .refine((item) => item.refMin == null || item.refMax == null || item.refMin <= item.refMax, 'A referência mínima deve ser menor ou igual à máxima');

export const examSchema = z.object({
  date,
  lab: optionalText(120),
  items: z.array(examItemSchema).min(1).max(200),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function parseRequest(schema, input, partial = false) {
  const target = partial ? schema.partial() : schema;
  const parsed = target.safeParse(input);
  if (parsed.success) {
    if (partial && Object.keys(parsed.data).length === 0) return { error: 'Informe ao menos um campo' };
    return { data: parsed.data };
  }
  return { error: parsed.error.issues[0]?.message || 'Dados inválidos' };
}