import { KeyRound } from "lucide-react";
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(138px,1fr))] gap-2 px-[14px] pb-2.5" aria-label="Choose a protocol">
      {protocols.map((protocol) => {
        const Icon = protocol.icon;
        const active = protocol.id === selected;
        return (
          <button
            key={protocol.id}
            className={`grid min-h-[64px] min-w-0 grid-cols-[24px_minmax(0,1fr)] items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
              active
                ? "border-[rgba(117,215,180,0.62)] bg-[rgba(117,215,180,0.11)] text-[var(--accent)]"
                : "border-[var(--line)] bg-[#141a1f] text-[var(--muted-strong)] hover:border-[rgba(117,215,180,0.42)] hover:bg-[rgba(117,215,180,0.07)]"
            }`}
            type="button"
            title={protocol.summary}
            aria-pressed={active}
            onClick={() => onSelect(protocol.id)}
          >
            <span className="mt-0.5 grid size-6 place-items-center rounded-[7px] border border-current/20">
              <Icon size={16} />
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-xs font-bold text-[var(--ink-strong)]">{protocol.label}</strong>
              <small className="mt-1 block truncate text-[11px] leading-snug text-[var(--muted)]">
                {protocol.summary}
              </small>
            </span>
          </button>
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
