import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { analyzeMeeting } from "./ai";
import { createGitLabIssues, syncGitLabIssues } from "./gitlab";
import { postSlackMessage } from "./slack";
import type {
  AnalyzeRequest,
  GitLabIssueRequest,
  GitLabSyncRequest,
  SlackMessageRequest
} from "../shared/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const app = express();
const port = Number(process.env.PORT ?? 5173);
const serveStatic = process.argv.includes("--static") || process.env.NODE_ENV === "production";

app.use(express.json({ limit: "2mb" }));

app.post("/api/analyze", async (req, res) => {
  try {
    const result = await analyzeMeeting(req.body as AnalyzeRequest);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/gitlab/issues", async (req, res) => {
  try {
    const result = await createGitLabIssues(req.body as GitLabIssueRequest);
    res.json({ results: result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/gitlab/sync", async (req, res) => {
  try {
    const result = await syncGitLabIssues(req.body as GitLabSyncRequest);
    res.json({ results: result });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/slack/messages", async (req, res) => {
  try {
    const result = await postSlackMessage(req.body as SlackMessageRequest);
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

if (serveStatic) {
  app.use(express.static(join(rootDir, "dist", "client")));
  app.get("*", (_req, res) => {
    res.sendFile(join(rootDir, "dist", "client", "index.html"));
  });
} else {
  const vite = await createViteServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(port, "127.0.0.1", () => {
  console.log(`meeting-agent listening on http://127.0.0.1:${port}`);
});
