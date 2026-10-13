/**
 * Prints every document with its status, decision reasons and ranked matches — what a reviewer would see.
 * Usage: npm run db:report
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

async function main(): Promise<void> {
  const documents = await db.document.findMany({
    orderBy: { id: 'asc' },
    include: { matches: { orderBy: { rank: 'asc' }, include: { transaction: true } } },
  });
  for (const document of documents) {
    const reasons = Array.isArray(document.decisionReasons) ? document.decisionReasons.join(', ') : '';
    const detail = document.failureReason ?? reasons;
    console.log(
      `#${document.id} ${document.source.padEnd(8)} ${document.externalId.padEnd(22)} ${document.status.padEnd(12)} ${detail}`,
    );
    for (const match of document.matches) {
      const { transaction } = match;
      const amount = (transaction.amount / 100).toFixed(2);
      console.log(
        `     ${match.rank}. txn ${String(transaction.id).padStart(2)} ${transaction.merchantName.padEnd(24)} SAR ${amount.padStart(7)}  ${match.confidence.toFixed(2)}  ${match.status}`,
      );
    }
  }
  console.log(`\n${documents.length} document(s).`);
}
