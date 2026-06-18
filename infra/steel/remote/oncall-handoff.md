# Steel Remote On-Call Handoff

Use this template for remote Steel incidents. Do not paste hostnames, IP addresses, account IDs, private keys, tokens, raw screenshots, raw OCR text, raw frames, or input values into the handoff.

```text
Incident:
Started:
Current user impact:
Remote host option:
Latest accepted lifecycle artifact:
Current compose digest set:
TLS status:
Firewall status:
WireGuard/CDP status:
Recent recovery events:
Recent backup/restore drill event:
Health alerts firing:
PHI/raw-content exposure observed: no/yes
Human takeover boundary intact: yes/no
Agent credential entry observed: no/yes
External/write action observed: no/yes
Actions already taken:
Next recommended action:
Rollback needed: yes/no
```

Required closure evidence:

- `npm run sandbox:browser:steel-remote-readiness` pass/fail
- `npm run sandbox:browser:steel-ops-drills` pass/fail
- dashboard proof artifact ref
- confirmation that `requiresHumanTakeoverApproval` remained true
- confirmation that raw frames, screenshots, OCR text, and input values were not persisted
