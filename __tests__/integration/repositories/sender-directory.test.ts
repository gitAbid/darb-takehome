import { PrismaSenderDirectory } from '@/lib/repositories/prisma/prisma-sender-directory';

import { createClient, db, resetDatabase } from '../../helpers/test-database';

const directory = new PrismaSenderDirectory(db);
const PHONE = '+966551234567';

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('PrismaSenderDirectory', () => {
  it('resolves alias slugs and sender emails case-insensitively, and a phone to every client it drives for', async () => {
    const najd = await createClient({ slug: 'najd' });
    const redsea = await createClient({ slug: 'redsea' });
    await db.clientSenderEmail.create({ data: { clientId: najd.id, email: 'fleet@najd-logistics.example' } });
    await db.driver.create({ data: { clientId: redsea.id, phone: PHONE } });
    await db.driver.create({ data: { clientId: najd.id, phone: PHONE } });
    expect(
      await Promise.all([
        directory.clientIdBySlug(' NAJD '),
        directory.clientIdBySlug('unknown'),
        directory.clientIdBySenderEmail('  Fleet@NAJD-Logistics.example '),
        directory.clientIdBySenderEmail('billing@alfanar-fuel.com.sa'),
        directory.clientIdsByDriverPhone(` ${PHONE} `),
        directory.clientIdsByDriverPhone('+966500000000'),
      ]),
    ).toEqual([najd.id, null, najd.id, null, [najd.id, redsea.id].sort((a, b) => a - b), []]);
  });
});
