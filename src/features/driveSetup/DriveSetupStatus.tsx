import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Database,
  FolderOpen,
  HardDrive,
  KeyRound,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DriveForm, MountEnvironment, MountPointSuggestion, ProtocolDefinition } from "./model";
import {
  cacheLabelFromString,
  canSaveDriveForm,
  canTestDriveForm,
  endpointReadiness,
  environmentTone,
  environmentValue,
  shortPath,
} from "./model";

type StepState = "ready" | "pending" | "warning" | "neutral";

type SetupStep = {
  icon: LucideIcon;
  label: string;
  state: StepState;
  value: string;
  title?: string;
};

const panelClassName = "mx-[14px] mb-2.5 rounded-lg border px-2.5 py-[9px]";
const panelToneClassNames = {
  ready: "border-[rgba(117,215,180,0.34)] bg-[rgba(117,215,180,0.07)]",
  warning: "border-[rgba(239,196,90,0.38)] bg-[rgba(239,196,90,0.08)]",
} satisfies Record<"ready" | "warning", string>;
const headerIconClassNames = {
  ready: "text-[var(--accent)]",
  warning: "text-[var(--amber)]",
} satisfies Record<"ready" | "warning", string>;
const gridClassName = "mt-2 grid grid-cols-[repeat(auto-fit,minmax(142px,1fr))] gap-1.5";
const stepClassName =
  "grid min-h-[44px] min-w-0 grid-cols-[17px_minmax(0,1fr)] items-center gap-2 rounded-[7px] border border-[rgba(48,58,67,0.72)] bg-[#11171c] px-2 py-1.5";
const stepStateClassNames = {
  ready: "text-[var(--accent)]",
  pending: "text-[var(--amber)]",
  warning: "text-[var(--amber)]",
  neutral: "text-[var(--muted-strong)]",
} satisfies Record<StepState, string>;

export function DriveSetupStatus({
  form,
  protocol,
  suggestion,
  environment,
}: {
  form: DriveForm;
  protocol: ProtocolDefinition;
  suggestion: MountPointSuggestion | null;
  environment: MountEnvironment;
}) {
  const steps = setupSteps(form, protocol, suggestion, environment);
  const blockingCount = steps.filter((step) => step.state === "pending").length;
  const warningCount = steps.filter((step) => step.state === "warning").length;
  const ready = blockingCount === 0 && warningCount === 0 && canSaveDriveForm(form);
  const canTest = canTestDriveForm(form);
  const HeaderIcon = ready ? ShieldCheck : AlertTriangle;
  const headerTone = ready ? "ready" : "warning";
  const meta = setupMeta(blockingCount, warningCount);
  const status = ready
    ? "Ready to mount"
    : canTest
      ? warningCount > 0
        ? "Mount setup needs attention"
        : "Name this drive"
      : "Connection details needed";

  return (
    <div className={`${panelClassName} ${panelToneClassNames[headerTone]}`}>
      <div className="flex items-center justify-between gap-2.5">
        <div className={`flex min-w-0 items-center gap-[7px] ${headerIconClassNames[headerTone]}`}>
          <HeaderIcon size={15} />
          <strong className="truncate text-xs font-bold text-[var(--ink-strong)]">{status}</strong>
        </div>
        <span className="shrink-0 text-[11px] text-[var(--muted)]">{meta}</span>
      </div>

      <div className={gridClassName}>
        {steps.map((step) => (
          <SetupStepItem key={step.label} step={step} />
        ))}
      </div>
    </div>
  );
}

function SetupStepItem({ step }: { step: SetupStep }) {
  const Icon = step.icon;
  const StateIcon = step.state === "ready" ? CheckCircle2 : step.state === "pending" ? CircleDashed : AlertTriangle;

  return (
    <div className={`${stepClassName} ${stepStateClassNames[step.state]}`}>
      <Icon size={15} />
      <div className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--muted)]">
          <StateIcon size={12} />
          <span className="truncate">{step.label}</span>
        </span>
        <strong className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--muted-strong)]" title={step.title ?? step.value}>
          {step.value}
        </strong>
      </div>
    </div>
  );
}

function setupSteps(
  form: DriveForm,
  protocol: ProtocolDefinition,
  suggestion: MountPointSuggestion | null,
  environment: MountEnvironment,
): SetupStep[] {
  const endpoint = endpointReadiness(form, protocol);
  const localFolder = form.mountPoint.trim() || suggestion?.path || "";
  const mountTone = environmentTone(environment.state);

  return [
    {
      icon: HardDrive,
      label: "Drive name",
      state: form.displayName.trim() ? "ready" : "pending",
      value: form.displayName.trim() || "Required",
    },
    {
      icon: protocol.icon,
      label: endpoint.label,
      state: endpoint.ready ? "ready" : "pending",
      value: endpoint.value,
      title: endpoint.value,
    },
    accessStep(form),
    {
      icon: FolderOpen,
      label: "Local folder",
      state: localFolder ? "ready" : "pending",
      value: localFolder ? shortPath(localFolder) : "Resolving",
      title: localFolder,
    },
    {
      icon: ShieldCheck,
      label: "Mount support",
      state: mountTone === "good" ? "ready" : "warning",
      value: environmentValue(environment.state),
      title: `${environment.summary}\n${environment.recommendation}`,
    },
    {
      icon: RefreshCw,
      label: "Launch restore",
      state: form.autoMount ? "ready" : "neutral",
      value: form.autoMount ? "On launch" : "Manual",
    },
    {
      icon: Database,
      label: "Cache",
      state: "ready",
      value: cacheLabelFromString(form.cacheMode),
    },
  ];
}

function accessStep(form: DriveForm): SetupStep {
  const hasAccess = Boolean(form.username.trim() || form.password.trim() || form.domain.trim());
  const value = hasAccess
    ? form.domain.trim()
      ? `${form.domain.trim()} / ${form.username.trim() || "user"}`
      : form.username.trim() || "Credentials added"
    : form.protocol === "smb"
      ? "Guest or domain"
      : "Anonymous or password";

  return {
    icon: KeyRound,
    label: "Access",
    state: hasAccess ? "ready" : "neutral",
    value,
  };
}

function setupMeta(blockingCount: number, warningCount: number) {
  const parts: string[] = [];
  if (blockingCount > 0) parts.push(`${blockingCount} pending`);
  if (warningCount > 0) parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "All set";
}
