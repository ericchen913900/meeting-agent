export type RiskLevel = "low" | "medium" | "high";
export type DispatchState = "auto_ready" | "needs_review" | "dispatched" | "failed";
export type AssigneeSource = "explicit_transcript" | "responsibility_table" | "unassigned";

export interface ResponsibilityRow {
  id: string;
  name: string;
  gitlabUsername: string;
  gitlabUserId?: number;
  slackMention: string;
  role: string;
  modules: string[];
  keywords: string[];
  backupName?: string;
}

export interface MeetingInput {
  title: string;
  date: string;
  notes: string;
}

export interface AiSettings {
  provider: "openai-responses" | "openai-chat-compatible" | "anthropic-messages";
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface GitLabSettings {
  baseUrl: string;
  projectId: string;
  token: string;
}

export interface SlackSettings {
  token: string;
  channelId: string;
}

export interface DispatchPolicy {
  autoConfidenceThreshold: number;
  requireDueDateForAutoDispatch: boolean;
}

export interface ExtractedTask {
  id: string;
  title: string;
  description: string;
  sourceQuote: string;
  projectArea: string;
  assigneeName: string;
  gitlabUsername: string;
  slackMention: string;
  assigneeSource: AssigneeSource;
  assigneeReason: string;
  dueDate: string;
  labels: string[];
  confidence: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
  dispatchState: DispatchState;
  selected: boolean;
  issueUrl?: string;
  issueIid?: number;
  issueStatus?: string;
  lastError?: string;
}

export interface AiTaskCandidate {
  title: string;
  description: string;
  sourceQuote: string;
  projectArea: string;
  suggestedOwner: string;
  dueDate: string;
  labels: string[];
  confidence: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
}

export interface AnalyzeRequest {
  meeting: MeetingInput;
  responsibilities: ResponsibilityRow[];
  ai: AiSettings;
  policy: DispatchPolicy;
  demoMode?: boolean;
}

export interface AnalyzeResponse {
  tasks: ExtractedTask[];
  modelUsed: string;
  warnings: string[];
}

export interface GitLabIssueRequest {
  gitlab: GitLabSettings;
  tasks: ExtractedTask[];
  responsibilities: ResponsibilityRow[];
}

export interface GitLabIssueResult {
  taskId: string;
  ok: boolean;
  issueUrl?: string;
  issueIid?: number;
  issueStatus?: string;
  error?: string;
}

export interface GitLabSyncRequest {
  gitlab: GitLabSettings;
  tasks: ExtractedTask[];
}

export interface SlackMessageRequest {
  slack: SlackSettings;
  meeting: MeetingInput;
  tasks: ExtractedTask[];
  mode: "dispatch_summary" | "reminder";
}

export interface SlackMessageResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}
