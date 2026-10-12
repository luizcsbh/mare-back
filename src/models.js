import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const opts = { timestamps: true };
const owner = { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true };

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  heightCm: { type: Number, min: 100, max: 250 },
  goalWeightKg: { type: Number, min: 30, max: 300 },
}, opts));

export const RefreshSession = model('RefreshSession', new Schema({
  user: owner,
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, opts));

export const Measurement = model('Measurement', new Schema({
  user: owner,
  date: { type: Date, required: true },
  time: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  weightKg: { type: Number, required: true, min: 20, max: 500 },
  waistCm: { type: Number, min: 30, max: 300 },
  bodyFatPct: { type: Number, min: 1, max: 80 },
  muscleMassKg: { type: Number, min: 1, max: 300 },
  source: { type: String, maxlength: 80 },
  notes: { type: String, maxlength: 500 },
}, opts));

export const Workout = model('Workout', new Schema({
  user: owner,
  date: { type: Date, required: true },
  startTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  type: { type: String, required: true, trim: true, maxlength: 80 },
  minutes: { type: Number, required: true, min: 1, max: 600 },
  distanceKm: { type: Number, min: 0, max: 1000 },
  intensity: { type: Number, min: 1, max: 10 },
  notes: { type: String, maxlength: 500 },
}, opts));

const labResultSchema = new Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, maxlength: 80 },
  category: { type: String, maxlength: 80 },
  value: Number,
  resultText: { type: String, maxlength: 500 },
  unit: { type: String, maxlength: 40 },
  refMin: Number,
  refMax: Number,
  refText: { type: String, maxlength: 120 },
  method: { type: String, maxlength: 120 },
  notes: { type: String, maxlength: 500 },
});
labResultSchema.pre('validate', function () {
  if (this.value == null && !this.resultText?.trim()) this.invalidate('resultText', 'Informe um resultado numérico ou textual');
});

export const Exam = model('Exam', new Schema({
  user: owner,
  date: { type: Date, required: true },
  lab: { type: String, maxlength: 120 },
  items: [labResultSchema],
  file: { stored: String, original: String, mimetype: String },
}, opts));
