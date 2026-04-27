import assert from "node:assert/strict";
import test from "node:test";
import { getIntegrationReadiness } from "../shared/readiness";

test("reports missing integration credentials before dispatch", () => {
  const readiness = getIntegrationReadiness({
    ai: { provider: "anthropic-messages", apiKey: "", baseUrl: "https://ai.example.test", model: "claude" },
    gitlab: { baseUrl: "https://gitlab.com", projectId: "", token: "" },
    slack: { channelId: "C123", token: "" }
  });

  assert.equal(readiness.ai.ready, false);
  assert.deepEqual(readiness.ai.missing, ["AI API Key"]);
  assert.equal(readiness.gitlab.ready, false);
  assert.deepEqual(readiness.gitlab.missing, ["Project ID/path", "GitLab Token"]);
  assert.equal(readiness.slack.ready, false);
  assert.deepEqual(readiness.slack.missing, ["Slack Bot Token"]);
});

test("marks integrations ready when required settings are present", () => {
  const readiness = getIntegrationReadiness({
    ai: { provider: "anthropic-messages", apiKey: "secret", baseUrl: "https://ai.example.test", model: "claude" },
    gitlab: { baseUrl: "https://gitlab.com", projectId: "group/project", token: "gitlab-token" },
    slack: { channelId: "C123", token: "xoxb-secret" }
  });

  assert.equal(readiness.ai.ready, true);
  assert.equal(readiness.gitlab.ready, true);
  assert.equal(readiness.slack.ready, true);
});
