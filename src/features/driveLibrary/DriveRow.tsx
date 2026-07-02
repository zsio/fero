import type { LucideIcon } from "lucide-react";

export type DriveRowHealth = "healthy" | "attention" | "standby";

export type DriveRowView = {
  displayName: string;
  status: string;
  health: DriveRowHealth;
  icon: LucideIcon;
  protocolLabel: string;
  endpointLabel: string;
  mountPoint: string;
  cacheLabel: string;
};

const rowClassName =
  "grid min-h-[74px] w-full grid-cols-[38px_minmax(0,1fr)] gap-[11px] border-0 border-b border-[rgba(48,58,67,0.72)] px-[14px] py-[13px] text-left transition-colors";
const iconClassName =
  "grid size-[38px] place-items-center rounded-lg border border-[var(--line)] bg-[#151b20] text-[var(--blue)]";
const mainClassName = "min-w-0";
const topLineClassName = "flex items-center justify-between gap-2.5";
const nameClassName = "truncate text-sm font-bold text-[var(--ink-strong)]";
const metaClassName = "mt-[7px] flex flex-wrap gap-x-3 gap-y-2 text-xs text-[var(--muted)]";
const metaItemClassName = "max-w-full truncate";

const healthClassNames = {
  healthy: "border-[rgba(117,215,180,0.28)] text-[var(--accent)]",
  attention: "border-[rgba(255,131,124,0.38)] text-[var(--danger)]",
  standby: "border-[rgba(142,154,166,0.34)] text-[var(--muted-strong)]",
} satisfies Record<DriveRowHealth, string>;

export function DriveRow({
  drive,
  selected,
  onSelect,
}: {
  drive: DriveRowView;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = drive.icon;
  const selectedClassName = selected ? "bg-[#202933] shadow-[inset_3px_0_0_var(--accent)]" : "bg-transparent hover:bg-[#202933]";

  return (
    <button
      className={`${rowClassName} ${selectedClassName}`}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className={iconClassName}>
        <Icon size={18} />
      </div>
      <div className={mainClassName}>
        <div className={topLineClassName}>
          <strong className={nameClassName}>{drive.displayName}</strong>
          <span className={`shrink-0 rounded-full border px-2 py-[3px] text-[11px] leading-tight ${healthClassNames[drive.health]}`}>
            {drive.status}
          </span>
        </div>
        <div className={metaClassName}>
          <span className={metaItemClassName}>{drive.protocolLabel}</span>
          <span className={metaItemClassName}>{drive.endpointLabel}</span>
          <span className={metaItemClassName}>{drive.mountPoint}</span>
          <span className={metaItemClassName}>{drive.cacheLabel}</span>
        </div>
      </div>
    </button>
  );
}
