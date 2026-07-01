import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  FolderOpen,
  HardDrive,
  Loader2,
  Play,
  Plus,
  Power,
  RefreshCw,
  Server,
  Settings,
  Square,
  Terminal,
  Wifi,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./App.css";

type JsonValue = unknown;

type DaemonStatus = {
  running: boolean;
  endpoint?: string | null;
  source?: string | null;
  configPath: string;
  logPath: string;
  version?: JsonValue | null;
  lastError?: string | null;
};

type AppOverview = {
  productName: string;
  appVersion: string;
  paths: {
    appConfigDir: string;
    rcloneConfig: string;
    rcloneLog: string;
  };
  daemon: DaemonStatus;
};

type MountSession = {
  id: string;
  remote: string;
  mountPoint: string;
  status: string;
  cacheMode: string;
  health: "healthy" | "attention";
  raw?: JsonValue;
};

type MountForm = {
  remote: string;
  mountPoint: string;
};

type ActionOptions = {
  showOutput?: boolean;
  refreshMounts?: boolean;
  clearMounts?: boolean;
};

const emptyOverview: AppOverview = {
  productName: "Fero",
  appVersion: "0.1.0",
  paths: {
    appConfigDir: "",
    rcloneConfig: "",
    rcloneLog: "",
  },
  daemon: {
    running: false,
    configPath: "",
    logPath: "",
  },
};

function App() {
  const [overview, setOverview] = useState<AppOverview>(emptyOverview);
  const [mounts, setMounts] = useState<MountSession[]>([]);
  const [selectedMountId, setSelectedMountId] = useState<string | null>(null);
  const [output, setOutput] = useState<JsonValue>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mount, setMount] = useState<MountForm>({ remote: "", mountPoint: "" });

  const daemonRunning = overview.daemon.running;
  const selectedMount = useMemo(
    () => mounts.find((item) => item.id === selectedMountId) ?? mounts[0] ?? null,
    [mounts, selectedMountId],
  );

  const versionText = useMemo(() => {
    const version = overview.daemon.version;
    if (version && typeof version === "object" && "version" in version) {
      return String((version as { version?: unknown }).version ?? "running");
    }
    return daemonRunning ? "running" : "offline";
  }, [daemonRunning, overview.daemon.version]);

  function updateMountSelection(nextMounts: MountSession[]) {
    setMounts(nextMounts);
    setSelectedMountId((current) => {
      if (nextMounts.length === 0) return null;
      if (current && nextMounts.some((item) => item.id === current)) return current;
      return nextMounts[0].id;
    });
  }

  async function refreshOverview() {
    const nextOverview = await invoke<AppOverview>("get_overview");
    setOverview(nextOverview);
    return nextOverview;
  }

  async function refreshMountsFromDaemon(showOutput = false) {
    const result = await invoke<JsonValue>("list_mounts");
    if (showOutput) setOutput(result);
    updateMountSelection(extractMounts(result));
    return result;
  }

  async function refreshAll(showOutput = false) {
    setBusy(true);
    setError(null);
    try {
      const nextOverview = await refreshOverview();
      if (nextOverview.daemon.running) {
        await refreshMountsFromDaemon(showOutput);
      } else {
        updateMountSelection([]);
        if (showOutput) setOutput({ daemon: "offline" });
      }
    } catch (err) {
      const rawMessage = rawErrorMessage(err);
      if (showOutput || !isTauriBridgeError(rawMessage)) {
        setError(formatErrorMessage(rawMessage));
      }
    } finally {
      setBusy(false);
    }
  }

  async function runAction<T>(action: () => Promise<T>, options: ActionOptions = {}) {
    const { showOutput = true, refreshMounts = false, clearMounts = false } = options;
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (showOutput) setOutput(result);
      const nextOverview = await refreshOverview();
      if (clearMounts || !nextOverview.daemon.running) {
        updateMountSelection([]);
      } else if (refreshMounts) {
        await refreshMountsFromDaemon(false);
      }
      return result;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startMount() {
    const request = {
      remote: mount.remote.trim(),
      mountPoint: mount.mountPoint.trim(),
    };
    if (!request.remote || !request.mountPoint) return;
    const result = await runAction(() => invoke("start_mount", { request }), { refreshMounts: true });
    if (result) setMount({ remote: "", mountPoint: "" });
  }

  useEffect(() => {
    void refreshAll(false);
  }, []);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Fero navigation">
        <div className="brand">
          <div className="brand-mark">
            <HardDrive size={20} strokeWidth={2.2} />
          </div>
          <div>
            <h1>Fero</h1>
            <p>Mount manager</p>
          </div>
        </div>

        <section className={`daemon-panel ${daemonRunning ? "daemon-panel-online" : ""}`}>
          <div className="daemon-state">
            <StatusDot active={daemonRunning} />
            <span>{daemonRunning ? "Daemon online" : "Daemon offline"}</span>
          </div>
          <div className="daemon-version">{versionText}</div>
          <div className="daemon-actions">
            <ToolbarButton
              icon={Play}
              variant="primary"
              disabled={busy || daemonRunning}
              onClick={() => void runAction(() => invoke("start_rclone"), { refreshMounts: true })}
            >
              Start
            </ToolbarButton>
            <ToolbarButton
              icon={Square}
              disabled={busy || !daemonRunning}
              onClick={() => void runAction(() => invoke("stop_rclone"), { clearMounts: true })}
            >
              Stop
            </ToolbarButton>
          </div>
        </section>

        <nav className="side-nav" aria-label="Workspace">
          <button className="side-nav-item side-nav-item-active" type="button">
            <HardDrive size={17} />
            <span>Mounts</span>
          </button>
          <button
            className="side-nav-item"
            type="button"
            disabled={busy}
            onClick={() => void runAction(() => invoke("list_remotes"))}
          >
            <Cloud size={17} />
            <span>Remotes</span>
          </button>
          <button
            className="side-nav-item"
            type="button"
            disabled={busy}
            onClick={() => void runAction(() => invoke("list_providers"))}
          >
            <Database size={17} />
            <span>Providers</span>
          </button>
        </nav>

        <div className="path-stack">
          <PathLine icon={Settings} label="Config" value={overview.paths.rcloneConfig} />
          <PathLine icon={FileText} label="Log" value={overview.paths.rcloneLog} />
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <div className="section-kicker">
              <Activity size={14} />
              <span>Mount control</span>
            </div>
            <h2>Mounted drives</h2>
          </div>

          <div className="toolbar">
            <ToolbarButton icon={RefreshCw} disabled={busy} onClick={() => void refreshAll(true)}>
              Refresh
            </ToolbarButton>
            <ToolbarButton
              icon={Terminal}
              disabled={busy}
              onClick={() => void runAction(() => invoke("call_rclone_rc", { endpoint: "core/version", payload: {} }))}
            >
              Probe
            </ToolbarButton>
            <ToolbarButton
              icon={daemonRunning ? Power : Play}
              variant={daemonRunning ? "default" : "primary"}
              disabled={busy}
              onClick={() =>
                void runAction(() => invoke(daemonRunning ? "stop_rclone" : "start_rclone"), {
                  refreshMounts: !daemonRunning,
                  clearMounts: daemonRunning,
                })
              }
            >
              {daemonRunning ? "Stop daemon" : "Start daemon"}
            </ToolbarButton>
          </div>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        )}

        <section className="status-strip" aria-label="Overview">
          <StatusTile icon={Server} label="Daemon" value={daemonRunning ? "Online" : "Offline"} tone={daemonRunning ? "good" : "muted"} />
          <StatusTile icon={HardDrive} label="Mounts" value={String(mounts.length)} tone={mounts.length > 0 ? "good" : "muted"} />
          <StatusTile icon={Wifi} label="Endpoint" value={overview.daemon.endpoint ?? "Not bound"} />
          <StatusTile icon={FolderOpen} label="Source" value={overview.daemon.source ?? "Sidecar pending"} />
        </section>

        <div className="home-grid">
          <section className="mount-pane">
            <PaneHeader title="Mount sessions" meta={`${mounts.length} active`} icon={HardDrive} />
            <div className="mount-list">
              {mounts.length > 0 ? (
                mounts.map((item) => (
                  <MountRow
                    key={item.id}
                    mount={item}
                    selected={selectedMount?.id === item.id}
                    onSelect={() => setSelectedMountId(item.id)}
                  />
                ))
              ) : (
                <EmptyMounts daemonRunning={daemonRunning} />
              )}
            </div>
          </section>

          <aside className="detail-pane">
            <section className="pane-section">
              <PaneHeader title="New mount" meta={daemonRunning ? "Daemon ready" : "Starts daemon if needed"} icon={Plus} />
              <form
                className="mount-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startMount();
                }}
              >
                <Input
                  label="Remote"
                  value={mount.remote}
                  onChange={(value) => setMount((current) => ({ ...current, remote: value }))}
                  placeholder="drive:"
                />
                <Input
                  label="Mount point"
                  value={mount.mountPoint}
                  onChange={(value) => setMount((current) => ({ ...current, mountPoint: value }))}
                  placeholder="/Volumes/FeroDrive"
                />
                <button className="submit-button" type="submit" disabled={busy || !mount.remote.trim() || !mount.mountPoint.trim()}>
                  {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                  <span>Start mount</span>
                </button>
              </form>
            </section>

            <section className="pane-section">
              <PaneHeader title="Selected mount" meta={selectedMount ? selectedMount.status : "None selected"} icon={Activity} />
              {selectedMount ? (
                <MountDetails
                  mount={selectedMount}
                  busy={busy}
                  onUnmount={() =>
                    void runAction(() => invoke("unmount", { mountPoint: selectedMount.mountPoint }), {
                      refreshMounts: true,
                    })
                  }
                />
              ) : (
                <div className="empty-detail">
                  <XCircle size={18} />
                  <span>No active mount selected</span>
                </div>
              )}
            </section>

            <section className="pane-section output-section">
              <PaneHeader title="Last response" meta="Tauri / rclone RC" icon={Terminal} />
              <pre className="output">{output ? JSON.stringify(output, null, 2) : "No command output yet."}</pre>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ToolbarButton({
  icon: Icon,
  children,
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  children: ReactNode;
  variant?: "default" | "primary";
}) {
  return (
    <button className={`tool-button tool-button-${variant} ${className}`} type="button" {...props}>
      <Icon size={16} />
      <span>{children}</span>
    </button>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`status-dot ${active ? "status-dot-active" : ""}`} aria-hidden="true" />;
}

function StatusTile({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "default" | "good" | "muted";
}) {
  return (
    <div className={`status-tile status-tile-${tone}`}>
      <Icon size={17} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function PaneHeader({ title, meta, icon: Icon }: { title: string; meta: string; icon: LucideIcon }) {
  return (
    <div className="pane-header">
      <div>
        <Icon size={16} />
        <h3>{title}</h3>
      </div>
      <span>{meta}</span>
    </div>
  );
}

function MountRow({ mount, selected, onSelect }: { mount: MountSession; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`mount-row ${selected ? "mount-row-selected" : ""}`} type="button" onClick={onSelect}>
      <div className="mount-row-icon">
        <HardDrive size={18} />
      </div>
      <div className="mount-row-main">
        <div className="mount-row-top">
          <strong>{mount.mountPoint}</strong>
          <span className={`health-pill health-pill-${mount.health}`}>{mount.status}</span>
        </div>
        <div className="mount-row-meta">
          <span>{mount.remote}</span>
          <span>{mount.cacheMode}</span>
        </div>
      </div>
    </button>
  );
}

function EmptyMounts({ daemonRunning }: { daemonRunning: boolean }) {
  return (
    <div className="empty-mounts">
      <div className="empty-icon">
        <HardDrive size={22} />
      </div>
      <strong>{daemonRunning ? "No active mounts" : "Daemon is offline"}</strong>
      <span>{daemonRunning ? "Create a mount from a configured remote." : "Start the daemon before refreshing mount sessions."}</span>
    </div>
  );
}

function MountDetails({ mount, busy, onUnmount }: { mount: MountSession; busy: boolean; onUnmount: () => void }) {
  return (
    <div className="mount-details">
      <DetailLine icon={HardDrive} label="Mount point" value={mount.mountPoint} />
      <DetailLine icon={Cloud} label="Remote" value={mount.remote} />
      <DetailLine icon={CheckCircle2} label="Health" value={mount.health === "healthy" ? "Mounted" : "Needs attention"} />
      <DetailLine icon={Database} label="Cache" value={mount.cacheMode} />
      <button className="danger-button" type="button" disabled={busy} onClick={onUnmount}>
        <Square size={15} />
        <span>Unmount</span>
      </button>
    </div>
  );
}

function DetailLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="detail-line">
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} />
    </label>
  );
}

function PathLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="path-line">
      <Icon size={14} />
      <span>{label}</span>
      <strong title={value}>{shortPath(value)}</strong>
    </div>
  );
}

function extractMounts(value: JsonValue): MountSession[] {
  const record = asRecord(value);
  if (!record) return [];

  const mountItems = Array.isArray(record.mounts)
    ? record.mounts
    : Array.isArray(record.mountPoints)
      ? record.mountPoints
      : [];

  return mountItems
    .map((item, index) => mountFromItem(item, index))
    .filter((item): item is MountSession => Boolean(item));
}

function mountFromItem(item: JsonValue, index: number): MountSession | null {
  if (typeof item === "string") {
    return {
      id: item,
      remote: "rclone mount",
      mountPoint: item,
      status: "mounted",
      cacheMode: "rclone default",
      health: "healthy",
      raw: item,
    };
  }

  const record = asRecord(item);
  if (!record) return null;

  const mountPoint = stringField(record, ["mountPoint", "MountPoint", "mount_point", "path", "Path"]);
  if (!mountPoint) return null;

  const remote = stringField(record, ["fs", "Fs", "remote", "Remote", "source", "Source"]) ?? "rclone mount";
  const status = stringField(record, ["status", "Status", "state", "State"]) ?? "mounted";
  const cacheMode = stringField(record, ["cacheMode", "CacheMode", "vfsCacheMode", "VfsCacheMode"]) ?? "rclone default";
  const health = status.toLowerCase().includes("error") ? "attention" : "healthy";

  return {
    id: `${remote}:${mountPoint}:${index}`,
    remote,
    mountPoint,
    status,
    cacheMode,
    health,
    raw: item,
  };
}

function asRecord(value: JsonValue): Record<string, JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, JsonValue>;
}

function stringField(record: Record<string, JsonValue>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function shortPath(value: string) {
  if (!value) return "not resolved";
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || value;
}

function errorMessage(err: unknown) {
  return formatErrorMessage(rawErrorMessage(err));
}

function rawErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function formatErrorMessage(message: string) {
  return isTauriBridgeError(message) ? "Tauri command bridge is unavailable in this browser preview." : message;
}

function isTauriBridgeError(message: string) {
  return message.includes("invoke") && message.includes("undefined");
}

export default App;
