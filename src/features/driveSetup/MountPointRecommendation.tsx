import { FolderPlus, Loader2, RefreshCw } from "lucide-react";
import type { MountPointSuggestion } from "./model";
import { shortPath } from "./model";

const containerClassName =
  "grid min-h-[38px] grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border py-[7px] pl-2.5 pr-2 text-[var(--muted)]";
const activeToneClassName = "border-[rgba(117,215,180,0.36)] bg-[rgba(117,215,180,0.07)]";
const idleToneClassName = "border-[var(--line)] bg-[#12181d]";
const labelClassName = "inline-flex min-w-0 items-center gap-[7px] text-xs font-bold text-[var(--accent)]";
const pathClassName = "truncate font-mono text-xs font-medium text-[var(--muted-strong)]";
const actionButtonClassName =
  "inline-flex h-[34px] min-w-[84px] items-center justify-center gap-1.5 rounded-[7px] border border-[var(--line)] bg-[var(--panel-raised)] px-2.5 text-xs font-bold text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] hover:bg-[#2a333b] disabled:cursor-not-allowed disabled:opacity-50";

export function MountPointRecommendation({
  suggestion,
  active,
  busy,
  onUse,
}: {
  suggestion: MountPointSuggestion | null;
  active: boolean;
  busy: boolean;
  onUse: () => void;
}) {
  const path = suggestion?.path ?? "Resolving recommended folder";
  const toneClassName = active ? activeToneClassName : idleToneClassName;

  return (
    <div className={`${containerClassName} ${toneClassName}`}>
      <div className={labelClassName}>
        <FolderPlus size={15} />
        <span className="truncate">Recommended folder</span>
      </div>
      <strong className={pathClassName} title={path}>
        {shortPath(path)}
      </strong>
      <button className={actionButtonClassName} type="button" disabled={busy} onClick={onUse}>
        {busy ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
        <span>Use</span>
      </button>
    </div>
  );
}
