import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.STORAGE_DRIVER ||= 'local';
const { storage } = await import('./storage.js');

test('local storage uses a generated key and round-trips file contents', async () => {
  const buffer = Buffer.from('private test file');
  const key = await storage.save({ buffer, mimetype: 'application/pdf' });

  try {
    assert.match(key, /^[0-9a-f-]{36}$/);
    const stream = await storage.open(key);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), buffer);
  } finally {
    await storage.remove(key);
  }
});