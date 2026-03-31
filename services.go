package main

import (
	"strings"
	"time"
)

type UISettings struct {
	RcloneBinaryPath    string   `json:"rcloneBinaryPath"`
	PreferBundledBinary bool     `json:"preferBundledBinary"`
	Transfers           int      `json:"transfers"`
	Checkers            int      `json:"checkers"`
	MultiThreadStreams  int      `json:"multiThreadStreams"`
	UseJSONLog          bool     `json:"useJSONLog"`
	MountVFSCacheMode   string   `json:"mountVfsCacheMode"`
	MountExtraArgs      []string `json:"mountExtraArgs"`
	TransferExtraArgs   []string `json:"transferExtraArgs"`
	Theme               string   `json:"theme"`
}

type UIBinaryStatus struct {
	Available bool   `json:"available"`
	Path      string `json:"path"`
	Version   string `json:"version"`
	Source    string `json:"source"`
	Error     string `json:"error,omitempty"`
}

type UIOverview struct {
	Platform string         `json:"platform"`
	Arch     string         `json:"arch"`
	Rclone   UIBinaryStatus `json:"rclone"`
	Settings UISettings     `json:"settings"`
	Paths    struct {
		AppConfigDir string `json:"appConfigDir"`
		AppCacheDir  string `json:"appCacheDir"`
		RcloneConfig string `json:"rcloneConfig"`
		BundleRoot   string `json:"bundleRoot"`
	} `json:"paths"`
	Counts struct {
		Providers  int `json:"providers"`
		Remotes    int `json:"remotes"`
		Transfers  int `json:"transfers"`
		Mounts     int `json:"mounts"`
		RunningOps int `json:"runningOps"`
	} `json:"counts"`
	Prerequisites []string `json:"prerequisites"`
	RefreshedAt   string   `json:"refreshedAt"`
}

type UIProviderCatalog struct {
	Providers []ProviderDefinition `json:"providers"`
}

type UIRemote struct {
	Name        string            `json:"name"`
	Type        string            `json:"type"`
	Description string            `json:"description,omitempty"`
	Config      map[string]string `json:"config"`
}

type UIRemoteMutation struct {
	Name       string            `json:"name"`
	Type       string            `json:"type,omitempty"`
	Parameters map[string]string `json:"parameters"`
}

type UITransferRequest struct {
	Operation string   `json:"operation"`
	Source    string   `json:"source"`
	Target    string   `json:"target"`
	ExtraArgs []string `json:"extraArgs"`
	DryRun    bool     `json:"dryRun"`
}

type UITransferJob struct {
	ID          string   `json:"id"`
	Operation   string   `json:"operation"`
	Source      string   `json:"source"`
	Target      string   `json:"target"`
	Status      string   `json:"status"`
	Command     []string `json:"command"`
	StartedAt   string   `json:"startedAt"`
	UpdatedAt   string   `json:"updatedAt"`
	FinishedAt  string   `json:"finishedAt,omitempty"`
	ExitCode    int      `json:"exitCode,omitempty"`
	LastMessage string   `json:"lastMessage,omitempty"`
	Logs        []string `json:"logs"`
}

type UIMountRequest struct {
	Remote     string   `json:"remote"`
	MountPoint string   `json:"mountPoint"`
	ExtraArgs  []string `json:"extraArgs"`
}

type UIMountSession struct {
	ID         string   `json:"id"`
	Remote     string   `json:"remote"`
	MountPoint string   `json:"mountPoint"`
	Status     string   `json:"status"`
	Command    []string `json:"command"`
	StartedAt  string   `json:"startedAt"`
	UpdatedAt  string   `json:"updatedAt"`
	FinishedAt string   `json:"finishedAt,omitempty"`
	PID        int      `json:"pid,omitempty"`
	Logs       []string `json:"logs"`
	Error      string   `json:"error,omitempty"`
}

type SystemService struct{ desktop *DesktopService }
type RemoteService struct{ desktop *DesktopService }
type TransferService struct{ desktop *DesktopService }
type MountService struct{ desktop *DesktopService }

func (s *SystemService) Overview() (UIOverview, error) {
	bootstrap, err := s.desktop.GetBootstrap()
	if err != nil {
		return UIOverview{}, err
	}
	result := UIOverview{
		Platform: bootstrap.Environment.OS,
		Arch:     bootstrap.Environment.Arch,
		Rclone: UIBinaryStatus{
			Available: bootstrap.Environment.Rclone.Available,
			Path:      bootstrap.Environment.Rclone.Path,
			Version:   bootstrap.Environment.Rclone.Version,
			Source:    bootstrap.Environment.Rclone.Source,
			Error:     strings.Join(bootstrap.Environment.Rclone.Warnings, "; "),
		},
		Settings:      toUISettings(bootstrap.Settings),
		Prerequisites: append([]string{}, bootstrap.Environment.MountAdvice...),
		RefreshedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	result.Paths.AppConfigDir = bootstrap.Environment.Paths.AppDir
	result.Paths.AppCacheDir = bootstrap.Environment.Paths.CacheDir
	result.Paths.RcloneConfig = bootstrap.Environment.Paths.RcloneConfigPath
	result.Paths.BundleRoot = bootstrap.Environment.Paths.BundledBinaryRoot
	result.Counts.Providers = bootstrap.Dashboard.ProviderCount
	result.Counts.Remotes = bootstrap.Dashboard.RemoteCount
	result.Counts.Transfers = len(s.desktop.transfers.List())
	result.Counts.Mounts = len(s.desktop.mounts.List())
	result.Counts.RunningOps = bootstrap.Dashboard.ActiveTransfers + bootstrap.Dashboard.ActiveMounts
	return result, nil
}

func (s *SystemService) GetSettings() (UISettings, error) {
	return toUISettings(s.desktop.backend.Settings()), nil
}

func (s *SystemService) SaveSettings(input UISettings) (UISettings, error) {
	saved, err := s.desktop.SaveSettings(fromUISettings(input, s.desktop.backend.Settings()))
	if err != nil {
		return UISettings{}, err
	}
	return toUISettings(saved), nil
}

func (s *RemoteService) ListProviders() (UIProviderCatalog, error) {
	providers, err := s.desktop.GetProviders()
	if err != nil {
		return UIProviderCatalog{}, err
	}
	return UIProviderCatalog{Providers: providers}, nil
}

func (s *RemoteService) ListRemotes() ([]UIRemote, error) {
	remotes, err := s.desktop.GetRemotes()
	if err != nil {
		return nil, err
	}
	result := make([]UIRemote, 0, len(remotes))
	for _, remote := range remotes {
		result = append(result, UIRemote{
			Name:        remote.Name,
			Type:        remote.Type,
			Description: summarizeRemote(remote.Fields),
			Config:      remote.Fields,
		})
	}
	return result, nil
}

func (s *RemoteService) CreateRemote(input UIRemoteMutation) (UIRemote, error) {
	remote, err := s.desktop.CreateRemote(RemoteMutationRequest{Name: input.Name, Type: input.Type, Values: input.Parameters})
	if err != nil {
		return UIRemote{}, err
	}
	return UIRemote{Name: remote.Name, Type: remote.Type, Description: summarizeRemote(remote.Fields), Config: remote.Fields}, nil
}

func (s *RemoteService) UpdateRemote(input UIRemoteMutation) (UIRemote, error) {
	remote, err := s.desktop.UpdateRemote(RemoteMutationRequest{Name: input.Name, Type: input.Type, Values: input.Parameters})
	if err != nil {
		return UIRemote{}, err
	}
	return UIRemote{Name: remote.Name, Type: remote.Type, Description: summarizeRemote(remote.Fields), Config: remote.Fields}, nil
}

func (s *RemoteService) DeleteRemote(name string) error { return s.desktop.DeleteRemote(name) }

func (s *TransferService) ListTransfers() []UITransferJob {
	jobs := s.desktop.ListTransfers()
	result := make([]UITransferJob, 0, len(jobs))
	for _, job := range jobs {
		result = append(result, toUITransferJob(job))
	}
	return result
}

func (s *TransferService) StartTransfer(input UITransferRequest) (UITransferJob, error) {
	job, err := s.desktop.StartTransfer(TransferRequest{
		Operation:   input.Operation,
		Source:      input.Source,
		Destination: input.Target,
		DryRun:      input.DryRun,
		ExtraArgs:   input.ExtraArgs,
	})
	if err != nil {
		return UITransferJob{}, err
	}
	return toUITransferJob(job), nil
}

func (s *TransferService) CancelTransfer(id string) error { return s.desktop.CancelTransfer(id) }

func (s *MountService) ListMounts() []UIMountSession {
	sessions := s.desktop.ListMounts()
	result := make([]UIMountSession, 0, len(sessions))
	for _, session := range sessions {
		result = append(result, toUIMountSession(session))
	}
	return result
}

func (s *MountService) StartMount(input UIMountRequest) (UIMountSession, error) {
	session, err := s.desktop.StartMount(MountRequest{Remote: input.Remote, MountPoint: input.MountPoint, ExtraArgs: input.ExtraArgs})
	if err != nil {
		return UIMountSession{}, err
	}
	return toUIMountSession(session), nil
}

func (s *MountService) StopMount(id string) error { return s.desktop.StopMount(id) }

func toUISettings(input Settings) UISettings {
	return UISettings{
		RcloneBinaryPath:    input.PreferredBinaryPath,
		PreferBundledBinary: true,
		Transfers:           input.DefaultTransfers,
		Checkers:            input.DefaultCheckers,
		MultiThreadStreams:  4,
		UseJSONLog:          true,
		MountVFSCacheMode:   "full",
		MountExtraArgs:      []string{},
		TransferExtraArgs:   []string{},
		Theme:               "system",
	}
}

func fromUISettings(input UISettings, current Settings) Settings {
	next := current
	next.PreferredBinaryPath = input.RcloneBinaryPath
	next.UseBundledBinary = true
	next.DefaultTransfers = input.Transfers
	next.DefaultCheckers = input.Checkers
	if next.LogLevel == "" {
		next.LogLevel = "INFO"
	}
	return next
}

func toUITransferJob(job TransferJob) UITransferJob {
	updatedAt := job.StartedAt
	lastMessage := job.Error
	logs := make([]string, 0, len(job.Logs))
	for _, entry := range job.Logs {
		logs = append(logs, entry.Message)
		if entry.Time != "" {
			updatedAt = entry.Time
		}
		if entry.Message != "" {
			lastMessage = entry.Message
		}
	}
	if job.FinishedAt != "" {
		updatedAt = job.FinishedAt
	}
	return UITransferJob{
		ID:          job.ID,
		Operation:   job.Operation,
		Source:      job.Source,
		Target:      job.Destination,
		Status:      job.Status,
		Command:     []string{},
		StartedAt:   job.StartedAt,
		UpdatedAt:   updatedAt,
		FinishedAt:  job.FinishedAt,
		ExitCode:    job.ExitCode,
		LastMessage: lastMessage,
		Logs:        logs,
	}
}

func toUIMountSession(session MountSession) UIMountSession {
	updatedAt := session.StartedAt
	logs := make([]string, 0, len(session.Logs))
	for _, entry := range session.Logs {
		logs = append(logs, entry.Message)
		if entry.Time != "" {
			updatedAt = entry.Time
		}
	}
	if session.FinishedAt != "" {
		updatedAt = session.FinishedAt
	}
	return UIMountSession{
		ID:         session.ID,
		Remote:     session.Remote,
		MountPoint: session.MountPoint,
		Status:     session.Status,
		Command:    []string{},
		StartedAt:  session.StartedAt,
		UpdatedAt:  updatedAt,
		FinishedAt: session.FinishedAt,
		Logs:       logs,
		Error:      session.Error,
	}
}

func summarizeRemote(config map[string]string) string {
	for _, key := range []string{"description", "endpoint", "url", "bucket", "type"} {
		if value := strings.TrimSpace(config[key]); value != "" {
			return value
		}
	}
	pairs := make([]string, 0, len(config))
	for key, value := range config {
		if strings.TrimSpace(value) == "" {
			continue
		}
		pairs = append(pairs, key+"="+value)
	}
	if len(pairs) == 0 {
		return "Configured remote"
	}
	if len(pairs) > 3 {
		pairs = pairs[:3]
	}
	return strings.Join(pairs, " · ")
}
