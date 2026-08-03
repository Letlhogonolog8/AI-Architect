import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CustodyEvent } from '@aegisdrive/types';
import { custodyPayload } from './manifest';
import { verifyCustodyChain } from './verify';

const sha256: (input: string) => string = (input) =>
  createHash('sha256').update(input).digest('hex');

function link(
  overrides: Partial<CustodyEvent> & Pick<CustodyEvent, 'id' | 'occurredAt'>,
  prevHash: string | null,
): CustodyEvent {
  const base = {
    evidenceId: 'evidence-1',
    action: 'CREATED',
    actorUserId: 'user-1',
    actorEmail: 'operator@aegisdrive.ai',
    ipAddress: '10.0.0.1',
    notes: null,
    prevHash,
    ...overrides,
  };

  const entryHash = sha256(
    custodyPayload({
      prevHash: base.prevHash,
      evidenceId: base.evidenceId,
      action: base.action,
      actorUserId: base.actorUserId,
      actorEmail: base.actorEmail,
      ipAddress: base.ipAddress,
      notes: base.notes,
      occurredAt: base.occurredAt,
    }),
  );

  return { ...base, entryHash };
}

/** Builds a valid N-link chain, each entry's prevHash equal to the one before it. */
function buildChain(length: number): CustodyEvent[] {
  const events: CustodyEvent[] = [];
  let prevHash: string | null = null;

  for (let i = 0; i < length; i += 1) {
    const event = link(
      { id: `event-${i}`, occurredAt: `2026-01-0${i + 1}T00:00:00.000Z` },
      prevHash,
    );
    events.push(event);
    prevHash = event.entryHash;
  }

  return events;
}

describe('verifyCustodyChain', () => {
  it('reports an intact chain when every link recomputes and lines up', () => {
    const events = buildChain(3);

    const result = verifyCustodyChain(events, sha256);

    expect(result).toEqual({ intact: true, length: 3, verifiedLinks: 3, brokenAtEventId: null });
  });

  it('detects a tampered field even though the stored hash is unchanged', () => {
    const events = buildChain(3);
    // Simulates an evidence row edited directly in the database: the hash was
    // computed over the original notes, so it will not recompute over these.
    events[1] = { ...events[1], notes: 'attacker-modified' };

    const result = verifyCustodyChain(events, sha256);

    expect(result.intact).toBe(false);
    expect(result.brokenAtEventId).toBe('event-1');
    // The first link, which was not touched, is still counted as verified.
    expect(result.verifiedLinks).toBe(1);
  });

  it('detects a link spliced out of the middle of the chain', () => {
    const events = buildChain(3);
    // Removing event-1 leaves event-2's prevHash pointing at a hash that is no
    // longer the immediately preceding link's entryHash.
    const spliced = [events[0], events[2]];

    const result = verifyCustodyChain(spliced, sha256);

    expect(result.intact).toBe(false);
    expect(result.brokenAtEventId).toBe('event-2');
  });

  it('treats legacy unhashed links as unverifiable rather than broken, and resumes checking after them', () => {
    const events = buildChain(2);
    const legacy: CustodyEvent = {
      id: 'legacy-event',
      evidenceId: 'evidence-1',
      action: 'VIEWED',
      actorUserId: null,
      actorEmail: null,
      ipAddress: null,
      notes: null,
      prevHash: null,
      entryHash: null,
      occurredAt: '2025-06-01T00:00:00.000Z',
    };
    // A legacy link inserted after a hashed one resets the running linkage, so
    // the next hashed link must start its own chain from null prevHash to verify.
    const trailing = link({ id: 'event-2', occurredAt: '2026-02-01T00:00:00.000Z' }, null);

    const result = verifyCustodyChain([...events, legacy, trailing], sha256);

    expect(result.intact).toBe(true);
    expect(result.length).toBe(4);
    // Both original links plus the trailing one restart cleanly after the legacy gap.
    expect(result.verifiedLinks).toBe(3);
  });

  it('reports an empty chain as intact with nothing verified', () => {
    const result = verifyCustodyChain([], sha256);

    expect(result).toEqual({ intact: true, length: 0, verifiedLinks: 0, brokenAtEventId: null });
  });
});
