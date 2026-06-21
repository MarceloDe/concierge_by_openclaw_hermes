# Product Memory Runbook

Brainstyworkers product memory is the runtime Graphiti/FalkorDB adapter, not Cortex. Cortex remains project memory for agents, implementation history, and decisions.

## Safety Posture

- Committed default: `BRAINSTY_PRODUCT_MEMORY_ADAPTER=disabled`.
- Startup posture: fail-soft. Product memory health is probed at boot, logged, and never required for server startup.
- PHI posture: no live retain/recall/probe/replay payloads are sent when `BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED` is unset.
- Raw episode posture: keep `GRAPHITI_STORE_RAW_EPISODES=0`.
- Episode content: safe workflow summaries, source-pointer refs, masked identifiers, and no raw portal text.

## Local Provisioning

1. Initialize the Graphiti submodule:

   ```bash
   git submodule update --init --recursive vendor/getzep-graphiti
   ```

2. Build the local Graphiti venv:

   ```bash
   python3 -m venv .venv-graphiti
   .venv-graphiti/bin/python -m pip install --upgrade pip setuptools wheel
   .venv-graphiti/bin/pip install -e "vendor/getzep-graphiti[falkordb]"
   .venv-graphiti/bin/pip install -r tools/graphiti/requirements-graphiti.txt
   ```

3. Start FalkorDB for local non-PHI proof:

   ```bash
   npm run graphiti:falkordb
   ```

## HIPAA-Boundary Enablement

Production candidate enablement is an operator environment choice, not a code default. FalkorDB must run inside the AWS/HIPAA boundary before any PHI-adjacent product-memory payloads are allowed.

Required env:

```bash
BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti
BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED=1
BRAINSTY_GRAPHITI_PYTHON=/opt/brainsty/graphiti/bin/python
GRAPHITI_BACKEND=falkordb
FALKORDB_HOST=<private in-boundary host>
FALKORDB_PORT=6379
GRAPHITI_GROUP_ID=<fresh group id for bedrock embeddings>
GRAPHITI_STORE_RAW_EPISODES=0
GRAPHITI_LLM_PROVIDER=bedrock
GRAPHITI_BEDROCK_REGION=us-east-1
GRAPHITI_BEDROCK_LLM_MODEL_ID=<approved Bedrock Claude model or inference profile>
GRAPHITI_BEDROCK_SMALL_MODEL_ID=<approved smaller Bedrock Claude model or inference profile>
GRAPHITI_BEDROCK_EMBED_MODEL_ID=amazon.titan-embed-text-v2:0
GRAPHITI_BEDROCK_EMBED_DIM=1024
```

Use the host IAM role or standard AWS credential chain. Do not commit AWS keys, model ARNs tied to an account, hostnames, tokens, FalkorDB credentials, or endpoint secrets.

## Embedding Dimension Rule

Switching from OpenAI embeddings to Bedrock/Titan changes the embedding model and may change vector semantics. Use a fresh `GRAPHITI_GROUP_ID` when Bedrock embeddings are enabled so Bedrock vectors do not mix with prior OpenAI-embedded data.

## Verification

Run:

```bash
npm run test:memory:bedrock
npm run test:docker:contract
npm run build
npm run test:local
```

Optional live local proof remains:

```bash
npm run graphiti:falkordb
BRAINSTY_PRODUCT_MEMORY_ADAPTER=graphiti \
BRAINSTY_PRODUCT_MEMORY_PHI_CLEARED=1 \
GRAPHITI_LLM_PROVIDER=openai \
npm run test:memory:graphiti
```

Do not run live Graphiti proof with PHI unless Bedrock and FalkorDB are confirmed inside the covered boundary and the clearance flag is deliberately set by the operator.
