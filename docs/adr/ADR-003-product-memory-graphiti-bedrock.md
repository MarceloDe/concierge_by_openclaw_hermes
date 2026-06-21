# ADR-003: Product Memory Graphiti/Bedrock Posture

## Status

Accepted, 2026-06-21.

## Context

The project already has always-on operational memory through SQLite/Postgres plus LangGraph checkpointer state. The Graphiti/FalkorDB adapter is the product-memory layer for temporal retain/recall, but it must not become a hard startup dependency for a healthcare app.

The corrected product decision requires Graphiti to be MVP-ready and cleanly enable-able in the AWS HIPAA boundary while preserving safe local startup and disabled committed defaults.

## Decision

- Keep the committed code and compose default `BRAINSTY_PRODUCT_MEMORY_ADAPTER=disabled`.
- Keep Graphiti fail-soft: startup probes status and logs it, but the server continues when Graphiti, FalkorDB, Bedrock, or credentials are unavailable.
- Add `GRAPHITI_LLM_PROVIDER=bedrock` for HIPAA-bound operation through Amazon Bedrock, with the existing OpenAI path preserved for back-compat and local non-PHI proof.
- Add Bedrock LLM and embedding clients to the Python Graphiti bridge, using standard AWS credential resolution and env-selected model IDs.
- Keep FalkorDB inside the HIPAA boundary before live PHI enablement.
- Require `BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED=1` before retain/recall/probe/replay/suppress can send provider payloads while the adapter is enabled.
- Keep `GRAPHITI_STORE_RAW_EPISODES=0`, safe source-pointer summaries, identifier masking, outbound payload observation, and replay queue semantics.

## Consequences

The system can be deployed with product memory disabled, degraded, or fully enabled without changing code. Operators must explicitly confirm the boundary and set env to allow live product-memory traffic. Bedrock embeddings require a fresh `GRAPHITI_GROUP_ID` to avoid mixing vector dimensions or semantics with earlier OpenAI embedding groups.

## Verification

- `npm run test:memory:bedrock` proves the mocked Bedrock provider contract, configurable Python path, clearance gate, boot probe, and masking behavior.
- `npm run test:docker:contract` keeps compose disabled defaults and Graphiti runtime packaging under test.
