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
  Globe2,
  HardDrive,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./App.css";

type JsonValue = unknown;
type ProtocolId = "webdav" | "ftp" | "sftp" | "smb";
type CacheMode = "smart" | "full" | "off";

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
    rcloneLog: string;
    driveCatalog: string;
  };
  daemon: DaemonStatus;
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

type NetworkDriveTestResult = {
  ok: boolean;
  protocol: string;
  fs: string;
  summary: string;
  recommendation: string;
  details?: string | null;
  itemCount?: number | null;
  warnings: string[];
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

type DriveForm = {
  protocol: ProtocolId;
  displayName: string;
  url: string;
  host: string;
  port: string;
  username: string;
  password: string;
  domain: string;
  share: string;
  remotePath: string;
  mountPoint: string;
  webdavVendor: string;
  cacheMode: CacheMode;
};

type ActionOptions = {
  showOutput?: boolean;
  refreshMounts?: boolean;
  clearMounts?: boolean;
};

type ProtocolDefinition = {
  id: ProtocolId;
  label: string;
  summary: string;
  hint: string;
  icon: LucideIcon;
  defaultName: string;
  defaultPort: string;
  needsUrl?: boolean;
  needsShare?: boolean;
};

const protocols: ProtocolDefinition[] = [
  {
    id: "webdav",
    label: "WebDAV",
    summary: "NAS, Nextcloud, Seafile and many private clouds",
    hint: "Paste the WebDAV address from your service.",
    icon: Globe2,
    defaultName: "My WebDAV",
    defaultPort: "",
    needsUrl: true,
  },
  {
    id: "sftp",
    label: "SFTP",
    summary: "Secure SSH file servers",
    hint: "Use the SSH host, username and password for this server.",
    icon: LockKeyhole,
    defaultName: "My SFTP",
    defaultPort: "22",
  },
  {
    id: "ftp",
    label: "FTP",
    summary: "Classic FTP storage and hosting spaces",
    hint: "Use FTP for legacy servers. Prefer SFTP when available.",
    icon: Server,
    defaultName: "My FTP",
    defaultPort: "21",
  },
  {
    id: "smb",
    label: "SMB",
    summary: "Windows shares and local network NAS",
    hint: "Enter the server and share name, such as NAS and Media.",
    icon: Network,
    defaultName: "My SMB Share",
    defaultPort: "",
    needsShare: true,
  },
];

const emptyOverview: AppOverview = {
  productName: "Fero",
  appVersion: "0.1.0",
  paths: {
    appConfigDir: "",
    rcloneConfig: "",
    rcloneCache: "",
    rcloneLog: "",
    driveCatalog: "",
  },
  daemon: {
    running: false,
    configPath: "",
    logPath: "",
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

  const daemonRunning = overview.daemon.running;
  const selectedProtocol = protocols.find((protocol) => protocol.id === drive.protocol) ?? protocols[0];
  const autoRestoreCount = overview.drives.filter((item) => item.autoMount !== false).length;
  const restoreFailures = restoreResult?.items.filter((item) => item.status === "failed").length ?? 0;
  const attentionCount = overview.drives.filter((item) => Boolean(item.lastIssueSummary)).length;
  const autoRestoreValue = restoring
    ? "Restoring"
    : autoRestoreCount > 0
      ? `${autoRestoreCount} on launch`
      : "Manual";
  const driveItems = useMemo(
    () => buildDriveList(overview.drives, activeMounts),
    [overview.drives, activeMounts],
  );
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
        updateActiveMounts([], nextOverview.drives);
      } else if (refreshMounts) {
        await refreshMountsFromDaemon(false, nextOverview.drives);
      }
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

  function selectProtocol(protocol: ProtocolId) {
    setDrive((current) => {
      const next = makeDefaultForm(protocol);
      const currentName = current.displayName.trim();
      const shouldUseDefaultName = protocols.some((definition) => definition.defaultName === currentName);
      return {
        ...next,
        displayName: shouldUseDefaultName || !currentName ? next.displayName : current.displayName,
        mountPoint: current.mountPoint,
        username: current.username,
        password: current.password,
      };
    });
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
          <button className="side-nav-item" type="button" onClick={() => setDiagnosticsOpen((open) => !open)}>
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
        </section>

        <div className="sidebar-foot">
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
              <span>Local drive experience</span>
            </div>
            <h2>Network drives</h2>
            <p>Mount WebDAV, FTP, SFTP and SMB storage as local folders.</p>
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
          <StatusTile icon={HardDrive} label="Saved drives" value={String(driveItems.length)} tone={driveItems.length > 0 ? "good" : "muted"} />
          <StatusTile icon={AlertTriangle} label="Needs attention" value={String(attentionCount)} tone={attentionCount > 0 ? "warning" : "muted"} />
          <StatusTile icon={Activity} label="Service" value={daemonRunning ? "Running" : "Auto-start"} tone={daemonRunning ? "good" : "muted"} />
          <StatusTile icon={RefreshCw} label="Auto restore" value={autoRestoreValue} tone={autoRestoreCount > 0 ? "good" : "muted"} />
        </section>

        <div className="home-grid">
          <section className="drive-pane">
            <PaneHeader title="Network drives" meta={`${activeMounts.length} mounted`} icon={HardDrive} />
            <div className="drive-list">
              {driveItems.length > 0 ? (
                driveItems.map((item) => (
                  <MountRow
                    key={item.id}
                    drive={item}
                    selected={selectedDrive?.id === item.id}
                    onSelect={() => setSelectedDriveId(item.id)}
                  />
                ))
              ) : (
                <EmptyMounts daemonRunning={daemonRunning} onCreate={() => focusFirstCreateField()} />
              )}
            </div>
          </section>

          <aside className="detail-pane">
            <section className="pane-section create-pane">
              <PaneHeader title="Add network drive" meta={selectedProtocol.label} icon={FolderPlus} />
              <ProtocolPicker selected={drive.protocol} onSelect={selectProtocol} />

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

                <div className="form-grid two">
                  <TextInput
                    label="Remote folder"
                    value={drive.remotePath}
                    onChange={(value) => setDrive((current) => ({ ...current, remotePath: value }))}
                    placeholder={drive.protocol === "smb" ? "optional subfolder" : "/"}
                  />
                  <TextInput
                    label="Local folder"
                    value={drive.mountPoint}
                    onChange={(value) => setDrive((current) => ({ ...current, mountPoint: value }))}
                    placeholder="Choose folder"
                    action={
                      <button className="field-action" type="button" onClick={() => void chooseLocalFolder()}>
                        <FolderOpen size={14} />
                        <span>Browse</span>
                      </button>
                    }
                  />
                </div>

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
                <div className="empty-detail">
                  <XCircle size={18} />
                  <span>Select a drive to see its local folder, protocol and cache status.</span>
                </div>
              )}
            </section>

            <section className={`pane-section diagnostics-section ${diagnosticsOpen ? "diagnostics-section-open" : ""}`}>
              <button className="diagnostics-toggle" type="button" onClick={() => setDiagnosticsOpen((open) => !open)}>
                <span>
                  <Terminal size={16} />
                  Diagnostics
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

function ProtocolPicker({ selected, onSelect }: { selected: ProtocolId; onSelect: (protocol: ProtocolId) => void }) {
  return (
    <div className="protocol-grid" aria-label="Choose a protocol">
      {protocols.map((protocol) => {
        const Icon = protocol.icon;
        const active = protocol.id === selected;
        return (
          <button
            key={protocol.id}
            className={`protocol-option ${active ? "protocol-option-active" : ""}`}
            type="button"
            onClick={() => onSelect(protocol.id)}
          >
            <Icon size={18} />
            <span>{protocol.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProtocolHint({ protocol }: { protocol: ProtocolDefinition }) {
  return (
    <div className="protocol-hint">
      <KeyRound size={15} />
      <span>{protocol.hint}</span>
    </div>
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

function MountRow({ drive, selected, onSelect }: { drive: DriveListItem; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`mount-row ${selected ? "mount-row-selected" : ""}`} type="button" onClick={onSelect}>
      <div className="mount-row-icon">
        <HardDrive size={18} />
      </div>
      <div className="mount-row-main">
        <div className="mount-row-top">
          <strong>{drive.displayName}</strong>
          <span className={`health-pill health-pill-${drive.health}`}>{drive.status}</span>
        </div>
        <div className="mount-row-meta">
          <span>{protocolLabel(drive.protocol)}</span>
          <span>{drive.mountPoint}</span>
          <span>{cacheLabelFromString(drive.cacheMode)}</span>
        </div>
      </div>
    </button>
  );
}

function EmptyMounts({ daemonRunning, onCreate }: { daemonRunning: boolean; onCreate: () => void }) {
  return (
    <div className="empty-mounts">
      <div className="empty-icon">
        <FolderPlus size={24} />
      </div>
      <strong>{daemonRunning ? "No network drives yet" : "Add your first network drive"}</strong>
      <span>
        {daemonRunning
          ? "Choose a protocol, enter your server details, and Fero will mount it as a local folder."
          : "Fero will start its mount service automatically when you connect a drive."}
      </span>
      <button className="empty-action" type="button" onClick={onCreate}>
        <Plus size={16} />
        <span>Add network drive</span>
      </button>
    </div>
  );
}

function ConnectionTestPanel({ result }: { result: NetworkDriveTestResult }) {
  const Icon = result.ok ? ShieldCheck : AlertTriangle;
  return (
    <div className={`connection-result ${result.ok ? "connection-result-ok" : "connection-result-failed"}`}>
      <div className="connection-result-heading">
        <Icon size={16} />
        <strong>{result.summary}</strong>
      </div>
      <span>{result.recommendation}</span>
      {result.ok && typeof result.itemCount === "number" && (
        <small>{result.itemCount} item{result.itemCount === 1 ? "" : "s"} visible in the checked folder.</small>
      )}
      {result.warnings.length > 0 && <small>{result.warnings.join(" ")}</small>}
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
      <DetailLine icon={Cloud} label="Remote" value={drive.remote} />
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

function makeDefaultForm(protocol: ProtocolId): DriveForm {
  const definition = protocols.find((item) => item.id === protocol) ?? protocols[0];
  return {
    protocol,
    displayName: definition.defaultName,
    url: "",
    host: "",
    port: definition.defaultPort,
    username: "",
    password: "",
    domain: "",
    share: "",
    remotePath: "",
    mountPoint: "",
    webdavVendor: "other",
    cacheMode: "smart",
  };
}

function canTestDriveForm(form: DriveForm) {
  return Boolean(
    (form.protocol === "webdav" ? form.url.trim() : form.host.trim()) &&
      (form.protocol === "smb" ? form.share.trim() : true),
  );
}

function canSaveDriveForm(form: DriveForm) {
  return Boolean(form.displayName.trim() && form.mountPoint.trim() && canTestDriveForm(form));
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

function normalizeProtocolId(protocol: string): ProtocolId {
  const lower = protocol.toLowerCase();
  if (lower === "ftp" || lower === "sftp" || lower === "smb" || lower === "webdav") {
    return lower;
  }
  return "webdav";
}

function normalizeCacheMode(mode: string): CacheMode {
  if (mode === "full" || mode === "off" || mode === "smart") return mode;
  return "smart";
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

function cacheLabelFromString(mode: string) {
  if (mode === "full") return "Full cache";
  if (mode === "off") return "No cache";
  if (mode === "smart") return "Smart cache";
  return mode || "Smart cache";
}

function protocolLabel(protocol: string) {
  const match = protocols.find((item) => item.id === protocol.toLowerCase());
  return match?.label ?? protocol;
}

function shortPath(value: string) {
  if (!value) return "not resolved";
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || value;
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
