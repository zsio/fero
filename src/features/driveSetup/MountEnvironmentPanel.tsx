import { AlertTriangle, Settings, ShieldCheck } from "lucide-react";
import type { MountEnvironment } from "./model";
import { environmentTone, shortPath } from "./model";

const panelClassName =
  "mx-[14px] mb-2.5 grid min-h-[48px] grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-[9px] rounded-lg border px-2.5 py-[9px]";
const toneClassNames = {
  good: "border-[rgba(117,215,180,0.34)] bg-[rgba(117,215,180,0.07)]",
  warning: "border-[rgba(239,196,90,0.38)] bg-[rgba(239,196,90,0.08)]",
  muted: "border-[rgba(142,154,166,0.28)] bg-[#12181d]",
} satisfies Record<ReturnType<typeof environmentTone>, string>;
const iconClassNames = {
  good: "border-[rgba(117,215,180,0.25)] text-[var(--accent)]",
  warning: "border-[rgba(239,196,90,0.32)] text-[var(--amber)]",
  muted: "border-[rgba(142,154,166,0.24)] text-[var(--muted-strong)]",
} satisfies Record<ReturnType<typeof environmentTone>, string>;
const iconBoxClassName = "grid size-[26px] place-items-center rounded-[7px] border";
const copyClassName = "min-w-0";
const summaryClassName = "block truncate text-xs font-bold text-[var(--ink-strong)]";
const recommendationClassName = "mt-[3px] block text-[11px] leading-snug text-[var(--muted)]";
const metaClassName = "max-w-28 truncate font-mono text-[11px] text-[var(--muted-strong)]";

export function MountEnvironmentPanel({ environment }: { environment: MountEnvironment }) {
  const tone = environmentTone(environment.state);
  const ready = environment.state === "ready";
  const warning = environment.state === "needsSetup" || environment.state === "limited";
  const Icon = ready ? ShieldCheck : warning ? AlertTriangle : Settings;
  const pathLabel =
    environment.detectedPaths.length > 0
      ? shortPath(environment.detectedPaths[0])
      : environment.requirement;
  const detectedTitle = environment.detectedPaths.join("\n") || environment.requirement;

  return (
    <div className={`${panelClassName} ${toneClassNames[tone]}`} aria-label="Mount support">
      <div className={`${iconBoxClassName} ${iconClassNames[tone]}`}>
        <Icon size={16} />
      </div>
      <div className={copyClassName}>
        <strong className={summaryClassName}>{environment.summary}</strong>
        <span className={recommendationClassName}>{environment.recommendation}</span>
      </div>
      <small className={metaClassName} title={detectedTitle}>
        {environment.platform} · {pathLabel}
      </small>
    </div>
  );
}
