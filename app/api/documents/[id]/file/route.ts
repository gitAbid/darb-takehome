import { getContainer } from '@/lib/container';

/** The original document file for the review UI. Content is addressed by hash, so it never changes. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const documentId = Number((await params).id);
  if (!Number.isInteger(documentId) || documentId <= 0) return new Response('Not found', { status: 404 });
  const file = await getContainer().documentFiles.get(documentId);
  if (file === null) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: { 'content-type': file.mimeType, 'cache-control': 'private, max-age=31536000, immutable' },
  });
}
