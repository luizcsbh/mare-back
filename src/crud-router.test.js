import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { test } from 'node:test';
import { createCrudRouter } from './crud-router.js';
import { measurementSchema } from './validation.js';

function testServer(Model) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = 'authenticated-user'; next(); });
  app.use('/measurements', createCrudRouter(Model, measurementSchema));
  return app;
}

test('CRUD creation takes ownership from authenticated context, not request body', async () => {
  let created;
  const app = testServer({
    create: async (data) => { created = data; return data; },
  });

  const response = await request(app).post('/measurements').send({
    date: '2026-10-11', weightKg: 72, user: 'attacker-selected-user',
  });

  assert.equal(response.status, 201);
  assert.equal(created.user, 'authenticated-user');
  assert.equal(response.body.user, 'authenticated-user');
});

test('CRUD update and delete always scope database queries to the authenticated owner', async () => {
  const calls = [];
  const app = testServer({
    findOneAndUpdate: async (...args) => { calls.push(['update', ...args]); return null; },
    findOneAndDelete: async (...args) => { calls.push(['delete', ...args]); return null; },
  });

  const update = await request(app).put('/measurements/record-1').send({ notes: 'changed' });
  const deletion = await request(app).delete('/measurements/record-1');

  assert.equal(update.status, 404);
  assert.equal(deletion.status, 404);
  assert.deepEqual(calls.map(([operation, query]) => [operation, query]), [
    ['update', { _id: 'record-1', user: 'authenticated-user' }],
    ['delete', { _id: 'record-1', user: 'authenticated-user' }],
  ]);
});

test('CRUD rejects invalid inputs before calling the model', async () => {
  let called = false;
  const app = testServer({ create: async () => { called = true; } });
  const response = await request(app).post('/measurements').send({ date: 'not-a-date', weightKg: 5 });

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.match(response.body.error, /date|Data|number/i);
});

test('CRUD pagination is owner-scoped and enforces the maximum page size', async () => {
  let query;
  let offset;
  let limit;
  let countQuery;
  const app = testServer({
    find: (filter) => {
      query = filter;
      return {
        sort: () => ({
          skip: (value) => {
            offset = value;
            return { limit: (size) => { limit = size; return Promise.resolve([{ _id: 'record-3' }]); } };
          },
        }),
      };
    },
    countDocuments: async (filter) => { countQuery = filter; return 201; },
  });

  const response = await request(app).get('/measurements?page=3&limit=500');

  assert.equal(response.status, 400);
  const validResponse = await request(app).get('/measurements?page=3&limit=100');
  assert.equal(validResponse.status, 200);
  assert.deepEqual(query, { user: 'authenticated-user' });
  assert.deepEqual(countQuery, query);
  assert.equal(offset, 200);
  assert.equal(limit, 100);
  assert.deepEqual(validResponse.body, { items: [{ _id: 'record-3' }], page: 3, limit: 100, total: 201, pages: 3 });
});