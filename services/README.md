# services/

Background workers. None of them serve operator traffic — they exist so that
slow, bursty or failure-prone work never happens inside an HTTP request.

| Service          | Runtime | Responsibility                                                  |
| ---------------- | ------- | --------------------------------------------------------------- |
| `ai/`            | Python  | Inference gateway: risk scoring, tailing, duress, vision        |
| `notifications/` | Node    | Delivery across push, SMS, email, voice, with retry and backoff |
| `evidence/`      | Node    | Checksum verification, sealing, retention sweeps                |
| `telemetry/`     | Node    | Stream aggregation and hot-storage retention                    |

## Why these are separate processes

The API's job is to answer an operator in under 200 ms. Everything here
violates that in some way: an SMS gateway can take 30 seconds to time out, a
vision model can take 3 seconds per frame, and a retention sweep can hold a
table lock for minutes. Running any of it inline would make the console's
latency hostage to a third party's outage.

Splitting them also lets each scale on its own axis — telemetry scales with
fleet size, AI with incident rate, notifications with alert volume — and lets
`ai/` be Python, which is where the model tooling actually lives.

## Shared contract

The Node services import `@aegisdrive/types` and `@aegisdrive/shared`, so they
speak the same enums and RBAC vocabulary as the API. They talk to Postgres
through the same Prisma schema and coordinate through Redis.

**They do not import from `apps/api`.** A worker reaching into the API's module
tree would couple deployment of the two; where a worker needs API behaviour, it
calls the HTTP endpoint with a service token.

## Running

```bash
pnpm --filter @aegisdrive/telemetry-service run dev
pnpm --filter @aegisdrive/notifications-service run dev
pnpm --filter @aegisdrive/evidence-service run dev

cd services/ai && uv sync && uv run uvicorn app.main:app --reload
```
