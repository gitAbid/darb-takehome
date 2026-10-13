import type { SeedCard } from './types';

/** K1 and K2 share a last4 inside one client; K4 shares it from another client (docs/SCENARIOS.md). */
export const CARDS: readonly SeedCard[] = [
  { id: 1, ref: 'K1', clientId: 1, last4: '4471', label: 'Najd truck 12' },
  { id: 2, ref: 'K2', clientId: 1, last4: '4471', label: 'Najd truck 18' },
  { id: 3, ref: 'K3', clientId: 1, last4: '8820', label: 'Najd van 03' },
  { id: 4, ref: 'K4', clientId: 2, last4: '4471', label: 'Red Sea truck 07' },
  { id: 5, ref: 'K5', clientId: 2, last4: '3051', label: 'Red Sea truck 21' },
];
