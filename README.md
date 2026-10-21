# LifeOS Agents

An independent agent runtime for LifeOS. It is intentionally separate from `balaadithya123/life-os`; repository integration will happen through authenticated APIs/webhooks after this project has its own Git repository and reviewed contracts.

## Current MVP

- Cloudflare Worker: `lifeos-agents`
- Hosted inference: Cloudflare Workers AI (`@cf/zai-org/glm-4.7-flash`)
- Roles: Planner, Study, Radar, Build
- Public health endpoint; authenticated status, agent-list and planning endpoint
- Planning-only: no shell execution, repository writes, Telegram sends, or deployments
- Owner approval required for any future side-effecting tool
- Basic offline tests and GitHub Actions validation workflow

## Endpoints

- `GET /health` — public health and configuration flags
- `GET /api/status` — bearer-authenticated runtime status
- `GET /api/agents` — bearer-authenticated agent catalogue
- `POST /api/run` — bearer-authenticated planning request; JSON body: `{ "agent": "planner", "task": "...", "context": "optional" }`

## Local checks

```bash
npm test
npm run check
```

## Deploy / configure

The Worker is deployed at `https://lifeos-agents.balaadithya74.workers.dev` with the Workers AI binding. Configure a random API key as a Worker secret before using authenticated endpoints:

```bash
npx wrangler secret put AGENT_API_KEY
npx wrangler deploy
```

Do not put the API key in source control. The existing LifeOS Worker and its Telegram webhook were not changed.

## Model choice

The source uses `@cf/zai-org/glm-4.7-flash`, Cloudflare's recommended fast model for multilingual tasks and tool-oriented agent workflows. Check the current Workers AI model catalog and pricing before switching models; some frontier models require paid billing. Workers AI's free allocation is currently 10,000 Neurons per day, after which the free plan stops serving requests until reset.

## Ollama decision

Do not make remote Ollama a dependency for the MVP. A persistent, dependable Ollama host that is free, requires no payment card, and remains online has not been verified. Temporary notebooks and sleeping demo spaces do not meet the always-on requirement. Use Workers AI for cloud inference; keep Ollama as an optional provider for a user-controlled local/private endpoint. Reconsider a remote Ollama endpoint only if a genuinely persistent no-card host is verified.

## Next integration steps

1. Configure `AGENT_API_KEY` as a Cloudflare Worker secret.
2. Add provider adapter interface and bounded retries/timeout/rate limits.
3. Add durable task/run persistence in a new namespace/database (do not reuse LifeOS production state by default).
4. Add Telegram and Handoff Hub adapters with allowlists, audit events, idempotency, and approval gates.
5. Add integration tests before connecting any write-capable tools.
