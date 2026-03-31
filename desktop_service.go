package main

import "sort"

type DesktopService struct {
	backend   *RcloneBackend
	transfers *TransferManager
	mounts    *MountManager
}

func NewDesktopService() (*DesktopService, error) {
	backend, err := NewRcloneBackend("Fero")
	if err != nil {
		return nil, err
	}
	return &DesktopService{
		backend:   backend,
		transfers: NewTransferManager(backend),
		mounts:    NewMountManager(backend),
	}, nil
}

func (s *DesktopService) Shutdown() {
	s.transfers.Shutdown()
	s.mounts.Shutdown()
}

func (s *DesktopService) GetBootstrap() (BootstrapPayload, error) {
	providers, err := s.backend.ListProviders()
	if err != nil {
		providers = []ProviderDefinition{}
	}
	remotes, err := s.backend.ListRemotes()
	if err != nil {
		remotes = []RemoteSummary{}
	}
	jobs := s.transfers.List()
	mounts := s.mounts.List()
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].StartedAt > jobs[j].StartedAt })
	dashboard := DashboardSnapshot{
		RemoteCount:     len(remotes),
		ProviderCount:   len(providers),
		ActiveTransfers: s.transfers.ActiveCount(),
		ActiveMounts:    s.mounts.ActiveCount(),
		RecentTransfers: truncateTransfers(jobs, 6),
		ActiveMountList: truncateMounts(mounts, 6),
	}
	return BootstrapPayload{
		App: AppMeta{
			Name:        "Fero",
			Version:     "0.1.0",
			Description: "Desktop rclone control plane",
		},
		Environment: s.backend.Environment(),
		Settings:    s.backend.Settings(),
		Dashboard:   dashboard,
		Providers:   providers,
		Remotes:     remotes,
	}, nil
}

func truncateTransfers(items []TransferJob, max int) []TransferJob {
	if len(items) <= max {
		return items
	}
	return items[:max]
}

func truncateMounts(items []MountSession, max int) []MountSession {
	if len(items) <= max {
		return items
	}
	return items[:max]
}

func (s *DesktopService) GetProviders() ([]ProviderDefinition, error) {
	return s.backend.ListProviders()
}
func (s *DesktopService) GetRemotes() ([]RemoteSummary, error) { return s.backend.ListRemotes() }
func (s *DesktopService) SaveSettings(input Settings) (Settings, error) {
	return s.backend.SaveSettings(input)
}
func (s *DesktopService) CreateRemote(input RemoteMutationRequest) (RemoteSummary, error) {
	return s.backend.CreateRemote(input)
}
func (s *DesktopService) UpdateRemote(input RemoteMutationRequest) (RemoteSummary, error) {
	return s.backend.UpdateRemote(input)
}
func (s *DesktopService) DeleteRemote(name string) error { return s.backend.DeleteRemote(name) }
func (s *DesktopService) ListEntries(target string) ([]RemoteEntry, error) {
	return s.backend.ListEntries(target)
}
func (s *DesktopService) StartTransfer(input TransferRequest) (TransferJob, error) {
	return s.transfers.Start(input)
}
func (s *DesktopService) ListTransfers() []TransferJob   { return s.transfers.List() }
func (s *DesktopService) CancelTransfer(id string) error { return s.transfers.Cancel(id) }
func (s *DesktopService) StartMount(input MountRequest) (MountSession, error) {
	return s.mounts.Start(input)
}
func (s *DesktopService) ListMounts() []MountSession { return s.mounts.List() }
func (s *DesktopService) StopMount(id string) error  { return s.mounts.Stop(id) }
