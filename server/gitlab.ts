import type {
  ExtractedTask,
  GitLabIssueRequest,
  GitLabIssueResult,
  GitLabSettings,
  GitLabSyncRequest
} from "../shared/types";

export async function createGitLabIssues(request: GitLabIssueRequest): Promise<GitLabIssueResult[]> {
  validateGitLabSettings(request.gitlab);

  const results: GitLabIssueResult[] = [];
  for (const task of request.tasks) {
    try {
      const assigneeId =
        request.responsibilities.find((row) => row.gitlabUsername === task.gitlabUsername)?.gitlabUserId ??
        (await resolveGitLabUserId(request.gitlab, task.gitlabUsername));
      const issue = await createIssue(request.gitlab, task, assigneeId);
      results.push({
        taskId: task.id,
        ok: true,
        issueUrl: issue.web_url,
        issueIid: issue.iid,
        issueStatus: issue.state
      });
    } catch (error) {
      results.push({
        taskId: task.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

export async function syncGitLabIssues(request: GitLabSyncRequest): Promise<GitLabIssueResult[]> {
  validateGitLabSettings(request.gitlab);

  const results: GitLabIssueResult[] = [];
  for (const task of request.tasks.filter((item) => item.issueIid)) {
    try {
      const issue = await gitlabFetch<{ iid: number; web_url: string; state: string }>(
        request.gitlab,
        `/projects/${encodeProject(request.gitlab.projectId)}/issues/${task.issueIid}`,
        { method: "GET" }
      );
      results.push({
        taskId: task.id,
        ok: true,
        issueUrl: issue.web_url,
        issueIid: issue.iid,
        issueStatus: issue.state
      });
    } catch (error) {
      results.push({
        taskId: task.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return results;
}

async function resolveGitLabUserId(settings: GitLabSettings, username: string): Promise<number | undefined> {
  if (!username.trim()) return undefined;
  const users = await gitlabFetch<Array<{ id: number; username: string }>>(
    settings,
    `/users?username=${encodeURIComponent(username)}`,
    { method: "GET" }
  );
  return users.find((user) => user.username.toLowerCase() === username.toLowerCase())?.id;
}

async function createIssue(
  settings: GitLabSettings,
  task: ExtractedTask,
  assigneeId: number | undefined
): Promise<{ iid: number; web_url: string; state: string }> {
  const body: Record<string, unknown> = {
    title: task.title,
    description: formatIssueDescription(task, assigneeId),
    labels: task.labels.join(","),
    due_date: task.dueDate || undefined
  };

  if (assigneeId) {
    body.assignee_ids = [assigneeId];
  }

  return gitlabFetch(settings, `/projects/${encodeProject(settings.projectId)}/issues`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function formatIssueDescription(task: ExtractedTask, assigneeId: number | undefined): string {
  const assigneeLine = assigneeId
    ? `Assigned through GitLab user id ${assigneeId}.`
    : task.gitlabUsername
      ? `GitLab username could not be resolved automatically. Suggested owner: @${task.gitlabUsername}.`
      : "No GitLab username was available at dispatch time.";

  return [
    task.description,
    "",
    "## Meeting Agent Context",
    "",
    `- Suggested owner: ${task.assigneeName || "Unassigned"}`,
    `- ${assigneeLine}`,
    `- Slack mention: ${task.slackMention || "not configured"}`,
    `- Project area: ${task.projectArea || "general"}`,
    `- Confidence: ${Math.round(task.confidence * 100)}%`,
    `- Risk: ${task.riskLevel}`,
    `- Risk reasons: ${task.riskReasons.length > 0 ? task.riskReasons.join("; ") : "none"}`,
    "",
    "## Source Quote",
    "",
    task.sourceQuote ? `> ${task.sourceQuote}` : "_No source quote captured._"
  ].join("\n");
}

async function gitlabFetch<T>(
  settings: GitLabSettings,
  path: string,
  init: RequestInit
): Promise<T> {
  const response = await fetch(`${normalizeGitLabBase(settings.baseUrl)}/api/v4${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": settings.token,
      ...(init.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(readGitLabError(data, `GitLab request failed with ${response.status}`));
  }
  return data as T;
}

function validateGitLabSettings(settings: GitLabSettings): void {
  if (!settings.baseUrl.trim()) throw new Error("GitLab base URL is required.");
  if (!settings.projectId.trim()) throw new Error("GitLab project ID or path is required.");
  if (!settings.token.trim()) throw new Error("GitLab token is required.");
}

function normalizeGitLabBase(value: string): string {
  return value.replace(/\/+$/, "");
}

function encodeProject(projectId: string): string {
  return encodeURIComponent(projectId);
}

function readGitLabError(data: unknown, fallback: string): string {
  const error = data as { message?: unknown; error?: string };
  if (typeof error.message === "string") return error.message;
  if (error.message && typeof error.message === "object") return JSON.stringify(error.message);
  return error.error ?? fallback;
}
