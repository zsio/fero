export interface Settings {
  rcloneBinaryPath: string;
  preferBundledBinary: boolean;
  transfers: number;
  checkers: number;
  multiThreadStreams: number;
  useJSONLog: boolean;
  mountVfsCacheMode: string;
  mountExtraArgs: string[];
  transferExtraArgs: string[];
  theme: string;
}

export interface BinaryStatus {
  available: boolean;
  path: string;
  version: string;
  source: string;
  error?: string;
}

export interface Overview {
  platform: string;
  arch: string;
  rclone: BinaryStatus;
  settings: Settings;
  paths: {
    appConfigDir: string;
    appCacheDir: string;
    rcloneConfig: string;
    bundleRoot: string;
  };
  counts: {
    providers: number;
    remotes: number;
    transfers: number;
    mounts: number;
    runningOps: number;
  };
  prerequisites: string[];
  refreshedAt: string;
}

export interface ProviderExample {
  value: string;
  help: string;
}

export interface ProviderOption {
  name: string;
  help: string;
  type: string;
  required: boolean;
  advanced: boolean;
  sensitive: boolean;
  exclusive: boolean;
  isPassword: boolean;
  defaultStr: string;
  examples: ProviderExample[];
}

export interface Provider {
  name: string;
  prefix: string;
  description: string;
  hidden: boolean;
  aliases: string[];
  options: ProviderOption[];
}

export interface ProviderCatalog {
  providers: Provider[];
}

export interface Remote {
  name: string;
  type: string;
  description?: string;
  config: Record<string, string>;
}

export interface RemoteMutation {
  name: string;
  type?: string;
  parameters: Record<string, string>;
}

export interface TransferRequest {
  operation: string;
  source: string;
  target: string;
  extraArgs: string[];
  dryRun: boolean;
}

export interface TransferJob {
  id: string;
  operation: string;
  source: string;
  target: string;
  status: string;
  command: string[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  exitCode?: number;
  lastMessage?: string;
  logs: string[];
}

export interface MountRequest {
  remote: string;
  mountPoint: string;
  extraArgs: string[];
}

export interface MountSession {
  id: string;
  remote: string;
  mountPoint: string;
  status: string;
  command: string[];
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  pid?: number;
  logs: string[];
  error?: string;
}
