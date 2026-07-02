import { Activity, ExternalLink, Loader2, RefreshCw, Terminal } from "lucide-react";

export type ActivityLogEntry = {
  id: string;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  raw: string;
};

const panelClassName = "grid gap-2.5 px-[14px] pb-[14px] pt-3";
const headingClassName = "flex items-center justify-between gap-2.5";
const headingTitleClassName = "flex min-w-0 items-center gap-2 text-[var(--accent)]";
const eventCountClassName = "shrink-0 text-xs text-[var(--muted)]";
const listClassName = "grid gap-[7px]";
const itemClassName =
  "grid min-h-11 grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-[9px] rounded-lg border border-[rgba(48,58,67,0.78)] bg-[#12181d] px-[9px] py-2";
const dotClassNames = {
  info: "bg-[var(--accent)]",
  warning: "bg-[var(--amber)]",
  error: "bg-[var(--danger)]",
  muted: "bg-[var(--muted)]",
};
const entryMessageClassName = "block truncate text-xs font-semibold text-[var(--ink-strong)]";
const entryMetaClassName = "mt-[3px] block truncate text-[11px] text-[var(--muted)]";
const levelClassName =
  "rounded-full border border-[rgba(142,154,166,0.26)] px-[7px] py-0.5 text-[10px] font-bold uppercase not-italic text-[var(--muted-strong)]";
const emptyClassName =
  "grid min-h-11 grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-[var(--line)] bg-[#12181d] p-2.5 text-xs text-[var(--muted)]";
const actionsClassName = "grid grid-cols-2 gap-2";
const actionButtonClassName =
  "inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-[7px] border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] hover:bg-[#2a333b] disabled:cursor-not-allowed disabled:opacity-50";

export function ActivityPanel({
  entries,
  busy,
  logPath,
  onRefresh,
  onOpenLog,
}: {
  entries: ActivityLogEntry[];
  busy: boolean;
  logPath: string;
  onRefresh: () => void;
  onOpenLog: () => void;
}) {
  const visibleEntries = entries.slice(0, 6);

  return (
    <div className={panelClassName} data-activity-panel>
      <div className={headingClassName}>
        <div className={headingTitleClassName}>
          <Activity size={16} />
          <strong className="text-[13px] font-bold text-[var(--ink-strong)]">Recent activity</strong>
        </div>
        <span className={eventCountClassName}>{entries.length > 0 ? `${entries.length} events` : "No activity"}</span>
      </div>

      {visibleEntries.length > 0 ? (
        <div className={listClassName}>
          {visibleEntries.map((entry) => {
            const tone = activityTone(entry.level);
            return (
              <div className={itemClassName} key={entry.id} title={entry.raw}>
                <span className={`size-[7px] rounded-full ${dotClassNames[tone]}`} />
                <div className="min-w-0">
                  <strong className={entryMessageClassName}>{entry.message}</strong>
                  <small className={entryMetaClassName}>
                    {entry.source} / {formatActivityTime(entry.timestamp)}
                  </small>
                </div>
                <em className={levelClassName}>{entry.level || "info"}</em>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={emptyClassName}>
          <Terminal size={16} />
          <span>{busy ? "Reading activity..." : "Start the service or mount a drive to collect activity."}</span>
        </div>
      )}

      <div className={actionsClassName}>
        <button className={actionButtonClassName} type="button" disabled={busy} onClick={onRefresh}>
          {busy ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          <span>Refresh activity</span>
        </button>
        <button className={actionButtonClassName} type="button" disabled={!logPath} onClick={onOpenLog}>
          <ExternalLink size={15} />
          <span>Open log</span>
        </button>
      </div>
    </div>
  );
}

function activityTone(level: string): "info" | "warning" | "error" | "muted" {
  const lower = level.toLowerCase();
  if (lower.includes("error") || lower.includes("fatal") || lower.includes("panic")) return "error";
  if (lower.includes("warn")) return "warning";
  if (lower.includes("debug") || lower.includes("trace")) return "muted";
  return "info";
}

function formatActivityTime(value: string) {
  if (!value || value === "unknown time") return "unknown time";
  if (/^\d+$/.test(value)) return formatRelativeTime(Number(value));
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return formatRelativeTime(timestamp);
  return value;
}

function formatRelativeTime(timestamp: number) {
  const diffSeconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}
