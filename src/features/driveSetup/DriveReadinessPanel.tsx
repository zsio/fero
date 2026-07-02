import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { DriveForm, MountPointSuggestion, ProtocolDefinition } from "./model";
import { canSaveDriveForm, canTestDriveForm, driveReadinessItems } from "./model";

export function DriveReadinessPanel({
  form,
  protocol,
  suggestion,
}: {
  form: DriveForm;
  protocol: ProtocolDefinition;
  suggestion: MountPointSuggestion | null;
}) {
  const items = driveReadinessItems(form, protocol, suggestion);
  const pendingCount = items.filter((item) => !item.ready).length;
  const canTest = canTestDriveForm(form);
  const canSave = canSaveDriveForm(form);
  const Icon = canSave ? ShieldCheck : AlertTriangle;
  const status = canSave ? "Ready to mount" : canTest ? "Name this drive" : "Connection details needed";
  const panelTone = canSave
    ? "border-[rgba(117,215,180,0.34)] bg-[rgba(117,215,180,0.07)]"
    : "border-[rgba(239,196,90,0.34)] bg-[rgba(239,196,90,0.07)]";
  const headingTone = canSave ? "text-[var(--accent)]" : "text-[var(--amber)]";

  return (
    <div className={`mx-[14px] mb-2.5 grid gap-2 rounded-lg border px-2.5 py-[9px] ${panelTone}`}>
      <div className="flex items-center justify-between gap-2.5">
        <div className={`flex min-w-0 items-center gap-[7px] ${headingTone}`}>
          <Icon size={15} />
          <strong className="truncate text-xs font-bold text-[var(--ink-strong)]">{status}</strong>
        </div>
        <span className="shrink-0 text-[11px] text-[var(--muted)]">
          {pendingCount === 0 ? "All set" : `${pendingCount} pending`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((item) => {
          const ItemIcon = item.icon;
          return (
            <div
              key={item.label}
              className={`grid min-h-7 min-w-0 grid-cols-[16px_minmax(54px,0.9fr)_minmax(0,1fr)] items-center gap-1.5 rounded-[7px] border border-[rgba(48,58,67,0.72)] bg-[#11171c] px-2 py-1.5 text-[11px] ${
                item.ready ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              <ItemIcon size={14} />
              <span className="truncate">{item.label}</span>
              <strong className="truncate text-right font-semibold text-[var(--muted-strong)]" title={item.value}>
                {item.value}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}
