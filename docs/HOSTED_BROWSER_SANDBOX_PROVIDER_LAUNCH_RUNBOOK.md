# Hosted Browser Sandbox Provider Launch Runbook

## Purpose

Phase 26 turns the hosted-provider proof chain into an operator launch checklist. It does not enable production hosted browser readiness by itself. The final `hosted_remote_browser_sandbox` score must remain `0 / 100` until a real selected provider passes private live proof, WebRTC signaling when required, visual/OCR replay, and human review.

## Launch Readiness Sequence

1. Copy `project/deployment/browser-sandbox-provider.launch-readiness.example.env` to a private path outside Git.
2. Fill the copied file from the selected provider secret manager. Do not commit provider endpoints, tokens, runtime config, screenshots, OCR text, SDP, ICE candidates, or visual proof manifests.
3. Point `WEFELLA_BROWSER_SANDBOX_PROVIDER_CONFIG_FILE` at a private runtime JSON using `adapter.mode=hosted_provider`.
4. Run `npm run sandbox:browser:provider-selection`.
5. Set `WEFELLA_BROWSER_SANDBOX_PROVIDER_SELECTION_READY=1` only after the selected provider key matches the approved candidate.
6. Run `npm run sandbox:browser:provider-live-preflight`. Enable `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_PREFLIGHT_PROBE=1` only after the private endpoint is approved for a live health probe.
7. Run `npm run sandbox:browser:provider-live-verification` against the real provider. The proof must cover create session, stream frame ref, screenshot ref, OCR/caption ref, takeover, approved input relay, offsite fail-closed, and teardown.
8. Run `npm run sandbox:browser:provider-webrtc-signaling` when the selected provider uses `webrtc` or `webrtc_or_sse_frames`. Raw SDP, ICE candidates, TURN/STUN credentials, endpoint URLs, and tokens must not appear in proof output.
9. Capture dashboard, mobile live-block, and OCR/caption proof as opaque refs in a private manifest outside Git.
10. Run `npm run sandbox:browser:provider-visual-ocr-replay`.
11. Run `npm run sandbox:browser:provider-launch-readiness`.
12. Set `WEFELLA_BROWSER_SANDBOX_PROVIDER_LAUNCH_READINESS_READY=1` only after the private proof chain is green and reviewed.
13. Run `npm run sandbox:browser:provider-private-launch-execution`.
14. Complete final human review outside Codex. Review the real provider run for session creation, live stream, screenshot/OCR refs, takeover, approved input relay, offsite fail-closed behavior, teardown, dashboard/mobile proof, and absence of raw endpoint/token/frame/OCR/SDP/ICE/credential/input leakage.
15. Set `WEFELLA_BROWSER_SANDBOX_PROVIDER_PRIVATE_LAUNCH_EXECUTION_READY=1` and `WEFELLA_BROWSER_SANDBOX_PROVIDER_FINAL_HUMAN_REVIEWED=1` only for the reviewed private execution.
16. Set `WEFELLA_BROWSER_SANDBOX_PROVIDER_LIVE_VERIFIED=1` and `adapter.providerLiveConnected=true` in the private runtime JSON only after final human approval.

## Safety Invariants

- Codex must not enter credentials, solve 2FA or captcha, submit forms, contact payers, or change account data.
- `interactive_takeover` remains human-only.
- The live worker block may show the user an approved remote browser session, but proof artifacts must use opaque refs and sanitized captions.
- Raw screenshots, raw OCR text, portal/member text, endpoint URLs, tokens, SDP, ICE candidates, local paths, and input values are rejected by the proof validators.
- A passing launch-readiness run is not the same as final hosted remote readiness unless the private launch execution gate, final human review, final live-verified switch, and private provider live-connected config are all present.

## Verification Commands

```bash
npm run sandbox:browser:provider-selection
npm run sandbox:browser:provider-live-preflight
npm run sandbox:browser:provider-live-verification
npm run sandbox:browser:provider-webrtc-signaling
npm run sandbox:browser:provider-visual-ocr-replay
npm run sandbox:browser:provider-launch-readiness
npm run sandbox:browser:provider-private-launch-execution
npm run test:docker:contract
```

After starting the local dashboard, open `/api/proof/runs/server-connector-next-mobile-mvp` and the operator dashboard. Confirm `hosted_browser_sandbox_provider_launch_readiness` is visible and that `hosted_remote_browser_sandbox` remains blocked until final live provider proof is complete.
