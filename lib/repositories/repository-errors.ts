/** A confirmed match could not be stored because the transaction or document already has a confirmed match. */
export class ConfirmedSlotTakenError extends Error {
  constructor(readonly field: 'confirmedTransactionId' | 'confirmedDocumentId') {
    super(`Confirmed slot already taken (${field})`);
    this.name = 'ConfirmedSlotTakenError';
  }
}
