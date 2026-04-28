import {
  Bell,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  KeyRound,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Upload,
  Workflow
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  analyzeMeeting,
  createGitLabIssues,
  postSlackMessage,
  syncGitLabIssues
} from "./api";
import { useLocalStorageState, useSessionStorageState } from "./storage";
import { defaultPolicy } from "../shared/policy";
import { getIntegrationReadiness } from "../shared/readiness";
import { parseResponsibilityRecords } from "../shared/responsibilityImport";
import {
  canDirectDispatchToSlack,
  dueText,
  dueTiming,
  localIsoDate,
  shouldRemindTask
} from "../shared/slackRules";
import type {
  AiSettings,
  DispatchPolicy,
  ExtractedTask,
  GitLabSettings,
  MeetingInput,
  ResponsibilityRow,
  RiskLevel,
  SlackMessageMode,
  SlackSettings
} from "../shared/types";

const seedResponsibilities: ResponsibilityRow[] = [
  {
    id: "seed-frontend",
    name: "Alice Chen",
    gitlabUsername: "alice",
    slackMention: "<@U_ALICE>",
    role: "Frontend",
    modules: ["frontend", "dashboard", "UI"],
    keywords: ["React", "頁面", "管理台"]
  },
  {
    id: "seed-backend",
    name: "Bob Lin",
    gitlabUsername: "bob",
    slackMention: "<@U_BOB>",
    role: "Backend",
    modules: ["backend", "API", "GitLab"],
    keywords: ["Express", "issue", "整合"]
  },
  {
    id: "seed-pm",
    name: "Carol Wu",
    gitlabUsername: "carol",
    slackMention: "<@U_CAROL>",
    role: "PM",
    modules: ["planning", "release", "requirement"],
    keywords: ["需求", "排程", "跨部門"]
  }
];

const emptyMeeting: MeetingInput = {
  title: "週會派工",
  date: new Date().toISOString().slice(0, 10),
  notes: ""
};

const defaultAi: AiSettings = {
  provider: "openai-responses",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini"
};

const defaultGitLab: GitLabSettings = {
  baseUrl: "https://gitlab.com",
  projectId: "",
  token: ""
};

const defaultSlack: SlackSettings = {
  token: "",
  channelId: ""
};

export default function App() {
  const [meeting, setMeeting] = useLocalStorageState<MeetingInput>(
    "meeting-agent:meeting",
    emptyMeeting
  );
  const [responsibilities, setResponsibilities] = useLocalStorageState<ResponsibilityRow[]>(
    "meeting-agent:responsibilities",
    seedResponsibilities
  );
  const [tasks, setTasks] = useLocalStorageState<ExtractedTask[]>("meeting-agent:tasks", []);
  const [policy, setPolicy] = useLocalStorageState<DispatchPolicy>(
    "meeting-agent:policy",
    defaultPolicy
  );
  const [ai, setAi] = useSessionStorageState<AiSettings>("meeting-agent:ai", defaultAi);
  const [gitlab, setGitLab] = useSessionStorageState<GitLabSettings>(
    "meeting-agent:gitlab",
    defaultGitLab
  );
  const [slack, setSlack] = useSessionStorageState<SlackSettings>("meeting-agent:slack", defaultSlack);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("準備接收會議記錄");
  const today = localIsoDate();

  const stats = useMemo(() => {
    const autoReady = tasks.filter((task) => task.dispatchState === "auto_ready").length;
    const needsReview = tasks.filter((task) => task.dispatchState === "needs_review").length;
    const dispatched = tasks.filter((task) => task.issueUrl).length;
    return { autoReady, needsReview, dispatched, total: tasks.length };
  }, [tasks]);
  const slackAutomation = useMemo(
    () => ({
      direct: tasks.filter(canDirectDispatchToSlack),
      reminders: tasks.filter((task) => shouldRemindTask(task, today))
    }),
    [tasks, today]
  );
  const readiness = useMemo(() => getIntegrationReadiness({ ai, gitlab, slack }), [ai, gitlab, slack]);

  async function handleAnalyze(demoMode = false) {
    setBusy(demoMode ? "demo" : "analyze");
    setNotice("正在拆解會議任務...");
    try {
      const response = await analyzeMeeting({ meeting, responsibilities, ai, policy, demoMode });
      setTasks(response.tasks);
      const warning = response.warnings.length > 0 ? `；${response.warnings.join(" ")}` : "";
      setNotice(`已產生 ${response.tasks.length} 個任務，模型：${response.modelUsed}${warning}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function handleCreateIssues() {
    const selectedTasks = tasks.filter((task) => task.selected && !task.issueUrl);
    if (selectedTasks.length === 0) {
      setNotice("沒有可建立 issue 的已選任務。");
      return;
    }

    setBusy("gitlab");
    setNotice("正在建立 GitLab issues...");
    try {
      const response = await createGitLabIssues({
        gitlab,
        tasks: selectedTasks,
        responsibilities
      });
      applyIssueResults(response.results);
      const okCount = response.results.filter((result) => result.ok).length;
      setNotice(`GitLab 建立完成：${okCount}/${response.results.length} 成功。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function handleSync() {
    const trackedTasks = tasks.filter((task) => task.issueIid);
    if (trackedTasks.length === 0) {
      setNotice("目前沒有可同步的 GitLab issue。");
      return;
    }

    setBusy("sync");
    setNotice("正在同步 GitLab issue 狀態...");
    try {
      const response = await syncGitLabIssues({ gitlab, tasks: trackedTasks });
      applyIssueResults(response.results);
      setNotice(`已同步 ${response.results.filter((result) => result.ok).length} 個 issue。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  async function handleSlack(mode: SlackMessageMode, outgoingTasks = tasks) {
    if (outgoingTasks.length === 0) {
      setNotice(slackEmptyNotice(mode));
      return;
    }

    setBusy(mode);
    setNotice(slackBusyNotice(mode));
    try {
      const result = await postSlackMessage({ slack, meeting, tasks: outgoingTasks, mode, today });
      setNotice(result.ok ? `Slack 已送出到 ${result.channel}` : result.error ?? "Slack 發送失敗");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  function applyIssueResults(results: Array<{ taskId: string; ok: boolean; issueUrl?: string; issueIid?: number; issueStatus?: string; error?: string }>) {
    setTasks(
      tasks.map((task) => {
        const result = results.find((item) => item.taskId === task.id);
        if (!result) return task;
        if (!result.ok) return { ...task, dispatchState: "failed", lastError: result.error };
        return {
          ...task,
          dispatchState: "dispatched",
          issueUrl: result.issueUrl,
          issueIid: result.issueIid,
          issueStatus: result.issueStatus,
          lastError: undefined
        };
      })
    );
  }

  function updateTask(id: string, patch: Partial<ExtractedTask>) {
    setTasks(tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function addResponsibility() {
    setResponsibilities([
      ...responsibilities,
      {
        id: randomId(),
        name: "",
        gitlabUsername: "",
        slackMention: "",
        role: "",
        modules: [],
        keywords: []
      }
    ]);
  }

  function updateResponsibility(id: string, patch: Partial<ResponsibilityRow>) {
    setResponsibilities(responsibilities.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeResponsibility(id: string) {
    setResponsibilities(responsibilities.filter((row) => row.id !== id));
  }

  async function handleResponsibilityXlsxImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setBusy("xlsx");
    setNotice(`正在匯入 ${file.name}...`);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("XLSX 檔案沒有工作表。");

      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[firstSheetName],
        { defval: "" }
      );
      const result = parseResponsibilityRecords(records);
      if (result.rows.length === 0) {
        throw new Error(`沒有可匯入的人員列。${result.warnings.join(" ")}`);
      }

      setResponsibilities(result.rows);
      setNotice(
        `已從 ${file.name} 匯入 ${result.rows.length} 位人員。${
          result.warnings.length > 0 ? `略過 ${result.warnings.length} 列。` : ""
        }`
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-copy">
          <p className="eyebrow">
            <Workflow size={15} />
            Meeting Agent
          </p>
          <h1>智能專案助理</h1>
          <p className="topbar-subtitle">
            貼上會議逐字稿，AI 拆解任務、比對職責、送到 GitLab 與 Slack 追蹤。
          </p>
        </div>
        <div className="status-strip" aria-label="dispatch status">
          <Metric label="總任務" value={stats.total} />
          <Metric label="可自動派發" value={stats.autoReady} tone="green" />
          <Metric label="需審核" value={stats.needsReview} tone="amber" />
          <Metric label="已建 issue" value={stats.dispatched} tone="blue" />
        </div>
      </header>

      <div className="workflow-rail" aria-label="meeting dispatch workflow">
        <span>會議記錄</span>
        <span>AI 拆解</span>
        <span>職責匹配</span>
        <span>人工審核</span>
        <span>GitLab / Slack</span>
      </div>

      <main className="workspace">
        <aside className="settings-column">
          <section className="panel">
            <PanelTitle icon={<KeyRound size={18} />} title="API 接入" caption="送出前先檢查 AI、GitLab、Slack 是否可用。" />
            <div className="readiness-list" aria-label="integration readiness">
              {Object.values(readiness).map((item) => (
                <div className={`readiness-item ${item.ready ? "ready" : "missing"}`} key={item.key}>
                  <strong>{item.label}</strong>
                  <span>{item.ready ? "可用" : `缺 ${item.missing.join("、")}`}</span>
                </div>
              ))}
            </div>
            <label>
              AI Provider
              <select
                value={ai.provider}
                onChange={(event) => setAi({ ...ai, provider: event.currentTarget.value as AiSettings["provider"] })}
              >
                <option value="openai-responses">OpenAI Responses</option>
                <option value="openai-chat-compatible">OpenAI Chat-compatible</option>
                <option value="anthropic-messages">Anthropic Messages</option>
              </select>
            </label>
            <label>
              AI Base URL
              <input value={ai.baseUrl} onChange={(event) => setAi({ ...ai, baseUrl: event.currentTarget.value })} />
            </label>
            <label>
              Model
              <input value={ai.model} onChange={(event) => setAi({ ...ai, model: event.currentTarget.value })} />
            </label>
            <label>
              AI API Key
              <input
                type="password"
                value={ai.apiKey}
                onChange={(event) => setAi({ ...ai, apiKey: event.currentTarget.value })}
                placeholder="sk-..."
              />
            </label>
            <div className="divider" />
            <label>
              GitLab Base URL
              <input value={gitlab.baseUrl} onChange={(event) => setGitLab({ ...gitlab, baseUrl: event.currentTarget.value })} />
            </label>
            <label>
              Project ID or path
              <input
                value={gitlab.projectId}
                onChange={(event) => setGitLab({ ...gitlab, projectId: event.currentTarget.value })}
                placeholder="group/project or numeric id"
              />
            </label>
            <label>
              GitLab Token
              <input
                type="password"
                value={gitlab.token}
                onChange={(event) => setGitLab({ ...gitlab, token: event.currentTarget.value })}
              />
            </label>
            <div className="divider" />
            <label>
              Slack Channel ID
              <input
                value={slack.channelId}
                onChange={(event) => setSlack({ ...slack, channelId: event.currentTarget.value })}
                placeholder="C123456"
              />
            </label>
            <label>
              Slack Bot Token
              <input
                type="password"
                value={slack.token}
                onChange={(event) => setSlack({ ...slack, token: event.currentTarget.value })}
                placeholder="xoxb-..."
              />
            </label>
          </section>

          <section className="panel">
            <PanelTitle icon={<Save size={18} />} title="自動化規則" caption="控制哪些任務可以不經二次判斷直接派發。" />
            <label>
              自動派發信心門檻
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={policy.autoConfidenceThreshold}
                onChange={(event) =>
                  setPolicy({ ...policy, autoConfidenceThreshold: Number(event.currentTarget.value) })
                }
              />
            </label>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={policy.requireDueDateForAutoDispatch}
                onChange={(event) =>
                  setPolicy({ ...policy, requireDueDateForAutoDispatch: event.currentTarget.checked })
                }
              />
              自動派發必須有期限
            </label>
          </section>
        </aside>

        <section className="main-column">
          <section className="panel intake-panel">
            <PanelTitle icon={<ClipboardList size={18} />} title="會議記錄" caption="可貼逐字稿、會議摘要或行動項目草稿。" />
            <div className="meeting-grid">
              <label>
                會議名稱
                <input
                  value={meeting.title}
                  onChange={(event) => setMeeting({ ...meeting, title: event.currentTarget.value })}
                />
              </label>
              <label>
                會議日期
                <input
                  type="date"
                  value={meeting.date}
                  onChange={(event) => setMeeting({ ...meeting, date: event.currentTarget.value })}
                />
              </label>
            </div>
            <textarea
              className="notes-box"
              value={meeting.notes}
              onChange={(event) => setMeeting({ ...meeting, notes: event.currentTarget.value })}
              placeholder="貼上會議記錄，例如：Alice 本週五前完成 dashboard UI；Bob 需要建立 GitLab issue API；Carol 追蹤跨部門 release 風險。"
            />
            <div className="button-row">
              <button onClick={() => handleAnalyze(false)} disabled={busy !== "" || !meeting.notes.trim()}>
                <Play size={16} />
                AI 拆任務
              </button>
              <button className="secondary" onClick={() => handleAnalyze(true)} disabled={busy !== "" || !meeting.notes.trim()}>
                <ClipboardList size={16} />
                Demo 解析
              </button>
              <span className="notice">{busy ? "處理中..." : notice}</span>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <PanelTitle icon={<GitBranch size={18} />} title="人員職責表" caption="AI 不知道公司內部分工時，會用這張表補齊 owner。" />
              <div className="panel-actions">
                <label className="file-button" title="匯入 XLSX">
                  <Upload size={15} />
                  <span>匯入 XLSX</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleResponsibilityXlsxImport}
                    disabled={busy !== ""}
                  />
                </label>
                <button className="icon-button" onClick={addResponsibility} title="新增人員" disabled={busy !== ""}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div className="responsibility-table">
              <div className="table-head">姓名</div>
              <div className="table-head">GitLab</div>
              <div className="table-head">Slack</div>
              <div className="table-head">職能</div>
              <div className="table-head">模組</div>
              <div className="table-head">關鍵字</div>
              <div className="table-head" />
              {responsibilities.map((row) => (
                <ResponsibilityRowEditor
                  key={row.id}
                  row={row}
                  onChange={(patch) => updateResponsibility(row.id, patch)}
                  onRemove={() => removeResponsibility(row.id)}
                />
              ))}
            </div>
          </section>

          <section className="panel">
            <PanelTitle icon={<CheckCircle2 size={18} />} title="派工審核" caption="確認 owner、期限、風險與外部 issue 狀態後再同步。" />
            {tasks.length > 0 && (
              <div className="automation-grid" aria-label="slack automation actions">
                <div className="automation-card">
                  <span>低風險直送 Slack</span>
                  <strong>{slackAutomation.direct.length}</strong>
                  <p>只送低風險、可自動派發、有期限且有 Slack mention 的任務。</p>
                  <button
                    onClick={() => handleSlack("auto_dispatch", slackAutomation.direct)}
                    disabled={busy !== "" || slackAutomation.direct.length === 0}
                  >
                    <Send size={16} />
                    一鍵直送
                  </button>
                </div>
                <div className="automation-card urgent">
                  <span>依時間催辦</span>
                  <strong>{slackAutomation.reminders.length}</strong>
                  <p>只催逾期、今日到期、明日到期且尚未關閉的任務。</p>
                  <button
                    className="secondary"
                    onClick={() => handleSlack("reminder", slackAutomation.reminders)}
                    disabled={busy !== "" || slackAutomation.reminders.length === 0}
                  >
                    <Bell size={16} />
                    發送催辦
                  </button>
                </div>
              </div>
            )}
            <div className="task-list">
              {tasks.length === 0 ? (
                <div className="empty-state">尚未產生任務。先貼上會議記錄並執行 AI 拆解。</div>
              ) : (
                tasks.map((task) => (
                  <TaskEditor key={task.id} task={task} onChange={(patch) => updateTask(task.id, patch)} />
                ))
              )}
            </div>
            <div className="button-row">
              <button onClick={handleCreateIssues} disabled={busy !== "" || tasks.every((task) => !task.selected)}>
                <GitBranch size={16} />
                建立 GitLab issues
              </button>
              <button className="secondary" onClick={() => handleSlack("dispatch_summary")} disabled={busy !== "" || tasks.length === 0}>
                <Send size={16} />
                Slack 派工摘要
              </button>
              <button className="secondary" onClick={handleSync} disabled={busy !== "" || tasks.every((task) => !task.issueIid)}>
                <RefreshCw size={16} />
                同步狀態
              </button>
              <button
                className="secondary"
                onClick={() => handleSlack("reminder", slackAutomation.reminders)}
                disabled={busy !== "" || slackAutomation.reminders.length === 0}
              >
                <Bell size={16} />
                Slack 時間催辦
              </button>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "green" | "amber" | "blue" }) {
  return (
    <div className={`metric ${tone ?? ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PanelTitle({ icon, title, caption }: { icon: ReactNode; title: string; caption?: string }) {
  return (
    <div className="panel-title">
      <div className="panel-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        {caption && <p>{caption}</p>}
      </div>
    </div>
  );
}

function ResponsibilityRowEditor({
  row,
  onChange,
  onRemove
}: {
  row: ResponsibilityRow;
  onChange: (patch: Partial<ResponsibilityRow>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <input value={row.name} onChange={(event) => onChange({ name: event.currentTarget.value })} />
      <input value={row.gitlabUsername} onChange={(event) => onChange({ gitlabUsername: event.currentTarget.value })} />
      <input value={row.slackMention} onChange={(event) => onChange({ slackMention: event.currentTarget.value })} />
      <input value={row.role} onChange={(event) => onChange({ role: event.currentTarget.value })} />
      <input
        value={row.modules.join(", ")}
        onChange={(event) => onChange({ modules: splitCsv(event.currentTarget.value) })}
      />
      <input
        value={row.keywords.join(", ")}
        onChange={(event) => onChange({ keywords: splitCsv(event.currentTarget.value) })}
      />
      <button className="icon-button danger" onClick={onRemove} title="刪除人員">
        <Trash2 size={15} />
      </button>
    </>
  );
}

function TaskEditor({
  task,
  onChange
}: {
  task: ExtractedTask;
  onChange: (patch: Partial<ExtractedTask>) => void;
}) {
  return (
    <article className="task-row">
      <div className="task-select">
        <input
          type="checkbox"
          checked={task.selected}
          onChange={(event) => onChange({ selected: event.currentTarget.checked })}
          aria-label={`選取 ${task.title}`}
        />
        <strong>{Math.round(task.confidence * 100)}%</strong>
        <span>信心</span>
      </div>
      <div className="task-body">
        <div className="task-topline">
          <input
            className="task-title-input"
            value={task.title}
            onChange={(event) => onChange({ title: event.currentTarget.value })}
          />
          <Badge value={task.dispatchState === "auto_ready" ? "可自動" : task.dispatchState === "needs_review" ? "需審核" : task.dispatchState} />
          <Badge value={task.riskLevel} tone={riskTone(task.riskLevel)} />
          <Badge value={dueBadge(task)} tone={dueTone(task)} />
        </div>
        <textarea
          className="task-description"
          value={task.description}
          onChange={(event) => onChange({ description: event.currentTarget.value })}
        />
        <div className="task-fields">
          <label>
            負責人
            <input value={task.assigneeName} onChange={(event) => onChange({ assigneeName: event.currentTarget.value })} />
          </label>
          <label>
            GitLab
            <input value={task.gitlabUsername} onChange={(event) => onChange({ gitlabUsername: event.currentTarget.value })} />
          </label>
          <label>
            Slack
            <input value={task.slackMention} onChange={(event) => onChange({ slackMention: event.currentTarget.value })} />
          </label>
          <label>
            期限
            <input type="date" value={task.dueDate} onChange={(event) => onChange({ dueDate: event.currentTarget.value })} />
          </label>
          <label>
            風險
            <select value={task.riskLevel} onChange={(event) => onChange({ riskLevel: event.currentTarget.value as RiskLevel })}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label>
            Labels
            <input value={task.labels.join(", ")} onChange={(event) => onChange({ labels: splitCsv(event.currentTarget.value) })} />
          </label>
        </div>
        <div className="task-meta">
          <span>派工依據：{assigneeSourceLabel(task.assigneeSource)}{task.assigneeReason ? `，${task.assigneeReason}` : ""}</span>
          <span>來源：{task.sourceQuote || "未擷取"}</span>
          {task.issueUrl && (
            <a href={task.issueUrl} target="_blank" rel="noreferrer">
              GitLab #{task.issueIid}
            </a>
          )}
          {task.lastError && <span className="error-text">{task.lastError}</span>}
        </div>
      </div>
    </article>
  );
}

function Badge({ value, tone }: { value: string; tone?: string }) {
  return <span className={`badge ${tone ?? ""}`}>{value}</span>;
}

function assigneeSourceLabel(source: ExtractedTask["assigneeSource"]): string {
  if (source === "explicit_transcript") return "逐字稿";
  if (source === "responsibility_table") return "職責表";
  return "未指派";
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function riskTone(level: RiskLevel): string {
  if (level === "low") return "green";
  if (level === "medium") return "amber";
  return "red";
}

function dueBadge(task: ExtractedTask): string {
  const timing = dueTiming(task.dueDate);
  if (timing === "no_due") return "期限未定";
  if (timing === "overdue") return dueText(task.dueDate);
  if (timing === "today") return "今日到期";
  if (timing === "tomorrow") return "明日到期";
  return task.dueDate;
}

function dueTone(task: ExtractedTask): string {
  const timing = dueTiming(task.dueDate);
  if (timing === "overdue" || timing === "no_due") return "red";
  if (timing === "today") return "amber";
  if (timing === "tomorrow") return "blue";
  return "";
}

function slackBusyNotice(mode: SlackMessageMode): string {
  if (mode === "auto_dispatch") return "正在直送低風險 Slack 任務...";
  if (mode === "reminder") return "正在依到期時間發送 Slack 催辦...";
  return "正在發送 Slack 派工摘要...";
}

function slackEmptyNotice(mode: SlackMessageMode): string {
  if (mode === "auto_dispatch") return "目前沒有符合低風險直送條件的任務。";
  if (mode === "reminder") return "目前沒有逾期、今日到期或明日到期的任務需要催促。";
  return "沒有可發送到 Slack 的任務。";
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}`;
}
