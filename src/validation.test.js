import assert from 'node:assert/strict';
import { test } from 'node:test';
import { examSchema, measurementSchema, parseRequest, profileSchema, workoutSchema } from './validation.js';

test('measurement schema rejects out-of-range values and accepts omitted optional fields', () => {
  assert.equal(parseRequest(measurementSchema, { date: '2026-10-11', weightKg: 70 }).error, undefined);
  assert.equal(parseRequest(measurementSchema, { date: '2026-10-11', weightKg: 10 }).error, 'Too small: expected number to be >=20');
});

test('workout schema rejects invalid times and durations', () => {
  assert.equal(parseRequest(workoutSchema, { date: '2026-10-11', type: 'Corrida', minutes: 60, startTime: '25:00' }).error, 'Invalid string: must match pattern /^([01]\\d|2[0-3]):[0-5]\\d$/');
  assert.ok(parseRequest(workoutSchema, { date: '2026-10-11', type: 'Corrida', minutes: 0 }).error);
});

test('profile and resource updates accept a valid partial payload', () => {
  assert.deepEqual(parseRequest(profileSchema, { goalWeightKg: 72 }, true).data, { goalWeightKg: 72 });
  assert.deepEqual(parseRequest(measurementSchema, { notes: null }, true).data, { notes: null });
  assert.equal(parseRequest(profileSchema, {}, true).error, 'Informe ao menos um campo');
});

test('exam schema accepts textual results and rejects inverted reference intervals', () => {
  const result = { name: 'Resultado', resultText: 'Não reagente' };
  assert.equal(parseRequest(examSchema, { date: '2026-10-11', items: [result] }).error, undefined);
  assert.ok(parseRequest(examSchema, { date: '2026-10-11', items: [{ name: 'Resultado', value: 5, refMin: 10, refMax: 2 }] }).error);
});