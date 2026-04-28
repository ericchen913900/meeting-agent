import type { SlackMessageRequest, SlackMessageResult } from "../shared/types";
import { dueText, selectSlackTasks } from "../shared/slackRules";

export { selectSlackTasks } from "../shared/slackRules";

export async function postSlackMessage(request: SlackMessageRequest): Promise<SlackMessageResult> {
  if (!request.slack.token.trim()) throw new Error("Slack bot token is required.");
  if (!request.slack.channelId.trim()) throw new Error("Slack channel ID is required.");

  const text = formatSlackText(request);
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.slack.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      channel: request.slack.channelId,
      text,
      mrkdwn: true
    })
  });

  const data = (await response.json()) as { ok?: boolean; ts?: string; channel?: string; error?: string };
  if (!response.ok || !data.ok) {
    return {
      ok: false,
      error: data.error ?? `Slack request failed with ${response.status}`
    };
  }

  return {
    ok: true,
    ts: data.ts,
    channel: data.channel
  };
}

export function formatSlackText(request: SlackMessageRequest): string {
  const activeTasks = selectSlackTasks(request);
  if (activeTasks.length === 0) {
    throw new Error(slackEmptyMessage(request.mode));
  }

  const heading = slackHeading(request);

  const lines = activeTasks.map((task) => {
    const owner = task.slackMention || task.assigneeName || "未指派";
    const due = dueText(task.dueDate, request.today);
    const link = task.issueUrl ? `<${task.issueUrl}|GitLab #${task.issueIid ?? "issue"}>` : "尚未建立 issue";
    const status = task.issueStatus ? `狀態 ${task.issueStatus}` : "狀態未知";
    return `• ${owner} ${task.title}｜${due}｜${status}｜${link}`;
  });

  return [heading, `會議日期：${request.meeting.date || "未填"}`, "", ...lines].join("\n");
}

function slackHeading(request: SlackMessageRequest): string {
  const title = request.meeting.title || "未命名會議";
  if (request.mode === "auto_dispatch") return `*低風險任務自動派工：${title}*`;
  if (request.mode === "reminder") return `*會議任務催辦：${title}*`;
  return `*會議派工已建立：${title}*`;
}

function slackEmptyMessage(mode: SlackMessageRequest["mode"]): string {
  if (mode === "auto_dispatch") return "目前沒有符合低風險直送條件的 Slack 任務。";
  if (mode === "reminder") return "目前沒有逾期、今日到期或明日到期的任務需要催促。";
  return "沒有可發送到 Slack 的任務。";
}
