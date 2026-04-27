import type {
  AnalyzeRequest,
  AnalyzeResponse,
  GitLabIssueRequest,
  GitLabIssueResult,
  GitLabSyncRequest,
  SlackMessageRequest,
  SlackMessageResult
} from "../shared/types";

export async function analyzeMeeting(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  return postJson<AnalyzeResponse>("/api/analyze", payload);
}

export async function createGitLabIssues(payload: GitLabIssueRequest): Promise<{ results: GitLabIssueResult[] }> {
  return postJson<{ results: GitLabIssueResult[] }>("/api/gitlab/issues", payload);
}

export async function syncGitLabIssues(payload: GitLabSyncRequest): Promise<{ results: GitLabIssueResult[] }> {
  return postJson<{ results: GitLabIssueResult[] }>("/api/gitlab/sync", payload);
}

export async function postSlackMessage(payload: SlackMessageRequest): Promise<SlackMessageResult> {
  return postJson<SlackMessageResult>("/api/slack/messages", payload);
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? data.message ?? `Request failed with ${response.status}`);
  }
  return data as T;
}
