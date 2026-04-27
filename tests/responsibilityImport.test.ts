import assert from "node:assert/strict";
import test from "node:test";
import { parseResponsibilityRecords } from "../shared/responsibilityImport";

test("maps Chinese XLSX headers into responsibility rows", () => {
  const result = parseResponsibilityRecords([
    {
      "姓名": "Alice Chen",
      "GitLab 帳號": "alice",
      "Slack Mention": "<@U_ALICE>",
      "職能": "Frontend",
      "負責模組": "dashboard, UI",
      "關鍵字": "React, 管理台",
      "備援人": "Bob Lin"
    }
  ]);

  assert.equal(result.warnings.length, 0);
  assert.deepEqual(result.rows, [
    {
      id: "import-alice-0",
      name: "Alice Chen",
      gitlabUsername: "alice",
      slackMention: "<@U_ALICE>",
      role: "Frontend",
      modules: ["dashboard", "UI"],
      keywords: ["React", "管理台"],
      backupName: "Bob Lin"
    }
  ]);
});

test("skips rows without name or gitlab username and reports warnings", () => {
  const result = parseResponsibilityRecords([
    { "姓名": "", "GitLab": "missing-name", "職能": "Backend" },
    { "姓名": "No GitLab", "GitLab": "", "職能": "QA" },
    { "姓名": "Bob Lin", "GitLab": "bob", "職能": "Backend", "模組": "API; GitLab" }
  ]);

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].gitlabUsername, "bob");
  assert.deepEqual(result.rows[0].modules, ["API", "GitLab"]);
  assert.match(result.warnings.join("\n"), /Row 1 skipped/);
  assert.match(result.warnings.join("\n"), /Row 2 skipped/);
});
