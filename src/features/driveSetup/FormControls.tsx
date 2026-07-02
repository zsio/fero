import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const createFormClassName = "grid gap-[9px] px-[14px] pb-3";
const editFormClassName = "grid gap-[9px] px-[14px] pb-[14px]";
const protocolLineClassName =
  "flex min-h-8 items-center gap-2 rounded-[7px] border border-[var(--line)] bg-[#12181d] px-[9px] py-[7px] text-xs font-bold text-[var(--accent)]";
const fieldClassName = "grid min-w-0 gap-1.5";
const labelClassName = "text-xs text-[var(--muted)]";
const inputClassName =
  "h-[34px] w-full min-w-0 rounded-[7px] border border-[var(--line)] bg-[#11171c] px-2.5 py-2 text-[var(--ink-strong)] outline-none transition-colors placeholder:text-[#66727e] focus:border-[rgba(117,215,180,0.72)] focus:bg-[#141c22]";
const inputWithActionClassName = "grid grid-cols-[minmax(0,1fr)_auto] gap-[7px]";
const actionButtonClassName =
  "inline-flex h-[34px] min-w-[84px] items-center justify-center gap-1.5 rounded-[7px] border border-[var(--line)] bg-[var(--panel-raised)] px-2.5 text-xs font-bold text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] hover:bg-[#2a333b] disabled:cursor-not-allowed disabled:opacity-50";
const actionRowClassName = "grid grid-cols-[minmax(0,0.74fr)_minmax(0,1fr)] gap-2";
const editActionRowClassName = `${actionRowClassName} mt-0.5`;
const baseButtonClassName =
  "inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-[7px] border px-3 py-2 text-[13px] font-semibold transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClassName =
  `${baseButtonClassName} min-h-[38px] w-full border-[rgba(117,215,180,0.72)] bg-[var(--accent)] text-[var(--accent-ink)] hover:border-[rgba(139,224,156,0.8)] hover:bg-[#8be0bd]`;
const secondaryButtonClassName =
  `${baseButtonClassName} border-[var(--line)] bg-[#151b20] text-[var(--muted-strong)] hover:border-[var(--line-strong)] hover:bg-[#2a333b]`;

export function DriveSetupForm({
  children,
  variant = "create",
  onSubmit,
}: {
  children: ReactNode;
  variant?: "create" | "edit";
  onSubmit: () => void;
}) {
  return (
    <form
      className={variant === "edit" ? editFormClassName : createFormClassName}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

export function ProtocolSummaryLine({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className={protocolLineClassName}>
      <Icon size={15} />
      <span>{label}</span>
    </div>
  );
}

export function FieldGrid({
  children,
  columns = 1,
}: {
  children: ReactNode;
  columns?: 1 | 2;
}) {
  const columnClassName = columns === 2 ? "grid-cols-[repeat(auto-fit,minmax(150px,1fr))]" : "grid-cols-1";
  return <div className={`grid gap-2.5 ${columnClassName}`}>{children}</div>;
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  action,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
  action?: ReactNode;
}) {
  return (
    <div className={fieldClassName}>
      <label className={labelClassName} htmlFor={id}>
        {label}
      </label>
      <div className={action ? inputWithActionClassName : undefined}>
        <input
          className={inputClassName}
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
        />
        {action}
      </div>
    </div>
  );
}

export function SelectInput({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className={fieldClassName}>
      <label className={labelClassName} htmlFor={id}>
        {label}
      </label>
      <select className={inputClassName} id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FieldActionButton({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
}) {
  return (
    <button className={actionButtonClassName} type="button" {...props}>
      {children}
    </button>
  );
}

export function FormActionRow({
  children,
  variant = "create",
}: {
  children: ReactNode;
  variant?: "create" | "edit";
}) {
  return <div className={variant === "edit" ? editActionRowClassName : actionRowClassName}>{children}</div>;
}

export function FormButton({
  children,
  icon: Icon,
  loading = false,
  variant = "secondary",
  fullWidth = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  icon: LucideIcon;
  loading?: boolean;
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
}) {
  const ButtonIcon = loading ? Loader2 : Icon;
  const variantClassName = variant === "primary" ? primaryButtonClassName : secondaryButtonClassName;
  const widthClassName = fullWidth ? "w-full" : "";

  return (
    <button className={`${variantClassName} ${widthClassName}`} {...props}>
      <ButtonIcon className={loading ? "animate-spin" : undefined} size={16} />
      <span>{children}</span>
    </button>
  );
}
