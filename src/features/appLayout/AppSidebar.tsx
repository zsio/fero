import {
  Activity,
  Database,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Play,
  Settings,
  Square,
  Terminal,
} from "lucide-react";
import { PathLine, ToolbarButton } from "../workspace/WorkspaceChrome";

type SidebarPaths = {
  defaultMountRoot: string;
  rcloneConfig: string;
  rcloneCache: string;
  rcloneLog: string;
};

type RestoreSummary = {
  attempted: number;
  mounted: number;
} | null;

const sidebarClassName =
  "flex min-h-0 flex-col gap-[18px] border-r border-[var(--line)] bg-[var(--sidebar)] p-[18px]";
const brandClassName = "flex min-h-[46px] items-center gap-3";
const brandMarkClassName =
  "grid size-[42px] place-items-center rounded-lg border border-[rgba(117,215,180,0.48)] bg-[linear-gradient(145deg,rgba(117,215,180,0.18),rgba(134,180,255,0.1))] text-[var(--accent)]";
const navClassName = "grid gap-1.5";
const navItemBaseClassName =
  "flex min-h-[38px] w-full items-center gap-2.5 rounded-[7px] border px-2.5 py-2 text-left transition-colors";
const navItemClassName =
  `${navItemBaseClassName} border-transparent bg-transparent text-[var(--muted-strong)] hover:border-[var(--line)] hover:bg-[var(--panel)] hover:text-[var(--ink-strong)]`;
const activeNavItemClassName =
  `${navItemBaseClassName} border-[var(--line)] bg-[var(--panel)] text-[var(--accent)]`;
const serviceCardBaseClassName =
  "mt-auto rounded-lg border bg-[var(--panel-soft)] p-3";
const serviceCardClassName = {
  standby: `${serviceCardBaseClassName} border-[var(--line)]`,
  online: `${serviceCardBaseClassName} border-[rgba(117,215,180,0.38)]`,
};
const restoreNoteClassName = {
  normal:
    "mt-3 rounded-[7px] border border-[rgba(117,215,180,0.25)] bg-[rgba(117,215,180,0.08)] px-[9px] py-2 text-xs leading-snug text-[var(--muted-strong)]",
  warning:
    "mt-3 rounded-[7px] border border-[rgba(239,196,90,0.36)] bg-[rgba(239,196,90,0.1)] px-[9px] py-2 text-xs leading-snug text-[#f5d991]",
};
const detailsClassName = "group mt-3";
const summaryClassName =
  "flex min-h-[30px] cursor-pointer list-none items-center gap-[7px] rounded-[7px] border border-[rgba(48,58,67,0.76)] bg-[#11171c] px-2 py-1.5 text-xs font-semibold text-[var(--muted-strong)] group-open:border-[var(--line-strong)] group-open:text-[var(--ink-strong)] [&::-webkit-details-marker]:hidden";
const serviceActionsClassName = "mt-2 grid grid-cols-2 gap-2";
const sidebarFootClassName = "grid gap-2";

export function AppSidebar({
  paths,
  daemonRunning,
  restoring,
  restoreResult,
  restoreFailures,
  busy,
  onShowActivity,
  onToggleDiagnostics,
  onStartService,
  onStopService,
}: {
  paths: SidebarPaths;
  daemonRunning: boolean;
  restoring: boolean;
  restoreResult: RestoreSummary;
  restoreFailures: number;
  busy: boolean;
  onShowActivity: () => void;
  onToggleDiagnostics: () => void;
  onStartService: () => void;
  onStopService: () => void;
}) {
  const serviceActive = daemonRunning || restoring;
  const serviceTitle = restoring ? "Restoring drives" : daemonRunning ? "Service running" : "Service standby";
  const serviceCopy = restoring
    ? "Checking saved drives for launch restore"
    : daemonRunning
      ? "Ready to mount drives"
      : "Starts automatically when needed";

  return (
    <aside className={sidebarClassName} aria-label="Fero navigation">
      <div className={brandClassName}>
        <div className={brandMarkClassName}>
          <HardDrive size={20} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <h1 className="m-0 text-[21px] font-bold leading-none text-[var(--ink-strong)]">Fero</h1>
          <p className="m-0 mt-1 text-xs text-[var(--muted)]">Network drives</p>
        </div>
      </div>

      <nav className={navClassName} aria-label="Workspace">
        <button className={activeNavItemClassName} type="button">
          <HardDrive size={17} />
          <span>Drives</span>
        </button>
        <button className={navItemClassName} type="button" onClick={onShowActivity}>
          <Activity size={17} />
          <span>Activity</span>
        </button>
        <button className={navItemClassName} type="button" onClick={onToggleDiagnostics}>
          <Settings size={17} />
          <span>Diagnostics</span>
        </button>
      </nav>

      <section className={daemonRunning ? serviceCardClassName.online : serviceCardClassName.standby}>
        <div className="grid grid-cols-[14px_minmax(0,1fr)] items-start gap-2">
          <StatusDot active={serviceActive} />
          <div className="min-w-0">
            <strong className="block text-[13px] font-bold text-[var(--ink-strong)]">{serviceTitle}</strong>
            <span className="mt-1 block text-xs leading-snug text-[var(--muted)]">{serviceCopy}</span>
          </div>
        </div>

        {(restoring || (restoreResult && restoreResult.attempted > 0)) && (
          <div className={restoreFailures > 0 ? restoreNoteClassName.warning : restoreNoteClassName.normal}>
            {restoring
              ? "Restoring saved drives..."
              : restoreFailures > 0
                ? `${restoreFailures} drive${restoreFailures === 1 ? "" : "s"} need attention`
                : `${restoreResult?.mounted ?? 0}/${restoreResult?.attempted ?? 0} restored on launch`}
          </div>
        )}

        <details className={detailsClassName}>
          <summary className={summaryClassName}>
            <Settings size={14} />
            <span>Engine controls</span>
          </summary>
          <div className={serviceActionsClassName}>
            <ToolbarButton icon={Play} variant="primary" disabled={busy || daemonRunning} onClick={onStartService}>
              Start
            </ToolbarButton>
            <ToolbarButton icon={Square} disabled={busy || !daemonRunning} onClick={onStopService}>
              Stop
            </ToolbarButton>
          </div>
        </details>
      </section>

      <div className={sidebarFootClassName}>
        <PathLine icon={FolderPlus} label="Mounts" value={paths.defaultMountRoot} />
        <PathLine icon={FolderOpen} label="Config" value={paths.rcloneConfig} />
        <PathLine icon={Database} label="Cache" value={paths.rcloneCache} />
        <PathLine icon={Terminal} label="Logs" value={paths.rcloneLog} />
      </div>
    </aside>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`mt-1 size-2 rounded-full ${
        active
          ? "bg-[var(--accent)] shadow-[0_0_0_3px_rgba(117,215,180,0.15)]"
          : "bg-[var(--muted)] shadow-[0_0_0_3px_rgba(142,154,166,0.12)]"
      }`}
      aria-hidden="true"
    />
  );
}
