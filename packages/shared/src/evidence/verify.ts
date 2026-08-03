import type { CustodyChainVerification, CustodyEvent } from '@aegisdrive/types';
import { custodyPayload } from './manifest';

/** A hash function the caller supplies — the API passes SHA-256 from node:crypto. */
export type HashFn = (input: string) => string;

/**
 * Recomputes a custody chain and reports whether it is intact.
 *
 * Pure given a hash function, so it runs the same in the API and anywhere a
 * recipient re-verifies a disclosed chain. Each hashed link is recomputed from
 * its own stored fields and its `prevHash`, and its recorded `entryHash` must
 * match; each link's `prevHash` must also equal the previous hashed link's
 * `entryHash`, which is what catches a link removed from the middle.
 *
 * Legacy events written before the chain existed carry null hashes. They are not
 * treated as failures — they predate the mechanism — but they reset the running
 * link, and `verifiedLinks` reports how many were actually checked, so a chain
 * that is entirely legacy is honestly reported as intact-but-unverified rather
 * than falsely reassured.
 */
export function verifyCustodyChain(
  events: readonly CustodyEvent[],
  hash: HashFn,
): CustodyChainVerification {
  let previousEntryHash: string | null = null;
  let verifiedLinks = 0;

  for (const event of events) {
    if (event.entryHash === null) {
      // Legacy, unhashed link. Cannot be checked; breaks the running linkage.
      previousEntryHash = null;
      continue;
    }

    const recomputed = hash(
      custodyPayload({
        prevHash: event.prevHash,
        evidenceId: event.evidenceId,
        action: event.action,
        actorUserId: event.actorUserId,
        actorEmail: event.actorEmail,
        ipAddress: event.ipAddress,
        notes: event.notes,
        occurredAt: event.occurredAt,
      }),
    );

    const hashMatches = recomputed === event.entryHash;
    const linkageMatches = previousEntryHash === null || event.prevHash === previousEntryHash;

    if (!hashMatches || !linkageMatches) {
      return {
        intact: false,
        length: events.length,
        verifiedLinks,
        brokenAtEventId: event.id,
      };
    }

    verifiedLinks += 1;
    previousEntryHash = event.entryHash;
  }

  return {
    intact: true,
    length: events.length,
    verifiedLinks,
    brokenAtEventId: null,
  };
}
