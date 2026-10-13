import type { CandidateFlag, ReasonCode } from '@/lib/domain/reason-codes';
import type { DocumentStatus, MatchStatus } from '@/lib/domain/statuses';
import type { QueueItem, ReviewCandidate, ReviewDocument } from '@/lib/repositories/review-queue-reader';

import { compareAmount, compareCard, compareDay, type Comparison } from './comparisons';
import { formatAge, formatDay, formatDayTime, formatMoney, formatPercent } from './format';
import { confidenceTone, DISPLAYED_SIGNALS, type ConfidenceTone } from './signals';

export interface QueueRowView {
  documentId: number;
  channel: 'email' | 'whatsapp';
  title: string;
  amount: string;
  age: string;
  sender: string;
  reasons: ReasonCode[];
  pendingCandidates: number;
}

export interface CandidateView {
  matchId: number;
  rank: number;
  status: MatchStatus;
  isPending: boolean;
  confidence: string;
  confidenceValue: number;
  confidenceTone: ConfidenceTone;
  merchant: string;
  charged: string;
  chargedAt: string;
  cardLabel: string;
  amount: Comparison;
  day: Comparison;
  card: Comparison;
  signals: { label: string; value: number | null }[];
  flags: readonly CandidateFlag[];
}

export interface DocumentView {
  documentId: number;
  status: DocumentStatus;
  channel: 'email' | 'whatsapp';
  title: string;
  total: string;
  documentDay: string;
  documentType: string;
  sender: string;
  recipient: string | null;
  receivedAt: string;
  isImage: boolean;
  hasFile: boolean;
  fields: { label: string; value: string }[];
  reasons: ReasonCode[];
  candidates: CandidateView[];
}

export function toQueueRow(item: QueueItem, now: Date): QueueRowView {
  return {
    documentId: item.documentId,
    channel: item.source === 'EMAIL' ? 'email' : 'whatsapp',
    title: item.merchantName ?? 'Unnamed merchant',
    amount: formatMoney(item.totalAmount, item.currency),
    age: formatAge(item.receivedAt, now),
    sender: item.senderIdentifier,
    reasons: item.reasons,
    pendingCandidates: item.pendingCandidates,
  };
}

export function toDocumentView(document: ReviewDocument): DocumentView {
  const extraction = document.extraction;
  return {
    documentId: document.documentId,
    status: document.status,
    channel: document.source === 'EMAIL' ? 'email' : 'whatsapp',
    title: extraction?.merchantName ?? 'Unnamed merchant',
    total: formatMoney(extraction?.totalAmount ?? null, extraction?.currency ?? 'SAR'),
    documentDay: formatDay(extraction?.documentDate ?? null),
    documentType: humanType(extraction?.documentType ?? 'UNKNOWN'),
    sender: document.senderIdentifier,
    recipient: document.recipientIdentifier,
    receivedAt: formatDayTime(document.receivedAt),
    isImage: document.mimeType.startsWith('image/'),
    hasFile: document.hasFile,
    fields: [
      { label: 'Card', value: extraction?.cardLast4 ? `•••• ${extraction.cardLast4}` : 'Not printed' },
      { label: 'VAT no.', value: extraction?.vatNumber ?? '—' },
      { label: 'Invoice no.', value: extraction?.invoiceNumber ?? '—' },
      { label: 'OCR confidence', value: extraction ? formatPercent(extraction.extractionConfidence) : '—' },
    ],
    reasons: document.reasons,
    candidates: document.candidates.map((candidate) => toCandidateView(candidate, document)),
  };
}

function toCandidateView(candidate: ReviewCandidate, document: ReviewDocument): CandidateView {
  const { transaction } = candidate;
  const extraction = document.extraction;
  return {
    matchId: candidate.matchId,
    rank: candidate.rank,
    status: candidate.status,
    isPending: candidate.status === 'CANDIDATE',
    confidence: formatPercent(candidate.confidence),
    confidenceValue: candidate.confidence,
    confidenceTone: confidenceTone(candidate.confidence),
    merchant: transaction.merchantName,
    charged: formatMoney(transaction.amount, transaction.currency),
    chargedAt: formatDayTime(transaction.transactionAt),
    cardLabel: transaction.cardLabel,
    amount: compareAmount(extraction?.totalAmount ?? null, transaction.amount, transaction.currency),
    day: compareDay(extraction?.documentDate ?? null, transaction.transactionAt),
    card: compareCard(extraction?.cardLast4 ?? null, transaction.cardLast4),
    signals: DISPLAYED_SIGNALS.map(({ key, label }) => ({ label, value: candidate.signals[key] ?? null })),
    flags: candidate.flags,
  };
}

function humanType(type: string): string {
  return { RECEIPT: 'Receipt', TAX_INVOICE: 'Tax invoice' }[type] ?? 'Unknown';
}
