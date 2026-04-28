import assert from "node:assert/strict";
import test from "node:test";
import { formatSlackText, selectSlackTasks } from "../server/slack";
import type { ExtractedTask, SlackMessageRequest } from "../shared/types";

function task(overrides: Partial<ExtractedTask>): ExtractedTask {
  return {
    id: overrides.title?.toLowerCase().replace(/\s+/g, "-") ?? "task",
    title: "Task",
    description: "Task description",
    sourceQuote: "Meeting source quote",
    projectArea: "platform",
    assigneeName: "Alice Chen",
    gitlabUsername: "alice",
    slackMention: "<@U_ALICE>",
    assigneeSource: "responsibility_table",
    assigneeReason: "Matched platform responsibility",
    dueDate: "2026-05-08",
    labels: ["meeting-action"],
    confidence: 0.88,
    riskLevel: "low",
    riskReasons: [],
    dispatchState: "auto_ready",
    selected: true,
    ...overrides
  };
}

function request(overrides: Partial<SlackMessageRequest>): SlackMessageRequest {
  return {
    slack: { token: "xoxb-test", channelId: "C_TEST" },
    meeting: { title: "Enterprise rollout", date: "2026-05-06", notes: "notes" },
    tasks: [],
    mode: "dispatch_summary",
    today: "2026-05-08",
    ...overrides
  };
}

test("reminder mode selects only open tasks due by tomorrow", () => {
  const selected = selectSlackTasks(
    request({
      mode: "reminder",
      tasks: [
        task({ title: "Overdue", dueDate: "2026-05-07" }),
        task({ title: "Due today", dueDate: "2026-05-08" }),
        task({ title: "Due tomorrow", dueDate: "2026-05-09", selected: false, issueUrl: "https://gitlab/1" }),
        task({ title: "Future", dueDate: "2026-05-10" }),
        task({ title: "No due date", dueDate: "" }),
        task({ title: "Closed overdue", dueDate: "2026-05-07", issueStatus: "closed" })
      ]
    })
  );

  assert.deepEqual(
    selected.map((item) => item.title),
    ["Overdue", "Due today", "Due tomorrow"]
  );
});

test("auto dispatch sends low and medium auto-ready tasks that can reach Slack directly", () => {
  const selected = selectSlackTasks(
    request({
      mode: "auto_dispatch",
      tasks: [
        task({ title: "Ready low risk" }),
        task({ title: "Ready medium risk", riskLevel: "medium" }),
        task({ title: "Needs review", dispatchState: "needs_review" }),
        task({ title: "High risk", riskLevel: "high" }),
        task({ title: "Missing mention", slackMention: "" }),
        task({ title: "Manual unchecked", selected: false })
      ]
    })
  );

  assert.deepEqual(
    selected.map((item) => item.title),
    ["Ready low risk", "Ready medium risk"]
  );
});

test("reminder Slack copy explains due timing and excludes future work", () => {
  const text = formatSlackText(
    request({
      mode: "reminder",
      tasks: [
        task({ title: "Overdue", dueDate: "2026-05-07" }),
        task({ title: "Future", dueDate: "2026-05-10" })
      ]
    })
  );

  assert.match(text, /會議任務催辦/);
  assert.match(text, /Overdue/);
  assert.match(text, /逾期 1 天/);
  assert.doesNotMatch(text, /Future/);
});
