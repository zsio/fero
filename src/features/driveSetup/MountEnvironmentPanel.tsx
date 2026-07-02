import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import type { MountEnvironment } from "./model";
import { environmentValue, shortPath } from "./model";

const panelBaseClassName = "mx-[14px] mb-2.5 grid gap-2 rounded-lg border px-2.5 py-[9px]";
const panelToneClassNames = {
  ready: "border-[rgba(117,215,180,0.34)] bg-[rgba(117,215,180,0.07)]",
  warning: "border-[rgba(239,196,90,0.38)] bg-[rgba(239,196,90,0.08)]",
  muted: "border-[var(--line)] bg-[#12181d]",
};
const iconToneClassNames = {
  ready: "border-[rgba(117,215,180,0.32)] text-[var(--accent)]",
  warning: "border-[rgba(239,196,90,0.38)] text-[var(--amber)]",
  muted: "border-[rgba(142,154,166,0.28)] text-[var(--muted-strong)]",
};
const infoGridClassName = "grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-1.5";
const infoItemClassName =
  "min-w-0 rounded-[7px] border border-[rgba(48,58,67,0.72)] bg-[#10161b] px-2 py-1.5";
const infoLabelClassName = "block text-[11px] text-[var(--muted)]";
const infoValueClassName = "mt-0.5 block truncate text-[11px] font-semibold text-[var(--muted-strong)]";
const pathListClassName = "flex flex-wrap gap-1.5";
const pathChipClassName =
  "max-w-full truncate rounded-full border border-[rgba(117,215,180,0.24)] bg-[rgba(117,215,180,0.07)] px-2 py-[3px] text-[11px] text-[var(--muted-strong)]";

export function MountEnvironmentPanel({ environment }: { environment: MountEnvironment }) {
  const tone = environmentPanelTone(environment.state);
  const Icon = tone === "ready" ? CheckCircle2 : tone === "warning" ? AlertTriangle : Info;
  const detectedPaths = environment.detectedPaths.slice(0, 3);

  return (
    <section className={`${panelBaseClassName} ${panelToneClassNames[tone]}`} aria-label="Mount system readiness">
      <div className="grid grid-cols-[30px_minmax(0,1fr)] items-start gap-2.5">
        <div className={`grid size-[30px] place-items-center rounded-lg border ${iconToneClassNames[tone]}`}>
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <strong className="truncate text-[13px] font-bold text-[var(--ink-strong)]">Mount system</strong>
            <span className="shrink-0 rounded-full border border-current/20 px-2 py-[2px] text-[11px] font-semibold text-[var(--muted-strong)]">
              {environmentValue(environment.state)}
            </span>
          </div>
          <p className="m-0 mt-1 text-xs leading-snug text-[var(--muted-strong)]">{environment.summary}</p>
          <p className="m-0 mt-1 text-xs leading-snug text-[var(--muted)]">{environment.recommendation}</p>
        </div>
      </div>

      <div className={infoGridClassName}>
        <EnvironmentInfo label="Platform" value={environment.platform || "Unknown"} />
        <EnvironmentInfo label="Required" value={environment.requirement || "Mount support"} />
        <EnvironmentInfo label="Detected" value={detectedPaths.length > 0 ? `${detectedPaths.length} path${detectedPaths.length === 1 ? "" : "s"}` : "Not detected"} />
      </div>

      {detectedPaths.length > 0 && (
        <div className={pathListClassName} aria-label="Detected mount support paths">
          {detectedPaths.map((path) => (
            <span className={pathChipClassName} key={path} title={path}>
              <ShieldCheck size={11} className="mr-1 inline-block text-[var(--accent)]" />
              {shortPath(path)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function EnvironmentInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className={infoItemClassName}>
      <span className={infoLabelClassName}>{label}</span>
      <strong className={infoValueClassName} title={value}>
        {value}
      </strong>
    </div>
  );
}

function environmentPanelTone(state: string): "ready" | "warning" | "muted" {
  if (state === "ready") return "ready";
  if (state === "needsSetup" || state === "limited") return "warning";
  return "muted";
}
