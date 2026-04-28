import type { ExtractedTask, MeetingInput } from "./types";
import { localIsoDate, shouldRemindTask } from "./slackRules";

export interface SlackAutomationSettings {
  enabled: boolean;
  reminderTime: string;
  checkIntervalMinutes: number;
}

export interface AutoReminderPlan {
  ready: boolean;
  reason: string;
  today: string;
  tasks: ExtractedTask[];
  batchKey: string;
}

export const defaultSlackAutomation: SlackAutomationSettings = {
  enabled: false,
  reminderTime: "09:00",
  checkIntervalMinutes: 15
};

export function getAutoReminderPlan({
  settings,
  meeting,
  tasks,
  sentBatches,
  now = new Date()
}: {
  settings: SlackAutomationSettings;
  meeting: MeetingInput;
  tasks: ExtractedTask[];
  sentBatches: Record<string, string>;
  now?: Date;
}): AutoReminderPlan {
  const today = localIsoDate(now);
  const reminderTasks = tasks.filter((task) => shouldRemindTask(task, today));
  const batchKey = buildAutoReminderBatchKey(meeting, reminderTasks, today);

  if (!settings.enabled) {
    return blocked("自動催繳未啟用", today, reminderTasks, batchKey);
  }

  const reminderTime = normalizeReminderTime(settings.reminderTime);
  if (minutesSinceMidnight(now) < clockMinutes(reminderTime)) {
    return blocked(`尚未到每日催繳時間 ${reminderTime}`, today, reminderTasks, batchKey);
  }

  if (reminderTasks.length === 0) {
    return blocked("目前沒有需要催繳的到期任務", today, reminderTasks, batchKey);
  }

  if (sentBatches[batchKey]) {
    return blocked("這批催繳今天已自動送過", today, reminderTasks, batchKey);
  }

  return {
    ready: true,
    reason: "可自動催繳",
    today,
    tasks: reminderTasks,
    batchKey
  };
}

export function buildAutoReminderBatchKey(
  meeting: MeetingInput,
  tasks: ExtractedTask[],
  today: string
): string {
  const meetingPart = stableText(meeting.title || "untitled");
  const taskPart = tasks
    .map((task) => `${task.id}:${task.dueDate}:${task.issueStatus ?? ""}`)
    .sort()
    .join("|");
  return `${today}:${meetingPart}:${hashText(taskPart)}`;
}

export function normalizeCheckIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) return defaultSlackAutomation.checkIntervalMinutes;
  return Math.min(1440, Math.max(1, Math.round(value)));
}

function blocked(reason: string, today: string, tasks: ExtractedTask[], batchKey: string): AutoReminderPlan {
  return {
    ready: false,
    reason,
    today,
    tasks,
    batchKey
  };
}

function normalizeReminderTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return defaultSlackAutomation.reminderTime;
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const minutes = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clockMinutes(value: string): number {
  const [hours, minutes] = normalizeReminderTime(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function stableText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-").replace(/^-|-$/g, "") || "untitled";
}

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
