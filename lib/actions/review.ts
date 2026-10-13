'use server';

import { z } from 'zod';

import { getContainer } from '@/lib/container';
import { DEMO_REVIEWER } from '@/lib/services/review/reviewer';

import { actionClient } from './safe-action-client';

const matchInput = z.object({ matchId: z.number().int().positive() });

/** Confirm the candidate, reject its siblings, mark the document MATCHED — atomically. */
export const confirmMatch = actionClient
  .inputSchema(matchInput)
  .action(async ({ parsedInput }) => getContainer().review.confirm(parsedInput.matchId, DEMO_REVIEWER));

/** Reject the candidate; when none remain, the document becomes UNMATCHED. */
export const rejectMatch = actionClient
  .inputSchema(matchInput)
  .action(async ({ parsedInput }) => getContainer().review.reject(parsedInput.matchId, DEMO_REVIEWER));
