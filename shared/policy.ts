import type {
  AiTaskCandidate,
  AssigneeSource,
  DispatchPolicy,
  ExtractedTask,
  ResponsibilityRow,
  RiskLevel
} from "./types";

const HIGH_RISK_TERMS = [
  "security",
  "\u8cc7\u5b89",
  "legal",
  "\u6cd5\u52d9",
  "compliance",
  "\u5408\u898f",
  "budget",
  "\u9810\u7b97",
  "contract",
  "\u5408\u7d04",
  "production incident",
  "\u7dda\u4e0a\u4e8b\u6545",
  "customer data",
  "\u5ba2\u6236\u8cc7\u6599",
  "data migration",
  "\u8cc7\u6599\u9077\u79fb",
  "payment",
  "\u4ed8\u6b3e",
  "cross-team",
  "\u8de8\u90e8\u9580",
  "\u8de8\u5718\u968a"
];

const MEDIUM_RISK_TERMS = [
  "blocking",
  "\u963b\u585e",
  "dependency",
  "\u4f9d\u8cf4",
  "urgent",
  "\u7dca\u6025"
];

const DOMAIN_RULES: Array<{
  area: string;
  label: string;
  terms: string[];
}> = [
  {
    area: "frontend",
    label: "frontend",
    terms: [
      "frontend",
      "react",
      "ui",
      "ux",
      "dashboard",
      "badge",
      "mobile",
      "\u524d\u7aef",
      "\u9801\u9762",
      "\u756b\u9762",
      "\u7ba1\u7406\u53f0",
      "\u624b\u6a5f\u7248",
      "\u5be9\u6838\u72c0\u614b"
    ]
  },
  {
    area: "backend",
    label: "backend",
    terms: [
      "backend",
      "api",
      "endpoint",
      "gitlab",
      "issue",
      "webhook",
      "token",
      "database",
      "server",
      "error",
      "fallback",
      "\u5f8c\u7aef",
      "\u4f3a\u670d\u5668",
      "\u8cc7\u6599\u5eab",
      "\u932f\u8aa4",
      "\u6574\u5408"
    ]
  },
  {
    area: "planning",
    label: "planning",
    terms: [
      "pm",
      "release",
      "schedule",
      "requirement",
      "risk",
      "slack",
      "announce",
      "\u9700\u6c42",
      "\u6392\u7a0b",
      "\u98a8\u96aa",
      "\u4e0a\u7dda",
      "\u516c\u544a",
      "\u8de8\u90e8\u9580",
      "\u8de8\u5718\u968a"
    ]
  },
  {
    area: "qa",
    label: "qa",
    terms: ["qa", "test", "testing", "\u6e2c\u8a66", "\u9a57\u6536", "\u56de\u6b78"]
  },
  {
    area: "devops",
    label: "devops",
    terms: ["devops", "deploy", "ci", "cd", "pipeline", "\u90e8\u7f72", "\u4e0a\u67b6"]
  }
];

const ACTION_HINTS = [
  "todo",
  "action",
  "follow up",
  "need",
  "needs",
  "must",
  "should",
  "fix",
  "review",
  "\u9700\u8981",
  "\u5fc5\u9808",
  "\u8981",
  "\u4fee",
  "\u78ba\u8a8d",
  "\u8ffd\u8e64",
  "\u8655\u7406",
  "\u5b8c\u6210",
  "\u88dc",
  "\u76e4\u9ede",
  "\u7d71\u4e00",
  "\u6574\u7406"
];

export const defaultPolicy: DispatchPolicy = {
  autoConfidenceThreshold: 0.78,
  requireDueDateForAutoDispatch: true
};

export function routeAndGradeTasks(
  candidates: AiTaskCandidate[],
  responsibilities: ResponsibilityRow[],
  policy: DispatchPolicy = defaultPolicy
): ExtractedTask[] {
  return candidates.map((candidate, index) => {
    const matchedOwner = matchResponsibility(candidate, responsibilities);
    const confidence = clampConfidence(
      matchedOwner ? Math.max(candidate.confidence, matchedOwner.score) : candidate.confidence
    );
    const risk = gradeRisk(candidate, matchedOwner?.row, confidence);
    const dueDateMissing = !candidate.dueDate;
    const ownerMissing = !matchedOwner;
    const needsReview = risk.level === "high" || ownerMissing || (policy.requireDueDateForAutoDispatch && dueDateMissing);

    return {
      id: `task-${Date.now()}-${index}`,
      title: candidate.title.trim(),
      description: candidate.description.trim(),
      sourceQuote: candidate.sourceQuote.trim(),
      projectArea: candidate.projectArea.trim(),
      assigneeName: matchedOwner?.row.name ?? candidate.suggestedOwner.trim(),
      gitlabUsername: matchedOwner?.row.gitlabUsername ?? "",
      slackMention: matchedOwner?.row.slackMention ?? "",
      assigneeSource: matchedOwner?.source ?? "unassigned",
      assigneeReason: matchedOwner?.reason ?? "未命中職責表",
      dueDate: candidate.dueDate.trim(),
      labels: normalizeLabels(candidate.labels),
      confidence,
      riskLevel: risk.level,
      riskReasons: [...new Set([...candidate.riskReasons, ...risk.reasons])],
      dispatchState: needsReview ? "needs_review" : "auto_ready",
      selected: !needsReview
    };
  });
}

export function matchResponsibility(
  candidate: AiTaskCandidate,
  responsibilities: ResponsibilityRow[]
): { row: ResponsibilityRow; score: number; source: AssigneeSource; reason: string } | undefined {
  const explicitOwner = findOwnerByAlias(candidate.suggestedOwner, responsibilities);
  if (explicitOwner) {
    return {
      row: explicitOwner,
      score: 0.98,
      source: "explicit_transcript",
      reason: `逐字稿明確提到 ${explicitOwner.name}`
    };
  }

  const haystack = normalizeText([
    candidate.title,
    candidate.description,
    candidate.projectArea,
    candidate.suggestedOwner,
    candidate.sourceQuote,
    candidate.labels.join(" ")
  ].join(" "));

  let best:
    | { row: ResponsibilityRow; score: number; source: AssigneeSource; reason: string }
    | undefined;

  for (const row of responsibilities) {
    let score = 0;
    const signals: string[] = [];
    const ownerNeedles = [row.name, row.gitlabUsername, row.slackMention].map(normalizeText);
    if (ownerNeedles.some((needle) => needle && haystack.includes(needle))) {
      score += 0.45;
      signals.push(`owner alias ${row.name}`);
    }

    for (const moduleName of row.modules) {
      const needle = normalizeText(moduleName);
      if (needle && haystack.includes(needle)) {
        score += 0.28;
        signals.push(`module ${moduleName}`);
      }
    }

    for (const keyword of row.keywords) {
      const needle = normalizeText(keyword);
      if (needle && haystack.includes(needle)) {
        score += 0.16;
        signals.push(`keyword ${keyword}`);
      }
    }

    const role = normalizeText(row.role);
    if (role && haystack.includes(role)) {
      score += 0.2;
      signals.push(`role ${row.role}`);
    }

    score = Math.min(score, 0.96);
    if (score > 0 && (!best || score > best.score)) {
      best = {
        row,
        score,
        source: "responsibility_table",
        reason: `職責表匹配：${signals.slice(0, 3).join(", ")}`
      };
    }
  }

  return best && best.score >= 0.22 ? best : undefined;
}

export function gradeRisk(
  candidate: AiTaskCandidate,
  owner: ResponsibilityRow | undefined,
  confidence: number
): { level: RiskLevel; reasons: string[] } {
  const text = normalizeText(
    `${candidate.title} ${candidate.description} ${candidate.projectArea} ${candidate.sourceQuote}`
  );
  const reasons: string[] = [];

  for (const term of HIGH_RISK_TERMS) {
    if (text.includes(normalizeText(term))) reasons.push(`High-risk keyword: ${term}`);
  }

  if (!owner) reasons.push("No responsibility-table owner matched");
  if (!candidate.dueDate) reasons.push("No due date detected");
  if (confidence < 0.65) reasons.push("Low assignment confidence");

  if (reasons.length > 0 || candidate.riskLevel === "high") {
    return { level: "high", reasons };
  }

  const mediumReasons = MEDIUM_RISK_TERMS.filter((term) => text.includes(normalizeText(term))).map(
    (term) => `Medium-risk keyword: ${term}`
  );

  if (mediumReasons.length > 0 || candidate.riskLevel === "medium" || confidence < 0.78) {
    return { level: "medium", reasons: mediumReasons };
  }

  return { level: "low", reasons: [] };
}

export function demoAnalyze(notes: string, meetingDate = ""): AiTaskCandidate[] {
  const segments = splitTranscript(notes);
  const candidates = segments
    .map((segment) => buildDemoCandidate(segment, meetingDate))
    .filter((candidate): candidate is AiTaskCandidate => Boolean(candidate));

  return candidates.slice(0, 12);
}

interface TranscriptSegment {
  raw: string;
  speaker: string;
  content: string;
}

function buildDemoCandidate(segment: TranscriptSegment, meetingDate: string): AiTaskCandidate | undefined {
  const line = segment.content;
  const domain = inferProjectArea(line);
  const dueDate = inferDueDate(line, meetingDate);
  const actionable = hasActionHint(line) || domain.area !== "general" || dueDate !== "";
  if (!actionable || isOnlyMeetingHeader(line)) return undefined;
  const suggestedOwner = inferSuggestedOwner(segment);

  const highRiskReasons = HIGH_RISK_TERMS.filter((term) =>
    normalizeText(line).includes(normalizeText(term))
  ).map((term) => `High-risk keyword: ${term}`);
  const riskLevel: RiskLevel = highRiskReasons.length > 0 ? "high" : domain.score >= 2 ? "low" : "medium";
  const confidence = domain.area === "general" ? 0.58 : dueDate ? 0.84 : 0.72;

  return {
    title: makeDemoTitle(line, domain.area),
    description: `Inferred from transcript discussion: ${line}`,
    sourceQuote: segment.raw,
    projectArea: domain.area,
    suggestedOwner,
    dueDate,
    labels: ["meeting-action", domain.label].filter(Boolean),
    confidence,
    riskLevel,
    riskReasons:
      highRiskReasons.length > 0
        ? highRiskReasons
        : [
            suggestedOwner
              ? "Owner explicitly mentioned in transcript"
              : "Owner inferred from responsibility table, not directly named in transcript"
          ]
  };
}

function splitTranscript(notes: string): TranscriptSegment[] {
  return notes
    .split(/\r?\n|[。]/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .map((raw) => {
      const speakerMatch = raw.match(/^([^:：]{1,32})[:：]\s*(.+)$/);
      return {
        raw,
        speaker: speakerMatch?.[1].trim() ?? "",
        content: speakerMatch?.[2].trim() ?? raw
      };
    })
    .filter((segment) => segment.raw.length >= 6 && segment.content.length >= 3);
}

function inferSuggestedOwner(segment: TranscriptSegment): string {
  if (segment.speaker && hasSelfCommitment(segment.content)) {
    return segment.speaker;
  }

  const englishAssigned = segment.raw.match(
    /\b([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,2})\s+(?:will|should|must|needs? to|is going to|can)\b/
  );
  if (englishAssigned) return englishAssigned[1].trim();

  const chineseAssigned = segment.raw.match(
    /(?:請|由|交給)\s*([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z\s]{1,20}?)(?:負責|追蹤|處理|完成|確認|補|整理)/
  );
  if (chineseAssigned) return chineseAssigned[1].trim();

  return "";
}

function hasSelfCommitment(text: string): boolean {
  return /\b(i will|i'll|i can|let me|i am going to)\b/i.test(text) || /我來|我會|我負責|我可以|交給我/.test(text);
}

function inferProjectArea(text: string): { area: string; label: string; score: number } {
  const normalized = normalizeText(text);
  let best = { area: "general", label: "general", score: 0 };

  for (const rule of DOMAIN_RULES) {
    const score = rule.terms.reduce(
      (total, term) => total + (normalized.includes(normalizeText(term)) ? 1 : 0),
      0
    );
    if (score > best.score) best = { area: rule.area, label: rule.label, score };
  }

  return best;
}

function inferDueDate(text: string, meetingDate: string): string {
  const exact = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (exact) return exact[1];

  const base = parseDate(meetingDate);
  if (!base) return "";

  if (text.includes("\u4eca\u5929")) return formatDate(base);
  if (text.includes("\u660e\u5929")) return formatDate(addDays(base, 1));

  const weekdayMatch = text.match(/(?:\u672c|\u9019|\u4e0b)?[\u9031\u5468]([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])/);
  const englishWeekdayMatch = text.match(/\b(this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (!weekdayMatch && !englishWeekdayMatch) return "";

  const target = weekdayMatch ? weekdayIndex(weekdayMatch[1]) : englishWeekdayIndex(englishWeekdayMatch?.[2] ?? "");
  if (target === undefined) return "";

  const isNextWeek = /(?:\u4e0b)[\u9031\u5468]/.test(text) || englishWeekdayMatch?.[1].toLowerCase() === "next";
  const baseDay = base.getDay();
  let delta = target - baseDay;
  if (isNextWeek) {
    delta = delta <= 0 ? delta + 7 : delta + 7;
  } else if (delta < 0) {
    delta += 7;
  }

  return formatDate(addDays(base, delta));
}

function hasActionHint(text: string): boolean {
  const normalized = normalizeText(text);
  return ACTION_HINTS.some((hint) => normalized.includes(normalizeText(hint)));
}

function isOnlyMeetingHeader(text: string): boolean {
  const normalized = normalizeText(text);
  return (
    /^\d{4}-\d{2}-\d{2}\s+/.test(text) &&
    /(meeting|weekly|transcript|\u6703\u8b70|\u9031\u6703|\u9010\u5b57\u7a3f)/.test(normalized) &&
    !hasActionHint(text)
  );
}

function makeDemoTitle(line: string, area: string): string {
  const cleaned = line.replace(/\s+/g, " ").trim();
  const prefix = area === "general" ? "Follow up" : `${area} follow up`;
  return cleaned.length <= 86 ? cleaned : `${prefix}: ${cleaned.slice(0, 72)}`;
}

function parseDate(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayIndex(value: string): number | undefined {
  const map: Record<string, number> = {
    "\u65e5": 0,
    "\u5929": 0,
    "\u4e00": 1,
    "\u4e8c": 2,
    "\u4e09": 3,
    "\u56db": 4,
    "\u4e94": 5,
    "\u516d": 6
  };
  return map[value];
}

function englishWeekdayIndex(value: string): number | undefined {
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  return map[value.toLowerCase()];
}

function normalizeLabels(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
}

function findOwnerByAlias(value: string, responsibilities: ResponsibilityRow[]): ResponsibilityRow | undefined {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return undefined;

  return responsibilities.find((row) =>
    ownerAliases(row).some((alias) => aliasMatches(normalizedValue, alias))
  );
}

function ownerAliases(row: ResponsibilityRow): string[] {
  const nameParts = row.name.split(/\s+/).filter(Boolean);
  return [row.name, nameParts[0] ?? "", row.gitlabUsername, row.slackMention]
    .map(normalizeText)
    .filter((value) => value.length >= 2);
}

function aliasMatches(value: string, alias: string): boolean {
  return value === alias || value.includes(alias) || alias.includes(value);
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
