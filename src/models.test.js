import assert from 'node:assert/strict';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { Exam } from './models.js';

test('exam results accept textual values without classifying them as numeric', async () => {
  const exam = new Exam({
    user: new mongoose.Types.ObjectId(),
    date: new Date('2026-01-10'),
    items: [{ name: 'Resultado qualitativo', resultText: 'Não reagente' }],
  });

  await assert.doesNotReject(() => exam.validate());
});

test('exam results require either a numeric or textual value', async () => {
  const exam = new Exam({
    user: new mongoose.Types.ObjectId(),
    date: new Date('2026-01-10'),
    items: [{ name: 'Resultado sem valor' }],
  });

  await assert.rejects(() => exam.validate(), { name: 'ValidationError' });
});