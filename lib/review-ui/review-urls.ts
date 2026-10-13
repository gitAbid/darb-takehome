/** URLs the review UI links to, in one place so navigation, previews and preloading agree. */
export function reviewHref(documentId: number): string {
  return `/review?doc=${documentId}`;
}

export function documentFileUrl(documentId: number): string {
  return `/api/documents/${documentId}/file`;
}
