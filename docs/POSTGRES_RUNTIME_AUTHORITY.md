# PostgreSQL Runtime Authority

Status: binding runtime architecture as of 2026-07-12.

## Ownership

| Layer | Authoritative data | Prohibited role |
|---|---|---|
| PostgreSQL | Sessions, agent state, encrypted LangGraph checkpoints and pending writes, context packets, source/deferred pointers, approval gates, tasks, audit events | No alternate runtime database or file checkpointer |
| Redis | Rebuildable caches and mirrors | No source-of-truth session, workflow, approval, task, pointer, or audit state |
| Zep Graphiti on FalkorDB | Long-term temporal facts and relationships | No live workflow/checkpoint/session authority |
| OpenClaw | Bounded worker execution state and read-only context projection | No independent product-memory authority |

The application store and LangGraph checkpointer resolve the same secret-backed database URL and share one process-global `PostgresStore`/pool. A connection-authority hash prevents the URL from changing after process initialization. The runtime rejects non-PostgreSQL database drivers and non-PostgreSQL checkpointer modes.

Deferred pointers are dereferenced only through PostgreSQL. Missing rows and missing backing artifacts are classified failures; no caller receives an empty value that could be mistaken for verified evidence.

## Runtime acceptance

The binding proof is:

```bash
npm run test:postgres:single-authority
```

It creates a real temporary database on the live PostgreSQL server, uses a secret file rather than an injected store, and proves:

1. the app and LangGraph checkpointer use the exact same store;
2. an encrypted interrupt resumes after the pool is closed and recreated;
3. sessions, context packets, pointers, approvals, tasks, audit events, and RAG chunks exist in PostgreSQL;
4. a real deferred pointer resolves to its backing extraction artifact;
5. a nonexistent pointer fails loudly;
6. deleting the Redis mirror causes a rebuild from PostgreSQL;
7. OpenClaw cannot write independent product memory.

The proof requires live PostgreSQL, Redis, and OpenAI embedding access. A skip is not acceptance.
