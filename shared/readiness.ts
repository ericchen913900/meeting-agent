import type { AiSettings, GitLabSettings, SlackSettings } from "./types";

export interface IntegrationReadinessItem {
  key: "ai" | "gitlab" | "slack";
  label: string;
  ready: boolean;
  missing: string[];
}

export interface IntegrationReadiness {
  ai: IntegrationReadinessItem;
  gitlab: IntegrationReadinessItem;
  slack: IntegrationReadinessItem;
}

export function getIntegrationReadiness(settings: {
  ai: AiSettings;
  gitlab: GitLabSettings;
  slack: SlackSettings;
}): IntegrationReadiness {
  const aiMissing = missingFields([
    ["AI Base URL", settings.ai.baseUrl],
    ["Model", settings.ai.model],
    ["AI API Key", settings.ai.apiKey]
  ]);
  const gitlabMissing = missingFields([
    ["GitLab Base URL", settings.gitlab.baseUrl],
    ["Project ID/path", settings.gitlab.projectId],
    ["GitLab Token", settings.gitlab.token]
  ]);
  const slackMissing = missingFields([
    ["Slack Channel ID", settings.slack.channelId],
    ["Slack Bot Token", settings.slack.token]
  ]);

  return {
    ai: readinessItem("ai", "AI", aiMissing),
    gitlab: readinessItem("gitlab", "GitLab", gitlabMissing),
    slack: readinessItem("slack", "Slack", slackMissing)
  };
}

function readinessItem(
  key: IntegrationReadinessItem["key"],
  label: string,
  missing: string[]
): IntegrationReadinessItem {
  return {
    key,
    label,
    ready: missing.length === 0,
    missing
  };
}

function missingFields(fields: Array<[label: string, value: string]>): string[] {
  return fields
    .filter(([, value]) => !value.trim())
    .map(([label]) => label);
}
