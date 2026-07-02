import type { ButtonHTMLAttributes, ReactNode } from "react";

const fieldClassName = "grid min-w-0 gap-1.5";
const labelClassName = "text-xs text-[var(--muted)]";
const inputClassName =
  "h-[34px] w-full min-w-0 rounded-[7px] border border-[var(--line)] bg-[#11171c] px-2.5 py-2 text-[var(--ink-strong)] outline-none transition-colors placeholder:text-[#66727e] focus:border-[rgba(117,215,180,0.72)] focus:bg-[#141c22]";
const inputWithActionClassName = "grid grid-cols-[minmax(0,1fr)_auto] gap-[7px]";
const actionButtonClassName =
  "inline-flex h-[34px] min-w-[84px] items-center justify-center gap-1.5 rounded-[7px] border border-[var(--line)] bg-[var(--panel-raised)] px-2.5 text-xs font-bold text-[var(--ink)] transition-colors hover:border-[var(--line-strong)] hover:bg-[#2a333b] disabled:cursor-not-allowed disabled:opacity-50";

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
