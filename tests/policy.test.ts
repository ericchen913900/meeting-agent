import assert from "node:assert/strict";
import test from "node:test";
import { demoAnalyze, routeAndGradeTasks } from "../shared/policy";
import type { AiTaskCandidate, ResponsibilityRow } from "../shared/types";

const responsibilities: ResponsibilityRow[] = [
  {
    id: "front",
    name: "Alice Chen",
    gitlabUsername: "alice",
    gitlabUserId: 101,
    slackMention: "<@U_ALICE>",
    role: "Frontend",
    modules: ["frontend", "dashboard", "UI"],
    keywords: ["React", "\u9801\u9762", "\u7ba1\u7406\u53f0"]
  },
  {
    id: "back",
    name: "Bob Lin",
    gitlabUsername: "bob",
    gitlabUserId: 102,
    slackMention: "<@U_BOB>",
    role: "Backend",
    modules: ["backend", "API", "GitLab"],
    keywords: ["Express", "issue", "\u6574\u5408"]
  },
  {
    id: "pm",
    name: "Carol Wu",
    gitlabUsername: "carol",
    gitlabUserId: 103,
    slackMention: "<@U_CAROL>",
    role: "PM",
    modules: ["planning", "release", "requirement"],
    keywords: ["\u9700\u6c42", "\u6392\u7a0b", "\u8de8\u90e8\u9580"]
  }
];

function candidate(overrides: Partial<AiTaskCandidate>): AiTaskCandidate {
  return {
    title: "Build dashboard UI",
    description: "Alice should finish the React dashboard by 2026-05-01",
    sourceQuote: "Alice finish dashboard UI 2026-05-01",
    projectArea: "frontend",
    suggestedOwner: "Alice",
    dueDate: "2026-05-01",
    labels: ["meeting-action", "frontend"],
    confidence: 0.82,
    riskLevel: "low",
    riskReasons: [],
    ...overrides
  };
}

test("low-risk task with owner and due date is auto-ready", () => {
  const [task] = routeAndGradeTasks([candidate({})], responsibilities);

  assert.equal(task.dispatchState, "auto_ready");
  assert.equal(task.selected, true);
  assert.equal(task.gitlabUsername, "alice");
  assert.equal(task.riskLevel, "low");
});

test("implicit transcript task routes by project area without explicit owner", () => {
  const [task] = routeAndGradeTasks(
    [
      candidate({
        title: "Dashboard review status needs badges and issue links",
        description: "Transcript says the dashboard review status is unclear and needs UI badges.",
        sourceQuote: "Dashboard review status is unclear; add badges and issue links by 2026-05-01.",
        projectArea: "frontend",
        suggestedOwner: "",
        dueDate: "2026-05-01",
        confidence: 0.84
      })
    ],
    responsibilities
  );

  assert.equal(task.dispatchState, "auto_ready");
  assert.equal(task.assigneeName, "Alice Chen");
  assert.equal(task.gitlabUsername, "alice");
});

test("explicitly mentioned owner wins over project-area routing", () => {
  const [task] = routeAndGradeTasks(
    [
      candidate({
        title: "Unify GitLab API error response format",
        description: "Alice Chen needs to define a shared GitLab API error response format.",
        sourceQuote: "Alice Chen needs to unify GitLab API error responses by next Wednesday.",
        projectArea: "backend",
        suggestedOwner: "Alice Chen",
        dueDate: "2026-05-07",
        confidence: 0.86
      })
    ],
    responsibilities
  );

  assert.equal(task.assigneeName, "Alice Chen");
  assert.equal(task.gitlabUsername, "alice");
});

test("demo parser treats a speaker self-commitment as the mentioned owner", () => {
  const tasks = routeAndGradeTasks(
    demoAnalyze("Alice Chen: I will unify GitLab API error responses by next Wednesday.", "2026-04-27"),
    responsibilities
  );

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].assigneeName, "Alice Chen");
  assert.equal(tasks[0].gitlabUsername, "alice");
  assert.match(tasks[0].sourceQuote, /Alice Chen/);
});

test("missing due date requires review", () => {
  const [task] = routeAndGradeTasks([candidate({ dueDate: "" })], responsibilities);

  assert.equal(task.dispatchState, "needs_review");
  assert.equal(task.selected, false);
  assert.equal(task.riskLevel, "high");
  assert.match(task.riskReasons.join(" "), /No due date/);
});

test("high-risk wording requires review even with a matched owner", () => {
  const [task] = routeAndGradeTasks(
    [
      candidate({
        title: "Review customer data migration",
        description: "Bob needs to review customer data migration risk by 2026-05-02",
        sourceQuote: "Bob review customer data migration 2026-05-02",
        projectArea: "backend",
        suggestedOwner: "Bob",
        dueDate: "2026-05-02",
        labels: ["meeting-action", "backend"],
        confidence: 0.9
      })
    ],
    responsibilities
  );

  assert.equal(task.dispatchState, "needs_review");
  assert.equal(task.gitlabUsername, "bob");
  assert.equal(task.riskLevel, "high");
});

test("demo parser extracts tasks from transcript without named assignees", () => {
  const tasks = routeAndGradeTasks(
    demoAnalyze(
      [
        "PM: Dashboard review status is too hard to scan; add badges and issue links by this Friday.",
        "Engineer: GitLab API error responses need one consistent format by next Wednesday.",
        "Lead: Release risk across teams needs a plan by 2026-05-08."
      ].join("\n"),
      "2026-04-27"
    ),
    responsibilities
  );

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].gitlabUsername, "alice");
  assert.equal(tasks[1].gitlabUsername, "bob");
  assert.equal(tasks[2].gitlabUsername, "carol");
});
