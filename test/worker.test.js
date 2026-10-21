import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const call = (path, init = {}, env = {}) => worker.fetch(new Request(`https://example.test${path}`, init), env);

test("health is public and reports setup state", async () => {
  const response = await call("/health");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.service, "lifeos-agents");
  assert.equal(data.model, "@cf/zai-org/glm-4.7-flash");
  assert.deepEqual(data.agents, ["planner", "study", "radar", "build"]);
});

test("protected endpoints reject unauthenticated requests", async () => {
  assert.equal((await call("/api/status")).status, 401);
  assert.equal((await call("/api/run", { method: "POST", body: JSON.stringify({ agent: "planner", task: "plan" }) })).status, 401);
});

test("unknown routes return 404", async () => {
  assert.equal((await call("/unknown")).status, 404);
});

test("authenticated run rejects unknown agent", async () => {
  const response = await call("/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ agent: "shell", task: "do anything" })
  }, { AGENT_API_KEY: "test-key", AI: { run: async () => ({ response: "should not run" }) } });
  assert.equal(response.status, 400);
});

test("authenticated planner call uses AI and never reports side effects", async () => {
  let selectedModel = "";
  const response = await call("/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ agent: "planner", task: "Create a short plan" })
  }, {
    AGENT_API_KEY: "test-key",
    AI: { run: async (model) => { selectedModel = model; return { response: JSON.stringify({ summary: "plan", steps: [], risks: [], approval_required: true, next_action: "review" }) }; }
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(selectedModel, "@cf/zai-org/glm-4.7-flash");
  assert.equal(data.ok, true);
  assert.deepEqual(data.executed_actions, []);
  assert.equal(data.approval_required, true);
});

test("authenticated run requires a task", async () => {
  const response = await call("/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ agent: "study", task: "   " })
  }, { AGENT_API_KEY: "test-key", AI: { run: async () => ({ response: "should not run" }) } });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "task_required");
});

test("authenticated run validates JSON and provider configuration", async () => {
  const invalidJson = await call("/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: "{"
  }, { AGENT_API_KEY: "test-key", AI: { run: async () => ({ response: "unused" }) } });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error, "invalid_json");

  const missingProvider = await call("/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ agent: "study", task: "Plan a revision session" })
  }, { AGENT_API_KEY: "test-key" });
  assert.equal(missingProvider.status, 503);
  assert.equal((await missingProvider.json()).error, "provider_not_configured");
});

test("all four named agent roles can be invoked", async () => {
  for (const agent of ["planner", "study", "radar", "build"]) {
    const response = await call("/api/run", {
      method: "POST",
      headers: { authorization: "Bearer test-key", "content-type": "application/json" },
      body: JSON.stringify({ agent, task: "Create a safe, short plan" })
    }, {
      AGENT_API_KEY: "test-key",
      AI: { run: async () => ({ response: JSON.stringify({ summary: "ok", steps: [], risks: [], approval_required: true, next_action: "review" }) }) }
    });
    assert.equal(response.status, 200, agent);
    const data = await response.json();
    assert.equal(data.agent, agent);
    assert.equal(data.approval_required, true);
    assert.deepEqual(data.executed_actions, []);
  }
});
