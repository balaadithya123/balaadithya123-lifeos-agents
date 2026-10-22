# LifeOS Agents

Independent Cloudflare Worker for LifeOS's specialist AI agents. This repository is separate from the main LifeOS application.

## Current capabilities

- Cloudflare Workers AI inference using `@cf/zai-org/glm-4.7-flash`
- Four specialist agents: Planner, Study (JEE), Radar (research/evaluation of supplied evidence), and Build (software implementation planning)
- Authenticated `POST /api/run` for one specialist
- Authenticated `POST /api/orchestrate` for up to four selected specialists with bounded text handoffs
- Optional session memory through a Cloudflare KV binding named `AGENT_MEMORY`; only used when a caller supplies `session_id` and explicitly sets `remember: true`
- Output extraction that strips reasoning fields, input validation, bounded context/output sizes, health/status endpoints, offline tests, and GitHub Actions validation
- Planning-only security boundary: no shell execution, repository writes, Telegram sends, live browsing, or deployments

## Endpoints

- `GET /health` — public health/configuration flags
- `GET /api/status` — bearer-authenticated runtime status
- `GET /api/agents` — bearer-authenticated agent catalogue
- `POST /api/run` — run one specialist
- `POST /api/orchestrate` — run one or more specialists in sequence

Every private endpoint requires `Authorization: Bearer <AGENT_API_KEY>`.

### Run one agent

```json
{
  "agent": "study",
  "task": "Create a revision plan for my next mock test",
  "context": "Optional syllabus, available hours, mistakes, or constraints",
  "session_id": "optional-session-id",
  "remember": false
}
```

### Orchestrate multiple agents

```json
{
  "task": "Plan and review a small software release",
  "agents": ["planner", "build", "radar"],
  "context": "Supply requirements and any evidence to evaluate",
  "session_id": "optional-session-id",
  "remember": false
}
```

Orchestration is sequential and bounded to four unique known agents. It passes only task/context and previous specialist outputs; it does not grant agents tools or execution permissions. Unknown IDs are ignored when at least one valid agent remains.

## Configure and deploy

The Worker name is `lifeos-agents`. Set a strong private API key as a Cloudflare Worker secret:

```bash
npx wrangler secret put AGENT_API_KEY
npx wrangler deploy
```

The LifeOS Telegram adapter must use the same private value in its `LIFEOS_AGENTS_API_KEY` secret. Never commit either secret.

### Optional persistent session memory

Create a KV namespace, then add its namespace ID to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "AGENT_MEMORY"
id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"
```

Without this binding, agent execution and orchestration still work; memory flags report unavailable and no memory is persisted. Session identifiers are sanitized and stored for 30 days. Use opaque session IDs rather than names, phone numbers, or other personal identifiers. Stored notes are short and bounded; do not send passwords, API keys, or sensitive personal information.

After configuring KV, redeploy the Worker. KV setup is optional and is not automatically provisioned by this repository.

## Local checks

Requires Node.js 22 or a recent Node.js release with built-in test runner:

```bash
npm test
npm run check
```

GitHub Actions runs both checks on pull requests and pushes to main/feature branches.

## Safety and limitations

- Agents return recommendations, not completed actions.
- `executed_actions` and `tool_calls` remain empty; no tool execution is implemented.
- Every response signals that approval is required before external actions.
- Radar has no live web access. It evaluates evidence included in the request only.
- Orchestration is not autonomous delegation to external services; it is bounded model-to-model text handoff.
- Add authenticated, allowlisted tool adapters, rate limiting, durable audit events, and idempotency checks before considering any write-capable tools.
- Workers AI quota and model availability depend on Cloudflare account limits and current product policy.

The main LifeOS Worker and Telegram webhook are not modified by this repository's code changes.
