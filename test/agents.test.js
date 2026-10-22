import test from "node:test";
import assert from "node:assert/strict";
import worker, { extractUserFacingOutput, stripReasoning } from "../src/index.js";

const API_KEY = "test-secret";
const env = (overrides = {}) => ({
  AGENT_API_KEY: API_KEY,
  AI: { async run(model, input) {
    assert.equal(model, "@cf/zai-org/glm-4.7-flash");
    const role = input.messages[0].content;
    const agent = role.match(/Specialist: (\w+)/)?.[1] || "Specialist";
    return { response: JSON.stringify({ summary: agent + " result", steps: ["Do the next step"], risks: [], approval_required: true, next_action: "Review" }) };
  } },
  ...overrides
});
const request = (path, { method = "GET", body, key = API_KEY } = {}) => new Request("https://unit.test" + path, {
  method,
  headers: { ...(key ? { authorization: "Bearer " + key } : {}), ...(body ? { "content-type": "application/json" } : {}) },
  body: body ? JSON.stringify(body) : undefined
});

test("health is public and reports available routes/capabilities", async () => {
  const response = await worker.fetch(request("/health"), env());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.version, "0.2.0");
  assert.ok(body.capabilities.includes("bounded-orchestration"));
});
test("private endpoints reject missing or wrong credentials", async () => {
  assert.equal((await worker.fetch(request("/api/agents", { key: "" }), env())).status, 401);
  assert.equal((await worker.fetch(request("/api/run", { method: "POST", key: "wrong", body: { agent: "planner", task: "plan" } }), env())).status, 401);
});
test("agent catalogue lists four specialist roles", async () => {
  const response = await worker.fetch(request("/api/agents"), env());
  const body = await response.json();
  assert.equal(body.agents.length, 4);
  assert.deepEqual(body.agents.map(a => a.id), ["planner", "study", "radar", "build"]);
});
test("run validates JSON, agent and task", async () => {
  assert.equal((await worker.fetch(new Request("https://unit.test/api/run", { method: "POST", headers: { authorization: "Bearer " + API_KEY }, body: "{" }), env())).status, 400);
  assert.equal((await worker.fetch(request("/api/run", { method: "POST", body: { agent: "nope", task: "x" } }), env())).status, 400);
  assert.equal((await worker.fetch(request("/api/run", { method: "POST", body: { agent: "planner", task: "  " } }), env())).status, 400);
});
test("run invokes specialist and marks execution as planning-only", async () => {
  const response = await worker.fetch(request("/api/run", { method: "POST", body: { agent: "study", task: "Plan revision" } }), env());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.agent, "study");
  assert.match(body.output, /Study result/);
  assert.deepEqual(body.executed_actions, []);
  assert.equal(body.approval_required, true);
});
test("orchestrator deduplicates agents and returns bounded handoff results", async () => {
  const response = await worker.fetch(request("/api/orchestrate", { method: "POST", body: { task: "Plan release", agents: ["planner", "build", "planner", "unknown"] } }), env());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.successful_agents, 2);
  assert.deepEqual(body.results.map(r => r.agent), ["planner", "build"]);
  assert.deepEqual(body.executed_actions, []);
});
test("orchestrator rejects empty task and unknown-only agent selection", async () => {
  assert.equal((await worker.fetch(request("/api/orchestrate", { method: "POST", body: { task: " " } }), env())).status, 400);
  assert.equal((await worker.fetch(request("/api/orchestrate", { method: "POST", body: { task: "x", agents: ["unknown"] } }), env())).status, 400);
});
test("missing AI binding returns a configuration error, not a false success", async () => {
  const response = await worker.fetch(request("/api/run", { method: "POST", body: { agent: "planner", task: "plan" } }), env({ AI: undefined }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "provider_not_configured");
});
test("reasoning fields are removed recursively", () => {
  assert.deepEqual(stripReasoning({ answer: "ok", reasoning_content: "secret", nested: { thinking: "secret", safe: true } }), { answer: "ok", nested: { safe: true } });
});
test("output extraction formats JSON and ignores reasoning", () => {
  const output = extractUserFacingOutput({ response: JSON.stringify({ summary: "Done", steps: ["One"], reasoning: "hidden", next_action: "Review" }) });
  assert.match(output, /Done/);
  assert.match(output, /1\. One/);
  assert.doesNotMatch(output, /hidden/);
});
