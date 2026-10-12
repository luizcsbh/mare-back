import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const uploadDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
const driver = process.env.STORAGE_DRIVER || (process.env.NODE_ENV === 'production' ? 's3' : 'local');
const bucket = process.env.S3_BUCKET;

if (!['local', 's3'].includes(driver)) throw new Error('STORAGE_DRIVER deve ser local ou s3');
if (process.env.NODE_ENV === 'production' && driver !== 's3') throw new Error('Armazenamento local não é permitido em produção');
if (driver === 's3' && !bucket) throw new Error('S3_BUCKET é obrigatório para armazenamento S3');
if (driver === 'local') await mkdir(uploadDirectory, { recursive: true });

const client = driver === 's3' ? new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
}) : null;

function localPath(key) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(key)) throw new Error('Identificador de arquivo inválido');
  return path.join(uploadDirectory, key);
}

export const storage = {
  async save(file) {
    const key = randomUUID();
    if (driver === 'local') await writeFile(localPath(key), file.buffer, { flag: 'wx', mode: 0o600 });
    else await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    return key;
  },
  async open(key) {
    if (driver === 'local') return createReadStream(localPath(key));
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error('Arquivo não encontrado no armazenamento');
    return result.Body;
  },
  async remove(key) {
    if (driver === 'local') await rm(localPath(key), { force: true });
    else await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};