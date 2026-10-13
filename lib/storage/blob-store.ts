/** Stores document bytes so post-response processing and reviewers can read them. Keys are content hashes. */
export interface BlobStore {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export class BlobNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`No blob stored under ${key}`);
    this.name = 'BlobNotFoundError';
  }
}
