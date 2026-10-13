import { DRIVERS } from './drivers';
import type { SeedConfirmedDocument } from './types';

/** SD1: a receipt already confirmed against T07, so a later tax invoice for T07 must go to review (S07). */
export const CONFIRMED_DOCUMENTS: readonly SeedConfirmedDocument[] = [
  {
    ref: 'SD1',
    externalId: 'wamid.seed-0001',
    senderIdentifier: DRIVERS.D4.phone,
    clientId: 1,
    merchantName: 'Rawabi Fuel',
    totalAmount: 9500,
    documentDate: '2025-06-11',
    cardLast4: '8820',
    confirmedTransactionId: 7,
    decidedBy: 'reviewer:seed',
    decidedAt: new Date('2025-06-11T12:00:00Z'),
  },
];
