import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FolderOpen,
  HardDrive,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CachePanel } from "../cache/CachePanel";
import type { DriveCacheStatus } from "../cache/model";
import { cacheLabelFromString } from "../driveSetup/model";

export type MountDetailsDrive = {
  displayName: string;
  mountPoint: string;
  endpointLabel: string;
  protocolLabel: string;
  cacheMode: string;
  autoMount: boolean;
  mounted: boolean;
  health: "healthy" | "attention" | "standby";
  status: string;
  lastIssueSummary?: string | null;
  lastIssueRecommendation?: string | null;
  lastIssueDetails?: string | null;
  lastCheckedAt?: number | null;
};

const detailsClassName = "grid gap-2 px-[14px] pb-[14px]";
const stateCardClassName =
  "grid min-h-[66px] grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[#12181d] px-3 py-2.5";
const stateIconClassName = "grid size-[34px] place-items-center rounded-lg border";
const stateCopyClassName = "min-w-0";
const stateTitleClassName = "block truncate text-[13px] font-bold text-[var(--ink-strong)]";
const stateMetaClassName = "mt-1 block truncate text-xs text-[var(--muted)]";
const stateBadgeClassName = "shrink-0 rounded-full border px-2 py-[3px] text-[11px] font-semibold";
const detailLineClassName =
  "grid min-h-[34px] grid-cols-[18px_90px_minmax(0,1fr)] items-center gap-2 border-b border-[rgba(48,58,67,0.62)] text-xs text-[var(--muted)]";
const detailValueClassName = "truncate text-right font-semibold text-[var(--ink-strong)]";
const actionGridClassName = "mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)] gap-2";
const primaryButtonClassName =
  "inline-flex min-h-[38px] min-w-0 items-center justify-center gap-2 rounded-[7px] border border-[rgba(117,215,180,0.72)] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:border-[rgba(139,224,189,0.8)] hover:bg-[#8be0bd] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "inline-flex min-h-[36px] min-w-0 items-center justify-center gap-2 rounded-[7px] border border-[var(--line)] bg-[#151b20] px-3 py-2 text-[13px] font-semibold text-[var(--muted-strong)] transition-colors hover:border-[var(--line-strong)] hover:bg-[#2a333b] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const fullWidthSecondaryButtonClassName = `${secondaryButtonClassName} mt-2.5 w-full`;
const dangerButtonClassName =
  "mt-3 inline-flex min-h-[36px] w-full items-center justify-center gap-2 rounded-[7px] border border-[rgba(255,131,124,0.45)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] font-semibold text-[#ffd3d0] transition-colors hover:border-[rgba(255,131,124,0.62)] hover:bg-[rgba(255,131,124,0.18)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const issueClassName =
  "grid gap-[7px] rounded-lg border border-[rgba(239,196,90,0.36)] bg-[rgba(239,196,90,0.09)] px-[11px] py-2.5 text-xs leading-normal text-[var(--muted-strong)]";
const issueHeadingClassName = "flex items-center gap-2 text-[var(--amber)]";

const stateToneClassNames = {
  mounted: {
    icon: "border-[rgba(117,215,180,0.28)] text-[var(--accent)]",
    badge: "border-[rgba(117,215,180,0.3)] text-[var(--accent)]",
  },
  attention: {
    icon: "border-[rgba(255,131,124,0.38)] text-[var(--danger)]",
    badge: "border-[rgba(255,131,124,0.38)] text-[var(--danger)]",
  },
  ready: {
    icon: "border-[rgba(142,154,166,0.3)] text-[var(--muted-strong)]",
    badge: "border-[rgba(142,154,166,0.34)] text-[var(--muted-strong)]",
  },
};

export function MountDetails({
  drive,
  busy,
  cacheStatus,
  cacheBusy,
  onMount,
  onOpen,
  onUnmount,
  onRemove,
  onAutoMountChange,
  onEdit,
  onRefreshCache,
  onClearCache,
}: {
  drive: MountDetailsDrive;
  busy: boolean;
  cacheStatus: DriveCacheStatus | null;
  cacheBusy: boolean;
  onMount: () => void;
  onOpen: () => void;
  onUnmount: () => void;
  onRemove: () => void;
  onAutoMountChange: (autoMount: boolean) => void;
  onEdit: () => void;
  onRefreshCache: () => void;
  onClearCache: () => void;
}) {
  return (
    <div className={detailsClassName} aria-label="Selected drive details">
      <MountStateCard drive={drive} />
      <DetailLine icon={HardDrive} label="Name" value={drive.displayName} />
      <DetailLine icon={FolderOpen} label="Local folder" value={drive.mountPoint} />
      <DetailLine icon={Cloud} label="Remote" value={drive.endpointLabel} />
      <DetailLine icon={Wifi} label="Protocol" value={drive.protocolLabel} />
      <DetailLine icon={Database} label="Cache" value={cacheLabelFromString(drive.cacheMode)} />
      <DetailLine icon={RefreshCw} label="Restore" value={drive.autoMount ? "On launch" : "Manual"} />
      {drive.lastIssueSummary && <MountIssuePanel drive={drive} />}
      <CachePanel
        cacheMode={drive.cacheMode}
        status={cacheStatus}
        busy={cacheBusy}
        onRefresh={onRefreshCache}
        onClear={onClearCache}
      />

      {drive.mounted ? (
        <div className={actionGridClassName}>
          <button className={primaryButtonClassName} type="button" disabled={busy} onClick={onOpen}>
            <ExternalLink size={15} />
            <span>Open folder</span>
          </button>
          <button className={secondaryButtonClassName} type="button" disabled={busy} onClick={onUnmount}>
            <Square size={15} />
            <span>Unmount</span>
          </button>
        </div>
      ) : (
        <div className={actionGridClassName}>
          <button className={primaryButtonClassName} type="button" disabled={busy} onClick={onMount}>
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            <span>{drive.health === "attention" ? "Retry mount" : "Mount drive"}</span>
          </button>
          <button className={secondaryButtonClassName} type="button" disabled={busy} onClick={onOpen}>
            <ExternalLink size={15} />
            <span>Open folder</span>
          </button>
        </div>
      )}

      <button className={fullWidthSecondaryButtonClassName} type="button" disabled={busy} onClick={() => onAutoMountChange(!drive.autoMount)}>
        <RefreshCw size={15} />
        <span>{drive.autoMount ? "Disable auto mount" : "Restore on launch"}</span>
      </button>
      <button className={fullWidthSecondaryButtonClassName} type="button" disabled={busy} onClick={onEdit}>
        <Pencil size={15} />
        <span>Edit settings</span>
      </button>
      <button className={dangerButtonClassName} type="button" disabled={busy} onClick={onRemove}>
        <Trash2 size={15} />
        <span>Remove from Fero</span>
      </button>
    </div>
  );
}

function MountStateCard({ drive }: { drive: MountDetailsDrive }) {
  const state = drive.mounted ? "mounted" : drive.health === "attention" ? "attention" : "ready";
  const Icon = state === "mounted" ? CheckCircle2 : state === "attention" ? AlertTriangle : HardDrive;
  const title = state === "mounted" ? "Mounted" : state === "attention" ? "Needs attention" : "Ready to mount";
  const meta = drive.mounted ? drive.mountPoint : drive.endpointLabel;

  return (
    <div className={stateCardClassName} aria-label="Drive mount state">
      <div className={`${stateIconClassName} ${stateToneClassNames[state].icon}`}>
        <Icon size={17} />
      </div>
      <div className={stateCopyClassName}>
        <strong className={stateTitleClassName}>{title}</strong>
        <span className={stateMetaClassName}>{meta}</span>
      </div>
      <span className={`${stateBadgeClassName} ${stateToneClassNames[state].badge}`}>{drive.status}</span>
    </div>
  );
}

function MountIssuePanel({ drive }: { drive: MountDetailsDrive }) {
  return (
    <div className={issueClassName} title={drive.lastIssueDetails ?? undefined}>
      <div className={issueHeadingClassName}>
        <AlertTriangle size={15} />
        <strong className="text-[13px] font-bold text-[var(--ink-strong)]">{drive.lastIssueSummary}</strong>
      </div>
      {drive.lastIssueRecommendation && <span>{drive.lastIssueRecommendation}</span>}
      {drive.lastCheckedAt && <small className="text-[var(--muted)]">Last checked {formatRelativeTime(drive.lastCheckedAt)}</small>}
    </div>
  );
}

function DetailLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className={detailLineClassName}>
      <Icon size={15} />
      <span>{label}</span>
      <strong className={detailValueClassName} title={value}>
        {value}
      </strong>
    </div>
  );
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
