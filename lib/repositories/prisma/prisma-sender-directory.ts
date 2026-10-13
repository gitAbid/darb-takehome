import type { SenderDirectory } from '../sender-directory';
import type { PrismaDb } from './prisma-db';

export class PrismaSenderDirectory implements SenderDirectory {
  constructor(private readonly db: PrismaDb) {}

  async clientIdBySlug(slug: string): Promise<number | null> {
    const client = await this.db.client.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true },
    });
    return client?.id ?? null;
  }

  /** Sender emails are stored lower-cased, so the lookup is case-insensitive. */
  async clientIdBySenderEmail(email: string): Promise<number | null> {
    const sender = await this.db.clientSenderEmail.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { clientId: true },
    });
    return sender?.clientId ?? null;
  }

  async clientIdsByDriverPhone(phone: string): Promise<number[]> {
    const drivers = await this.db.driver.findMany({
      where: { phone: phone.trim() },
      select: { clientId: true },
      distinct: ['clientId'],
      orderBy: { clientId: 'asc' },
    });
    return drivers.map((driver) => driver.clientId);
  }
}
