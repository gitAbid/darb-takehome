import type { SenderDirectory } from '@/lib/repositories/sender-directory';
import type { SenderScope } from '@/lib/services/matching/types';

const INBOX_ALIAS = /^[^@+]+\+([^@]+)@/;

export type SenderIdentity =
  { source: 'EMAIL'; from: string; to: string | null } | { source: 'WHATSAPP'; phone: string };

/**
 * Decides which transactions a document may match (E1): the client alias in `to` (receipts+<slug>@) wins, then a
 * registered `from` address; a WhatsApp phone scopes to that driver's transactions in every client they drive for.
 * Null means "unknown sender" — never "all transactions".
 */
export class SenderResolver {
  constructor(private readonly directory: SenderDirectory) {}

  async resolve(identity: SenderIdentity): Promise<SenderScope | null> {
    if (identity.source === 'WHATSAPP') return this.resolvePhone(identity.phone);
    const clientId =
      (await this.clientIdFromAlias(identity.to)) ?? (await this.directory.clientIdBySenderEmail(identity.from));
    return clientId === null ? null : { clientIds: [clientId], driverPhone: null };
  }

  private async resolvePhone(phone: string): Promise<SenderScope | null> {
    const clientIds = await this.directory.clientIdsByDriverPhone(phone);
    return clientIds.length > 0 ? { clientIds, driverPhone: phone } : null;
  }

  private async clientIdFromAlias(to: string | null): Promise<number | null> {
    const slug = to === null ? undefined : INBOX_ALIAS.exec(to)?.[1];
    return slug ? this.directory.clientIdBySlug(slug) : null;
  }
}
