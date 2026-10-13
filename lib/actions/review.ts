'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getContainer } from '@/lib/container';
import { DEMO_REVIEWER } from '@/lib/services/review/reviewer';

import { actionClient } from './safe-action-client';

const matchInput = z.object({ matchId: z.number().int().positive() });
/** Each decision changes the queue and its counts; revalidating also drops the reviewer's 30 s router cache. */
const REVIEW_PAGE = '/review';

/** Confirm the candidate, reject its siblings, mark the document MATCHED — atomically. */
export const confirmMatch = actionClient.inputSchema(matchInput).action(async ({ parsedInput }) => {
  const outcome = await getContainer().review.confirm(parsedInput.matchId, DEMO_REVIEWER);
  revalidatePath(REVIEW_PAGE);
  return outcome;
});

/** Reject the candidate; when none remain, the document becomes UNMATCHED. */
export const rejectMatch = actionClient.inputSchema(matchInput).action(async ({ parsedInput }) => {
  const outcome = await getContainer().review.reject(parsedInput.matchId, DEMO_REVIEWER);
  revalidatePath(REVIEW_PAGE);
  return outcome;
});
