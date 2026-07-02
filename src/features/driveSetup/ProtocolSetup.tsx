import { FolderOpen, KeyRound, Play } from "lucide-react";
import type { ProtocolDefinition, ProtocolId } from "./model";
import { protocols } from "./model";

export function ProtocolPicker({
  selected,
  onSelect,
}: {
  selected: ProtocolId;
  onSelect: (protocol: ProtocolId) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-[7px] px-[14px] pb-2.5" aria-label="Choose a protocol">
      {protocols.map((protocol) => {
        const Icon = protocol.icon;
        const active = protocol.id === selected;
        return (
          <button
            key={protocol.id}
            className={`grid min-h-[50px] min-w-0 place-items-center gap-1 rounded-lg border px-1.5 py-[7px] text-xs font-bold transition-colors ${
              active
                ? "border-[rgba(117,215,180,0.62)] bg-[rgba(117,215,180,0.11)] text-[var(--accent)]"
                : "border-[var(--line)] bg-[#141a1f] text-[var(--muted-strong)] hover:border-[rgba(117,215,180,0.42)] hover:bg-[rgba(117,215,180,0.07)]"
            }`}
            type="button"
            title={protocol.summary}
            aria-pressed={active}
            onClick={() => onSelect(protocol.id)}
          >
            <Icon size={18} />
            <span className="truncate">{protocol.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SetupRail({ protocol }: { protocol: ProtocolDefinition }) {
  const ProtocolIcon = protocol.icon;
  const steps = [
    { icon: ProtocolIcon, label: protocol.label },
    { icon: KeyRound, label: "Credentials" },
    { icon: FolderOpen, label: "Local folder" },
    { icon: Play, label: "Mount" },
  ];

  return (
    <div className="grid grid-cols-4 gap-[7px] px-[14px] pb-2.5" aria-label="Drive setup path">
      {steps.map((step) => {
        const Icon = step.icon;
        return (
          <div
            key={step.label}
            className="inline-flex min-h-[30px] min-w-0 items-center justify-center gap-1.5 rounded-[7px] border border-[rgba(48,58,67,0.72)] bg-[#11171c] px-2 text-[11px] font-semibold text-[var(--muted-strong)]"
          >
            <Icon size={14} />
            <span className="truncate">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ProtocolHint({ protocol }: { protocol: ProtocolDefinition }) {
  return (
    <div className="grid min-h-[34px] grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-[7px] border border-[var(--line)] bg-[#12181d] px-[9px] py-[7px] text-xs leading-snug text-[var(--muted)]">
      <KeyRound size={15} />
      <span>{protocol.hint}</span>
    </div>
  );
}
