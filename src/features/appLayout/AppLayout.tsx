import type { ReactNode } from "react";

const appShellClassName =
  "grid min-h-full grid-cols-1 items-start text-[var(--ink)] md:max-[1180px]:grid-cols-[220px_minmax(0,1fr)] min-[1181px]:h-full min-[1181px]:grid-cols-[248px_minmax(0,1fr)] min-[1181px]:items-stretch";
const workspaceSurfaceClassName =
  "flex min-h-screen min-w-0 flex-col px-[22px] pb-[22px] pt-5 min-[1181px]:min-h-0";

export function AppShell({ children }: { children: ReactNode }) {
  return <main className={appShellClassName}>{children}</main>;
}

export function WorkspaceSurface({ children }: { children: ReactNode }) {
  return <section className={workspaceSurfaceClassName}>{children}</section>;
}
