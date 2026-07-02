import { FolderOpen } from "lucide-react";
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
          onChange={(value) => onChange({ url: value })}
          placeholder="https://cloud.example.com/remote.php/dav/files/me/"
        />
      ) : (
        <FieldGrid columns={2}>
          <TextInput
            id={`${idPrefix}-host`}
            label="Server"
            value={form.host}
            onChange={(value) => onChange({ host: value })}
            placeholder={form.protocol === "smb" ? "NAS.local" : "files.example.com"}
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
    </>
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
