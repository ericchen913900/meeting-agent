import { demoAnalyze, routeAndGradeTasks } from "../shared/policy";
import type { AiTaskCandidate, AnalyzeRequest, AnalyzeResponse } from "../shared/types";

const TASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tasks"],
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "sourceQuote",
          "projectArea",
          "suggestedOwner",
          "dueDate",
          "labels",
          "confidence",
          "riskLevel",
          "riskReasons"
        ],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          sourceQuote: { type: "string" },
          projectArea: { type: "string" },
          suggestedOwner: { type: "string" },
          dueDate: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          riskLevel: { type: "string", enum: ["low", "medium", "high"] },
          riskReasons: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} as const;

export async function analyzeMeeting(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  if (!request.meeting.notes.trim()) {
    throw new Error("Meeting notes are required.");
  }

  const warnings: string[] = [];
  let candidates: AiTaskCandidate[];
  let modelUsed = "demo-parser";

  if (request.demoMode || !request.ai.apiKey.trim()) {
    candidates = demoAnalyze(request.meeting.notes, request.meeting.date);
    warnings.push("Using local demo parser because no AI API key was supplied.");
  } else if (request.ai.provider === "openai-responses") {
    candidates = await callOpenAiResponses(request);
    modelUsed = request.ai.model;
  } else if (request.ai.provider === "anthropic-messages") {
    candidates = await callAnthropicMessages(request);
    modelUsed = request.ai.model;
  } else {
    candidates = await callChatCompatible(request);
    modelUsed = request.ai.model;
  }

  return {
    tasks: routeAndGradeTasks(candidates, request.responsibilities, request.policy),
    modelUsed,
    warnings
  };
}

async function callOpenAiResponses(request: AnalyzeRequest): Promise<AiTaskCandidate[]> {
  const response = await fetch(`${normalizeBaseUrl(request.ai.baseUrl)}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.ai.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: request.ai.model,
      input: [
        {
          role: "system",
          content: buildSystemPrompt()
        },
        {
          role: "user",
          content: buildUserPrompt(request)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meeting_task_plan",
          strict: true,
          schema: TASK_SCHEMA
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(readApiError(data, "AI Responses request failed"));
  }

  const text = extractResponsesText(data);
  return parseTaskCandidates(text);
}

async function callChatCompatible(request: AnalyzeRequest): Promise<AiTaskCandidate[]> {
  const response = await fetch(`${normalizeBaseUrl(request.ai.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.ai.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: request.ai.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${buildSystemPrompt()}\nReturn only valid JSON.` },
        { role: "user", content: buildUserPrompt(request) }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(readApiError(data, "AI chat-compatible request failed"));
  }

  return parseTaskCandidates(data.choices?.[0]?.message?.content ?? "");
}

async function callAnthropicMessages(request: AnalyzeRequest): Promise<AiTaskCandidate[]> {
  const built = buildAnthropicMessagesRequest(request);
  const response = await fetch(built.url, built.init);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(readApiError(data, "Anthropic Messages request failed"));
  }

  return parseAnthropicMessage(data);
}

export function buildAnthropicMessagesRequest(request: AnalyzeRequest): { url: string; init: RequestInit } {
  return {
    url: `${normalizeAnthropicBaseUrl(request.ai.baseUrl)}/messages`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": request.ai.apiKey,
        Authorization: `Bearer ${request.ai.apiKey}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: request.ai.model,
        max_tokens: 4096,
        system: buildSystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildUserPrompt(request)
          }
        ],
        tools: [
          {
            name: "record_meeting_tasks",
            description:
              "Extract meeting action items from an implicit transcript. Use this for concrete deliverables, risks, blockers, follow-ups, and due dates. Set suggestedOwner only for a person actually assigned in the transcript, including speaker self-commitments. Return tasks with projectArea and confidence so the responsibility router can assign owners.",
            input_schema: TASK_SCHEMA
          }
        ],
        tool_choice: {
          type: "tool",
          name: "record_meeting_tasks"
        }
      })
    }
  };
}

function buildSystemPrompt(): string {
  return [
    "You extract project action items from meeting notes.",
    "Use Traditional Chinese when the source is Chinese.",
    "Meeting transcripts often do not directly say who owns each task.",
    "Extract concrete deliverables, follow-ups, decisions, risks, blockers, and deadlines even when no person is explicitly assigned.",
    "If a person is explicitly assigned or a speaker self-commits, put that real mentioned person in suggestedOwner.",
    "Do not treat a speaker name as the owner unless the transcript explicitly assigns the work to that person.",
    "Use the responsibility table to infer projectArea, but do not invent suggestedOwner from example or placeholder people who are not actually responsible in the transcript.",
    "If owner or due date is unclear, leave that field blank and lower confidence; the router will still assign by projectArea when possible.",
    "Risk level must be high for security, legal, compliance, customer data, budget, production incident, cross-team dependency, or data migration work.",
    "Return JSON matching this shape: {\"tasks\":[{\"title\":\"\",\"description\":\"\",\"sourceQuote\":\"\",\"projectArea\":\"\",\"suggestedOwner\":\"\",\"dueDate\":\"YYYY-MM-DD or empty\",\"labels\":[\"meeting-action\"],\"confidence\":0.0,\"riskLevel\":\"low|medium|high\",\"riskReasons\":[]}]}."
  ].join(" ");
}

function buildUserPrompt(request: AnalyzeRequest): string {
  return [
    `Meeting title: ${request.meeting.title || "Untitled meeting"}`,
    `Meeting date: ${request.meeting.date || "unknown"}`,
    "",
    "Responsibility table JSON:",
    JSON.stringify(
      request.responsibilities.map((row) => ({
        name: row.name,
        gitlabUsername: row.gitlabUsername,
        slackMention: row.slackMention,
        role: row.role,
        modules: row.modules,
        keywords: row.keywords,
        backupName: row.backupName
      })),
      null,
      2
    ),
    "",
    "Meeting notes:",
    request.meeting.notes
  ].join("\n");
}

function parseTaskCandidates(text: string): AiTaskCandidate[] {
  const parsed = JSON.parse(text) as { tasks?: AiTaskCandidate[] };
  if (!Array.isArray(parsed.tasks)) {
    throw new Error("AI response did not contain a tasks array.");
  }

  return parsed.tasks.map((task) => ({
    title: String(task.title ?? ""),
    description: String(task.description ?? ""),
    sourceQuote: String(task.sourceQuote ?? ""),
    projectArea: String(task.projectArea ?? ""),
    suggestedOwner: String(task.suggestedOwner ?? ""),
    dueDate: String(task.dueDate ?? ""),
    labels: Array.isArray(task.labels) ? task.labels.map(String) : ["meeting-action"],
    confidence: Number(task.confidence ?? 0),
    riskLevel: ["low", "medium", "high"].includes(task.riskLevel) ? task.riskLevel : "medium",
    riskReasons: Array.isArray(task.riskReasons) ? task.riskReasons.map(String) : []
  }));
}

function parseAnthropicMessage(data: unknown): AiTaskCandidate[] {
  const message = data as {
    content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>;
  };

  for (const block of message.content ?? []) {
    if (block.type === "tool_use" && block.name === "record_meeting_tasks") {
      const input = block.input as { tasks?: AiTaskCandidate[] };
      if (!Array.isArray(input?.tasks)) {
        throw new Error("Anthropic tool response did not include a tasks array.");
      }
      return normalizeTaskCandidates(input.tasks);
    }
  }

  const text = (message.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
  return parseTaskCandidates(text);
}

function normalizeTaskCandidates(tasks: AiTaskCandidate[]): AiTaskCandidate[] {
  return tasks.map((task) => ({
    title: String(task.title ?? ""),
    description: String(task.description ?? ""),
    sourceQuote: String(task.sourceQuote ?? ""),
    projectArea: String(task.projectArea ?? ""),
    suggestedOwner: String(task.suggestedOwner ?? ""),
    dueDate: String(task.dueDate ?? ""),
    labels: Array.isArray(task.labels) ? task.labels.map(String) : ["meeting-action"],
    confidence: Number(task.confidence ?? 0),
    riskLevel: ["low", "medium", "high"].includes(task.riskLevel) ? task.riskLevel : "medium",
    riskReasons: Array.isArray(task.riskReasons) ? task.riskReasons.map(String) : []
  }));
}

function extractResponsesText(data: unknown): string {
  const response = data as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (response.output_text) return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }

  throw new Error("AI response did not include output text.");
}

function normalizeBaseUrl(value: string): string {
  return (value || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function normalizeAnthropicBaseUrl(value: string): string {
  const base = (value || "https://api.anthropic.com").replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

function readApiError(data: unknown, fallback: string): string {
  const error = data as { error?: { message?: string } | string; message?: string };
  if (typeof error.error === "string") return error.error;
  return error.error?.message ?? error.message ?? fallback;
}
