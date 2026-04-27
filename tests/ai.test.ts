import assert from "node:assert/strict";
import test from "node:test";
import { buildAnthropicMessagesRequest } from "../server/ai";
import type { AnalyzeRequest } from "../shared/types";

const request: AnalyzeRequest = {
  meeting: {
    title: "Weekly",
    date: "2026-04-27",
    notes: "Dashboard needs better status badges by Friday."
  },
  responsibilities: [
    {
      id: "front",
      name: "Alice Chen",
      gitlabUsername: "alice",
      slackMention: "<@U_ALICE>",
      role: "Frontend",
      modules: ["dashboard"],
      keywords: ["UI"]
    }
  ],
  ai: {
    provider: "anthropic-messages",
    apiKey: "secret",
    baseUrl: "https://ai.example.test",
    model: "claude-sonnet-4-5"
  },
  policy: {
    autoConfidenceThreshold: 0.78,
    requireDueDateForAutoDispatch: true
  }
};

test("builds Anthropic Messages request with request-scoped auth and forced extraction tool", () => {
  const built = buildAnthropicMessagesRequest(request);

  assert.equal(built.url, "https://ai.example.test/v1/messages");
  assert.equal(built.init.method, "POST");
  assert.equal((built.init.headers as Record<string, string>)["x-api-key"], "secret");
  assert.equal((built.init.headers as Record<string, string>)["anthropic-version"], "2023-06-01");

  const body = JSON.parse(String(built.init.body));
  assert.equal(body.model, "claude-sonnet-4-5");
  assert.equal(body.max_tokens, 4096);
  assert.match(body.system, /Meeting transcripts often do not directly say who owns each task/);
  assert.match(body.system, /If a person is explicitly assigned or a speaker self-commits/);
  assert.equal(body.messages[0].role, "user");
  assert.equal(body.tools[0].name, "record_meeting_tasks");
  assert.deepEqual(body.tool_choice, { type: "tool", name: "record_meeting_tasks" });
});
