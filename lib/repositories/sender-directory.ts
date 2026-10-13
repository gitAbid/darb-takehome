/** Looks up which client(s) a sender belongs to. */
export interface SenderDirectory {
  clientIdBySlug(slug: string): Promise<number | null>;
  clientIdBySenderEmail(email: string): Promise<number | null>;
  clientIdsByDriverPhone(phone: string): Promise<number[]>;
}
