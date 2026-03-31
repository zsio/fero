package main

import "fmt"

type AppMeta struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
}

type AppPaths struct {
	AppDir            string `json:"appDir"`
	CacheDir          string `json:"cacheDir"`
	LogDir            string `json:"logDir"`
	SettingsPath      string `json:"settingsPath"`
	RcloneConfigPath  string `json:"rcloneConfigPath"`
	BundledBinaryRoot string `json:"bundledBinaryRoot"`
}

type Settings struct {
	PreferredBinaryPath string `json:"preferredBinaryPath"`
	UseBundledBinary    bool   `json:"useBundledBinary"`
	RcloneVersionPin    string `json:"rcloneVersionPin"`
	DefaultTransfers    int    `json:"defaultTransfers"`
	DefaultCheckers     int    `json:"defaultCheckers"`
	LogLevel            string `json:"logLevel"`
}

type BinaryStatus struct {
	Available       bool     `json:"available"`
	Path            string   `json:"path"`
	Source          string   `json:"source"`
	Version         string   `json:"version"`
	VersionPinned   bool     `json:"versionPinned"`
	ExpectedVersion string   `json:"expectedVersion"`
	Warnings        []string `json:"warnings"`
}

type EnvironmentSnapshot struct {
	OS          string       `json:"os"`
	Arch        string       `json:"arch"`
	Paths       AppPaths     `json:"paths"`
	Rclone      BinaryStatus `json:"rclone"`
	MountAdvice []string     `json:"mountAdvice"`
}

type ProviderExample struct {
	Value string `json:"value"`
	Help  string `json:"help"`
}

type ProviderOption struct {
	Name       string            `json:"name"`
	Help       string            `json:"help"`
	DefaultStr string            `json:"defaultStr"`
	Required   bool              `json:"required"`
	IsPassword bool              `json:"isPassword"`
	Advanced   bool              `json:"advanced"`
	Sensitive  bool              `json:"sensitive"`
	Exclusive  bool              `json:"exclusive"`
	Type       string            `json:"type"`
	Examples   []ProviderExample `json:"examples"`
}

type ProviderDefinition struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Prefix      string           `json:"prefix"`
	Options     []ProviderOption `json:"options"`
	Aliases     []string         `json:"aliases"`
	Hidden      bool             `json:"hidden"`
}

type RemoteSummary struct {
	Name   string            `json:"name"`
	Type   string            `json:"type"`
	Fields map[string]string `json:"fields"`
}

type RemoteMutationRequest struct {
	Name   string            `json:"name"`
	Type   string            `json:"type"`
	Values map[string]string `json:"values"`
}

type RemoteEntry struct {
	Name      string `json:"name"`
	IsDir     bool   `json:"isDir"`
	Path      string `json:"path"`
	Size      int64  `json:"size"`
	MimeType  string `json:"mimeType"`
	ModTime   string `json:"modTime"`
	Encrypted string `json:"encrypted"`
}

type TransferRequest struct {
	Name        string   `json:"name"`
	Operation   string   `json:"operation"`
	Source      string   `json:"source"`
	Destination string   `json:"destination"`
	Transfers   int      `json:"transfers"`
	Checkers    int      `json:"checkers"`
	DryRun      bool     `json:"dryRun"`
	ExtraArgs   []string `json:"extraArgs"`
}

type TransferStats struct {
	Bytes          int64   `json:"bytes"`
	TotalBytes     int64   `json:"totalBytes"`
	Transfers      int64   `json:"transfers"`
	TotalTransfers int64   `json:"totalTransfers"`
	Checks         int64   `json:"checks"`
	TotalChecks    int64   `json:"totalChecks"`
	Errors         int64   `json:"errors"`
	Speed          float64 `json:"speed"`
	EtaSeconds     float64 `json:"etaSeconds"`
}

type LogEntry struct {
	Time    string `json:"time"`
	Level   string `json:"level"`
	Message string `json:"message"`
}

type TransferJob struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Operation   string        `json:"operation"`
	Source      string        `json:"source"`
	Destination string        `json:"destination"`
	Status      string        `json:"status"`
	StartedAt   string        `json:"startedAt"`
	FinishedAt  string        `json:"finishedAt"`
	Error       string        `json:"error"`
	ExitCode    int           `json:"exitCode"`
	Stats       TransferStats `json:"stats"`
	Logs        []LogEntry    `json:"logs"`
}

type MountRequest struct {
	Remote      string   `json:"remote"`
	MountPoint  string   `json:"mountPoint"`
	VolumeName  string   `json:"volumeName"`
	DriveLetter string   `json:"driveLetter"`
	ReadOnly    bool     `json:"readOnly"`
	AllowOther  bool     `json:"allowOther"`
	ExtraArgs   []string `json:"extraArgs"`
}

type MountSession struct {
	ID         string     `json:"id"`
	Remote     string     `json:"remote"`
	MountPoint string     `json:"mountPoint"`
	Status     string     `json:"status"`
	StartedAt  string     `json:"startedAt"`
	FinishedAt string     `json:"finishedAt"`
	Error      string     `json:"error"`
	Logs       []LogEntry `json:"logs"`
}

type DashboardSnapshot struct {
	RemoteCount     int            `json:"remoteCount"`
	ProviderCount   int            `json:"providerCount"`
	ActiveTransfers int            `json:"activeTransfers"`
	ActiveMounts    int            `json:"activeMounts"`
	RecentTransfers []TransferJob  `json:"recentTransfers"`
	ActiveMountList []MountSession `json:"activeMountList"`
}

type BootstrapPayload struct {
	App         AppMeta              `json:"app"`
	Environment EnvironmentSnapshot  `json:"environment"`
	Settings    Settings             `json:"settings"`
	Dashboard   DashboardSnapshot    `json:"dashboard"`
	Providers   []ProviderDefinition `json:"providers"`
	Remotes     []RemoteSummary      `json:"remotes"`
}

func defaultSettings() Settings {
	return Settings{
		UseBundledBinary: true,
		RcloneVersionPin: "v1.73.3",
		DefaultTransfers: 4,
		DefaultCheckers:  8,
		LogLevel:         "INFO",
	}
}

func (s Settings) normalized() Settings {
	s.UseBundledBinary = true
	if s.RcloneVersionPin == "" {
		s.RcloneVersionPin = "v1.73.3"
	}
	if s.DefaultTransfers <= 0 {
		s.DefaultTransfers = 4
	}
	if s.DefaultCheckers <= 0 {
		s.DefaultCheckers = 8
	}
	if s.LogLevel == "" {
		s.LogLevel = "INFO"
	}
	return s
}

func validateRequired(name, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", name)
	}
	return nil
}
