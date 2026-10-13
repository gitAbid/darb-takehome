import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BlobNotFoundError, type BlobStore } from './blob-store';

const SAFE_KEY = /^[a-zA-Z0-9_-]{1,128}$/;

/** Blob store on the local disk; object storage (S3, GCS) would implement the same interface in production. */
export class LocalFileBlobStore implements BlobStore {
  constructor(private readonly directory: string) {}

  async put(key: string, bytes: Buffer): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(key), bytes);
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(key));
    } catch {
      throw new BlobNotFoundError(key);
    }
  }

  private pathFor(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error(`Invalid blob key: ${key}`);
    return join(this.directory, key);
  }
}
