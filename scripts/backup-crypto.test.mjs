import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptBackup, encryptBackup } from './backup-crypto.mjs';

test('encrypted backup restores byte-for-byte and rejects a wrong key', async () => {
  const source = randomBytes(8192);
  process.env.STACKFLOW_BACKUP_PASSPHRASE = 'local-test-passphrase-only';
  const encrypted = await encryptBackup(source);
  assert.notDeepEqual(encrypted, source);
  assert.deepEqual(await decryptBackup(encrypted), source);
  process.env.STACKFLOW_BACKUP_PASSPHRASE = 'different-local-passphrase';
  await assert.rejects(() => decryptBackup(encrypted));
});
