const D1_PHONE = '+966551234567';

/** Who sends each scenario's document, and how (docs/SCENARIOS.md §3). */
export const SCENARIO_PAYLOAD_SPECS: readonly ScenarioPayloadSpec[] = [
  whatsapp('01-exact-match', '01-exact-match', 'wamid.S01-0001', D1_PHONE, '2025-06-10T07:50:00Z', 'media_0101'),
  email(
    '02-ambiguous-same-chain',
    'msg_S02',
    'billing@alfanar-fuel.com.sa',
    'receipts+najd@darb.example.com',
    'Tax Invoice #INV-99830',
    '2025-06-14T10:05:00Z',
    'invoice-99830',
    true,
  ),
  whatsapp(
    '03-restaurant-tip',
    '03-restaurant-tip',
    'wamid.S03-0001',
    '+966552223344',
    '2025-06-12T17:55:00Z',
    'media_0301',
  ),
  whatsapp('04-duplicate-photo', '01-exact-match', 'wamid.S04-0002', D1_PHONE, '2025-06-10T08:30:00Z', 'media_0102'),
  email(
    '05-invoice-no-transaction',
    'msg_S05',
    'fleet@najd-logistics.example',
    'receipts@darb.example.com',
    'Fwd: Tax Invoice INV-2025-0612',
    '2025-06-15T11:20:00Z',
    'INV-2025-0612',
  ),
  whatsapp(
    '06-garbage-extraction',
    '06-garbage-extraction',
    'wamid.S06-0001',
    D1_PHONE,
    '2025-06-15T13:00:00Z',
    'media_0601',
  ),
  email(
    '07-invoice-after-confirmed-receipt',
    'msg_S07',
    'fleet@najd-logistics.example',
    'receipts+najd@darb.example.com',
    'Fwd: Tax Invoice INV-55120',
    '2025-06-12T08:40:00Z',
    'INV-55120',
  ),
  email(
    '08-shared-last4',
    'msg_S08',
    'fleet@najd-logistics.example',
    'receipts+najd@darb.example.com',
    'Fwd: car wash receipt',
    '2025-06-16T13:10:00Z',
    'lamaa-receipt',
  ),
  whatsapp('09-card-misread', '09-card-misread', 'wamid.S09-0001', D1_PHONE, '2025-06-18T15:20:00Z', 'media_0901'),
  email(
    '10-extractor-error',
    'msg_S10',
    'fleet@redsea-transport.example',
    'receipts+redsea@darb.example.com',
    'Fwd: Tax Invoice INV-RS-7781',
    '2025-06-17T09:00:00Z',
    'INV-RS-7781',
  ),
  email(
    '11-unknown-sender',
    'msg_8f2a1',
    'billing@alfanar-fuel.com.sa',
    'receipts@darb.example.com',
    'Tax Invoice #INV-99812',
    '2025-06-14T09:21:00Z',
    'invoice-99812',
  ),
  whatsapp(
    '12-back-to-back-refuel',
    '12-back-to-back-refuel',
    'wamid.S12-0001',
    D1_PHONE,
    '2025-06-16T06:05:00Z',
    'media_1201',
  ),
  whatsapp(
    '13-foreign-currency',
    '13-foreign-currency',
    'wamid.S13-0001',
    '+966553334455',
    '2025-06-19T10:15:00Z',
    'media_1301',
  ),
];

export type ScenarioPayloadSpec = EmailScenarioSpec | WhatsAppScenarioSpec;

export interface EmailScenarioSpec {
  channel: 'email';
  folder: string;
  messageId: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: string;
  /** Attachment name without extension; the extension comes from the document file. */
  filename: string;
  /** Also attach the signature logo, which intake must ignore. */
  includeLogo: boolean;
}

export interface WhatsAppScenarioSpec {
  channel: 'whatsapp';
  /** Where payload.json is written. */
  folder: string;
  /** Whose document.jpg the media id resolves to (S04 reuses S01's file). */
  documentFolder: string;
  wamid: string;
  fromPhone: string;
  sentAt: string;
  mediaId: string;
}

function whatsapp(
  folder: string,
  documentFolder: string,
  wamid: string,
  fromPhone: string,
  sentAt: string,
  mediaId: string,
): WhatsAppScenarioSpec {
  return { channel: 'whatsapp', folder, documentFolder, wamid, fromPhone, sentAt, mediaId };
}

function email(
  folder: string,
  messageId: string,
  from: string,
  to: string,
  subject: string,
  receivedAt: string,
  filename: string,
  includeLogo = false,
): EmailScenarioSpec {
  return { channel: 'email', folder, messageId, from, to, subject, receivedAt, filename, includeLogo };
}
