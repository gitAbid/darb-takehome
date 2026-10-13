import { PrismaSenderDirectory } from '@/lib/repositories/prisma/prisma-sender-directory';

import { createClient, db, resetDatabase } from '../../helpers/test-database';

const directory = new PrismaSenderDirectory(db);
const PHONE = '+966551234567';

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('PrismaSenderDirectory', () => {
  describe('clientIdBySlug', () => {
    it('finds the client of an inbox alias slug, ignoring case and whitespace', async () => {
      const client = await createClient({ slug: 'najd' });
      expect(await directory.clientIdBySlug('najd')).toBe(client.id);
      expect(await directory.clientIdBySlug(' NAJD ')).toBe(client.id);
    });

    it('returns null for an unknown slug', async () => {
      await createClient({ slug: 'najd' });
      expect(await directory.clientIdBySlug('unknown')).toBeNull();
    });
  });

  describe('clientIdBySenderEmail', () => {
    it('finds the client of a registered sender, ignoring case and whitespace', async () => {
      const client = await createClient();
      await db.clientSenderEmail.create({ data: { clientId: client.id, email: 'fleet@najd-logistics.example' } });
      expect(await directory.clientIdBySenderEmail('fleet@najd-logistics.example')).toBe(client.id);
      expect(await directory.clientIdBySenderEmail('  Fleet@NAJD-Logistics.example ')).toBe(client.id);
    });

    it('returns null for an unregistered sender (e.g. a supplier writing directly)', async () => {
      expect(await directory.clientIdBySenderEmail('billing@alfanar-fuel.com.sa')).toBeNull();
    });
  });

  describe('clientIdsByDriverPhone', () => {
    it('returns the client of a known driver', async () => {
      const client = await createClient();
      await db.driver.create({ data: { clientId: client.id, phone: PHONE } });
      expect(await directory.clientIdsByDriverPhone(PHONE)).toEqual([client.id]);
    });

    it('returns every client a phone drives for, sorted and distinct', async () => {
      const second = await createClient();
      const first = await createClient();
      await db.driver.create({ data: { clientId: second.id, phone: PHONE } });
      await db.driver.create({ data: { clientId: first.id, phone: PHONE } });
      expect(await directory.clientIdsByDriverPhone(` ${PHONE} `)).toEqual([second.id, first.id].sort((a, b) => a - b));
    });

    it('returns [] for an unknown phone', async () => {
      expect(await directory.clientIdsByDriverPhone('+966500000000')).toEqual([]);
    });
  });
});
