import type { ResponsibilityRow } from "./types";

type RawRecord = Record<string, unknown>;

interface ParseResult {
  rows: ResponsibilityRow[];
  warnings: string[];
}

const HEADER_ALIASES = {
  name: ["name", "姓名", "人員", "成員", "owner", "負責人"],
  gitlabUsername: ["gitlabusername", "gitlab username", "gitlab", "gitlab 帳號", "gitlab帳號"],
  gitlabUserId: ["gitlabuserid", "gitlab user id", "gitlab id", "gitlab userid"],
  slackMention: ["slackmention", "slack mention", "slack", "slack id", "slack user", "slack 帳號"],
  role: ["role", "職能", "角色", "部門", "team", "function"],
  modules: ["modules", "module", "負責模組", "模組", "系統", "服務"],
  keywords: ["keywords", "keyword", "關鍵字", "關鍵詞", "技能", "tags"],
  backupName: ["backupname", "backup", "備援人", "備援", "代理人"]
} as const;

export function parseResponsibilityRecords(records: RawRecord[]): ParseResult {
  const warnings: string[] = [];
  const rows: ResponsibilityRow[] = [];

  records.forEach((record, index) => {
    const get = createRecordGetter(record);
    const name = get("name");
    const gitlabUsername = normalizeGitLabUsername(get("gitlabUsername"));

    if (!name || !gitlabUsername) {
      warnings.push(`Row ${index + 1} skipped: name and GitLab username are required.`);
      return;
    }

    const gitlabUserId = parseOptionalNumber(get("gitlabUserId"));
    rows.push({
      id: `import-${slugify(gitlabUsername || name)}-${rows.length}`,
      name,
      gitlabUsername,
      ...(gitlabUserId ? { gitlabUserId } : {}),
      slackMention: get("slackMention"),
      role: get("role"),
      modules: splitList(get("modules")),
      keywords: splitList(get("keywords")),
      backupName: get("backupName") || undefined
    });
  });

  return { rows, warnings };
}

function createRecordGetter(record: RawRecord): (field: keyof typeof HEADER_ALIASES) => string {
  const normalizedEntries = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    normalizedEntries.set(normalizeHeader(key), value);
  }

  return (field) => {
    for (const alias of HEADER_ALIASES[field]) {
      const value = normalizedEntries.get(normalizeHeader(alias));
      if (value !== undefined && value !== null) return String(value).trim();
    }
    return "";
  };
}

function splitList(value: string): string[] {
  return value
    .split(/[,;；、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeGitLabUsername(value: string): string {
  return value.trim().replace(/^@/, "");
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "row"
  );
}
