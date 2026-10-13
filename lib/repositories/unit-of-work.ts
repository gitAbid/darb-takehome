import type { DocumentRepository } from './document-repository';
import type { MatchRepository } from './match-repository';
import type { SenderDirectory } from './sender-directory';
import type { TransactionRepository } from './transaction-repository';

export interface Repositories {
  documents: DocumentRepository;
  matches: MatchRepository;
  transactions: TransactionRepository;
  senders: SenderDirectory;
}

/** Runs several repository calls atomically: all commit or none do. */
export interface UnitOfWork {
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>;
}
