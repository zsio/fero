import { Database, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cacheLabelFromString, shortPath } from "../driveSetup/model";
import { formatBytes } from "./model";
import type { DriveCacheStatus } from "./model";

const panelClassName = "grid gap-[9px] rounded-lg border border-[var(--line)] bg-[#12181d] px-[11px] py-2.5";
const headingClassName = "flex items-center justify-between gap-2.5";
const headingTitleClassName = "flex min-w-0 items-center gap-2 text-[var(--accent)]";
const headingBadgeClassName = "shrink-0 truncate text-xs text-[var(--muted)]";
const metricGridClassName = "grid grid-cols-2 gap-2";
const metricCardClassName = "min-w-0 rounded-[7px] border border-[rgba(48,58,67,0.78)] bg-[#10161b] p-2";
const metricLabelClassName = "block text-[11px] text-[var(--muted)]";
const metricValueClassName = "mt-[3px] block truncate text-sm font-bold text-[var(--ink-strong)]";
const messageClassName = "m-0 text-xs leading-snug text-[var(--muted-strong)]";
const pathClassName = "block truncate text-xs text-[var(--muted)]";
const actionsClassName = "grid grid-cols-2 gap-2";
const actionButtonClassName =
  "inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-[7px] border border-[var(--line)] bg-[var(--panel-raised)] px-3 py-2 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] hover:bg-[#2a333b] disabled:cursor-not-allowed disabled:opacity-50";

export function CachePanel({
  cacheMode,
  status,
  busy,
  onRefresh,
  onClear,
}: {
  cacheMode: string;
  status: DriveCacheStatus | null;
  busy: boolean;
  onRefresh: () => void;
  onClear: () => void;
}) {
  const sizeLabel = status ? formatBytes(status.driveBytes) : "Not scanned";
  const totalLabel = status ? formatBytes(status.totalBytes) : "Unknown";
  const fileLabel = status ? `${status.fileCount} cached file${status.fileCount === 1 ? "" : "s"}` : "Scan to inspect files";
  const root = status?.cacheRoot ?? "Cache path not resolved";
  const mode = cacheLabelFromString(cacheMode);

  return (
    <div className={panelClassName} aria-label="Cache status">
      <div className={headingClassName}>
        <div className={headingTitleClassName}>
          <Database size={15} />
          <strong className="text-[13px] font-bold text-[var(--ink-strong)]">Cache status</strong>
        </div>
        <span className={headingBadgeClassName}>{mode}</span>
      </div>

      <div className={metricGridClassName}>
        <div className={metricCardClassName}>
          <span className={metricLabelClassName}>This drive</span>
          <strong className={metricValueClassName}>{busy && !status ? "Scanning..." : sizeLabel}</strong>
        </div>
        <div className={metricCardClassName}>
          <span className={metricLabelClassName}>Fero cache</span>
          <strong className={metricValueClassName}>{totalLabel}</strong>
        </div>
      </div>

      <p className={messageClassName}>{status?.message ?? "Fero keeps rclone VFS cache in its own cache folder."}</p>
      <small className={pathClassName} title={root}>
        {shortPath(root)} / {fileLabel}
      </small>

      <div className={actionsClassName}>
        <button className={actionButtonClassName} type="button" disabled={busy} onClick={onRefresh}>
          {busy ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          <span>Refresh cache</span>
        </button>
        <button className={actionButtonClassName} type="button" disabled={busy || !status || status.driveBytes === 0} onClick={onClear}>
          <Trash2 size={15} />
          <span>Clear cache</span>
        </button>
      </div>
    </div>
  );
}
