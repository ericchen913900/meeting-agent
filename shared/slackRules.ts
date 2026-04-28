import type { ExtractedTask, SlackMessageRequest } from "./types";

export type DueTiming = "overdue" | "today" | "tomorrow" | "future" | "no_due";

const DAY_MS = 24 * 60 * 60 * 1000;

export function selectSlackTasks(request: SlackMessageRequest): ExtractedTask[] {
  if (request.mode === "auto_dispatch") {
    return request.tasks.filter(canDirectDispatchToSlack);
  }

  if (request.mode === "reminder") {
    const today = request.today ?? localIsoDate();
    return request.tasks.filter((task) => shouldRemindTask(task, today));
  }

  return request.tasks.filter(isSlackVisibleTask);
}

export function shouldRemindTask(task: ExtractedTask, today: string = localIsoDate()): boolean {
  if (!isSlackVisibleTask(task) || isClosedTask(task)) return false;
  const timing = dueTiming(task.dueDate, today);
  return timing === "overdue" || timing === "today" || timing === "tomorrow";
}

export function canDirectDispatchToSlack(task: ExtractedTask): boolean {
  return (
    task.selected &&
    !isClosedTask(task) &&
    task.dispatchState === "auto_ready" &&
    task.riskLevel !== "high" &&
    task.dueDate.trim().length > 0 &&
    task.slackMention.trim().length > 0
  );
}

export function dueTiming(dueDate: string, today: string = localIsoDate()): DueTiming {
  const days = daysUntil(dueDate, today);
  if (days === null) return "no_due";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return "future";
}

export function dueText(dueDate: string, today: string = localIsoDate()): string {
  const days = daysUntil(dueDate, today);
  if (days === null) return "期限未定";
  if (days < 0) return `逾期 ${Math.abs(days)} 天`;
  if (days === 0) return `今日到期 ${dueDate}`;
  if (days === 1) return `明日到期 ${dueDate}`;
  return `期限 ${dueDate}`;
}

export function isClosedTask(task: ExtractedTask): boolean {
  const status = task.issueStatus?.trim().toLowerCase();
  if (!status) return false;
  return ["closed", "done", "completed", "resolved", "merged"].some((word) => status.includes(word));
}

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSlackVisibleTask(task: ExtractedTask): boolean {
  return task.selected || Boolean(task.issueUrl);
}

function daysUntil(dueDate: string, today: string): number | null {
  const due = parseIsoDay(dueDate);
  const base = parseIsoDay(today);
  if (due === null || base === null) return null;
  return Math.round((due - base) / DAY_MS);
}

function parseIsoDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}
