/** Plain seed records (no Prisma types) so tests can use the same data without a database. */
export interface SeedClient {
  id: number;
  name: string;
  slug: string;
}

export interface SeedSenderEmail {
  clientId: number;
  email: string;
}

export interface SeedDriver {
  ref: string;
  phone: string;
  clientId: number;
}

export interface SeedCard {
  id: number;
  ref: string;
  clientId: number;
  last4: string;
  label: string;
}

export interface SeedTransaction {
  id: number;
  ref: string;
  clientId: number;
  cardId: number;
  driverPhone: string;
  merchantName: string;
  mcc: string;
  amount: number;
  currency: string;
  transactionAt: Date;
}

export interface SeedConfirmedDocument {
  ref: string;
  externalId: string;
  senderIdentifier: string;
  clientId: number;
  merchantName: string;
  totalAmount: number;
  documentDate: string;
  cardLast4: string;
  confirmedTransactionId: number;
  decidedBy: string;
  decidedAt: Date;
}
