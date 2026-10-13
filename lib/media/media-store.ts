export interface MediaObject {
  bytes: Buffer;
  mimeType: string;
  /** Where the bytes live, so a reviewer can open the file later. */
  storageKey: string;
}

/** Resolves a WhatsApp media id to its bytes (in production: the Meta Graph API). */
export interface MediaStore {
  /** Throws MediaNotFoundError when the id is unknown or the bytes are unavailable. */
  fetch(mediaId: string): Promise<MediaObject>;
}
