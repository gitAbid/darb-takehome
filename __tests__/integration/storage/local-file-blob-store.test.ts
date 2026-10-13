import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BlobNotFoundError } from '@/lib/storage/blob-store';
import { LocalFileBlobStore } from '@/lib/storage/local-file-blob-store';

describe('LocalFileBlobStore', () => {
  const store = new LocalFileBlobStore(join(mkdtempSync(join(tmpdir(), 'blobs-')), 'nested'));

  it('round-trips bytes by key, creating the directory on first write', async () => {
    await store.put('abc123', Buffer.from('receipt'));
    await expect(store.get('abc123')).resolves.toEqual(Buffer.from('receipt'));
  });

  it('reports a missing blob and refuses keys that could escape the directory', async () => {
    await expect(store.get('missing')).rejects.toBeInstanceOf(BlobNotFoundError);
    await expect(store.put('../escape', Buffer.from('x'))).rejects.toThrow('Invalid blob key');
  });
});
