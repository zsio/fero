import { FolderOpen, LockKeyhole, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FieldActionButton, FieldGrid, SelectInput, TextInput } from "./FormControls";
import { ProtocolHint } from "./ProtocolSetup";
import type { CacheMode, DriveForm, ProtocolDefinition } from "./model";

const webdavVendorOptions = [
  { value: "other", label: "Generic WebDAV" },
  { value: "nextcloud", label: "Nextcloud" },
  { value: "owncloud", label: "ownCloud" },
  { value: "sharepoint", label: "SharePoint" },
];

const cacheOptions = [
  { value: "smart", label: "Smart cache" },
  { value: "full", label: "Full cache" },
  { value: "off", label: "No cache" },
];

export function DriveConnectionFields({
  form,
  protocol,
  idPrefix,
  mountPointPlaceholder,
  passwordPlaceholder = "optional",
  localFolderLayout = "stacked",
  onChange,
  onMountPointChange,
  onBrowse,
}: {
  form: DriveForm;
  protocol: ProtocolDefinition;
  idPrefix: string;
  mountPointPlaceholder: string;
  passwordPlaceholder?: string;
  localFolderLayout?: "stacked" | "paired";
  onChange: (patch: Partial<DriveForm>) => void;
  onMountPointChange?: (value: string) => void;
  onBrowse: () => void;
}) {
  const localFolderField = (
    <TextInput
      id={`${idPrefix}-mount-point`}
      label="Local folder"
      value={form.mountPoint}
      onChange={(value) => (onMountPointChange ? onMountPointChange(value) : onChange({ mountPoint: value }))}
      placeholder={mountPointPlaceholder}
      action={
        <FieldActionButton onClick={onBrowse}>
          <FolderOpen size={14} />
          <span>Browse</span>
        </FieldActionButton>
      }
    />
  );

  return (
    <>
      {form.protocol === "webdav" ? (
        <TextInput
          id={`${idPrefix}-webdav-url`}
          label="WebDAV address"
          value={form.url}
          onChange={(value) => onChange(endpointPatchFromInput(form, value))}
          placeholder="https://cloud.example.com/remote.php/dav/files/me/"
        />
      ) : (
        <FieldGrid columns={2}>
          <TextInput
            id={`${idPrefix}-host`}
            label="Server"
            value={form.host}
            onChange={(value) => onChange(endpointPatchFromInput(form, value))}
            placeholder={form.protocol === "smb" ? "//NAS/Media" : `${form.protocol}://files.example.com/folder`}
          />
          <TextInput
            id={`${idPrefix}-port`}
            label="Port"
            value={form.port}
            onChange={(value) => onChange({ port: value })}
            placeholder={protocol.defaultPort || "default"}
          />
        </FieldGrid>
      )}

      {form.protocol === "smb" && (
        <FieldGrid columns={2}>
          <TextInput
            id={`${idPrefix}-share`}
            label="Share name"
            value={form.share}
            onChange={(value) => onChange({ share: value })}
            placeholder="Media"
          />
          <TextInput
            id={`${idPrefix}-domain`}
            label="Domain"
            value={form.domain}
            onChange={(value) => onChange({ domain: value })}
            placeholder="optional"
          />
        </FieldGrid>
      )}

      <FieldGrid columns={2}>
        <TextInput
          id={`${idPrefix}-username`}
          label="Username"
          value={form.username}
          onChange={(value) => onChange({ username: value })}
          placeholder="optional"
        />
        <TextInput
          id={`${idPrefix}-password`}
          label="Password"
          type="password"
          value={form.password}
          onChange={(value) => onChange({ password: value })}
          placeholder={passwordPlaceholder}
        />
      </FieldGrid>

      {localFolderLayout === "paired" ? (
        <FieldGrid columns={2}>
          <RemoteFolderField form={form} idPrefix={idPrefix} onChange={onChange} />
          {localFolderField}
        </FieldGrid>
      ) : (
        <>
          <RemoteFolderField form={form} idPrefix={idPrefix} onChange={onChange} />
          {localFolderField}
        </>
      )}

      <FieldGrid columns={2}>
        {form.protocol === "webdav" ? (
          <SelectInput
            id={`${idPrefix}-webdav-vendor`}
            label="WebDAV type"
            value={form.webdavVendor}
            onChange={(value) => onChange({ webdavVendor: value })}
            options={webdavVendorOptions}
          />
        ) : (
          <ProtocolHint protocol={protocol} />
        )}
        <SelectInput
          id={`${idPrefix}-cache-mode`}
          label="Cache"
          value={form.cacheMode}
          onChange={(value) => onChange({ cacheMode: value as CacheMode })}
          options={cacheOptions}
        />
      </FieldGrid>

      <FieldGrid columns={2}>
        <MountBehaviorToggle
          icon={RefreshCw}
          id={`${idPrefix}-auto-mount`}
          title="Restore on launch"
          enabled={form.autoMount}
          enabledLabel="Automatic"
          disabledLabel="Manual"
          onChange={(autoMount) => onChange({ autoMount })}
        />
        <MountBehaviorToggle
          icon={LockKeyhole}
          id={`${idPrefix}-read-only`}
          title="Read-only mount"
          enabled={form.readOnly}
          enabledLabel="Read-only"
          disabledLabel="Read/write"
          onChange={(readOnly) => onChange({ readOnly })}
        />
      </FieldGrid>
    </>
  );
}

function endpointPatchFromInput(form: DriveForm, value: string): Partial<DriveForm> {
  if (form.protocol === "webdav") return webdavPatchFromInput(value);
  if (form.protocol === "smb") return smbPatchFromInput(value) ?? { host: value };
  if (form.protocol === "ftp" || form.protocol === "sftp") {
    return urlPatchFromInput(form, value) ?? { host: value };
  }
  return { host: value };
}

function webdavPatchFromInput(value: string): Partial<DriveForm> {
  const trimmed = value.trim();
  if (!trimmed) return { url: value };

  try {
    const url = new URL(trimmed);
    const patch: Partial<DriveForm> = {};
    if (url.username) patch.username = decodeUrlPart(url.username);
    if (url.password) patch.password = decodeUrlPart(url.password);

    if (url.username || url.password) {
      url.username = "";
      url.password = "";
      patch.url = url.toString();
    } else {
      patch.url = value;
    }

    return Object.keys(patch).length > 0 ? patch : { url: value };
  } catch {
    return { url: value };
  }
}

function urlPatchFromInput(form: DriveForm, value: string): Partial<DriveForm> | null {
  const trimmed = value.trim();
  if (!trimmed || !trimmed.toLowerCase().startsWith(`${form.protocol}://`)) return null;

  try {
    const url = new URL(trimmed);
    const path = cleanRemotePath(url.pathname);
    const patch: Partial<DriveForm> = {
      host: url.hostname,
    };

    if (url.port) patch.port = url.port;
    if (url.username) patch.username = decodeUrlPart(url.username);
    if (url.password) patch.password = decodeUrlPart(url.password);
    if (path) patch.remotePath = path;

    return patch;
  } catch {
    return null;
  }
}

function smbPatchFromInput(value: string): Partial<DriveForm> | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase().startsWith("smb://")) {
    return smbPatchFromUrl(trimmed);
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (!normalized.startsWith("//") && !/^[^/]+\/[^/]+/.test(normalized)) return null;

  const parts = normalized.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const { host, port } = splitHostPort(parts[0]);
  const patch: Partial<DriveForm> = { host };
  if (port) patch.port = port;
  if (parts[1]) patch.share = parts[1];
  if (parts.length > 2) patch.remotePath = parts.slice(2).join("/");
  return patch;
}

function smbPatchFromUrl(value: string): Partial<DriveForm> | null {
  try {
    const url = new URL(value);
    const segments = cleanRemotePath(url.pathname).split("/").filter(Boolean);
    const patch: Partial<DriveForm> = {
      host: url.hostname,
    };

    if (url.port) patch.port = url.port;
    if (url.username) patch.username = decodeUrlPart(url.username);
    if (url.password) patch.password = decodeUrlPart(url.password);
    if (segments[0]) patch.share = segments[0];
    if (segments.length > 1) patch.remotePath = segments.slice(1).join("/");
    return patch;
  } catch {
    return null;
  }
}

function cleanRemotePath(pathname: string) {
  return pathname
    .split("/")
    .filter(Boolean)
    .map(decodeUrlPart)
    .join("/");
}

function splitHostPort(value: string) {
  const match = value.match(/^(.+):(\d+)$/);
  if (!match) return { host: value, port: "" };
  return { host: match[1], port: match[2] };
}

function decodeUrlPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function MountBehaviorToggle({
  icon: Icon,
  id,
  title,
  enabled,
  enabledLabel,
  disabledLabel,
  onChange,
}: {
  icon: LucideIcon;
  id: string;
  title: string;
  enabled: boolean;
  enabledLabel: string;
  disabledLabel: string;
  onChange: (enabled: boolean) => void;
}) {
  const valueLabel = enabled ? enabledLabel : disabledLabel;

  return (
    <label
      className={`grid min-h-[42px] cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
        enabled
          ? "border-[rgba(117,215,180,0.36)] bg-[rgba(117,215,180,0.07)]"
          : "border-[var(--line)] bg-[#12181d]"
      }`}
      htmlFor={id}
    >
      <Icon size={15} className={enabled ? "text-[var(--accent)]" : "text-[var(--muted-strong)]"} />
      <span className="min-w-0">
        <strong className="block truncate text-xs font-bold text-[var(--ink-strong)]">{title}</strong>
        <small className="mt-0.5 block text-[11px] text-[var(--muted)]">{valueLabel}</small>
      </span>
      <span
        className={`relative h-[22px] w-[38px] rounded-full border transition-colors ${
          enabled
            ? "border-[rgba(117,215,180,0.52)] bg-[rgba(117,215,180,0.28)]"
            : "border-[var(--line)] bg-[#0f151a]"
        }`}
      >
        <span
          className={`absolute top-1/2 size-[16px] -translate-y-1/2 rounded-full bg-[var(--ink-strong)] transition-transform ${
            enabled ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </span>
      <input
        checked={enabled}
        className="sr-only"
        id={id}
        type="checkbox"
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function RemoteFolderField({
  form,
  idPrefix,
  onChange,
}: {
  form: DriveForm;
  idPrefix: string;
  onChange: (patch: Partial<DriveForm>) => void;
}) {
  return (
    <TextInput
      id={`${idPrefix}-remote-path`}
      label="Remote folder"
      value={form.remotePath}
      onChange={(value) => onChange({ remotePath: value })}
      placeholder={form.protocol === "smb" ? "optional subfolder" : "/"}
    />
  );
}
