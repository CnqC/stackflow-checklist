import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const magic = Buffer.from('STACKFLOW-BACKUP-V1\n');
const saltSize = 16;
const ivSize = 12;
const tagSize = 16;

async function keyFor(passphrase, salt) {
  if (!passphrase || passphrase.length < 16) {
    throw new Error('STACKFLOW_BACKUP_PASSPHRASE cần ít nhất 16 ký tự.');
  }
  return scrypt(passphrase, salt, 32);
}

export async function encryptBackup(input) {
  const salt = randomBytes(saltSize);
  const iv = randomBytes(ivSize);
  const key = await keyFor(process.env.STACKFLOW_BACKUP_PASSPHRASE, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export async function decryptBackup(input) {
  if (!input.subarray(0, magic.length).equals(magic)) {
    throw new Error('Định dạng backup không hợp lệ.');
  }
  const saltStart = magic.length;
  const ivStart = saltStart + saltSize;
  const tagStart = ivStart + ivSize;
  const dataStart = tagStart + tagSize;
  if (input.length < dataStart) throw new Error('Backup bị thiếu dữ liệu.');
  const key = await keyFor(process.env.STACKFLOW_BACKUP_PASSPHRASE,
    input.subarray(saltStart, ivStart));
  const decipher = createDecipheriv('aes-256-gcm', key, input.subarray(ivStart, tagStart));
  decipher.setAuthTag(input.subarray(tagStart, dataStart));
  return Buffer.concat([decipher.update(input.subarray(dataStart)), decipher.final()]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , mode, inputPath, outputPath] = process.argv;
  if (!['encrypt', 'decrypt'].includes(mode) || !inputPath || !outputPath) {
    throw new Error('Dùng: node scripts/backup-crypto.mjs encrypt|decrypt input output');
  }
  const input = await readFile(inputPath);
  const output = mode === 'encrypt' ? await encryptBackup(input) : await decryptBackup(input);
  await writeFile(outputPath, output, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${mode === 'encrypt' ? 'Đã mã hóa' : 'Đã giải mã'}: ${outputPath}\n`);
}
