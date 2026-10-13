/**
 * End-to-end review: real webhooks create the review cases from the scenario fixtures, then the real server actions
 * (next-safe-action) decide them. Asserts what the reviewer sees and what the database guarantees.
 */
import { confirmMatch, rejectMatch } from '@/lib/actions/review';

import { createTestApp, documentOutcome, readFixtureJson, resetAndSeed } from '../helpers/e2e-app';
import { db } from '../helpers/test-database';

process.env.LOG_SINK = 'test';

/** Sends a scenario through its webhook and returns its candidate match ids, best first. */
async function reviewCase(folder: string, channel: 'email' | 'whatsapp', externalId: string): Promise<number[]> {
  await createTestApp().post(channel, readFixtureJson('scenarios', folder, 'payload.json'));
  const matches = await db.documentMatch.findMany({ where: { document: { externalId } }, orderBy: { rank: 'asc' } });
  return matches.map((match) => match.id);
}

const nearTie = () => reviewCase('02-ambiguous-same-chain', 'email', 'msg_S02:0');

beforeEach(resetAndSeed);
afterAll(() => db.$disconnect());

describe('confirmMatch', () => {
  it('confirms the chosen candidate, rejects its sibling and marks the document MATCHED; a double-submit is a no-op', async () => {
    const [chosen, sibling] = await nearTie();
    const first = await confirmMatch({ matchId: chosen });
    const again = await confirmMatch({ matchId: chosen });
    expect(first.data).toMatchObject({ ok: true, result: 'confirmed' });
    expect(again.data).toMatchObject({ ok: true, result: 'alreadyConfirmed' });
    expect(await documentOutcome('msg_S02:0')).toMatchObject({
      status: 'MATCHED',
      matches: [
        ['T04', 'CONFIRMED', 1],
        ['T05', 'REJECTED', 1],
      ],
    });
    expect((await confirmMatch({ matchId: sibling })).data).toEqual({ ok: false, code: 'MATCH_NOT_PENDING' });
  });

  it('S07: the database refuses a second confirmed document on a transaction; the reviewer can still reject', async () => {
    const [candidate] = await reviewCase('07-invoice-after-confirmed-receipt', 'email', 'msg_S07:0');
    expect((await confirmMatch({ matchId: candidate })).data).toEqual({
      ok: false,
      code: 'TRANSACTION_ALREADY_HAS_DOCUMENT',
    });
    expect((await documentOutcome('msg_S07:0')).status).toBe('NEEDS_REVIEW');
    expect((await rejectMatch({ matchId: candidate })).data).toMatchObject({
      ok: true,
      result: 'rejected',
      remainingCandidates: 0,
    });
    expect((await documentOutcome('msg_S07:0')).status).toBe('UNMATCHED');
  });

  it('concurrent submits: a double-click succeeds once and is a no-op once; two rival candidates → exactly one wins', async () => {
    const [first] = await nearTie();
    const doubleClick = await Promise.all([confirmMatch({ matchId: first }), confirmMatch({ matchId: first })]);
    expect(
      doubleClick
        .map((result) => result.data)
        .map((data) => (data?.ok ? data.result : data?.code))
        .sort(),
    ).toEqual(['alreadyConfirmed', 'confirmed']);
    await resetAndSeed();
    const [a, b] = await nearTie();
    const rivals = await Promise.all([confirmMatch({ matchId: a }), confirmMatch({ matchId: b })]);
    expect(rivals.map((result) => result.data?.ok).sort()).toEqual([false, true]);
    expect(
      await db.documentMatch.count({ where: { document: { externalId: 'msg_S02:0' }, status: 'CONFIRMED' } }),
    ).toBe(1);
  });
});

describe('rejectMatch', () => {
  it('keeps the document in review while candidates remain, then UNMATCHED; a repeat is a no-op', async () => {
    const [first, second] = await nearTie();
    expect((await rejectMatch({ matchId: first })).data).toMatchObject({
      ok: true,
      result: 'rejected',
      remainingCandidates: 1,
    });
    expect((await documentOutcome('msg_S02:0')).status).toBe('NEEDS_REVIEW');
    expect((await rejectMatch({ matchId: second })).data).toMatchObject({ ok: true, remainingCandidates: 0 });
    expect((await rejectMatch({ matchId: second })).data).toMatchObject({ ok: true, result: 'alreadyRejected' });
    expect(await documentOutcome('msg_S02:0')).toMatchObject({ status: 'UNMATCHED' });
    expect((await confirmMatch({ matchId: first })).data).toEqual({ ok: false, code: 'MATCH_NOT_PENDING' });
  });

  it('cannot reject a system decision (auto-confirmed match)', async () => {
    const [autoConfirmed] = await reviewCase('01-exact-match', 'whatsapp', 'wamid.S01-0001');
    expect((await rejectMatch({ matchId: autoConfirmed })).data).toEqual({ ok: false, code: 'MATCH_NOT_PENDING' });
  });
});

describe('input and unknown matches', () => {
  it('rejects invalid input before touching the database and reports unknown matches', async () => {
    const invalid = await confirmMatch({ matchId: -1 });
    expect(invalid.validationErrors).toBeDefined();
    expect(invalid.data).toBeUndefined();
    expect((await rejectMatch({ matchId: 999_999 })).data).toEqual({ ok: false, code: 'MATCH_NOT_FOUND' });
  });
});
