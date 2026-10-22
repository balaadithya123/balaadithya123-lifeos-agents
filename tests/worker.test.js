import test from "node:test";
import assert from "node:assert/strict";
import worker, { extractUserFacingOutput, stripReasoning } from "../src/index.js";

const env = { AGENT_API_KEY: "test-key", AI: { run: async () => ({ response: '{"summary":"ok","steps":["a"],"approval_required":true}' }) } };

test("health endpoint is public and reports service configuration", async () => {
  const response = await worker.fetch(new Request("https://example.test/health"), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.service, "lifeos-agents");
  assert.equal(body.version, "0.1.3");
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

test("agent run returns concise output without reasoning fields", async () => {
  const leakyEnv = {
    AGENT_API_KEY: "test-key",
    AI: {
      run: async () => ({
        response: '{"summary":"Ship the brief","steps":["Draft","Review"],"approval_required":true}',
        reasoning: "I thought about priorities for a long time...",
        reasoning_content: "internal chain of thought that must never reach Telegram"
      })
    }
  };
  const response = await worker.fetch(new Request("https://example.test/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ agent: "planner", task: "prioritize morning" })
  }), leakyEnv);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.match(body.output, /Ship the brief/);
  assert.doesNotMatch(body.output, /reasoning|chain of thought|thought about priorities/i);
  assert.equal(body.executed_actions.length, 0);
  assert.equal(body.tool_calls.length, 0);
  assert.equal(typeof body.duration_ms, "number");
  assert.ok(body.duration_ms >= 0);
  const dumped = JSON.stringify(body);
  assert.doesNotMatch(dumped, /chain of thought|thought about priorities/i);
});

test("extractUserFacingOutput never dumps raw reasoning via JSON.stringify fallback", () => {
  const raw = {
    reasoning: "SECRET_REASONING",
    reasoning_content: "SECRET_CONTENT",
    thinking: "SECRET_THINK"
  };
  const out = extractUserFacingOutput(raw);
  assert.equal(out, "");
  assert.doesNotMatch(out, /SECRET/);
});

test("extractUserFacingOutput prefers response and formats JSON plan", () => {
  const out = extractUserFacingOutput({
    response: JSON.stringify({ summary: "Do X", steps: ["one", "two"], risks: ["y"], next_action: "wait" }),
    reasoning: "ignore me"
  });
  assert.match(out, /Do X/);
  assert.match(out, /1\. one/);
  assert.match(out, /2\. two/);
  assert.doesNotMatch(out, /ignore me/);
});

test("stripReasoning removes nested reasoning keys", () => {
  const cleaned = stripReasoning({ a: 1, reasoning: "x", nested: { thinking: "y", b: 2 } });
  assert.deepEqual(cleaned, { a: 1, nested: { b: 2 } });
});

test("inference timeout is reported with layer and duration", async () => {
  const slowEnv = {
    AGENT_API_KEY: "test-key",
    AI: { run: async () => { throw new Error("AI request timed out after 30000ms"); } }
  };
  const response = await worker.fetch(new Request("https://example.test/api/run", {
    method: "POST",
    headers: { authorization: "Bearer test-key", "content-type": "application/json" },
    body: JSON.stringify({ agent: "study", task: "long task" })
  }), slowEnv);
  assert.equal(response.status, 504);
  const body = await response.json();
  assert.equal(body.error, "timeout");
  assert.equal(body.layer, "agents-worker");
  assert.equal(typeof body.duration_ms, "number");
});

test("extractUserFacingOutput parses fenced JSON into concise text", () => {
  const out = extractUserFacingOutput({
    response: '```json\n{"summary":"Prioritize today","steps":[{"action":"Capture","description":"List tasks"},{"action":"Select","description":"Pick top three"}],"reasoning":"must not leak"}\n```',
    reasoning: "outer reasoning must not leak"
  });
  assert.match(out, /Prioritize today/);
  assert.match(out, /1\. Capture/);
  assert.match(out, /2\. Select/);
  assert.doesNotMatch(out, /```|reasoning|must not leak/i);
});
