import type { SeedDriver } from './types';

export const DRIVERS = {
  D1: { ref: 'D1', phone: '+966551234567', clientId: 1 },
  D2: { ref: 'D2', phone: '+966552223344', clientId: 1 },
  D3: { ref: 'D3', phone: '+966553334455', clientId: 2 },
  D4: { ref: 'D4', phone: '+966554445566', clientId: 1 },
} as const satisfies Record<string, SeedDriver>;
