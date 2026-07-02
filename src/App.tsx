import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Activity,
  AlertTriangle,
  Database,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Wifi,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ActivityPanel } from "./features/activity/ActivityPanel";
import type { ActivityLogEntry } from "./features/activity/ActivityPanel";
import { AppShell, WorkspaceSurface } from "./features/appLayout/AppLayout";
import { formatBytes } from "./features/cache/model";
import type { ClearDriveCacheResult, DriveCacheStatus } from "./features/cache/model";
import { ConnectionTestPanel } from "./features/driveSetup/ConnectionTestPanel";
import { DriveConnectionFields } from "./features/driveSetup/DriveConnectionFields";
import { DriveSetupStatus } from "./features/driveSetup/DriveSetupStatus";
import { DriveSetupForm, FormActionRow, FormButton, ProtocolSummaryLine, TextInput } from "./features/driveSetup/FormControls";
import { MountPointRecommendation } from "./features/driveSetup/MountPointRecommendation";
import { ProtocolPicker } from "./features/driveSetup/ProtocolSetup";
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
} from "./features/driveSetup/model";
import type {
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
import { MountDetails } from "./features/driveLibrary/MountDetails";
import type { MountDetailsDrive } from "./features/driveLibrary/MountDetails";
import {
  PaneHeader,
  PathLine,
  StatusStrip,
  StatusTile,
  ToolbarButton,
  WorkspaceHeader,
} from "./features/workspace/WorkspaceChrome";
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
    <AppShell>
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

      <WorkspaceSurface>
        <WorkspaceHeader
          kickerIcon={Wifi}
          kicker="Local drive workspace"
          title="Drives"
          description="WebDAV, SFTP, FTP and SMB storage mounted into local folders."
        >
          <ToolbarButton icon={RefreshCw} disabled={busy} onClick={() => void refreshAll(true)}>
            Refresh
          </ToolbarButton>
          <ToolbarButton icon={Plus} variant="primary" disabled={busy} onClick={() => focusFirstCreateField()}>
            Add drive
          </ToolbarButton>
        </WorkspaceHeader>

        {error && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        )}

        <StatusStrip>
          <StatusTile icon={HardDrive} label="Drive library" value={String(driveItems.length)} tone={driveItems.length > 0 ? "good" : "muted"} />
          <StatusTile icon={FolderOpen} label="Mounted" value={`${mountedDriveCount}/${driveItems.length}`} tone={mountedDriveCount > 0 ? "good" : "muted"} />
          <StatusTile icon={Play} label="Ready" value={String(readyDriveCount)} tone={readyDriveCount > 0 ? "good" : "muted"} />
          <StatusTile icon={AlertTriangle} label="Needs attention" value={String(attentionCount)} tone={attentionCount > 0 ? "warning" : "muted"} />
          <StatusTile icon={ShieldCheck} label="Mount system" value={mountEnvironmentValue} tone={mountEnvironmentTone} />
          <StatusTile icon={Database} label="Cache" value={cacheOverviewValue} tone={scannedCacheCount > 0 ? "default" : "muted"} />
        </StatusStrip>

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
              <DriveSetupStatus
                form={drive}
                protocol={selectedProtocol}
                suggestion={mountPointSuggestion}
                environment={overview.mountEnvironment}
              />

              <DriveSetupForm onSubmit={() => void createNetworkDrive()}>
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

                <DriveConnectionFields
                  form={drive}
                  protocol={selectedProtocol}
                  idPrefix="create-drive"
                  mountPointPlaceholder={mountPointSuggestion?.path ?? "Choose folder"}
                  onChange={(patch) => setDrive((current) => ({ ...current, ...patch }))}
                  onMountPointChange={(value) => {
                    setMountPointCustom(true);
                    setDrive((current) => ({ ...current, mountPoint: value }));
                  }}
                  onBrowse={() => void chooseLocalFolder()}
                />

                {connectionTest && <ConnectionTestPanel result={connectionTest} />}

                <FormActionRow>
                  <FormButton
                    icon={Wifi}
                    loading={testingConnection}
                    type="button"
                    disabled={busy || !canTestDrive}
                    onClick={() => void testConnection()}
                  >
                    {testingConnection ? "Testing" : "Test connection"}
                  </FormButton>
                  <FormButton
                    icon={Play}
                    loading={busy && !testingConnection}
                    variant="primary"
                    type="submit"
                    disabled={busy || !canCreateDrive}
                  >
                    Connect and mount
                  </FormButton>
                </FormActionRow>
              </DriveSetupForm>
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
                  drive={driveDetailsView(selectedDrive)}
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
      </WorkspaceSurface>
    </AppShell>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return <span className={`status-dot ${active ? "status-dot-active" : ""}`} aria-hidden="true" />;
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
    <DriveSetupForm variant="edit" onSubmit={onSave}>
      <ProtocolSummaryLine icon={ProtocolIcon} label={protocol.label} />

      <TextInput
        id="edit-drive-name"
        label="Drive name"
        value={form.displayName}
        onChange={(value) => onChange({ displayName: value })}
        placeholder={protocol.defaultName}
      />

      <DriveConnectionFields
        form={form}
        protocol={protocol}
        idPrefix="edit-drive"
        mountPointPlaceholder="Choose folder"
        passwordPlaceholder="keep current"
        localFolderLayout="paired"
        onChange={onChange}
        onBrowse={onBrowse}
      />

      {connectionTest && <ConnectionTestPanel result={connectionTest} />}

      <FormActionRow variant="edit">
        <FormButton icon={Wifi} loading={testingConnection} type="button" disabled={busy || !canTest} onClick={onTest}>
          {testingConnection ? "Testing" : "Test connection"}
        </FormButton>
        <FormButton icon={Pencil} loading={busy && !testingConnection} variant="primary" type="submit" disabled={busy || !canSave}>
          Save changes
        </FormButton>
      </FormActionRow>

      <FormButton icon={XCircle} type="button" disabled={busy} fullWidth onClick={onCancel}>
        Cancel
      </FormButton>
    </DriveSetupForm>
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

function driveDetailsView(drive: DriveListItem): MountDetailsDrive {
  return {
    displayName: drive.displayName,
    mountPoint: drive.mountPoint,
    endpointLabel: driveEndpointLabel(drive),
    protocolLabel: protocolLabel(drive.protocol),
    cacheMode: drive.cacheMode,
    autoMount: drive.autoMount,
    mounted: drive.mounted,
    health: drive.health,
    status: drive.status,
    lastIssueSummary: drive.lastIssueSummary,
    lastIssueRecommendation: drive.lastIssueRecommendation,
    lastIssueDetails: drive.lastIssueDetails,
    lastCheckedAt: drive.lastCheckedAt,
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
