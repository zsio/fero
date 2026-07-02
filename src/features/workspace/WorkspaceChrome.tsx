import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { shortPath } from "../driveSetup/model";

export type StatusTone = "default" | "good" | "muted" | "warning";

const toolbarButtonBaseClassName =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-[7px] border px-3 py-2 text-[13px] font-semibold transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const toolbarButtonClassNames = {
  default: `${toolbarButtonBaseClassName} border-[var(--line)] bg-[var(--panel-raised)] text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[#2a333b]`,
  primary: `${toolbarButtonBaseClassName} border-[rgba(117,215,180,0.72)] bg-[var(--accent)] text-[var(--accent-ink)] hover:border-[rgba(139,224,156,0.8)] hover:bg-[#8be0bd]`,
};
const pathLineClassName = "grid min-h-7 grid-cols-[16px_42px_minmax(0,1fr)] items-center gap-2 text-[11px] text-[var(--muted)]";
const pathValueClassName = "truncate font-mono text-[11px] font-medium text-[var(--muted-strong)]";
const workspaceHeaderClassName =
  "flex min-h-[66px] flex-none items-center justify-between gap-[22px] border-b border-[var(--line)] pb-3";
const kickerClassName = "flex items-center gap-[7px] text-xs font-bold text-[var(--accent)]";
const toolbarClassName = "flex flex-wrap justify-end gap-2";
const statusStripClassName =
  "grid flex-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5 py-3";
const statusTileClassName =
  "grid min-h-[52px] min-w-0 grid-cols-[22px_minmax(0,1fr)] items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[rgba(26,32,38,0.82)] px-3 py-2";
const statusToneClassNames = {
  default: "text-[var(--blue)]",
  good: "text-[var(--accent)]",
  muted: "text-[var(--muted)]",
  warning: "text-[var(--amber)]",
} satisfies Record<StatusTone, string>;
const paneHeaderClassName = "flex min-h-11 flex-none items-center justify-between gap-3 px-[14px] py-2.5";
const paneHeaderTitleClassName = "flex min-w-0 items-center gap-2 text-[var(--accent)]";

export function ToolbarButton({
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
    <button className={`${toolbarButtonClassNames[variant]} ${className}`} type="button" {...props}>
      <Icon size={16} />
      <span>{children}</span>
    </button>
  );
}

export function PathLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className={pathLineClassName}>
      <Icon size={14} />
      <span>{label}</span>
      <strong className={pathValueClassName} title={value}>
        {shortPath(value)}
      </strong>
    </div>
  );
}

export function WorkspaceHeader({
  kickerIcon: KickerIcon,
  kicker,
  title,
  description,
  children,
}: {
  kickerIcon: LucideIcon;
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <header className={workspaceHeaderClassName}>
      <div className="min-w-0">
        <div className={kickerClassName}>
          <KickerIcon size={14} />
          <span>{kicker}</span>
        </div>
        <h2 className="m-0 mt-1 text-[26px] font-bold text-[var(--ink-strong)]">{title}</h2>
        <p className="m-0 mt-1.5 text-[13px] text-[var(--muted)]">{description}</p>
      </div>

      <div className={toolbarClassName}>{children}</div>
    </header>
  );
}

export function StatusStrip({ children }: { children: ReactNode }) {
  return (
    <section className={statusStripClassName} aria-label="Overview">
      {children}
    </section>
  );
}

export function StatusTile({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <div className={`${statusTileClassName} ${statusToneClassNames[tone]}`}>
      <Icon size={17} />
      <div className="min-w-0">
        <span className="block text-[11px] text-[var(--muted)]">{label}</span>
        <strong className="mt-1 block truncate text-sm font-bold text-[var(--ink-strong)]">{value}</strong>
      </div>
    </div>
  );
}

export function PaneHeader({ title, meta, icon: Icon }: { title: string; meta: string; icon: LucideIcon }) {
  return (
    <div className={paneHeaderClassName}>
      <div className={paneHeaderTitleClassName}>
        <Icon size={16} />
        <h3 className="m-0 truncate text-sm font-bold text-[var(--ink-strong)]">{title}</h3>
      </div>
      <span className="shrink-0 text-xs text-[var(--muted)]">{meta}</span>
    </div>
  );
}
