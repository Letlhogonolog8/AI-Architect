# AEGISDRIVE AI — documentation

## Start here

| Document                                                                               | What it answers                                           |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [architecture/overview.md](architecture/overview.md)                                   | How the pieces fit together and why they are separate     |
| [architecture/rbac.md](architecture/rbac.md)                                           | Who can do what, and where that is enforced               |
| [architecture/evidence-chain-of-custody.md](architecture/evidence-chain-of-custody.md) | How an artefact stays admissible                          |
| [architecture/data-model.md](architecture/data-model.md)                               | The entities and the invariants they carry                |
| [api.md](api.md)                                                                       | Every endpoint, its permission and its shape              |
| [runbook.md](runbook.md)                                                               | Setup, common tasks, and what to do when something breaks |
| [deployment.md](deployment.md)                                                         | Production deployment, end to end — start here for Phase 12 |
| [postgres-optimization.md](postgres-optimization.md)                                   | Connection pooling, slow queries, autovacuum, partitioning |
| [redis-production.md](redis-production.md)                                             | What Redis holds, TLS/auth, why it needs no backup         |
| [backup-restore.md](backup-restore.md)                                                 | Postgres backup, restore procedure, recovery targets       |
| [security-hardening.md](security-hardening.md)                                         | Every security control and where it lives                  |
| [logging.md](logging.md)                                                               | Structured logging, correlation, aggregation                |
| [performance.md](performance.md)                                                       | Every performance lever and where it lives                  |

## Architecture decision records

ADRs record decisions that a reader could not infer from the code, together
with what was given up. They are immutable: a decision that turns out wrong
gets a new ADR that supersedes the old one, and the old one stays.

| ADR                                        | Decision                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| [0001](adr/0001-monorepo-structure.md)     | pnpm monorepo, and what happens to the legacy prototype                |
| [0002](adr/0002-prisma-over-drizzle.md)    | Prisma as the ORM for the new platform                                 |
| [0003](adr/0003-mobile-standalone.md)      | Mobile lives outside the workspace                                     |
| [0004](adr/0004-mapbox-deferred.md)        | Map architecture now, Mapbox integration later                         |
| [0005](adr/0005-no-synthetic-data.md)      | No fabricated data anywhere, including demos                           |
| [0006](adr/0006-authentication-model.md)   | Short access tokens with rotating, revocable refresh sessions          |
| [0007](adr/0007-biometric-identity.md)     | Biometric templates, LLR fusion, and why identity never immobilises    |
| [0008](adr/0008-behaviour-intelligence.md) | Cabin behaviour: measurement over emotion, and reporting the base rate |
| [0009](adr/0009-cabin-intelligence.md)     | Cabin perception: ambiguity as output, and who may watch a worker      |
| [0010](adr/0010-threat-decision-engine.md) | Competing hypotheses, two probabilities, and cost-weighted thresholds  |
| [0011](adr/0011-safecorridor-routing.md)   | Routing without redlining: segment hazard rates and measured detours   |

## The three rules everything else follows from

1. **The API is the only authorisation boundary.** Route guards in the web
   client and hidden buttons are UX. Every rule is enforced again server-side,
   on data the client cannot influence.

2. **Automated decisions must be attributable.** Every threat event carries the
   versioned model that produced it and its confidence. A decision that cannot
   be traced to a model version is not usable in an investigation, and this
   platform's decisions have legal consequences.

3. **Nothing is fabricated.** No seeded fleets, no demo incidents, no
   placeholder risk scores. See [ADR-0005](adr/0005-no-synthetic-data.md).
