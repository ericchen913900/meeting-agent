import assert from "node:assert/strict";
import test from "node:test";
import { buildAutoReminderBatchKey, getAutoReminderPlan } from "../shared/autoReminder";
import type { ExtractedTask, MeetingInput } from "../shared/types";

const meeting: MeetingInput = {
  title: "Platform weekly",
  date: "2026-05-08",
  notes: "notes"
};

function task(overrides: Partial<ExtractedTask>): ExtractedTask {
  return {
    id: "task-1",
    title: "Follow up release blocker",
    description: "Follow up release blocker",
    sourceQuote: "Follow up release blocker",
    projectArea: "release",
    assigneeName: "Alice Chen",
    gitlabUsername: "alice",
    slackMention: "<@U_ALICE>",
    assigneeSource: "responsibility_table",
    assigneeReason: "Matched release responsibility",
    dueDate: "2026-05-08",
    labels: ["meeting-action"],
    confidence: 0.9,
    riskLevel: "low",
    riskReasons: [],
    dispatchState: "auto_ready",
    selected: true,
    ...overrides
  };
}

test("auto reminder does not run when disabled", () => {
  const plan = getAutoReminderPlan({
    settings: { enabled: false, reminderTime: "09:00", checkIntervalMinutes: 15 },
    meeting,
    tasks: [task({})],
    sentBatches: {},
    now: new Date("2026-05-08T10:00:00")
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.reason, "自動催繳未啟用");
});

test("auto reminder waits until the configured daily time", () => {
  const plan = getAutoReminderPlan({
    settings: { enabled: true, reminderTime: "09:30", checkIntervalMinutes: 15 },
    meeting,
    tasks: [task({})],
    sentBatches: {},
    now: new Date("2026-05-08T09:10:00")
  });

  assert.equal(plan.ready, false);
  assert.match(plan.reason, /尚未到每日催繳時間 09:30/);
});

test("auto reminder is ready after configured time when due tasks exist", () => {
  const plan = getAutoReminderPlan({
    settings: { enabled: true, reminderTime: "09:30", checkIntervalMinutes: 15 },
    meeting,
    tasks: [
      task({ id: "overdue", title: "Overdue", dueDate: "2026-05-07" }),
      task({ id: "today", title: "Today", dueDate: "2026-05-08" }),
      task({ id: "future", title: "Future", dueDate: "2026-05-10" })
    ],
    sentBatches: {},
    now: new Date("2026-05-08T10:00:00")
  });

  assert.equal(plan.ready, true);
  assert.deepEqual(
    plan.tasks.map((item) => item.title),
    ["Overdue", "Today"]
  );
  assert.equal(plan.today, "2026-05-08");
});

test("auto reminder suppresses a batch that was already sent today", () => {
  const dueTasks = [task({ id: "today", title: "Today", dueDate: "2026-05-08" })];
  const batchKey = buildAutoReminderBatchKey(meeting, dueTasks, "2026-05-08");
  const plan = getAutoReminderPlan({
    settings: { enabled: true, reminderTime: "09:00", checkIntervalMinutes: 15 },
    meeting,
    tasks: dueTasks,
    sentBatches: { [batchKey]: "2026-05-08T09:15:00.000Z" },
    now: new Date("2026-05-08T10:00:00")
  });

  assert.equal(plan.ready, false);
  assert.equal(plan.reason, "這批催繳今天已自動送過");
});
