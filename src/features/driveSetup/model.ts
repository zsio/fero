import {
  Globe2,
  LockKeyhole,
  Network,
  Server,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ProtocolId = "webdav" | "ftp" | "sftp" | "smb";
export type CacheMode = "smart" | "full" | "off";

export type MountPointSuggestion = {
  root: string;
  path: string;
};

export type MountEnvironment = {
  platform: string;
  requirement: string;
  state: "ready" | "needsSetup" | "limited" | "unknown" | string;
  summary: string;
  recommendation: string;
  detectedPaths: string[];
};

export type DriveForm = {
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

export type NetworkDriveTestResult = {
  ok: boolean;
  protocol: string;
  fs: string;
  summary: string;
  recommendation: string;
  details?: string | null;
  itemCount?: number | null;
  warnings: string[];
};

export type ProtocolDefinition = {
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

export type DriveReadinessStatus = {
  icon: LucideIcon;
  label: string;
  ready: boolean;
  value: string;
};

export const protocols: ProtocolDefinition[] = [
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

export function makeDefaultForm(protocol: ProtocolId): DriveForm {
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

export function canTestDriveForm(form: DriveForm) {
  return Boolean(
    (form.protocol === "webdav" ? form.url.trim() : form.host.trim()) &&
      (form.protocol === "smb" ? form.share.trim() : true),
  );
}

export function canSaveDriveForm(form: DriveForm) {
  return Boolean(form.displayName.trim() && canTestDriveForm(form));
}

export function endpointReadiness(form: DriveForm, protocol: ProtocolDefinition): DriveReadinessStatus {
  if (form.protocol === "webdav") {
    const url = form.url.trim();
    return {
      icon: protocol.icon,
      label: "WebDAV address",
      ready: Boolean(url),
      value: url || "Required",
    };
  }

  if (form.protocol === "smb") {
    const host = form.host.trim();
    const share = form.share.trim();
    const value =
      host && share ? `${host}/${share}` : host ? "Share required" : share ? "Server required" : "Server and share";
    return {
      icon: protocol.icon,
      label: "SMB share",
      ready: Boolean(host && share),
      value,
    };
  }

  const host = form.host.trim();
  const port = form.port.trim();
  return {
    icon: protocol.icon,
    label: `${protocol.label} server`,
    ready: Boolean(host),
    value: host ? `${host}${port ? `:${port}` : ""}` : "Required",
  };
}

export function normalizeProtocolId(protocol: string): ProtocolId {
  const lower = protocol.toLowerCase();
  if (lower === "ftp" || lower === "sftp" || lower === "smb" || lower === "webdav") {
    return lower;
  }
  return "webdav";
}

export function normalizeCacheMode(mode: string): CacheMode {
  if (mode === "full" || mode === "off" || mode === "smart") return mode;
  return "smart";
}

export function cacheLabelFromString(mode: string) {
  if (mode === "full") return "Full cache";
  if (mode === "off") return "No cache";
  if (mode === "smart") return "Smart cache";
  return mode || "Smart cache";
}

export function environmentValue(state: string) {
  if (state === "ready") return "Ready";
  if (state === "needsSetup") return "Needs setup";
  if (state === "limited") return "Limited";
  return "Unknown";
}

export function environmentTone(state: string): "good" | "warning" | "muted" {
  if (state === "ready") return "good";
  if (state === "needsSetup" || state === "limited") return "warning";
  return "muted";
}

export function shortPath(value: string) {
  if (!value) return "not resolved";
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || value;
}
