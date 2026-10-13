import { PrismaClient } from '@prisma/client';

import { seedDatabase } from './seed-data/seed-database';

// `npx prisma db seed` entry point: loads docs/SCENARIOS.md §1 into the database.
const prisma = new PrismaClient();

seedDatabase(prisma)
  .then((summary) => console.log('Seeded', summary))
  .catch((error: unknown) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
