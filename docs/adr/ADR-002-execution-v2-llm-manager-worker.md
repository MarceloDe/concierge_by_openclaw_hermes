# ADR-002: Execution V2 LLM-Manager Worker

Date: 2026-06-21

## Status

Accepted as a separate v2 track, built behind flags and not enabled live.

## Context

The v1 execution spine is read-only and intentionally conservative. It must not be weakened in place: OpenClaw must not type credentials, handle authentication challenges, contact payers, send external messages, submit forms, or make account changes under the read-only mode.

The product still needs a future write-capable path for a supervised healthcare operations workflow. The locked decisions are:

1. Design and implement the write-capable model as a separate v2 track.
2. Use per-action human approval for every irreversible write.
3. Keep credentials, 2FA, OTP, captcha, passkeys, and password-manager use human-only.
4. Build behind flags and do not enable live in committed config.

## Decision

Add Execution V2 as an additive substrate:

- `BRAINSTY_WORKER_RUNTIME=deterministic` remains the committed default.
- `BRAINSTY_WORKER_RUNTIME=llm_manager` is a private/runtime-only mode.
- `WEFELLA_EXECUTION_WRITE_ENABLED=0` remains the committed default.
- The LLM-manager may propose actions, but irreversible actions are blocked unless a single-use, expiring approval token is bound to the exact task, session, user, workflow, action schema, and URL.
- The approved runtime mode is `approved_single_write_action_only`.
- The worker contract may grant form submission only per job and only with a bound write token. Credentials and payer contact stay hard false.
- Hosted browser provider values stay private, and committed provider config remains contract-only.

## Consequences

- The v1 read-only invariants remain test-pinned and unchanged.
- LLM intelligence can move into bounded planning without becoming an autonomous write actor.
- Every irreversible write attempt is auditable, including blocked attempts.
- Live enablement requires out-of-band compliance sign-off, private secrets, private provider configuration, and explicit flag flips.
- A code-only re-audit can distinguish the future v2 track from the currently enabled deterministic runtime.
