# Cross-version pending-interrupt resume — recorded transcript (2026-07-03)

Arm (plan §11 Phase 88): a pending read-only approval interrupt created under
PRE-Phase-88 code (git worktree at origin/main = Phase 87, commit 323406f) in FILE
checkpointer mode, resumed under Phase 88 code via the SAME Command.resume path.

WRITER (Phase 87 worktree; scripts committed alongside this transcript):
{"outcome":"approval_pending_interrupt","interruptType":"read_only_observation_approval","sessionId":"session_a7466df0-3a7e-4c1a-b9ed-e85b5ded85a8","userId":"user_0d8204ac-50b1-4fb4-8859-99ef9ed35f93","taskId":"task_381fe735-c965-4ed3-b967-325d5bf2002c","approvalToken":"approval_20a7ef55-9222-4d39-9f03-78cd3bdedcf4"}

READER (Phase 88 current tree, same encrypted checkpoint file + SQLite):
{"resumedOutcome":"openclaw_skill_proposal_prepared","approvalResume":"approved_consumed","interruptStatus":"resumed","evidenceStatus":"blocked_live_portal_verification_failed"}

VERDICT: PASS — the pre-pivot interrupt resumed cross-version: the token consumed
exactly once, the interrupted node completed, and the run continued through the
Phase 88 kind-aware topology (the new channels hydrate null; the kind-null return
edge routes to observe_evidence exactly as the old fixed edge did). evidenceStatus is
the honest classified no-live-portal state, not a strand. The founder-#17 drain rule
therefore stays a fallback only; the cross-version arm passes outright.
