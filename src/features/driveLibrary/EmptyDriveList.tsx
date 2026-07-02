import { FolderPlus, Plus } from "lucide-react";
import { protocols } from "../driveSetup/model";

const containerClassName = "grid min-h-80 place-items-center px-7 py-8 text-center text-[var(--muted)]";
const contentClassName = "grid max-w-[430px] place-items-center";
const iconClassName =
  "grid size-[54px] place-items-center rounded-[10px] border border-[rgba(117,215,180,0.28)] bg-[#151b20] text-[var(--accent)]";
const titleClassName = "mt-[13px] text-base font-bold text-[var(--ink-strong)]";
const copyClassName = "mt-[7px] max-w-[380px] text-[13px] leading-relaxed text-[var(--muted)]";
const protocolListClassName = "mt-4 flex flex-wrap justify-center gap-[7px]";
const protocolChipClassName =
  "inline-flex min-h-7 items-center gap-[5px] rounded-full border border-[rgba(48,58,67,0.78)] bg-[#12181d] px-[9px] py-[5px] text-[11px] font-semibold leading-none text-[var(--muted-strong)]";
const actionClassName =
  "mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-[7px] border border-[rgba(117,215,180,0.72)] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:border-[rgba(139,224,156,0.8)] hover:bg-[#8be0bd] active:translate-y-px";

export function EmptyDriveList({
  daemonRunning,
  onCreate,
}: {
  daemonRunning: boolean;
  onCreate: () => void;
}) {
  const title = daemonRunning ? "No network drives yet" : "Add your first network drive";
  const copy = daemonRunning
    ? "Connect WebDAV, SFTP, FTP or SMB storage and mount it as a local folder."
    : "Choose a protocol and local folder. Fero starts the mount service when you connect.";

  return (
    <div className={containerClassName}>
      <div className={contentClassName}>
        <div className={iconClassName}>
          <FolderPlus size={24} />
        </div>
        <strong className={titleClassName}>{title}</strong>
        <span className={copyClassName}>{copy}</span>
        <div className={protocolListClassName} aria-label="Supported protocols">
          {protocols.map((protocol) => {
            const Icon = protocol.icon;
            return (
              <span className={protocolChipClassName} key={protocol.id}>
                <Icon size={13} />
                {protocol.label}
              </span>
            );
          })}
        </div>
        <button className={actionClassName} type="button" onClick={onCreate}>
          <Plus size={16} />
          <span>Add network drive</span>
        </button>
      </div>
    </div>
  );
}
