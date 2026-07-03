# Phase 89 ENTRY GATE — first unauthenticated MRF fetch (VERIFIED LIVE)

Plan §9 MRF row / §11 Phase 89 entry gate. Retrieval date: 2026-07-03 (21:10 UTC).
The previously UNVERIFIED external claim ("fetch latest_metadata.json per pinned brand
code from the public mrf.healthsparq.com egress bucket") is now VERIFIED by a real,
unauthenticated fetch — no auth header, no cookie, plain curl.

## Probe chain (as the plan prescribes: start at the Aetna publication points, record
## whichever host actually serves the files)

1. https://transparency.aetna.com/ — HTTP/2 200 (text/html; the TiC landing page)
2. https://health1.aetna.com/app/public/ — HTTP/1.1 200 (text/html; the MRF portal app shell)
3. **https://mrf.healthsparq.com/aetnacvs-egress.nophi.kyruushsq.com/prd/mrf/AETNACVS_I/ALICSI/latest_metadata.json**
   - HTTP/2 200, content-type: text/plain, UNAUTHENTICATED
   - sha256(latest_metadata.json) = 8cd92b0fafef2c0547e6ea76b904bfa634c6e78ac5eb1aafa3ee57cc83cc0a24
   - bytes = 7068263
   - files[] entries = 12030
   - reportingEntityName: "Aetna Life Insurance Company"
   - reportingEntityType: "Third Party Administrator_70287"
   - lastUpdatedOn (first entry): 2026-07-05 (current monthly cycle)

## Response headers (probe 3, recorded verbatim)

```
HTTP/2 200 
date: Fri, 03 Jul 2026 21:10:21 GMT
content-type: text/plain
content-length: 7068263
vary: Accept-Encoding
server: BunnyCDN-IL1-1348
cdn-pullzone: 726872
cdn-requestcountrycode: US
vary: Accept-Encoding
access-control-allow-origin: *
access-control-allow-headers: Server, x-goog-meta-frames, Content-Length, Content-Type, Range, X-Requested-With, If-Modified-Since, If-None-Match
access-control-expose-headers: Server, x-goog-meta-frames, Content-Length, Content-Type, Range, X-Requested-With, If-Modified-Since, If-None-Match
accept-ranges: bytes
cache-control: public, max-age=0
etag: "fc16c336baf043d80df93901fc682ae7"
```

## Verdict

ENTRY GATE: **PASS** — the bucket serves the metadata unauthenticated; the pinned
brand-code pattern (insurerCode AETNACVS_I, brandCode ALICSI) resolves. The MRF arm
proceeds; `external_blocked` is NOT triggered. Brand-code pinning for the UM/Miami
slice happens in the pipeline config; rate-limit posture: none observed on the
metadata fetch (single request; the pipeline still ships backoff + cache per plan).
