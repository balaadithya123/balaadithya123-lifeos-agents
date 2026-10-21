import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = { AGENT_API_KEY: "test-key", AI: { run: async () => ({ response: '{"summary":"ok"}' }) } };

test("health endpoint is public and reports service configuration", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "lifeos-agents");
  assert.deepEqual(body.agents, ["planner", "study", "radar", "build"]);
});

test("agent list requires authentication", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/agents"), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("authenticated agent list returns all agents", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/agents", {
    headers: { authorization: "Bearer test-key" }
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).agents.length, 4);
});

test("unknown routes return JSON 404", async () => {
  const response = await worker.fetch(new Request("https://example.test/no-such-route"), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "not_found");
});

test("agent run rejects missing task", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ agent: "planner", task: "" })
  }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "task_required");
});
