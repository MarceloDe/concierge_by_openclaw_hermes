# OpenClaw Runtime Alignment

Date: 2026-05-26

## Verification Result

Proceeding with a dedicated official OpenClaw profile is possible using the already installed OpenClaw CLI.

Local proof:

- Installed binary: `/opt/homebrew/bin/openclaw`
- Installed version: `OpenClaw 2026.5.4 (325df3e)`
- The CLI supports `--profile <name>`, which isolates state/config under `~/.openclaw-<name>`.
- `openclaw --profile brainstyworkers config file` resolves to `~/.openclaw-brainstyworkers/openclaw.json`.
- `openclaw --profile brainstyworkers config validate` currently reports the config file is missing, meaning the dedicated profile has not been initialized yet.

Official documentation alignment:

- OpenClaw profiles isolate state under `~/.openclaw-<name>`.
- OpenClaw agents are isolated by workspace, auth, and routing.
- OpenClaw skills can be installed from a local directory whose root contains `SKILL.md`.
- By default, skill installs target the active workspace `skills/` directory; `--agent <id>` can target a specific configured agent workspace.

## Contract Mapping

Current repo contract:

- Source skill path: `openclaw/skills/insurance-portal-browser`
- Official skill root compatibility: the directory contains `SKILL.md` at the root, with OpenClaw-style frontmatter.
- Repo validator metadata: `skill.json` defines Brainstyworkers-specific safety contract fields such as allowed workflows, required inputs, approval gates, fallback order, blocked actions, and output requirements.
- Current execution mode: proposal-only validation. No real OpenClaw worker execution occurs.

Official OpenClaw mapping:

- Profile: `brainstyworkers`
- State/config directory: `~/.openclaw-brainstyworkers`
- Active config file: `~/.openclaw-brainstyworkers/openclaw.json`
- Recommended agent id: `brainstyworkers-insurance-browser`
- Recommended workspace: `~/.openclaw-brainstyworkers/workspace-brainstyworkers`
- Recommended installed skill target: `~/.openclaw-brainstyworkers/workspace-brainstyworkers/skills/insurance-portal-browser`
- Recommended install source: local directory `openclaw/skills/insurance-portal-browser`

The repo `skill.json` remains the deterministic Brainstyworkers contract. The official OpenClaw worker sees the `SKILL.md` package and any supporting files copied into the agent workspace.

## Adapter Boundary

LangGraph remains the deterministic orchestrator:

- User/session identity
- Healthcare policy and approval gates
- Workflow routing
- Context packet assembly from database pointers and memory records
- OpenClaw task envelope creation
- Repo contract validation
- Proposal task and audit recording
- Final user response

OpenClaw becomes the adaptive worker layer only after approval:

- Runs through the installed official OpenClaw CLI/Gateway under `--profile brainstyworkers`
- Uses the dedicated agent workspace and visible workspace skills
- Executes only the validated read-only task envelope
- Returns source pointers, actions taken, approvals required, blockers, and audit references

No task should call the official OpenClaw worker unless the existing validator has produced a valid proposal and the user has approved the worker execution boundary.

## LangGraph-Owned Worker Job Contract

The project now makes the OpenClaw worker contract explicit before official worker execution:

- LangGraph creates a stable worker job id and correlation id.
- LangGraph assigns the target OpenClaw runtime profile, agent id, workspace, and skill key.
- LangGraph sets deterministic controls that forbid the worker from choosing workflows, creating subtasks, retaining memory, contacting payers, sending messages, submitting forms, entering credentials, or giving medical advice.
- LangGraph owns fan-out by creating worker jobs and parallel groups.
- LangGraph owns fan-in by collecting worker results by job id and correlation id before composing a response.
- OpenClaw returns only structured results, source pointers, actions taken, approvals required, and blockers.

Current implementation files:

- `src/concierge/openclawWorkerContract.mjs`
- `src/concierge/langgraphRunner.mjs`
- `src/concierge/openclawSkillInvocation.mjs`

This is the correction that prevents OpenClaw from becoming a second healthcare workflow orchestrator.

## Required Gate Preservation

The existing `openclaw_skill_invocation_proposal` gate must stay in front of the real worker adapter.

The gate remains responsible for:

- Blocking credential entry, SSN entry, passkeys, passwords, and 2FA handling.
- Blocking payer contact, external messages, form submission, uploads, payments, cancellations, record changes, prior authorization submission, denial appeal submission, and medical advice unless a later slice defines a specific explicit approval contract.
- Requiring `executionMode` to be explicit.
- Recording proposal and audit proof before any worker execution.
- Requiring `actionsTaken=[]` until the approved real worker adapter actually runs.

## Next Implementation Slice

The next slice should initialize, but not yet execute, the dedicated official OpenClaw profile:

1. Create or validate the `brainstyworkers` OpenClaw profile using the installed CLI.
2. Create the dedicated `brainstyworkers-insurance-browser` agent and workspace.
3. Install the local `insurance-portal-browser` skill into that workspace.
4. Add a repo adapter that can resolve the profile, workspace, agent id, and skill visibility without running a browser task.
5. Add API/UI proof that the official profile and skill are ready, while real worker execution remains approval-gated.

This uses the installed official OpenClaw stack without using the user's personal `~/.openclaw` profile, personal skills, personal channels, or personal memory.
