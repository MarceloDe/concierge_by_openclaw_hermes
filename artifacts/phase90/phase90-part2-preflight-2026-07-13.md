# Phase 90 Part 2 live preflight — 2026-07-13

Label: `external_blocked`

Command:

```text
set -a
source /Users/mfelix/projects/workerprototype_openclaw/.env.local
set +a
npm run preflight:phase90:part2
```

Runtime facts:

- Colima is running with the Docker runtime and the expected socket.
- Docker Engine answered with server version 29.2.1.
- `brainstyworkers-connector-postgres-1` is running and healthy on host port 55432.
- Aetna sandbox Patient Access `/metadata` returned HTTP 200 without member auth.
- The PostgreSQL LangGraph checkpointer reported durable restart survival with AES-256-GCM
  PHI-at-rest protection.
- Catalog seed v6 and the Phase 90 Part 2 processes are present; the commercial portal
  formulary process remains available as required.

External blockers proved by the preflight:

1. Aetna client-id, client-secret, test-member secret files, and callback URI are not
   configured. The developer-portal questionnaire was submitted and the application is
   under review; sandbox OAuth and EOB proof cannot run until credentials are issued.
2. The Stedi free test/mock API key is not configured. No BAA or production key is allowed
   before Phase 91 information-receiver/provider standing is confirmed.
3. The UM self-funded/TPA Patient Access scope answer is not recorded. An out-of-scope
   answer must produce a `portal_only` member-data rail.

Honest implementation state:

- `aetnaPatientAccess.mjs`, `pdexFormulary.mjs`, and `eligibility270.mjs` remain absent.
- They must not be created until the corresponding real runtime proof can execute in the
  same slice. No mock or scaffold connector is accepted.
- Phase 90 remains `in_progress`. Phase 93 remains `planned` and cannot begin until Phase
  90 lands.

Repository and runtime verification:

- `node --test src/tests/phase-ledger.test.mjs`: 5 passed, 0 failed. The ledger contains
  every phase from 83 through 96 and proves Phase 93 depends on 90, not 91 or 92.
- `npm run test:postgres:single-authority`: 3 passed, 0 failed against live PostgreSQL and
  Redis, including restart, deferred-pointer, approval, task, audit, Redis rebuild, and
  negative arms.
- `BRAINSTY_GRAPHITI_PYTHON=<installed-runtime> npm run test:memory:graphiti`: 2 passed,
  0 failed against real Graphiti/FalkorDB and OpenAI, including a temporal relationship
  fact and an uploaded-document source pointer recalled across sessions.
- `npm run build`: passed after initializing the pinned `vendor/getzep-graphiti` submodule.
- Protected-runtime `npm run test:local`: 447 total, 440 passed, 0 failed, 7 explicit
  live-data skips.
- `git diff --check`: passed before runtime verification and must be rerun at handoff.
