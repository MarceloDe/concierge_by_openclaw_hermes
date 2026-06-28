# Brainstyworkers AI Concierge — System Documentation Index

> Navigation-first documentation. Every page below was generated from a **real
> investigation** of the running system (live Postgres `information_schema`
> introspection, live Redis value capture, and direct reads of the source) — not
> from memory. JSON schema files are openable in **ToDiagram** alongside the
> Mermaid diagrams embedded in the markdown.

## Quick "where do I find…?" map

| I'm looking for… | Read this | Real code / table anchor |
| --- | --- | --- |
| The whole system, modules, classes, boot order, env/flags | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | `src/server/server.mjs`, `src/concierge/langgraphRunner.mjs` |
| LangGraph orchestrator nodes (12-node spine) | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | `langgraphRunner.mjs` (`*Node`, `runLangGraphOrchestration`) |
| Planner decision contract / response composer | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | `llmOrchestrationDecision.mjs`, `plannerResponseComposer.mjs` |
| Capability/process portfolio (catalog, ledger, resume, idempotency) | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md), [PEMS.md](./PEMS.md) | `capabilityCatalog.mjs`, `checkpointRunLedger.mjs`, `dispatchIdempotency.mjs` |
| Postgres tables, columns, FKs, ER diagram | [DATABASE_POSTGRES.md](./DATABASE_POSTGRES.md) | machine-readable: [db/postgres-schema.json](./db/postgres-schema.json) |
| Redis key namespaces + JSON value shapes | [DATABASE_REDIS.md](./DATABASE_REDIS.md) | machine-readable: [db/redis-keys.json](./db/redis-keys.json) |
| PEMS / continuous-learning loop (retain→promote→use→demote) | [PEMS.md](./PEMS.md) | `productMemory.mjs`, `capabilityCatalog.mjs`, `pems_*` tables |
| Live remote browser + facade (the `:8000` FastAPI) | [FACADE.md](./FACADE.md) | `project/api/main.py`, `src/userapp/api.ts` |
| Isolated environments (OpenClaw profile) + feature flags | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | `openclawRuntime.mjs`, `openclawOfficialRuntime.mjs` |

## The generated documentation set

- **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** — system-context + module/class Mermaid diagrams, a file→responsibility navigation table, boot sequence, the env-var catalog (names only), and the isolated-environment / feature-flag matrix.
- **[DATABASE_POSTGRES.md](./DATABASE_POSTGRES.md)** — the authoritative DB (74 tables, 948 columns), grouped into subsystems, with a Mermaid `erDiagram` and per-table dictionaries. Machine-readable: **[db/postgres-schema.json](./db/postgres-schema.json)** (real `information_schema` introspection).
- **[DATABASE_REDIS.md](./DATABASE_REDIS.md)** — the 7 fast-runtime Redis namespaces, their real JSON value shapes, writers/readers/TTLs, and the cross-turn hydration map. Machine-readable: **[db/redis-keys.json](./db/redis-keys.json)**.
- **[PEMS.md](./PEMS.md)** — the continuous-learning / procedural-episodic memory subsystem: the loop diagram, the function map, the PEMS tables, and the PHI-safety model (Graphiti bridge + FalkorDB, gated off by default).
- **[FACADE.md](./FACADE.md)** — the FastAPI facade (`:8000`) that brokers Steel remote-browser sessions + user takeover login, its endpoints, the topology, and the live-portal sequence.

## How this was produced (provenance)
- **Postgres**: a real Postgres 16 was initialized via `PostgresStore.initialize()` (applies `SCHEMA_SQL` + `COLUMN_MIGRATIONS`) and introspected through `information_schema` → `db/postgres-schema.json`.
- **Redis**: live values were captured from the running cache (`127.0.0.1:6381`) per namespace → shapes in `db/redis-keys.json`.
- **Code / Facade / PEMS**: authored by reading the actual source files (cited inline), not from memory.

## Opening the visual database
- **Mermaid**: rendered inline on GitHub, or paste any ```mermaid block into ToDiagram.
- **JSON schema**: open `db/postgres-schema.json` and `db/redis-keys.json` directly in ToDiagram for the visual data dictionary.
