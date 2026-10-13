import type { SeedClient, SeedSenderEmail } from './types';

export const CLIENTS: readonly SeedClient[] = [
  { id: 1, name: 'Najd Logistics', slug: 'najd' },
  { id: 2, name: 'Red Sea Transport', slug: 'redsea' },
];

export const SENDER_EMAILS: readonly SeedSenderEmail[] = [
  { clientId: 1, email: 'fleet@najd-logistics.example' },
  { clientId: 2, email: 'fleet@redsea-transport.example' },
];
