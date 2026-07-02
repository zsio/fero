import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Activity,
  AlertTriangle,
  Cloud,
  Database,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActivityPanel } from "./features/activity/ActivityPanel";
import type { ActivityLogEntry } from "./features/activity/ActivityPanel";
import { ConnectionTestPanel } from "./features/driveSetup/ConnectionTestPanel";
import { DriveReadinessPanel } from "./features/driveSetup/DriveReadinessPanel";
import { MountEnvironmentPanel } from "./features/driveSetup/MountEnvironmentPanel";
import { MountPointRecommendation } from "./features/driveSetup/MountPointRecommendation";
import { ProtocolHint, ProtocolPicker, SetupRail } from "./features/driveSetup/ProtocolSetup";
import {
  cacheLabelFromString,
  canSaveDriveForm,
  canTestDriveForm,
  environmentTone,
  environmentValue,
  makeDefaultForm,
  normalizeCacheMode,
  normalizeProtocolId,
  protocols,
  shortPath,
} from "./features/driveSetup/model";
import type {
  CacheMode,
  DriveForm,
  MountEnvironment,
  MountPointSuggestion,
  NetworkDriveTestResult,
  ProtocolId,
} from "./features/driveSetup/model";
import { DriveRow } from "./features/driveLibrary/DriveRow";
import type { DriveRowView } from "./features/driveLibrary/DriveRow";
import { EmptyDriveDetails } from "./features/driveLibrary/EmptyDriveDetails";
import { EmptyDriveList } from "./features/driveLibrary/EmptyDriveList";
import "./styles/index.css";

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
    rcloneCache: string;
    defaultMountRoot: string;
    activityLog: string;
    rcloneLog: string;
    driveCatalog: string;
  };
  daemon: DaemonStatus;
  mountEnvironment: MountEnvironment;
  drives: SavedDrive[];
};

type MountSession = {
  id: string;
  remote: string;
  mountPoint: string;
  status: string;
  cacheMode: string;
  protocol: string;
  health: "healthy" | "attention";
  raw?: JsonValue;
};

type SavedDrive = {
  id: string;
  displayName: string;
  protocol: ProtocolId | string;
  remoteName: string;
  fs: string;
  mountPoint: string;
  remotePath: string;
  cacheMode: string;
  autoMount?: boolean;
  url?: string | null;
  host?: string | null;
  port?: string | null;
  username?: string | null;
  domain?: string | null;
  share?: string | null;
  webdavVendor?: string | null;
  lastMountState?: string | null;
  lastIssueSummary?: string | null;
  lastIssueRecommendation?: string | null;
  lastIssueDetails?: string | null;
  lastCheckedAt?: number | null;
  createdAt: number;
};

type DriveListItem = {
  id: string;
  displayName: string;
  protocol: string;
  remote: string;
  mountPoint: string;
  status: string;
  cacheMode: string;
  health: "healthy" | "attention" | "standby";
  mounted: boolean;
  fs: string;
  autoMount: boolean;
  remotePath: string;
  url?: string | null;
  host?: string | null;
  port?: string | null;
  username?: string | null;
  domain?: string | null;
  share?: string | null;
  webdavVendor?: string | null;
  lastMountState?: string | null;
  lastIssueSummary?: string | null;
  lastIssueRecommendation?: string | null;
  lastIssueDetails?: string | null;
  lastCheckedAt?: number | null;
};

type RestoreDriveItem = {
  drive: SavedDrive;
  mounted: boolean;
  status: string;
  message?: string | null;
};

type RestoreDrivesResult = {
  attempted: number;
  mounted: number;
  skipped: number;
  items: RestoreDriveItem[];
};

type DriveCacheStatus = {
  driveId: string;
  cacheMode: string;
  cacheRoot: string;
  driveCachePaths: string[];
  driveBytes: number;
  totalBytes: number;
  fileCount: number;
  mounted: boolean;
  lastScannedAt: number;
  message: string;
};

type ClearDriveCacheResult = {
  status: DriveCacheStatus;
  removedBytes: number;
  removedPaths: string[];
  warnings: string[];
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
    rcloneCache: "",
    defaultMountRoot: "",
    activityLog: "",
    rcloneLog: "",
    driveCatalog: "",
  },
  daemon: {
    running: false,
    configPath: "",
    logPath: "",
  },
  mountEnvironment: {
    platform: "Desktop",
    requirement: "Mount support",
    state: "unknown",
    summary: "Mount support is not checked.",
    recommendation: "Open Fero as a desktop app to verify local mount support.",
    detectedPaths: [],
  },
  drives: [],
};

const initialDriveForm = makeDefaultForm("webdav");

function App() {
  const [overview, setOverview] = useState<AppOverview>(emptyOverview);
  const [activeMounts, setActiveMounts] = useState<MountSession[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string | null>(null);
  const [output, setOutput] = useState<JsonValue>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drive, setDrive] = useState<DriveForm>(initialDriveForm);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreDrivesResult | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTest, setConnectionTest] = useState<NetworkDriveTestResult | null>(null);
  const [editingDriveId, setEditingDriveId] = useState<string | null>(null);
  const [editDrive, setEditDrive] = useState<DriveForm | null>(null);
  const [editConnectionTest, setEditConnectionTest] = useState<NetworkDriveTestResult | null>(null);
  const [testingEditConnection, setTestingEditConnection] = useState(false);
  const [cacheStatusByDrive, setCacheStatusByDrive] = useState<Record<string, DriveCacheStatus>>({});
  const [cacheBusyDriveId, setCacheBusyDriveId] = useState<string | null>(null);
  const [mountPointCustom, setMountPointCustom] = useState(false);
  const [suggestingMountPoint, setSuggestingMountPoint] = useState(false);
  const [mountPointSuggestion, setMountPointSuggestion] = useState<MountPointSuggestion | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const daemonRunning = overview.daemon.running;
  const selectedProtocol = protocols.find((protocol) => protocol.id === drive.protocol) ?? protocols[0];
  const restoreFailures = restoreResult?.items.filter((item) => item.status === "failed").length ?? 0;
  const attentionCount = overview.drives.filter((item) => Boolean(item.lastIssueSummary)).length;
  const mountEnvironmentTone = environmentTone(overview.mountEnvironment.state);
  const mountEnvironmentValue = environmentValue(overview.mountEnvironment.state);
  const driveItems = useMemo(
    () => buildDriveList(overview.drives, activeMounts),
    [overview.drives, activeMounts],
  );
  const mountedDriveCount = driveItems.filter((item) => item.mounted).length;
  const readyDriveCount = driveItems.filter((item) => !item.mounted && item.health === "standby").length;
  const scannedCacheStatuses = Object.values(cacheStatusByDrive);
  const scannedCacheCount = scannedCacheStatuses.length;
  const scannedCacheBytes = scannedCacheStatuses.reduce((total, status) => total + status.driveBytes, 0);
  const cacheOverviewValue =
    scannedCacheBytes > 0 ? formatBytes(scannedCacheBytes) : scannedCacheCount > 0 ? `${scannedCacheCount} scanned` : "Not scanned";
  const selectedDrive = useMemo(
    () => driveItems.find((item) => item.id === selectedDriveId) ?? driveItems[0] ?? null,
    [driveItems, selectedDriveId],
  );

  const canTestDrive = canTestDriveForm(drive);
  const canCreateDrive = canSaveDriveForm(drive);
  const canTestEditDrive = editDrive ? canTestDriveForm(editDrive) : false;
  const canSaveEditDrive = editDrive ? canSaveDriveForm(editDrive) : false;
  const isEditingSelectedDrive = Boolean(selectedDrive && editDrive && editingDriveId === selectedDrive.id);

  function updateActiveMounts(nextMounts: MountSession[], savedDrives = overview.drives) {
    setActiveMounts(nextMounts);
    setSelectedDriveId((current) => {
      if (current) return current;
      const nextItems = buildDriveList(savedDrives, nextMounts);
      return nextItems[0]?.id ?? null;
    });
  }

  async function refreshOverview() {
    const nextOverview = await invoke<AppOverview>("get_overview");
    setOverview(nextOverview);
    return nextOverview;
  }

  async function refreshMountsFromDaemon(showOutput = false, savedDrives = overview.drives) {
    const result = await invoke<JsonValue>("list_mounts");
    if (showOutput) setOutput(result);
    updateActiveMounts(extractMounts(result), savedDrives);
    return result;
  }

  async function refreshAll(showOutput = false) {
    setBusy(true);
    setError(null);
    try {
      const nextOverview = await refreshOverview();
      if (nextOverview.daemon.running) {
        await refreshMountsFromDaemon(showOutput, nextOverview.drives);
      } else {
        updateActiveMounts([], nextOverview.drives);
        if (showOutput) setOutput({ service: "offline" });
      }
      await loadActivityLog(false);
    } catch (err) {
      const rawMessage = rawErrorMessage(err);
      if (showOutput || !isTauriBridgeError(rawMessage)) {
        setError(formatErrorMessage(rawMessage));
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadActivityLog(showOutput = false) {
    setLoadingActivity(true);
    try {
      const entries = await invoke<ActivityLogEntry[]>("get_activity_log", { limit: 40 });
      setActivityLog(entries);
      if (showOutput) setOutput(entries);
      return entries;
    } catch (err) {
      const rawMessage = rawErrorMessage(err);
      if (!isTauriBridgeError(rawMessage)) {
        setError(formatErrorMessage(rawMessage));
      }
      return [];
    } finally {
      setLoadingActivity(false);
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
        updateActiveMounts([], nextOverview.drives);
      } else if (refreshMounts) {
        await refreshMountsFromDaemon(false, nextOverview.drives);
      }
      await loadActivityLog(false);
      return result;
    } catch (err) {
      setError(errorMessage(err));
      setDiagnosticsOpen(true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createNetworkDrive() {
    if (!canCreateDrive) return;
    const result = await runAction(
      () =>
        invoke("create_network_drive", {
          request: toNetworkDriveRequest(drive),
        }),
      { refreshMounts: true },
    );
    if (result) {
      setDrive(makeDefaultForm(drive.protocol));
      setMountPointCustom(false);
    }
  }

  function startEditingDrive(item: DriveListItem) {
    setEditingDriveId(item.id);
    setEditDrive(formFromDriveItem(item));
    setEditConnectionTest(null);
  }

  function stopEditingDrive() {
    setEditingDriveId(null);
    setEditDrive(null);
    setEditConnectionTest(null);
    setTestingEditConnection(false);
  }

  async function testConnection() {
    if (!canTestDrive) return;
    setBusy(true);
    setTestingConnection(true);
    setError(null);
    try {
      const result = await invoke<NetworkDriveTestResult>("test_network_drive", {
        request: toNetworkDriveRequest(drive),
      });
      setConnectionTest(result);
      setOutput(result);
      const nextOverview = await refreshOverview();
      if (nextOverview.daemon.running) {
        await refreshMountsFromDaemon(false, nextOverview.drives);
      }
      await loadActivityLog(false);
    } catch (err) {
      setError(errorMessage(err));
      setDiagnosticsOpen(true);
    } finally {
      setTestingConnection(false);
      setBusy(false);
    }
  }

  async function testEditedConnection() {
    if (!editDrive || !canTestEditDrive) return;
    setBusy(true);
    setTestingEditConnection(true);
    setError(null);
    try {
      const result = await invoke<NetworkDriveTestResult>("test_network_drive", {
        request: toNetworkDriveRequest(editDrive),
      });
      setEditConnectionTest(result);
      setOutput(result);
      const nextOverview = await refreshOverview();
      if (nextOverview.daemon.running) {
        await refreshMountsFromDaemon(false, nextOverview.drives);
      }
      await loadActivityLog(false);
    } catch (err) {
      setError(errorMessage(err));
      setDiagnosticsOpen(true);
    } finally {
      setTestingEditConnection(false);
      setBusy(false);
    }
  }

  async function saveEditedDrive(item: DriveListItem) {
    if (!editDrive || !canSaveEditDrive) return;
    const result = await runAction(
      () =>
        invoke("update_saved_drive", {
          driveId: item.id,
          request: toNetworkDriveRequest(editDrive),
        }),
      { refreshMounts: true },
    );
    if (result) {
      stopEditingDrive();
    }
  }

  async function chooseLocalFolder() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose a local folder for this network drive",
      });
      if (typeof selected === "string") {
        setDrive((current) => ({ ...current, mountPoint: selected }));
        setMountPointCustom(true);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function chooseEditLocalFolder() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose a local folder for this network drive",
      });
      if (typeof selected === "string") {
        setEditDrive((current) => (current ? { ...current, mountPoint: selected } : current));
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function mountSavedDrive(item: DriveListItem) {
    await runAction(() => invoke("mount_saved_drive", { driveId: item.id }), { refreshMounts: true });
  }

  async function setDriveAutoMount(item: DriveListItem, autoMount: boolean) {
    await runAction(
      () =>
        invoke("set_drive_auto_mount", {
          driveId: item.id,
          autoMount,
        }),
      { refreshMounts: true },
    );
  }

  async function loadCacheStatus(item: DriveListItem, showOutput = false) {
    setCacheBusyDriveId(item.id);
    setError(null);
    try {
      const status = await invoke<DriveCacheStatus>("get_cache_status", { driveId: item.id });
      setCacheStatusByDrive((current) => ({ ...current, [item.id]: status }));
      if (showOutput) setOutput(status);
      return status;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setCacheBusyDriveId(null);
    }
  }

  async function clearDriveCache(item: DriveListItem) {
    setCacheBusyDriveId(item.id);
    setError(null);
    try {
      const result = await invoke<ClearDriveCacheResult>("clear_drive_cache", { driveId: item.id });
      setCacheStatusByDrive((current) => ({ ...current, [item.id]: result.status }));
      setOutput(result);
      if (result.warnings.length > 0) {
        setDiagnosticsOpen(true);
      }
    } catch (err) {
      setError(errorMessage(err));
      setDiagnosticsOpen(true);
    } finally {
      setCacheBusyDriveId(null);
    }
  }

  async function removeSavedDrive(item: DriveListItem) {
    const confirmed = await confirmDialog(
      `Remove "${item.displayName}" from Fero? This will unmount it if possible and remove its saved connection.`,
      {
        title: "Remove network drive",
        kind: "warning",
        okLabel: "Remove",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) return;
    await runAction(() => invoke("remove_saved_drive", { driveId: item.id }), { refreshMounts: true });
  }

  async function openLocalFolder(item: DriveListItem) {
    setError(null);
    try {
      await openPath(item.mountPoint);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function openLogFile() {
    setError(null);
    try {
      await openPath(overview.paths.activityLog || overview.paths.rcloneLog);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function focusActivityPanel() {
    document.querySelector("[data-activity-panel]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function selectProtocol(protocol: ProtocolId) {
    setDrive((current) => {
      const next = makeDefaultForm(protocol);
      const currentName = current.displayName.trim();
      const shouldUseDefaultName = protocols.some((definition) => definition.defaultName === currentName);
      return {
        ...next,
        displayName: shouldUseDefaultName || !currentName ? next.displayName : current.displayName,
        mountPoint: mountPointCustom ? current.mountPoint : next.mountPoint,
        username: current.username,
        password: current.password,
      };
    });
  }

  async function loadMountPointSuggestion(displayName: string, applyToForm: boolean) {
    const trimmedName = displayName.trim() || selectedProtocol.defaultName;
    setSuggestingMountPoint(true);
    try {
      const suggestion = await invoke<MountPointSuggestion>("suggest_mount_point", {
        displayName: trimmedName,
      });
      setMountPointSuggestion(suggestion);
      if (applyToForm) {
        setDrive((current) => ({ ...current, mountPoint: suggestion.path }));
      }
      return suggestion;
    } catch (err) {
      const rawMessage = rawErrorMessage(err);
      if (!isTauriBridgeError(rawMessage)) {
        setError(formatErrorMessage(rawMessage));
      }
      const fallback = fallbackMountPointSuggestion(trimmedName, overview.paths.defaultMountRoot);
      setMountPointSuggestion(fallback);
      if (applyToForm) {
        setDrive((current) => ({ ...current, mountPoint: fallback.path }));
      }
      return fallback;
    } finally {
      setSuggestingMountPoint(false);
    }
  }

  async function useRecommendedMountPoint() {
    setMountPointCustom(false);
    await loadMountPointSuggestion(drive.displayName, true);
  }

  async function bootstrapApp() {
    setRestoring(true);
    setError(null);
    try {
      const nextOverview = await refreshOverview();
      if (nextOverview.drives.some((item) => item.autoMount !== false)) {
        const result = await invoke<RestoreDrivesResult>("restore_saved_drives");
        setRestoreResult(result);
        setOutput(result);
      }

      const latestOverview = await refreshOverview();
      if (latestOverview.daemon.running) {
        await refreshMountsFromDaemon(false, latestOverview.drives);
      } else {
        updateActiveMounts([], latestOverview.drives);
      }
      await loadActivityLog(false);
    } catch (err) {
      const rawMessage = rawErrorMessage(err);
      if (!isTauriBridgeError(rawMessage)) {
        setError(formatErrorMessage(rawMessage));
      }
    } finally {
      setRestoring(false);
    }
  }

  useEffect(() => {
    void bootstrapApp();
  }, []);

  useEffect(() => {
    setConnectionTest(null);
  }, [
    drive.protocol,
    drive.url,
    drive.host,
    drive.port,
    drive.username,
    drive.password,
    drive.domain,
    drive.share,
    drive.remotePath,
    drive.webdavVendor,
  ]);

  useEffect(() => {
    setEditConnectionTest(null);
  }, [
    editDrive?.protocol,
    editDrive?.url,
    editDrive?.host,
    editDrive?.port,
    editDrive?.username,
    editDrive?.password,
    editDrive?.domain,
    editDrive?.share,
    editDrive?.remotePath,
    editDrive?.webdavVendor,
  ]);

  useEffect(() => {
    if (editingDriveId && selectedDrive?.id !== editingDriveId) {
      stopEditingDrive();
    }
  }, [selectedDrive?.id, editingDriveId]);

  useEffect(() => {
    if (selectedDrive) {
      void loadCacheStatus(selectedDrive, false);
    }
  }, [selectedDrive?.id, selectedDrive?.cacheMode, selectedDrive?.mounted]);

  useEffect(() => {
    if (!mountPointCustom) {
      void loadMountPointSuggestion(drive.displayName, true);
    }
  }, [drive.displayName, overview.paths.defaultMountRoot, mountPointCustom]);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Fero navigation">
        <div className="brand">
          <div className="brand-mark">
            <HardDrive size={20} strokeWidth={2.2} />
          </div>
          <div>
            <h1>Fero</h1>
            <p>Network drives</p>
          </div>
        </div>

        <nav className="side-nav" aria-label="Workspace">
          <button className="side-nav-item side-nav-item-active" type="button">
            <HardDrive size={17} />
            <span>Drives</span>
          </button>
          <button className="side-nav-item" type="button" onClick={focusActivityPanel}>
            <Activity size={17} />
            <span>Activity</span>
          </button>
          <button className="side-nav-item" type="button" onClick={() => setDiagnosticsOpen((open) => !open)}>
            <Settings size={17} />
            <span>Diagnostics</span>
          </button>
        </nav>

        <section className={`service-card ${daemonRunning ? "service-card-online" : ""}`}>
          <div className="service-state">
            <StatusDot active={daemonRunning || restoring} />
            <div>
              <strong>{restoring ? "Restoring drives" : daemonRunning ? "Service running" : "Service standby"}</strong>
              <span>
                {restoring
                  ? "Checking saved drives for launch restore"
                  : daemonRunning
                    ? "Ready to mount drives"
                    : "Starts automatically when needed"}
              </span>
            </div>
          </div>
          {(restoring || (restoreResult && restoreResult.attempted > 0)) && (
            <div className={`restore-note ${restoreFailures > 0 ? "restore-note-warning" : ""}`}>
              {restoring
                ? "Restoring saved drives..."
                : restoreFailures > 0
                  ? `${restoreFailures} drive${restoreFailures === 1 ? "" : "s"} need attention`
                  : `${restoreResult?.mounted ?? 0}/${restoreResult?.attempted ?? 0} restored on launch`}
            </div>
          )}
          <details className="service-advanced">
            <summary>
              <Settings size={14} />
              <span>Engine controls</span>
            </summary>
            <div className="service-actions">
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
          </details>
        </section>

        <div className="sidebar-foot">
          <PathLine icon={FolderPlus} label="Mounts" value={overview.paths.defaultMountRoot} />
          <PathLine icon={FolderOpen} label="Config" value={overview.paths.rcloneConfig} />
          <PathLine icon={Database} label="Cache" value={overview.paths.rcloneCache} />
          <PathLine icon={Terminal} label="Logs" value={overview.paths.rcloneLog} />
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <div className="section-kicker">
              <Wifi size={14} />
              <span>Local drive workspace</span>
            </div>
            <h2>Drives</h2>
            <p>WebDAV, SFTP, FTP and SMB storage mounted into local folders.</p>
          </div>

          <div className="toolbar">
            <ToolbarButton icon={RefreshCw} disabled={busy} onClick={() => void refreshAll(true)}>
              Refresh
            </ToolbarButton>
            <ToolbarButton icon={Plus} variant="primary" disabled={busy} onClick={() => focusFirstCreateField()}>
              Add drive
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
          <StatusTile icon={HardDrive} label="Drive library" value={String(driveItems.length)} tone={driveItems.length > 0 ? "good" : "muted"} />
          <StatusTile icon={FolderOpen} label="Mounted" value={`${mountedDriveCount}/${driveItems.length}`} tone={mountedDriveCount > 0 ? "good" : "muted"} />
          <StatusTile icon={Play} label="Ready" value={String(readyDriveCount)} tone={readyDriveCount > 0 ? "good" : "muted"} />
          <StatusTile icon={AlertTriangle} label="Needs attention" value={String(attentionCount)} tone={attentionCount > 0 ? "warning" : "muted"} />
          <StatusTile icon={ShieldCheck} label="Mount system" value={mountEnvironmentValue} tone={mountEnvironmentTone} />
          <StatusTile icon={Database} label="Cache" value={cacheOverviewValue} tone={scannedCacheCount > 0 ? "default" : "muted"} />
        </section>

        <div className="home-grid">
          <section className="drive-pane">
            <PaneHeader title="Network drives" meta={`${activeMounts.length} mounted`} icon={HardDrive} />
            <div className="drive-list">
              {driveItems.length > 0 ? (
                driveItems.map((item) => (
                  <DriveRow
                    key={item.id}
                    drive={driveRowView(item)}
                    selected={selectedDrive?.id === item.id}
                    onSelect={() => setSelectedDriveId(item.id)}
                  />
                ))
              ) : (
                <EmptyDriveList daemonRunning={daemonRunning} onCreate={() => focusFirstCreateField()} />
              )}
            </div>
          </section>

          <aside className="detail-pane">
            <section className="pane-section create-pane">
              <PaneHeader title="Add network drive" meta={selectedProtocol.label} icon={FolderPlus} />
              <ProtocolPicker selected={drive.protocol} onSelect={selectProtocol} />
              <SetupRail protocol={selectedProtocol} />
              <MountEnvironmentPanel environment={overview.mountEnvironment} />
              <DriveReadinessPanel
                form={drive}
                protocol={selectedProtocol}
                suggestion={mountPointSuggestion}
              />

              <form
                className="drive-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createNetworkDrive();
                }}
              >
                <TextInput
                  id="drive-name"
                  label="Drive name"
                  value={drive.displayName}
                  onChange={(value) => setDrive((current) => ({ ...current, displayName: value }))}
                  placeholder={selectedProtocol.defaultName}
                />

                <MountPointRecommendation
                  suggestion={mountPointSuggestion}
                  active={!mountPointCustom}
                  busy={suggestingMountPoint}
                  onUse={() => void useRecommendedMountPoint()}
                />

                {drive.protocol === "webdav" ? (
                  <TextInput
                    label="WebDAV address"
                    value={drive.url}
                    onChange={(value) => setDrive((current) => ({ ...current, url: value }))}
                    placeholder="https://cloud.example.com/remote.php/dav/files/me/"
                  />
                ) : (
                  <div className="form-grid two">
                    <TextInput
                      label="Server"
                      value={drive.host}
                      onChange={(value) => setDrive((current) => ({ ...current, host: value }))}
                      placeholder={drive.protocol === "smb" ? "NAS.local" : "files.example.com"}
                    />
                    <TextInput
                      label="Port"
                      value={drive.port}
                      onChange={(value) => setDrive((current) => ({ ...current, port: value }))}
                      placeholder={selectedProtocol.defaultPort || "default"}
                    />
                  </div>
                )}

                {drive.protocol === "smb" && (
                  <div className="form-grid two">
                    <TextInput
                      label="Share name"
                      value={drive.share}
                      onChange={(value) => setDrive((current) => ({ ...current, share: value }))}
                      placeholder="Media"
                    />
                    <TextInput
                      label="Domain"
                      value={drive.domain}
                      onChange={(value) => setDrive((current) => ({ ...current, domain: value }))}
                      placeholder="optional"
                    />
                  </div>
                )}

                <div className="form-grid two">
                  <TextInput
                    label="Username"
                    value={drive.username}
                    onChange={(value) => setDrive((current) => ({ ...current, username: value }))}
                    placeholder="optional"
                  />
                  <TextInput
                    label="Password"
                    type="password"
                    value={drive.password}
                    onChange={(value) => setDrive((current) => ({ ...current, password: value }))}
                    placeholder="optional"
                  />
                </div>

                <TextInput
                  label="Remote folder"
                  value={drive.remotePath}
                  onChange={(value) => setDrive((current) => ({ ...current, remotePath: value }))}
                  placeholder={drive.protocol === "smb" ? "optional subfolder" : "/"}
                />

                <TextInput
                  label="Local folder"
                  value={drive.mountPoint}
                  onChange={(value) => {
                    setMountPointCustom(true);
                    setDrive((current) => ({ ...current, mountPoint: value }));
                  }}
                  placeholder={mountPointSuggestion?.path ?? "Choose folder"}
                  action={
                    <button className="field-action" type="button" onClick={() => void chooseLocalFolder()}>
                      <FolderOpen size={14} />
                      <span>Browse</span>
                    </button>
                  }
                />

                <div className="form-grid two">
                  {drive.protocol === "webdav" ? (
                    <SelectInput
                      label="WebDAV type"
                      value={drive.webdavVendor}
                      onChange={(value) => setDrive((current) => ({ ...current, webdavVendor: value }))}
                      options={[
                        { value: "other", label: "Generic WebDAV" },
                        { value: "nextcloud", label: "Nextcloud" },
                        { value: "owncloud", label: "ownCloud" },
                        { value: "sharepoint", label: "SharePoint" },
                      ]}
                    />
                  ) : (
                    <ProtocolHint protocol={selectedProtocol} />
                  )}
                  <SelectInput
                    label="Cache"
                    value={drive.cacheMode}
                    onChange={(value) => setDrive((current) => ({ ...current, cacheMode: value as CacheMode }))}
                    options={[
                      { value: "smart", label: "Smart cache" },
                      { value: "full", label: "Full cache" },
                      { value: "off", label: "No cache" },
                    ]}
                  />
                </div>

                {connectionTest && <ConnectionTestPanel result={connectionTest} />}

                <div className="form-actions">
                  <button className="secondary-button test-button" type="button" disabled={busy || !canTestDrive} onClick={() => void testConnection()}>
                    {testingConnection ? <Loader2 className="spin" size={16} /> : <Wifi size={16} />}
                    <span>{testingConnection ? "Testing" : "Test connection"}</span>
                  </button>
                  <button className="submit-button" type="submit" disabled={busy || !canCreateDrive}>
                    {busy && !testingConnection ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                    <span>Connect and mount</span>
                  </button>
                </div>
              </form>
            </section>

            <section className="pane-section">
              <PaneHeader
                title={isEditingSelectedDrive ? "Edit drive" : "Selected drive"}
                meta={selectedDrive ? selectedDrive.status : "None selected"}
                icon={isEditingSelectedDrive ? Pencil : Activity}
              />
              {selectedDrive && isEditingSelectedDrive && editDrive ? (
                <EditDriveSettings
                  form={editDrive}
                  busy={busy}
                  testingConnection={testingEditConnection}
                  connectionTest={editConnectionTest}
                  canTest={canTestEditDrive}
                  canSave={canSaveEditDrive}
                  onChange={(patch) => setEditDrive((current) => (current ? { ...current, ...patch } : current))}
                  onBrowse={() => void chooseEditLocalFolder()}
                  onTest={() => void testEditedConnection()}
                  onCancel={stopEditingDrive}
                  onSave={() => void saveEditedDrive(selectedDrive)}
                />
              ) : selectedDrive ? (
                <MountDetails
                  drive={selectedDrive}
                  busy={busy}
                  cacheStatus={cacheStatusByDrive[selectedDrive.id] ?? null}
                  cacheBusy={cacheBusyDriveId === selectedDrive.id}
                  onMount={() => void mountSavedDrive(selectedDrive)}
                  onOpen={() => void openLocalFolder(selectedDrive)}
                  onUnmount={() =>
                    void runAction(() => invoke("unmount", { mountPoint: selectedDrive.mountPoint }), {
                      refreshMounts: true,
                    })
                  }
                  onRemove={() => void removeSavedDrive(selectedDrive)}
                  onAutoMountChange={(autoMount) => void setDriveAutoMount(selectedDrive, autoMount)}
                  onEdit={() => startEditingDrive(selectedDrive)}
                  onRefreshCache={() => void loadCacheStatus(selectedDrive, true)}
                  onClearCache={() => void clearDriveCache(selectedDrive)}
                />
              ) : (
                <EmptyDriveDetails
                  hasDrives={driveItems.length > 0}
                  onCreate={() => focusFirstCreateField()}
                />
              )}
            </section>

            <section className={`pane-section diagnostics-section ${diagnosticsOpen ? "diagnostics-section-open" : ""}`}>
              <ActivityPanel
                entries={activityLog}
                busy={loadingActivity}
                logPath={overview.paths.activityLog || overview.paths.rcloneLog}
                onRefresh={() => void loadActivityLog(true)}
                onOpenLog={() => void openLogFile()}
              />
              <button className="diagnostics-toggle" type="button" onClick={() => setDiagnosticsOpen((open) => !open)}>
                <span>
                  <Terminal size={16} />
                  Advanced diagnostics
                </span>
                <small>{diagnosticsOpen ? "Hide" : "Show"}</small>
              </button>
              {diagnosticsOpen && (
                <pre className="output">{output ? JSON.stringify(output, null, 2) : "No diagnostic output yet."}</pre>
              )}
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
  tone?: "default" | "good" | "muted" | "warning";
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

function EditDriveSettings({
  form,
  busy,
  testingConnection,
  connectionTest,
  canTest,
  canSave,
  onChange,
  onBrowse,
  onTest,
  onCancel,
  onSave,
}: {
  form: DriveForm;
  busy: boolean;
  testingConnection: boolean;
  connectionTest: NetworkDriveTestResult | null;
  canTest: boolean;
  canSave: boolean;
  onChange: (patch: Partial<DriveForm>) => void;
  onBrowse: () => void;
  onTest: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const protocol = protocols.find((item) => item.id === form.protocol) ?? protocols[0];
  const ProtocolIcon = protocol.icon;
  return (
    <form
      className="edit-drive-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="edit-protocol-line">
        <ProtocolIcon size={15} />
        <span>{protocol.label}</span>
      </div>

      <TextInput
        label="Drive name"
        value={form.displayName}
        onChange={(value) => onChange({ displayName: value })}
        placeholder={protocol.defaultName}
      />

      {form.protocol === "webdav" ? (
        <TextInput
          label="WebDAV address"
          value={form.url}
          onChange={(value) => onChange({ url: value })}
          placeholder="https://cloud.example.com/remote.php/dav/files/me/"
        />
      ) : (
        <div className="form-grid two">
          <TextInput
            label="Server"
            value={form.host}
            onChange={(value) => onChange({ host: value })}
            placeholder={form.protocol === "smb" ? "NAS.local" : "files.example.com"}
          />
          <TextInput
            label="Port"
            value={form.port}
            onChange={(value) => onChange({ port: value })}
            placeholder={protocol.defaultPort || "default"}
          />
        </div>
      )}

      {form.protocol === "smb" && (
        <div className="form-grid two">
          <TextInput label="Share name" value={form.share} onChange={(value) => onChange({ share: value })} placeholder="Media" />
          <TextInput label="Domain" value={form.domain} onChange={(value) => onChange({ domain: value })} placeholder="optional" />
        </div>
      )}

      <div className="form-grid two">
        <TextInput label="Username" value={form.username} onChange={(value) => onChange({ username: value })} placeholder="optional" />
        <TextInput label="Password" type="password" value={form.password} onChange={(value) => onChange({ password: value })} placeholder="keep current" />
      </div>

      <div className="form-grid two">
        <TextInput
          label="Remote folder"
          value={form.remotePath}
          onChange={(value) => onChange({ remotePath: value })}
          placeholder={form.protocol === "smb" ? "optional subfolder" : "/"}
        />
        <TextInput
          label="Local folder"
          value={form.mountPoint}
          onChange={(value) => onChange({ mountPoint: value })}
          placeholder="Choose folder"
          action={
            <button className="field-action" type="button" onClick={onBrowse}>
              <FolderOpen size={14} />
              <span>Browse</span>
            </button>
          }
        />
      </div>

      <div className="form-grid two">
        {form.protocol === "webdav" ? (
          <SelectInput
            label="WebDAV type"
            value={form.webdavVendor}
            onChange={(value) => onChange({ webdavVendor: value })}
            options={[
              { value: "other", label: "Generic WebDAV" },
              { value: "nextcloud", label: "Nextcloud" },
              { value: "owncloud", label: "ownCloud" },
              { value: "sharepoint", label: "SharePoint" },
            ]}
          />
        ) : (
          <ProtocolHint protocol={protocol} />
        )}
        <SelectInput
          label="Cache"
          value={form.cacheMode}
          onChange={(value) => onChange({ cacheMode: value as CacheMode })}
          options={[
            { value: "smart", label: "Smart cache" },
            { value: "full", label: "Full cache" },
            { value: "off", label: "No cache" },
          ]}
        />
      </div>

      {connectionTest && <ConnectionTestPanel result={connectionTest} />}

      <div className="form-actions edit-form-actions">
        <button className="secondary-button test-button" type="button" disabled={busy || !canTest} onClick={onTest}>
          {testingConnection ? <Loader2 className="spin" size={16} /> : <Wifi size={16} />}
          <span>{testingConnection ? "Testing" : "Test connection"}</span>
        </button>
        <button className="submit-button" type="submit" disabled={busy || !canSave}>
          {busy && !testingConnection ? <Loader2 className="spin" size={16} /> : <Pencil size={16} />}
          <span>Save changes</span>
        </button>
      </div>

      <button className="secondary-button cancel-edit-button" type="button" disabled={busy} onClick={onCancel}>
        <XCircle size={15} />
        <span>Cancel</span>
      </button>
    </form>
  );
}

function MountDetails({
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
  drive: DriveListItem;
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
    <div className="mount-details">
      <DetailLine icon={HardDrive} label="Name" value={drive.displayName} />
      <DetailLine icon={FolderOpen} label="Local folder" value={drive.mountPoint} />
      <DetailLine icon={Cloud} label="Remote" value={driveEndpointLabel(drive)} />
      <DetailLine icon={Wifi} label="Protocol" value={protocolLabel(drive.protocol)} />
      <DetailLine icon={Database} label="Cache" value={cacheLabelFromString(drive.cacheMode)} />
      <DetailLine icon={RefreshCw} label="Restore" value={drive.autoMount ? "On launch" : "Manual"} />
      {drive.lastIssueSummary && <MountIssuePanel drive={drive} />}
      <CachePanel
        drive={drive}
        status={cacheStatus}
        busy={cacheBusy}
        onRefresh={onRefreshCache}
        onClear={onClearCache}
      />
      {drive.mounted ? (
        <div className="drive-actions">
          <button className="submit-button" type="button" disabled={busy} onClick={onOpen}>
            <ExternalLink size={15} />
            <span>Open folder</span>
          </button>
          <button className="secondary-button" type="button" disabled={busy} onClick={onUnmount}>
            <Square size={15} />
            <span>Unmount</span>
          </button>
        </div>
      ) : (
        <div className="drive-actions">
          <button className="submit-button" type="button" disabled={busy} onClick={onMount}>
            {busy ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
            <span>{drive.health === "attention" ? "Retry mount" : "Mount drive"}</span>
          </button>
          <button className="secondary-button" type="button" disabled={busy} onClick={onOpen}>
            <ExternalLink size={15} />
            <span>Open folder</span>
          </button>
        </div>
      )}
      <button className="secondary-button preference-button" type="button" disabled={busy} onClick={() => onAutoMountChange(!drive.autoMount)}>
        <RefreshCw size={15} />
        <span>{drive.autoMount ? "Disable auto mount" : "Restore on launch"}</span>
      </button>
      <button className="secondary-button preference-button" type="button" disabled={busy} onClick={onEdit}>
        <Pencil size={15} />
        <span>Edit settings</span>
      </button>
      <button className="danger-button" type="button" disabled={busy} onClick={onRemove}>
        <Trash2 size={15} />
        <span>Remove from Fero</span>
      </button>
    </div>
  );
}

function MountIssuePanel({ drive }: { drive: DriveListItem }) {
  return (
    <div className="mount-issue" title={drive.lastIssueDetails ?? undefined}>
      <div className="mount-issue-heading">
        <AlertTriangle size={15} />
        <strong>{drive.lastIssueSummary}</strong>
      </div>
      {drive.lastIssueRecommendation && <span>{drive.lastIssueRecommendation}</span>}
      {drive.lastCheckedAt && <small>Last checked {formatRelativeTime(drive.lastCheckedAt)}</small>}
    </div>
  );
}

function CachePanel({
  drive,
  status,
  busy,
  onRefresh,
  onClear,
}: {
  drive: DriveListItem;
  status: DriveCacheStatus | null;
  busy: boolean;
  onRefresh: () => void;
  onClear: () => void;
}) {
  const sizeLabel = status ? formatBytes(status.driveBytes) : "Not scanned";
  const totalLabel = status ? formatBytes(status.totalBytes) : "Unknown";
  const fileLabel = status ? `${status.fileCount} cached file${status.fileCount === 1 ? "" : "s"}` : "Scan to inspect files";
  const root = status?.cacheRoot ?? "Cache path not resolved";
  const mode = cacheLabelFromString(drive.cacheMode);

  return (
    <div className="cache-panel">
      <div className="cache-panel-heading">
        <div>
          <Database size={15} />
          <strong>Cache status</strong>
        </div>
        <span>{mode}</span>
      </div>
      <div className="cache-metrics">
        <div>
          <span>This drive</span>
          <strong>{busy && !status ? "Scanning..." : sizeLabel}</strong>
        </div>
        <div>
          <span>Fero cache</span>
          <strong>{totalLabel}</strong>
        </div>
      </div>
      <p>{status?.message ?? "Fero keeps rclone VFS cache in its own cache folder."}</p>
      <small title={root}>{shortPath(root)} · {fileLabel}</small>
      <div className="cache-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>
          {busy ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
          <span>Refresh cache</span>
        </button>
        <button className="secondary-button" type="button" disabled={busy || !status || status.driveBytes === 0} onClick={onClear}>
          <Trash2 size={15} />
          <span>Clear cache</span>
        </button>
      </div>
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

function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  action,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
  action?: ReactNode;
}) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className={action ? "input-with-action" : ""}>
        <input id={inputId} type={type} value={value} onChange={(event) => onChange(event.currentTarget.value)} placeholder={placeholder} />
        {action}
      </div>
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const inputId = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <select id={inputId} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
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

function formFromDriveItem(item: DriveListItem): DriveForm {
  const protocol = normalizeProtocolId(item.protocol);
  const definition = protocols.find((entry) => entry.id === protocol) ?? protocols[0];
  return {
    protocol,
    displayName: item.displayName,
    url: item.url ?? "",
    host: item.host ?? "",
    port: item.port ?? definition.defaultPort,
    username: item.username ?? "",
    password: "",
    domain: item.domain ?? "",
    share: item.share ?? "",
    remotePath: item.remotePath ?? "",
    mountPoint: item.mountPoint,
    webdavVendor: item.webdavVendor ?? "other",
    cacheMode: normalizeCacheMode(item.cacheMode),
  };
}

function toNetworkDriveRequest(form: DriveForm) {
  return {
    protocol: form.protocol,
    displayName: form.displayName,
    mountPoint: form.mountPoint,
    url: form.url,
    host: form.host,
    port: form.port,
    username: form.username,
    password: form.password,
    domain: form.domain,
    share: form.share,
    remotePath: form.remotePath,
    webdavVendor: form.webdavVendor,
    cacheMode: form.cacheMode,
  };
}

function buildDriveList(savedDrives: SavedDrive[], activeMounts: MountSession[]): DriveListItem[] {
  const activeByMountPoint = new Map(activeMounts.map((mount) => [mount.mountPoint, mount]));
  const activeByRemote = new Map(activeMounts.map((mount) => [mount.remote, mount]));
  const savedItems = savedDrives.map((drive) => {
    const active = activeByMountPoint.get(drive.mountPoint) ?? activeByRemote.get(drive.fs);
    const hasIssue = Boolean(drive.lastIssueSummary);
    return {
      id: drive.id,
      displayName: drive.displayName,
      protocol: drive.protocol,
      remote: drive.fs,
      mountPoint: drive.mountPoint,
      status: active ? "mounted" : hasIssue ? "attention" : "ready",
      cacheMode: drive.cacheMode,
      health: active ? "healthy" : hasIssue ? "attention" : "standby",
      mounted: Boolean(active),
      fs: drive.fs,
      autoMount: drive.autoMount !== false,
      remotePath: drive.remotePath,
      url: drive.url,
      host: drive.host,
      port: drive.port,
      username: drive.username,
      domain: drive.domain,
      share: drive.share,
      webdavVendor: drive.webdavVendor,
      lastMountState: drive.lastMountState,
      lastIssueSummary: drive.lastIssueSummary,
      lastIssueRecommendation: drive.lastIssueRecommendation,
      lastIssueDetails: drive.lastIssueDetails,
      lastCheckedAt: drive.lastCheckedAt,
    } satisfies DriveListItem;
  });

  const savedMountPoints = new Set(savedDrives.map((drive) => drive.mountPoint));
  const orphanMounts = activeMounts
    .filter((mount) => !savedMountPoints.has(mount.mountPoint))
    .map((mount) => ({
      id: mount.id,
      displayName: mount.mountPoint,
      protocol: mount.protocol,
      remote: mount.remote,
      mountPoint: mount.mountPoint,
      status: mount.status,
      cacheMode: mount.cacheMode,
      health: mount.health,
      mounted: true,
      fs: mount.remote,
      autoMount: false,
      remotePath: "",
    }) satisfies DriveListItem);

  return [...savedItems, ...orphanMounts];
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
      remote: "Network drive",
      mountPoint: item,
      status: "mounted",
      cacheMode: "rclone default",
      protocol: "Unknown",
      health: "healthy",
      raw: item,
    };
  }

  const record = asRecord(item);
  if (!record) return null;

  const mountPoint = stringField(record, ["mountPoint", "MountPoint", "mount_point", "path", "Path"]);
  if (!mountPoint) return null;

  const remote = stringField(record, ["fs", "Fs", "remote", "Remote", "source", "Source"]) ?? "Network drive";
  const status = stringField(record, ["status", "Status", "state", "State"]) ?? "mounted";
  const cacheMode = stringField(record, ["cacheMode", "CacheMode", "vfsCacheMode", "VfsCacheMode"]) ?? "rclone default";
  const health = status.toLowerCase().includes("error") ? "attention" : "healthy";

  return {
    id: `${remote}:${mountPoint}:${index}`,
    remote,
    mountPoint,
    status,
    cacheMode,
    protocol: protocolFromRemote(remote),
    health,
    raw: item,
  };
}

function protocolFromRemote(remote: string) {
  const lower = remote.toLowerCase();
  if (lower.includes("webdav_")) return "WebDAV";
  if (lower.includes("sftp_")) return "SFTP";
  if (lower.includes("ftp_")) return "FTP";
  if (lower.includes("smb_")) return "SMB";
  return "Network";
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

function protocolLabel(protocol: string) {
  const match = protocols.find((item) => item.id === protocol.toLowerCase());
  return match?.label ?? protocol;
}

function protocolIcon(protocol: string): LucideIcon {
  const match = protocols.find((item) => item.id === protocol.toLowerCase());
  return match?.icon ?? HardDrive;
}

function driveRowView(drive: DriveListItem): DriveRowView {
  return {
    displayName: drive.displayName,
    status: drive.status,
    health: drive.health,
    icon: protocolIcon(drive.protocol),
    protocolLabel: protocolLabel(drive.protocol),
    endpointLabel: driveEndpointLabel(drive),
    mountPoint: drive.mountPoint,
    cacheLabel: cacheLabelFromString(drive.cacheMode),
  };
}

function driveEndpointLabel(drive: DriveListItem) {
  const protocol = normalizeProtocolId(drive.protocol);
  if (protocol === "webdav") return drive.url || drive.remote;
  if (protocol === "smb") {
    const share = [drive.host, drive.share].filter(Boolean).join("/");
    return share || drive.remote;
  }
  const host = drive.host ? `${drive.host}${drive.port ? `:${drive.port}` : ""}` : "";
  const remotePath = drive.remotePath ? `/${drive.remotePath.replace(/^\/+/, "")}` : "";
  return host ? `${host}${remotePath}` : drive.remote;
}

function safeFolderName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "");
  return cleaned || "Network Drive";
}

function joinDisplayPath(root: string, child: string) {
  if (!root) return `~/Fero Drives/${child}`;
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${separator}${child}`;
}

function fallbackMountPointSuggestion(displayName: string, defaultMountRoot: string): MountPointSuggestion {
  const root = defaultMountRoot || "~/Fero Drives";
  return {
    root,
    path: joinDisplayPath(root, safeFolderName(displayName)),
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
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

function focusFirstCreateField() {
  document.getElementById("drive-name")?.focus();
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
