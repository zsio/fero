import { AlertTriangle, CheckCircle2, FolderSearch, Server } from "lucide-react";
import type { NetworkDriveTestResult } from "./model";

const panelClassName = "grid gap-2 rounded-lg border px-2.5 py-[9px] text-xs leading-snug";
const successToneClassName = "border-[rgba(117,215,180,0.36)] bg-[rgba(117,215,180,0.08)] text-[var(--muted-strong)]";
const warningToneClassName = "border-[rgba(239,196,90,0.36)] bg-[rgba(239,196,90,0.09)] text-[var(--muted-strong)]";
const headingClassName = "flex min-w-0 items-center gap-2";
const metaGridClassName = "grid grid-cols-2 gap-1.5";
const metaItemClassName =
  "grid min-h-[30px] min-w-0 grid-cols-[15px_minmax(0,1fr)] items-center gap-1.5 rounded-[7px] border border-[rgba(48,58,67,0.72)] bg-[#11171c] px-2 py-1.5 text-[11px] text-[var(--muted)]";

export function ConnectionTestPanel({ result }: { result: NetworkDriveTestResult }) {
  const Icon = result.ok ? CheckCircle2 : AlertTriangle;
  const toneClassName = result.ok ? successToneClassName : warningToneClassName;
  const headingToneClassName = result.ok ? "text-[var(--accent)]" : "text-[var(--amber)]";
  const visibleItemCount = typeof result.itemCount === "number" ? result.itemCount : null;
  const itemLabel =
    visibleItemCount == null
      ? "Folder checked"
      : `${visibleItemCount} visible item${visibleItemCount === 1 ? "" : "s"}`;

  return (
    <div className={`${panelClassName} ${toneClassName}`} title={result.details ?? undefined}>
      <div className={`${headingClassName} ${headingToneClassName}`}>
        <Icon size={16} />
        <strong className="truncate text-[13px] font-bold text-[var(--ink-strong)]">{result.summary}</strong>
      </div>

      <span className="text-[var(--muted-strong)]">{result.recommendation}</span>

      <div className={metaGridClassName}>
        <div className={metaItemClassName}>
          <Server size={14} />
          <strong className="truncate text-right font-semibold text-[var(--muted-strong)]">
            {result.protocol || "Network drive"}
          </strong>
        </div>
        <div className={metaItemClassName}>
          <FolderSearch size={14} />
          <strong className="truncate text-right font-semibold text-[var(--muted-strong)]">{itemLabel}</strong>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <small className="text-[11px] leading-snug text-[var(--muted)]">{result.warnings.join(" ")}</small>
      )}
    </div>
  );
}
