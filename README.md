# Smart Project Assistant Agent

Web management console MVP: paste meeting notes or a meeting transcript, let AI extract tasks, route them through an internal responsibility table, create GitLab issues, and send Slack dispatch or reminder messages.

The transcript does not need to directly say "who does what." The agent first extracts work from the discussion, then assigns it by responsibility rules. For example, UI/dashboard work routes to frontend, API/GitLab work routes to backend, and release/cross-team/requirement risk routes to PM or planning owners.

## Product usage guide

完整中文使用教學請看：

- [docs/USAGE.md](docs/USAGE.md)
- [Product deck](docs/product-deck/index.html)

## User-provided API keys

This project does not ship with any API key. Users enter credentials in the Web console:

- AI provider API key
- GitLab personal access token or project access token
- Slack bot token

The backend uses credentials only for the current request. It does not write them to the repo or server files. The browser keeps secret settings in session storage for the current tab session.

## Start

```bash
cd C:\Users\yeee3642\Documents\Playground\meeting-agent
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

## Verify

```bash
npm test
npm run typecheck
npm run build
```

## GitLab permissions

The GitLab token needs permission to read users and create issues. Issue creation calls the GitLab Issues API. If username resolution works, the app sends `assignee_ids`. If resolution fails, the issue body still includes `@username`.

## Slack permissions

The Slack bot token needs the `chat:write` scope, and the bot must be in the target channel.

## Implicit-assignment demo input

```text
2026-04-27 product weekly transcript

Host: The dashboard review status is too hard to scan; add badges and GitLab issue links by this Friday.
Engineer: GitLab API error responses are inconsistent. They need one shared response format by next Wednesday.
PM: Release risk across teams needs a plan by 2026-05-08, including Slack announcement wording.
Support: Customer data migration needs legal review by 2026-05-08.
```

Click `Demo Parse`. The first three items route by responsibility table to frontend, backend, and PM/planning. The customer-data/legal item is marked high risk and requires review.

## Responsibility table XLSX import

The Web console can import the first sheet of an `.xlsx` or `.xls` file and replace the current responsibility table.

Recommended headers:

| Header | Required | Example |
| --- | --- | --- |
| `姓名` or `name` | yes | `Alice Chen` |
| `GitLab 帳號` or `gitlabUsername` | yes | `alice` |
| `Slack Mention` or `slackMention` | no | `<@U_ALICE>` |
| `職能` or `role` | no | `Frontend` |
| `負責模組` or `modules` | no | `dashboard, UI` |
| `關鍵字` or `keywords` | no | `React, 管理台` |
| `備援人` or `backupName` | no | `Bob Lin` |

`modules` and `keywords` can be separated by commas, semicolons, Chinese semicolons, ideographic commas, or new lines.

## Current limits

- Meeting input is manual paste only; audio/video transcription is out of scope.
- The personnel responsibility table is maintained in the UI.
- Scheduled Slack reminders are browser-session automation in the current MVP. Production deployment still needs a durable worker, database, and audit log.
- There is no multi-tenant account system or long-term token storage.
- XLSX import uses the `xlsx` package, which currently has npm audit advisories with no npm-provided fix. Keep import to trusted local files.
