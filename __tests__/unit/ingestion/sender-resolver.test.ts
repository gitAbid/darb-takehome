import type { SenderDirectory } from '@/lib/repositories/sender-directory';
import { SenderResolver } from '@/lib/services/ingestion/sender-resolver';

const directory: SenderDirectory = {
  clientIdBySlug: async (slug) => ({ najd: 1, redsea: 2 })[slug] ?? null,
  clientIdBySenderEmail: async (email) => (email === 'fleet@najd-logistics.example' ? 1 : null),
  clientIdsByDriverPhone: async (phone) => ({ '+966551234567': [1], '+966559999999': [1, 2] })[phone] ?? [],
};
const resolver = new SenderResolver(directory);
const email = (from: string, to: string | null) => resolver.resolve({ source: 'EMAIL', from, to });

describe('SenderResolver (E1)', () => {
  it('scopes email by the inbox alias first, then a registered sender, else unknown', async () => {
    expect(
      await Promise.all([
        email('billing@supplier.example', 'receipts+redsea@darb.example.com'),
        email('fleet@najd-logistics.example', 'receipts+redsea@darb.example.com'),
        email('fleet@najd-logistics.example', 'receipts+unknown@darb.example.com'),
        email('fleet@najd-logistics.example', 'receipts@darb.example.com'),
        email('billing@supplier.example', 'receipts@darb.example.com'),
      ]),
    ).toEqual([
      { clientIds: [2], driverPhone: null },
      { clientIds: [2], driverPhone: null },
      { clientIds: [1], driverPhone: null },
      { clientIds: [1], driverPhone: null },
      null,
    ]);
  });

  it('scopes WhatsApp to the driver across every client they drive for, else unknown', async () => {
    expect(
      await Promise.all(
        ['+966551234567', '+966559999999', '+966500000000'].map((phone) =>
          resolver.resolve({ source: 'WHATSAPP', phone }),
        ),
      ),
    ).toEqual([
      { clientIds: [1], driverPhone: '+966551234567' },
      { clientIds: [1, 2], driverPhone: '+966559999999' },
      null,
    ]);
  });
});
