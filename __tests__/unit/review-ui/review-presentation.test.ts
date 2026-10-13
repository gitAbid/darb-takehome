/** The review UI's decision aids: what a reviewer reads must say exactly what the matcher saw. */
import { REASON_CODES } from '@/lib/domain/reason-codes';
import type { ReviewDocument } from '@/lib/repositories/review-queue-reader';
import { compareAmount, compareCard, compareDay } from '@/lib/review-ui/comparisons';
import { formatAge, formatDay, formatMoney } from '@/lib/review-ui/format';
import { queueNavigation } from '@/lib/review-ui/queue-navigation';
import { REASON_COPY } from '@/lib/review-ui/reasons';
import { confidenceTone } from '@/lib/review-ui/signals';
import { toDocumentView, toQueueRow } from '@/lib/review-ui/view-models';

describe('review presentation', () => {
  it('explains amount, date and card differences in reviewer language', () => {
    expect([
      compareAmount(15000, 15003, 'SAR'),
      compareAmount(5750, 6325, 'SAR'),
      compareAmount(15000, 12000, 'SAR'),
      compareAmount(null, 100, 'SAR'),
    ]).toEqual([
      { label: 'Exact', tone: 'match' },
      { label: '+SAR 5.75 (10%) · tip?', tone: 'close' },
      { label: '−SAR 30.00 (20%)', tone: 'mismatch' },
      { label: 'No total on document', tone: 'unknown' },
    ]);
    const day = new Date('2025-06-14T00:00:00Z');
    expect(
      [
        compareDay(day, new Date('2025-06-13T22:30:00Z')),
        compareDay(day, new Date('2025-06-15T09:00:00Z')),
        compareDay(day, new Date('2025-06-11T09:00:00Z')),
        compareDay(null, day),
      ].map((comparison) => [comparison.label, comparison.tone]),
    ).toEqual([
      ['Same day', 'match'],
      ['Charged 1 day later', 'close'],
      ['Charged 3 days earlier', 'mismatch'],
      ['No date on document', 'unknown'],
    ]);
    expect(['4471', '4477', '9902', null].map((last4) => compareCard(last4, '4471').tone)).toEqual([
      'match',
      'close',
      'mismatch',
      'unknown',
    ]);
  });

  it('has reviewer copy for every reason code the matcher can emit', () => {
    expect(Object.keys(REASON_COPY).sort()).toEqual([...REASON_CODES].sort());
  });

  it('navigates the queue forwards and backwards, and onwards after the current document leaves it', () => {
    expect(queueNavigation([7, 8, 11], 8)).toEqual({
      nextHref: '/review?doc=11',
      prevHref: '/review?doc=7',
      position: '2 of 3',
      neighborIds: [11, 7],
    });
    expect(queueNavigation([7, 8, 11], 11)).toEqual({
      nextHref: '/review?doc=7',
      prevHref: '/review?doc=8',
      position: '3 of 3',
      neighborIds: [7, 8],
    });
    expect(queueNavigation([7, 8], 12)).toMatchObject({
      nextHref: '/review?doc=7',
      prevHref: null,
      position: '2 waiting',
      neighborIds: [7],
    });
    expect(queueNavigation([7, 8], 8).neighborIds).toEqual([7]);
    expect(queueNavigation([], null)).toEqual({
      nextHref: '/review',
      prevHref: null,
      position: '0 waiting',
      neighborIds: [],
    });
  });

  it('formats money, Riyadh days and ages', () => {
    expect([formatMoney(123450), formatMoney(5750, 'AED'), formatMoney(100, null), formatMoney(null)]).toEqual([
      'SAR 1,234.50',
      'AED 57.50',
      'SAR 1.00',
      '—',
    ]);
    expect(formatDay(null)).toBe('—');
    expect([0.9, 0.6, 0.3].map(confidenceTone)).toEqual(['high', 'medium', 'low']);
    expect(formatDay(new Date('2025-06-13T22:30:00Z'))).toBe('14 Jun 2025');
    const now = new Date('2025-06-20T12:00:00Z');
    expect(
      ['2025-06-20T12:00:00Z', '2025-06-20T11:55:00Z', '2025-06-20T09:00:00Z', '2025-06-17T12:00:00Z'].map((at) =>
        formatAge(new Date(at), now),
      ),
    ).toEqual(['just now', '5 min ago', '3 h ago', '3 d ago']);
  });

  it('builds the document view with candidate comparisons and only the measurable signals filled', () => {
    const document: ReviewDocument = {
      documentId: 9,
      status: 'NEEDS_REVIEW',
      source: 'WHATSAPP',
      senderIdentifier: '+966551234567',
      recipientIdentifier: null,
      receivedAt: new Date('2025-06-18T15:20:00Z'),
      mimeType: 'image/jpeg',
      hasFile: true,
      reasons: ['CARD_POSSIBLE_MISREAD'],
      extraction: {
        documentType: 'RECEIPT',
        merchantName: 'Rawabi Fuel 03',
        vatNumber: null,
        totalAmount: 12000,
        currency: 'SAR',
        documentDate: new Date('2025-06-18T00:00:00Z'),
        cardLast4: '4477',
        invoiceNumber: null,
        rawText: '',
        extractionConfidence: 0.86,
      },
      candidates: [
        {
          matchId: 3,
          rank: 1,
          confidence: 0.86,
          signals: { amount: 1, date: 1, merchant: 1, card: 0.3, scope: 1 },
          flags: ['CARD_POSSIBLE_MISREAD'],
          status: 'CANDIDATE',
          transaction: {
            id: 10,
            merchantName: 'RAWABI FUEL 03 RUH',
            mcc: '5541',
            amount: 12000,
            currency: 'SAR',
            transactionAt: new Date('2025-06-18T15:10:00Z'),
            cardLast4: '4471',
            cardLabel: 'Najd truck 12',
            driverPhone: '+966551234567',
          },
        },
      ],
    };
    const view = toDocumentView(document);
    expect(view).toMatchObject({
      channel: 'whatsapp',
      title: 'Rawabi Fuel 03',
      total: 'SAR 120.00',
      isImage: true,
      documentType: 'Receipt',
    });
    expect(view.candidates[0]).toMatchObject({
      isPending: true,
      confidence: '86%',
      confidenceTone: 'high',
      amount: { label: 'Exact' },
      card: { label: 'Receipt 4477 vs 4471 · misread?', tone: 'close' },
      signals: [
        { label: 'Amount', value: 1 },
        { label: 'Date', value: 1 },
        { label: 'Merchant', value: 1 },
        { label: 'Card', value: 0.3 },
      ],
    });
  });

  it('falls back gracefully for documents without extraction, PDFs and decided candidates', () => {
    const view = toDocumentView({
      documentId: 4,
      status: 'MATCHED',
      source: 'EMAIL',
      senderIdentifier: 'fleet@najd-logistics.example',
      recipientIdentifier: 'receipts+najd@darb.example.com',
      receivedAt: new Date('2025-06-14T09:21:00Z'),
      mimeType: 'application/pdf',
      hasFile: false,
      reasons: [],
      extraction: null,
      candidates: [
        {
          matchId: 1,
          rank: 1,
          confidence: 0.4,
          signals: { amount: 1 },
          flags: [],
          status: 'CONFIRMED',
          transaction: {
            id: 1,
            merchantName: 'X',
            mcc: '5541',
            amount: 100,
            currency: 'SAR',
            transactionAt: new Date('2025-06-14T09:00:00Z'),
            cardLast4: '4471',
            cardLabel: 'Truck',
            driverPhone: null,
          },
        },
      ],
    });
    expect(view).toMatchObject({
      channel: 'email',
      title: 'Unnamed merchant',
      total: '—',
      isImage: false,
      documentType: 'Unknown',
    });
    expect(view.fields.map((field) => field.value)).toEqual(['Not printed', '—', '—', '—']);
    expect(view.candidates[0]).toMatchObject({
      isPending: false,
      confidenceTone: 'low',
      signals: expect.arrayContaining([{ label: 'Card', value: null }]),
    });
  });

  it('builds queue rows for both channels', () => {
    const row = (source: 'EMAIL' | 'WHATSAPP', merchantName: string | null) =>
      toQueueRow(
        {
          documentId: 1,
          source,
          senderIdentifier: 'x',
          receivedAt: new Date('2025-06-20T11:00:00Z'),
          merchantName,
          totalAmount: 5750,
          currency: 'SAR',
          documentDate: null,
          reasons: ['NEAR_TIE'],
          pendingCandidates: 2,
        },
        new Date('2025-06-20T12:00:00Z'),
      );
    expect(row('EMAIL', null)).toMatchObject({
      channel: 'email',
      title: 'Unnamed merchant',
      amount: 'SAR 57.50',
      age: '1 h ago',
    });
    expect(row('WHATSAPP', 'Al Mashwar Grill')).toMatchObject({ channel: 'whatsapp', title: 'Al Mashwar Grill' });
  });
});
