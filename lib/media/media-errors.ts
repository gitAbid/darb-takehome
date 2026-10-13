/** The media id is unknown or its bytes cannot be retrieved. */
export class MediaNotFoundError extends Error {
  constructor(
    readonly mediaId: string,
    reason: string,
  ) {
    super(`Media ${mediaId} not found: ${reason}`);
    this.name = 'MediaNotFoundError';
  }
}
