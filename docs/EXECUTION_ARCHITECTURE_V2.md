# Execution Architecture V2

Status: design and gated substrate only. Not enabled live.

Execution Architecture V2 introduces an LLM-manager worker track operated through OpenClaw while preserving the existing deterministic healthcare safety controls. It is additive: the v1 read-only execution mode remains unchanged, and all write behavior is off by default.

## Runtime Modes

| Mode | Flag | Committed default | Behavior |
| --- | --- | --- | --- |
| Deterministic | `BRAINSTY_WORKER_RUNTIME=deterministic` | yes | Current v1 behavior. No LLM-manager write planning. |
| LLM manager | `BRAINSTY_WORKER_RUNTIME=llm_manager` | no | LLM may propose actions, but irreversible actions must pass the single-action write approval gate. |
| Write execution | `WEFELLA_EXECUTION_WRITE_ENABLED=1` | no | Private enablement only after compliance sign-off and provider proof. |
| Kill switch | `BRAINSTY_EXECUTION_KILL_SWITCH=1` | off by default | Blocks Execution V2 write action runtime immediately. |

## Target Architecture

```text
LangGraph healthcare authority
  -> OpenClaw bounded worker assignment
  -> LLM-manager proposes a portal action
  -> deterministic action-schema normalization
  -> human approves exact action and exact URL
  -> single-use write token is consumed
  -> policy re-checks exact action/schema/url
  -> approved_single_write_action_only runtime
  -> audit event for attempt, block, authorization, and completion
```

Credentials, 2FA, OTP, passkeys, captcha, login screens, and password managers remain human-only through supervised takeover. The LLM-manager must never harvest, store, replay, or type credentials.

## Control Replacement Matrix

| V1 read-only invariant | V2 compensating control |
| --- | --- |
| Agent cannot submit forms. | Agent may submit only one schema-validated action bound to one consumed, single-use, expiring, human-approved write token. |
| Agent cannot perform irreversible portal actions. | Irreversible actions remain blocked unless the action schema digest, task, session, user, workflow, and exact URL match the token. |
| Agent cannot enter credentials. | Unchanged. Credentials/2FA/captcha/passkeys remain human-only via takeover. No write token can authorize credential entry. |
| Agent cannot contact payer. | Unchanged. Payer contact remains hard false in the worker contract and requires a separate future approval design. |
| Read-only approval token authorizes observation only. | Write approval token is a separate gate type with `approved_single_write_action_only`; read-only tokens cannot authorize writes. |
| OpenClaw worker cannot choose healthcare workflow. | Unchanged. LangGraph remains healthcare authority; OpenClaw/LLM-manager acts only inside an assigned task. |
| External write actions are globally blocked. | No global write boolean is introduced. Write capability is per-action, per-token, per-job, and off by default. |
| Hosted browser provider stays contract-only in Git. | Unchanged. Private provider runtime plus `WEFELLA_EXECUTION_WRITE_ENABLED=1` are required before any live write path can be attempted. |
| Audit proves read-only actions. | Audit now also records write attempts, blocked attempts, token consumption, authorization, and executor completion. |

## Threat Model

| Threat | Mitigation |
| --- | --- |
| Prompt injection from portal text tells the LLM to submit or bypass policy. | Portal text remains untrusted evidence. LLM output is only a proposal; deterministic policy and token binding decide execution. |
| Over-broad approval authorizes more than the human intended. | Approval binds exact action schema digest and exact target URL. One token authorizes one action only. |
| Token replay. | Approval tokens are single-use and store `consumedAt`; replay returns blocked and emits audit. |
| Wrong URL or wrong action. | Consumption checks task, session, user, workflow, target URL, and action-schema digest. Any mismatch blocks. |
| Credential leakage. | Worker contract keeps credential entry hard false; takeover remains human-only; no token type authorizes credentials. |
| Runaway LLM agent. | LLM-manager is behind `BRAINSTY_WORKER_RUNTIME=llm_manager`, kill-switchable, and cannot call the approved-write runtime without a valid token. |
| Live write enabled accidentally from committed config. | All committed examples keep `WEFELLA_EXECUTION_WRITE_ENABLED=0`; FastAPI status reports the write gate blocked by default. |

## Out-Of-Band Enablement Requirements

Live use is not enabled by this branch. A human operator must complete all of the following outside Git:

1. Compliance/legal sign-off for agent-assisted PHI writes.
2. Private browser-provider runtime JSON and secrets.
3. Confirmed hosted browser proof chain and final human review.
4. `BRAINSTY_WORKER_RUNTIME=llm_manager`.
5. `WEFELLA_EXECUTION_WRITE_ENABLED=1`.
6. Operational runbook for rollback and emergency kill switch.
