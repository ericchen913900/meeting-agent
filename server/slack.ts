import type { SlackMessageRequest, SlackMessageResult } from "../shared/types";

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
  const activeTasks = request.tasks.filter((task) => task.selected || task.issueUrl);
  const heading =
    request.mode === "dispatch_summary"
      ? `*會議派工已建立：${request.meeting.title || "未命名會議"}*`
      : `*會議任務催辦：${request.meeting.title || "未命名會議"}*`;

  const lines = activeTasks.map((task) => {
    const owner = task.slackMention || task.assigneeName || "未指派";
    const due = task.dueDate ? `期限 ${task.dueDate}` : "期限未定";
    const link = task.issueUrl ? `<${task.issueUrl}|GitLab #${task.issueIid ?? "issue"}>` : "尚未建立 issue";
    const status = task.issueStatus ? `狀態 ${task.issueStatus}` : "狀態未知";
    return `• ${owner} ${task.title}｜${due}｜${status}｜${link}`;
  });

  return [heading, `會議日期：${request.meeting.date || "未填"}`, "", ...lines].join("\n");
}
