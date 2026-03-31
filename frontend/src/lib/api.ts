import { Events } from "@wailsio/runtime";

import { MountService, RemoteService, SystemService, TransferService } from "../../bindings/fero";
import type {
  MountRequest,
  MountSession,
  Overview,
  ProviderCatalog,
  Remote,
  RemoteMutation,
  Settings,
  TransferJob,
  TransferRequest,
} from "./types";

export const api = {
  overview: async () => (await SystemService.Overview()) as unknown as Overview,
  getSettings: async () => (await SystemService.GetSettings()) as unknown as Settings,
  saveSettings: async (settings: Settings) => (await SystemService.SaveSettings(settings)) as unknown as Settings,
  listProviders: async () => (await RemoteService.ListProviders()) as unknown as ProviderCatalog,
  listRemotes: async () => (await RemoteService.ListRemotes()) as unknown as Remote[],
  createRemote: async (payload: RemoteMutation) => (await RemoteService.CreateRemote(payload)) as unknown as Remote,
  updateRemote: async (payload: RemoteMutation) => (await RemoteService.UpdateRemote(payload)) as unknown as Remote,
  deleteRemote: (name: string) => RemoteService.DeleteRemote(name),
  listTransfers: async () => (await TransferService.ListTransfers()) as unknown as TransferJob[],
  startTransfer: async (payload: TransferRequest) => (await TransferService.StartTransfer(payload)) as unknown as TransferJob,
  cancelTransfer: (id: string) => TransferService.CancelTransfer(id),
  listMounts: async () => (await MountService.ListMounts()) as unknown as MountSession[],
  startMount: async (payload: MountRequest) => (await MountService.StartMount(payload)) as unknown as MountSession,
  stopMount: (id: string) => MountService.StopMount(id),
};

export function onTransferUpdated(callback: (job: TransferJob) => void) {
  Events.On("transfer:updated", (event: { data: TransferJob }) => callback(event.data));
}

export function onMountUpdated(callback: (session: MountSession) => void) {
  Events.On("mount:updated", (event: { data: MountSession }) => callback(event.data));
}
