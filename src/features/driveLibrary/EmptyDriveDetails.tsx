import { Activity, FolderPlus, HardDrive } from "lucide-react";

const containerClassName = "grid min-h-80 place-items-center px-7 py-8 text-center text-[var(--muted)]";
const contentClassName = "grid max-w-[380px] place-items-center";
const iconClassName =
  "grid size-[46px] place-items-center rounded-[10px] border border-[rgba(142,154,166,0.28)] bg-[#151b20] text-[var(--muted-strong)]";
const titleClassName = "mt-3 text-[15px] font-bold text-[var(--ink-strong)]";
const copyClassName = "mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]";
const actionClassName =
  "mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-[7px] border border-[rgba(117,215,180,0.72)] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--accent-ink)] transition-colors hover:border-[rgba(139,224,156,0.8)] hover:bg-[#8be0bd] active:translate-y-px";

export function EmptyDriveDetails({
  hasDrives,
  onCreate,
}: {
  hasDrives: boolean;
  onCreate: () => void;
}) {
  const Icon = hasDrives ? Activity : HardDrive;
  const title = hasDrives ? "Select a drive" : "No drive selected";
  const copy = hasDrives
    ? "Choose a network drive to manage its mount state, local folder and cache."
    : "Add a network drive to see mount controls, health and cache details here.";

  return (
    <div className={containerClassName}>
      <div className={contentClassName}>
        <div className={iconClassName}>
          <Icon size={20} />
        </div>
        <strong className={titleClassName}>{title}</strong>
        <span className={copyClassName}>{copy}</span>
        {!hasDrives && (
          <button className={actionClassName} type="button" onClick={onCreate}>
            <FolderPlus size={16} />
            <span>Add network drive</span>
          </button>
        )}
      </div>
    </div>
  );
}
