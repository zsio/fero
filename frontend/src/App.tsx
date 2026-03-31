import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, HardDrive, LoaderCircle, PlugZap, RefreshCcw, Settings2, ShieldCheck, Trash2, Waypoints } from "lucide-react";
import { Toaster, toast } from "sonner";

import { api } from "@/lib/api";
import type { MountSession, Overview, Provider, Remote, Settings, TransferJob } from "@/lib/types";
import { splitArgs } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const defaultSettings: Settings = {
  rcloneBinaryPath: "",
  preferBundledBinary: true,
  transfers: 4,
  checkers: 8,
  multiThreadStreams: 4,
  useJSONLog: true,
  mountVfsCacheMode: "full",
  mountExtraArgs: [],
  transferExtraArgs: [],
  theme: "system",
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [transfers, setTransfers] = useState<TransferJob[]>([]);
  const [mounts, setMounts] = useState<MountSession[]>([]);
  const [providerFilter, setProviderFilter] = useState("");
  const [providerName, setProviderName] = useState("local");
  const [remoteName, setRemoteName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [providerValues, setProviderValues] = useState<Record<string, string>>({});
  const [transferForm, setTransferForm] = useState({ operation: "copy", source: "", target: "", extraArgs: "", dryRun: false });
  const [mountForm, setMountForm] = useState({ remote: "", mountPoint: "", extraArgs: "" });

  const hydrate = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const [nextOverview, nextSettings, providerCatalog, nextRemotes, nextTransfers, nextMounts] = await Promise.all([
        api.overview(),
        api.getSettings(),
        api.listProviders(),
        api.listRemotes(),
        api.listTransfers(),
        api.listMounts(),
      ]);
      setOverview(nextOverview);
      setSettings(nextSettings);
      setProviders(providerCatalog.providers);
      setRemotes(nextRemotes);
      setTransfers(nextTransfers);
      setMounts(nextMounts);
      if (!providerCatalog.providers.some((item) => item.name === providerName) && providerCatalog.providers.length > 0) {
        setProviderName(providerCatalog.providers[0].name);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh Fero state");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void hydrate();
    const timer = window.setInterval(() => void hydrate(true), 3500);
    return () => window.clearInterval(timer);
  }, []);

  const selectedProvider = useMemo(
    () => providers.find((item) => item.name === providerName) ?? providers[0],
    [providers, providerName],
  );

  const filteredProviders = useMemo(() => {
    const needle = providerFilter.trim().toLowerCase();
    return providers.filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle));
  }, [providers, providerFilter]);

  const providerOptions = useMemo(
    () => (selectedProvider?.options ?? []).filter((item) => showAdvanced || !item.advanced),
    [selectedProvider, showAdvanced],
  );

  const saveSettings = async () => {
    try {
      const next = await api.saveSettings(settings);
      setSettings(next);
      toast.success("Settings saved");
      await hydrate(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save settings");
    }
  };

  const createRemote = async () => {
    try {
      await api.createRemote({ name: remoteName, type: selectedProvider?.name, parameters: providerValues });
      toast.success(`Remote ${remoteName} created`);
      setRemoteName("");
      setProviderValues({});
      await hydrate(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create remote");
    }
  };

  const deleteRemote = async (name: string) => {
    try {
      await api.deleteRemote(name);
      toast.success(`Remote ${name} deleted`);
      await hydrate(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete remote");
    }
  };

  const startTransfer = async () => {
    try {
      await api.startTransfer({
        operation: transferForm.operation,
        source: transferForm.source,
        target: transferForm.target,
        extraArgs: splitArgs(transferForm.extraArgs),
        dryRun: transferForm.dryRun,
      });
      toast.success("Transfer started");
      setTransferForm((current) => ({ ...current, source: "", target: "", extraArgs: "" }));
      await hydrate(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start transfer");
    }
  };

  const cancelTransfer = async (id: string) => {
    try {
      await api.cancelTransfer(id);
      toast.success("Transfer cancelled");
      await hydrate(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel transfer");
    }
  };

  const startMount = async () => {
    try {
      await api.startMount({ remote: mountForm.remote, mountPoint: mountForm.mountPoint, extraArgs: splitArgs(mountForm.extraArgs) });
      toast.success("Mount started");
      setMountForm({ remote: "", mountPoint: "", extraArgs: "" });
      await hydrate(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to start mount");
    }
  };

  const stopMount = async (id: string) => {
    try {
      await api.stopMount(id);
      toast.success("Mount stopping");
      await hydrate(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to stop mount");
    }
  };

  if (loading || !overview) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--muted-foreground)]">
        <LoaderCircle className="mr-3 animate-spin" /> Booting Fero desktop console…
      </div>
    );
  }

  const binaryState = overview.rclone.available ? (overview.rclone.error ? "warning" : "success") : "danger";

  return (
    <div className="min-h-screen px-5 py-5 lg:px-8">
      <Toaster richColors theme="dark" />
      <div className="mx-auto grid max-w-[1600px] gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(17,23,30,.94),rgba(8,12,18,.92))] p-5 shadow-[0_24px_80px_rgba(0,0,0,.36)]">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <div className="mono text-[11px] uppercase tracking-[0.4em] text-[var(--accent)]">FERO</div>
              <h1 className="mt-3 text-3xl font-semibold leading-none tracking-[0.18em] text-white">RCLONE</h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">A tight, native-feeling storage control board.</p>
            </div>
            <Badge variant={binaryState}>live</Badge>
          </div>

          <div className="space-y-3">
            <MetricTile icon={<ShieldCheck className="size-4" />} label="Binary" value={overview.rclone.available ? overview.rclone.version || overview.rclone.source : "offline"} />
            <MetricTile icon={<PlugZap className="size-4" />} label="Providers" value={String(overview.counts.providers)} />
            <MetricTile icon={<ArrowUpDown className="size-4" />} label="Transfers" value={String(overview.counts.runningOps)} />
            <MetricTile icon={<Waypoints className="size-4" />} label="Mounts" value={String(overview.counts.mounts)} />
          </div>

          <Separator className="my-6" />
          <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
            <div>{overview.platform} · {overview.arch}</div>
            <div className="break-all">{overview.rclone.path || "No binary resolved yet"}</div>
            <Button variant="secondary" className="mt-3 w-full" onClick={() => void hydrate(true)}>
              <RefreshCcw className="mr-2 size-4" /> Refresh snapshot
            </Button>
          </div>
        </aside>

        <main className="space-y-5">
          <Card>
            <CardContent className="grid gap-5 p-6 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <Badge variant={binaryState}>{overview.rclone.available ? overview.rclone.source : "missing binary"}</Badge>
                <h2 className="mt-4 max-w-3xl text-4xl leading-tight font-semibold text-white">
                  Ship rclone as a pinned runtime, operate it like a desktop workstation.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted-foreground)]">
                  Fero reads provider metadata from rclone itself, persists its own app-scoped config, and wraps transfers + mounts
                  in a compact shell built for repeated operational work instead of browser-like sprawl.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Remotes" value={String(overview.counts.remotes)} note="configured endpoints" />
                <StatCard label="Providers" value={String(overview.counts.providers)} note="protocol surfaces" />
                <StatCard label="Pinned" value={overview.rclone.version || "n/a"} note="resolved runtime" />
                <StatCard label="Config" value={overview.paths.rcloneConfig.split("/").slice(-2).join("/")} note="app-owned config" />
              </div>
            </CardContent>
          </Card>

          {overview.rclone.error && (
            <Card className="border-amber-400/30">
              <CardContent className="space-y-2 p-5 text-sm text-amber-100">
                {overview.rclone.error.split(";").filter(Boolean).map((line) => <div key={line}>• {line.trim()}</div>)}
              </CardContent>
            </Card>
          )}

          <Tabs defaultValue="dashboard">
            <TabsList>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="providers">Providers</TabsTrigger>
              <TabsTrigger value="transfers">Transfers</TabsTrigger>
              <TabsTrigger value="mounts">Mounts</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Latest transfer activity</CardTitle>
                    <CardDescription>Background rclone commands launched through the Go task manager.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {transfers.length === 0 ? <Empty label="No transfer jobs yet" /> : transfers.slice(0, 5).map((job) => <TransferRow key={job.id} job={job} onCancel={cancelTransfer} compact />)}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Current mount sessions</CardTitle>
                    <CardDescription>Managed child processes with OS-specific prerequisites.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mounts.length === 0 ? <Empty label="No mount sessions yet" /> : mounts.slice(0, 5).map((mount) => <MountRow key={mount.id} mount={mount} onStop={stopMount} compact />)}
                    <Separator />
                    <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
                      {overview.prerequisites.map((item) => <div key={item}>• {item}</div>)}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="providers">
              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Provider catalog</CardTitle>
                    <CardDescription>Directly generated from `rclone config providers`.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} placeholder="Search webdav / s3 / drive" />
                    <ScrollArea className="h-[520px] pr-3">
                      <div className="space-y-3">
                        {filteredProviders.map((provider) => (
                          <button
                            key={provider.name}
                            type="button"
                            onClick={() => {
                              setProviderName(provider.name);
                              setProviderValues({});
                            }}
                            className={`w-full rounded-2xl border p-4 text-left transition ${provider.name === providerName ? "border-[var(--accent)] bg-[rgba(71,245,202,.08)]" : "border-white/8 bg-black/12 hover:border-white/16"}`}
                          >
                            <div className="font-medium text-white">{provider.name}</div>
                            <div className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{provider.description}</div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Create remote</CardTitle>
                    <CardDescription>Dynamic form fields backed by the selected provider's option schema.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Remote name"><Input value={remoteName} onChange={(event) => setRemoteName(event.target.value)} placeholder="media-archive" /></Field>
                      <Field label="Provider"><Input value={selectedProvider?.name ?? ""} disabled /></Field>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <input type="checkbox" checked={showAdvanced} onChange={(event) => setShowAdvanced(event.target.checked)} /> Show advanced options
                    </label>
                    <ScrollArea className="h-[420px] pr-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        {providerOptions.map((option) => (
                          <Field key={option.name} label={`${option.name}${option.required ? " *" : ""}`} hint={option.help}>
                            {option.exclusive && option.examples.length > 0 ? (
                              <select
                                value={providerValues[option.name] ?? option.defaultStr ?? ""}
                                onChange={(event) => setProviderValues((current) => ({ ...current, [option.name]: event.target.value }))}
                                className="flex h-11 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                              >
                                <option value="">Select value</option>
                                {option.examples.map((example) => <option key={example.value} value={example.value}>{example.value}</option>)}
                              </select>
                            ) : (
                              <Input
                                type={option.isPassword || option.sensitive ? "password" : "text"}
                                value={providerValues[option.name] ?? option.defaultStr ?? ""}
                                placeholder={option.defaultStr || option.type}
                                onChange={(event) => setProviderValues((current) => ({ ...current, [option.name]: event.target.value }))}
                              />
                            )}
                          </Field>
                        ))}
                      </div>
                    </ScrollArea>
                    <Button size="lg" onClick={() => void createRemote()} disabled={!remoteName.trim() || !selectedProvider}>
                      <PlugZap className="mr-2 size-4" /> Create remote
                    </Button>
                    <Separator />
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-white">Configured remotes</div>
                      {remotes.length === 0 ? <Empty label="No remotes configured" /> : remotes.map((remote) => (
                        <div key={remote.name} className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/12 px-4 py-3">
                          <div>
                            <div className="font-medium text-white">{remote.name}</div>
                            <div className="text-sm text-[var(--muted-foreground)]">{remote.type}</div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => void deleteRemote(remote.name)}>
                            <Trash2 className="mr-2 size-4" /> Delete
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="transfers">
              <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Launch transfer</CardTitle>
                    <CardDescription>Use `remote:path` and absolute/local paths exactly as rclone expects.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Operation">
                        <select value={transferForm.operation} onChange={(event) => setTransferForm((current) => ({ ...current, operation: event.target.value }))} className="flex h-11 w-full rounded-xl border border-white/8 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]">
                          {['copy', 'copyto', 'sync', 'move', 'delete', 'purge'].map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </Field>
                      <Field label="Dry run">
                        <label className="flex h-11 items-center gap-2 rounded-xl border border-white/8 bg-black/20 px-3 text-sm text-white">
                          <input type="checkbox" checked={transferForm.dryRun} onChange={(event) => setTransferForm((current) => ({ ...current, dryRun: event.target.checked }))} />
                          Validate wiring without mutation
                        </label>
                      </Field>
                      <Field label="Source"><Input value={transferForm.source} onChange={(event) => setTransferForm((current) => ({ ...current, source: event.target.value }))} placeholder="/Users/me/Downloads or remote:path" /></Field>
                      <Field label="Target"><Input value={transferForm.target} onChange={(event) => setTransferForm((current) => ({ ...current, target: event.target.value }))} placeholder="remote:path or /absolute/path" /></Field>
                    </div>
                    <Field label="Extra args" hint="Whitespace/newline separated extra CLI flags">
                      <Textarea value={transferForm.extraArgs} onChange={(event) => setTransferForm((current) => ({ ...current, extraArgs: event.target.value }))} placeholder="--fast-list --bwlimit=8M" />
                    </Field>
                    <Button size="lg" onClick={() => void startTransfer()} disabled={!transferForm.source.trim()}>
                      <ArrowUpDown className="mr-2 size-4" /> Start transfer
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Transfer queue</CardTitle>
                    <CardDescription>Commands, states and last messages from background workers.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {transfers.length === 0 ? <Empty label="No transfer jobs" /> : transfers.map((job) => <TransferRow key={job.id} job={job} onCancel={cancelTransfer} />)}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="mounts">
              <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Start mount</CardTitle>
                    <CardDescription>Managed `rclone mount` process with platform-specific prerequisites.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="Remote"><Input value={mountForm.remote} onChange={(event) => setMountForm((current) => ({ ...current, remote: event.target.value }))} placeholder="drive:" /></Field>
                    <Field label="Mount point"><Input value={mountForm.mountPoint} onChange={(event) => setMountForm((current) => ({ ...current, mountPoint: event.target.value }))} placeholder="/Volumes/FeroDrive or X:" /></Field>
                    <Field label="Extra args"><Textarea value={mountForm.extraArgs} onChange={(event) => setMountForm((current) => ({ ...current, extraArgs: event.target.value }))} placeholder="--vfs-cache-mode writes" /></Field>
                    <Button size="lg" onClick={() => void startMount()} disabled={!mountForm.remote.trim() || !mountForm.mountPoint.trim()}>
                      <HardDrive className="mr-2 size-4" /> Start mount
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Mount sessions</CardTitle>
                    <CardDescription>Long-lived sessions the backend can stop cleanly.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mounts.length === 0 ? <Empty label="No mount sessions" /> : mounts.map((mount) => <MountRow key={mount.id} mount={mount} onStop={stopMount} />)}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings">
              <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>Desktop runtime preferences</CardTitle>
                    <CardDescription>Keep the GUI stable while the binary source remains swappable and version-pinned.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Field label="Preferred binary path"><Input value={settings.rcloneBinaryPath} onChange={(event) => setSettings((current) => ({ ...current, rcloneBinaryPath: event.target.value }))} placeholder="/opt/homebrew/bin/rclone" /></Field>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Transfers"><Input type="number" value={settings.transfers} onChange={(event) => setSettings((current) => ({ ...current, transfers: Number(event.target.value) }))} /></Field>
                      <Field label="Checkers"><Input type="number" value={settings.checkers} onChange={(event) => setSettings((current) => ({ ...current, checkers: Number(event.target.value) }))} /></Field>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <input type="checkbox" checked={settings.preferBundledBinary} onChange={(event) => setSettings((current) => ({ ...current, preferBundledBinary: event.target.checked }))} /> Prefer bundled binary when present
                    </label>
                    <Button size="lg" onClick={() => void saveSettings()}>
                      <Settings2 className="mr-2 size-4" /> Save settings
                    </Button>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Resolved paths</CardTitle>
                    <CardDescription>Application-owned locations used by Fero and the pinned binary layout.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
                    <PathLine label="App config" value={overview.paths.appConfigDir} />
                    <PathLine label="App cache" value={overview.paths.appCacheDir} />
                    <PathLine label="rclone config" value={overview.paths.rcloneConfig} />
                    <PathLine label="Bundle root" value={overview.paths.bundleRoot} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

function MetricTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[var(--muted-foreground)]">{icon}{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/15 p-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted-foreground)]">{label}</div>
      <div className="mt-4 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-[var(--muted-foreground)]">{note}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-medium text-white">{label}</div>
        {hint ? <div className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{hint}</div> : null}
      </div>
      {children}
    </label>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-white/8 bg-black/12 px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">{label}</div>;
}

function statusVariant(status: string): "default" | "success" | "warning" | "danger" {
  const normalized = status.toLowerCase();
  if (["running", "starting"].includes(normalized)) return "default";
  if (["completed", "active"].includes(normalized)) return "success";
  if (["cancelled", "stopped"].includes(normalized)) return "warning";
  if (["failed", "error"].includes(normalized)) return "danger";
  return "default";
}

function TransferRow({ job, onCancel, compact = false }: { job: TransferJob; onCancel: (id: string) => void; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/12 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="font-medium text-white">{job.operation}</div>
            <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
          </div>
          <div className="mono mt-2 text-xs text-[var(--muted-foreground)]">{job.source} {job.target ? `→ ${job.target}` : ""}</div>
        </div>
        {(job.status === "running" || job.status === "starting") && <Button variant="ghost" size="sm" onClick={() => void onCancel(job.id)}>Cancel</Button>}
      </div>
      {!compact && (
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/30 p-3 text-xs text-[var(--muted-foreground)]">
          {job.logs.length > 0 ? job.logs.slice(-5).map((line, index) => <div key={`${job.id}-${index}`} className="truncate">{line}</div>) : <div>No logs yet</div>}
        </div>
      )}
    </div>
  );
}

function MountRow({ mount, onStop, compact = false }: { mount: MountSession; onStop: (id: string) => void; compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/12 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <div className="font-medium text-white">{mount.remote}</div>
            <Badge variant={statusVariant(mount.status)}>{mount.status}</Badge>
          </div>
          <div className="mono mt-2 text-xs text-[var(--muted-foreground)]">{mount.mountPoint}</div>
        </div>
        {(mount.status === "running" || mount.status === "starting") && <Button variant="ghost" size="sm" onClick={() => void onStop(mount.id)}>Stop</Button>}
      </div>
      {!compact && (
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/30 p-3 text-xs text-[var(--muted-foreground)]">
          {mount.logs.length > 0 ? mount.logs.slice(-5).map((line, index) => <div key={`${mount.id}-${index}`} className="truncate">{line}</div>) : <div>No logs yet</div>}
        </div>
      )}
    </div>
  );
}

function PathLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono text-[11px] uppercase tracking-[0.28em]">{label}</div>
      <div className="mt-1 break-all text-white">{value}</div>
    </div>
  );
}
