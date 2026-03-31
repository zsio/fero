package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
)

type RcloneBackend struct {
	mu       sync.RWMutex
	paths    AppPaths
	settings Settings
}

type providerPayload struct {
	Name        string   `json:"Name"`
	Description string   `json:"Description"`
	Prefix      string   `json:"Prefix"`
	Aliases     []string `json:"Aliases"`
	Hide        bool     `json:"Hide"`
	Options     []struct {
		Name       string `json:"Name"`
		Help       string `json:"Help"`
		DefaultStr string `json:"DefaultStr"`
		Required   bool   `json:"Required"`
		IsPassword bool   `json:"IsPassword"`
		Advanced   bool   `json:"Advanced"`
		Sensitive  bool   `json:"Sensitive"`
		Exclusive  bool   `json:"Exclusive"`
		Type       string `json:"Type"`
		Examples   []struct {
			Value string `json:"Value"`
			Help  string `json:"Help"`
		} `json:"Examples"`
	} `json:"Options"`
}

type rcloneJSONLog struct {
	Time  string `json:"time"`
	Level string `json:"level"`
	Msg   string `json:"msg"`
	Stats *struct {
		Bytes          int64   `json:"bytes"`
		TotalBytes     int64   `json:"totalBytes"`
		Transfers      int64   `json:"transfers"`
		TotalTransfers int64   `json:"totalTransfers"`
		Checks         int64   `json:"checks"`
		TotalChecks    int64   `json:"totalChecks"`
		Errors         int64   `json:"errors"`
		Speed          float64 `json:"speed"`
		Eta            any     `json:"eta"`
	} `json:"stats"`
}

func NewRcloneBackend(appName string) (*RcloneBackend, error) {
	paths, err := resolveAppPaths(appName)
	if err != nil {
		return nil, err
	}
	settings, err := loadSettings(paths.SettingsPath)
	if err != nil {
		return nil, err
	}
	if err := saveSettings(paths.SettingsPath, settings); err != nil {
		return nil, err
	}
	return &RcloneBackend{paths: paths, settings: settings}, nil
}

func (b *RcloneBackend) Paths() AppPaths {
	return b.paths
}

func (b *RcloneBackend) Settings() Settings {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.settings
}

func (b *RcloneBackend) SaveSettings(input Settings) (Settings, error) {
	normalized := input.normalized()
	if err := saveSettings(b.paths.SettingsPath, normalized); err != nil {
		return Settings{}, err
	}
	b.mu.Lock()
	b.settings = normalized
	b.mu.Unlock()
	return normalized, nil
}

func (b *RcloneBackend) Environment() EnvironmentSnapshot {
	binary := b.ResolveBinary()
	return EnvironmentSnapshot{
		OS:          runtime.GOOS,
		Arch:        runtime.GOARCH,
		Paths:       b.paths,
		Rclone:      binary,
		MountAdvice: mountAdvice(),
	}
}

func (b *RcloneBackend) ResolveBinary() BinaryStatus {
	settings := b.Settings()
	candidates := b.binaryCandidates(settings)
	warnings := make([]string, 0)
	for _, candidate := range candidates {
		if candidate.Path == "" {
			continue
		}
		if info, err := os.Stat(candidate.Path); err == nil && !info.IsDir() {
			version, vErr := detectRcloneVersion(candidate.Path)
			if vErr != nil {
				warnings = append(warnings, vErr.Error())
			}
			pinned := settings.RcloneVersionPin == "" || strings.Contains(version, settings.RcloneVersionPin)
			if settings.RcloneVersionPin != "" && version != "" && !pinned {
				warnings = append(warnings, fmt.Sprintf("resolved version %s does not match pinned version %s", version, settings.RcloneVersionPin))
			}
			return BinaryStatus{
				Available:       true,
				Path:            candidate.Path,
				Source:          candidate.Source,
				Version:         version,
				VersionPinned:   pinned,
				ExpectedVersion: settings.RcloneVersionPin,
				Warnings:        warnings,
			}
		}
	}
	warnings = append(warnings, "bundled rclone binary not found; package the pinned upstream binary under resources/rclone/<os>-<arch>/ or configure a development override path")
	return BinaryStatus{ExpectedVersion: settings.RcloneVersionPin, Warnings: warnings}
}

type binaryCandidate struct {
	Path   string
	Source string
}

func (b *RcloneBackend) binaryCandidates(settings Settings) []binaryCandidate {
	exeName := "rclone"
	if runtime.GOOS == "windows" {
		exeName = "rclone.exe"
	}
	platformDir := fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH)
	execPath, _ := os.Executable()
	execDir := filepath.Dir(execPath)
	cwd, _ := os.Getwd()
	candidates := []binaryCandidate{}
	if settings.PreferredBinaryPath != "" {
		candidates = append(candidates, binaryCandidate{Path: settings.PreferredBinaryPath, Source: "custom"})
	}
	if settings.UseBundledBinary {
		candidates = append(candidates,
			binaryCandidate{Path: filepath.Join(cwd, "resources", "rclone", platformDir, exeName), Source: "bundled"},
			binaryCandidate{Path: filepath.Join(execDir, "resources", "rclone", platformDir, exeName), Source: "bundled"},
			binaryCandidate{Path: filepath.Join(execDir, "..", "Resources", "rclone", platformDir, exeName), Source: "bundled"},
		)
	}
	return candidates
}

func detectRcloneVersion(binaryPath string) (string, error) {
	cmd := exec.Command(binaryPath, "version")
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to query rclone version: %w", err)
	}
	scanner := bufio.NewScanner(bytes.NewReader(out))
	if scanner.Scan() {
		return strings.TrimSpace(scanner.Text()), nil
	}
	return "", nil
}

func (b *RcloneBackend) runCommand(stdin []byte, args ...string) ([]byte, []byte, error) {
	status := b.ResolveBinary()
	if !status.Available {
		return nil, nil, errors.New(strings.Join(status.Warnings, "; "))
	}
	commandArgs := append([]string{}, args...)
	if !slicesContain(commandArgs, "--config") {
		commandArgs = append(commandArgs, "--config", b.paths.RcloneConfigPath)
	}
	cmd := exec.Command(status.Path, commandArgs...)
	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.Bytes(), stderr.Bytes(), err
}

func (b *RcloneBackend) baseCommand(args ...string) (*exec.Cmd, error) {
	status := b.ResolveBinary()
	if !status.Available {
		return nil, errors.New(strings.Join(status.Warnings, "; "))
	}
	cmdArgs := append([]string{}, args...)
	if !slicesContain(cmdArgs, "--config") {
		cmdArgs = append(cmdArgs, "--config", b.paths.RcloneConfigPath)
	}
	return exec.Command(status.Path, cmdArgs...), nil
}

func slicesContain(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (b *RcloneBackend) ListProviders() ([]ProviderDefinition, error) {
	stdout, stderr, err := b.runCommand(nil, "config", "providers")
	if err != nil {
		return nil, fmt.Errorf("list providers: %w (%s)", err, strings.TrimSpace(string(stderr)))
	}
	var raw []providerPayload
	if err := json.Unmarshal(stdout, &raw); err != nil {
		return nil, err
	}
	providers := make([]ProviderDefinition, 0, len(raw))
	for _, item := range raw {
		if item.Hide {
			continue
		}
		provider := ProviderDefinition{
			Name:        item.Name,
			Description: item.Description,
			Prefix:      item.Prefix,
			Aliases:     item.Aliases,
			Hidden:      item.Hide,
			Options:     make([]ProviderOption, 0, len(item.Options)),
		}
		for _, option := range item.Options {
			examples := make([]ProviderExample, 0, len(option.Examples))
			for _, example := range option.Examples {
				examples = append(examples, ProviderExample{Value: example.Value, Help: example.Help})
			}
			provider.Options = append(provider.Options, ProviderOption{
				Name:       option.Name,
				Help:       option.Help,
				DefaultStr: option.DefaultStr,
				Required:   option.Required,
				IsPassword: option.IsPassword,
				Advanced:   option.Advanced,
				Sensitive:  option.Sensitive,
				Exclusive:  option.Exclusive,
				Type:       option.Type,
				Examples:   examples,
			})
		}
		providers = append(providers, provider)
	}
	sort.Slice(providers, func(i, j int) bool { return providers[i].Name < providers[j].Name })
	return providers, nil
}

func (b *RcloneBackend) ListRemotes() ([]RemoteSummary, error) {
	stdout, stderr, err := b.runCommand(nil, "config", "dump")
	if err != nil {
		return nil, fmt.Errorf("config dump: %w (%s)", err, strings.TrimSpace(string(stderr)))
	}
	if len(bytes.TrimSpace(stdout)) == 0 {
		return []RemoteSummary{}, nil
	}
	payload := map[string]map[string]any{}
	if err := json.Unmarshal(stdout, &payload); err != nil {
		return nil, err
	}
	remotes := make([]RemoteSummary, 0, len(payload))
	for name, values := range payload {
		fields := make(map[string]string, len(values))
		remoteType := ""
		for key, value := range values {
			rendered := fmt.Sprint(value)
			fields[key] = rendered
			if key == "type" {
				remoteType = rendered
			}
		}
		remotes = append(remotes, RemoteSummary{Name: name, Type: remoteType, Fields: fields})
	}
	sort.Slice(remotes, func(i, j int) bool { return remotes[i].Name < remotes[j].Name })
	return remotes, nil
}

func (b *RcloneBackend) CreateRemote(req RemoteMutationRequest) (RemoteSummary, error) {
	if err := validateRequired("name", req.Name); err != nil {
		return RemoteSummary{}, err
	}
	if err := validateRequired("type", req.Type); err != nil {
		return RemoteSummary{}, err
	}
	args := []string{"config", "create", req.Name, req.Type}
	keys := make([]string, 0, len(req.Values))
	for key, value := range req.Values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		args = append(args, fmt.Sprintf("%s=%s", key, req.Values[key]))
	}
	_, stderr, err := b.runCommand(nil, args...)
	if err != nil {
		return RemoteSummary{}, fmt.Errorf("create remote: %w (%s)", err, strings.TrimSpace(string(stderr)))
	}
	remotes, err := b.ListRemotes()
	if err != nil {
		return RemoteSummary{}, err
	}
	for _, remote := range remotes {
		if remote.Name == req.Name {
			return remote, nil
		}
	}
	return RemoteSummary{Name: req.Name, Type: req.Type, Fields: map[string]string{}}, nil
}

func (b *RcloneBackend) UpdateRemote(req RemoteMutationRequest) (RemoteSummary, error) {
	if err := validateRequired("name", req.Name); err != nil {
		return RemoteSummary{}, err
	}
	args := []string{"config", "update", req.Name}
	keys := make([]string, 0, len(req.Values))
	for key, value := range req.Values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		args = append(args, fmt.Sprintf("%s=%s", key, req.Values[key]))
	}
	_, stderr, err := b.runCommand(nil, args...)
	if err != nil {
		return RemoteSummary{}, fmt.Errorf("update remote: %w (%s)", err, strings.TrimSpace(string(stderr)))
	}
	remotes, err := b.ListRemotes()
	if err != nil {
		return RemoteSummary{}, err
	}
	for _, remote := range remotes {
		if remote.Name == req.Name {
			return remote, nil
		}
	}
	return RemoteSummary{Name: req.Name}, nil
}

func (b *RcloneBackend) DeleteRemote(name string) error {
	if err := validateRequired("name", name); err != nil {
		return err
	}
	_, stderr, err := b.runCommand(nil, "config", "delete", name)
	if err != nil {
		return fmt.Errorf("delete remote: %w (%s)", err, strings.TrimSpace(string(stderr)))
	}
	return nil
}

func (b *RcloneBackend) ListEntries(target string) ([]RemoteEntry, error) {
	if err := validateRequired("target", target); err != nil {
		return nil, err
	}
	stdout, stderr, err := b.runCommand(nil, "lsjson", target, "--max-depth", "1")
	if err != nil {
		return nil, fmt.Errorf("lsjson: %w (%s)", err, strings.TrimSpace(string(stderr)))
	}
	var raw []struct {
		Name      string `json:"Name"`
		IsDir     bool   `json:"IsDir"`
		Path      string `json:"Path"`
		Size      int64  `json:"Size"`
		MimeType  string `json:"MimeType"`
		ModTime   string `json:"ModTime"`
		Encrypted string `json:"Encrypted"`
	}
	if err := json.Unmarshal(stdout, &raw); err != nil {
		return nil, err
	}
	entries := make([]RemoteEntry, 0, len(raw))
	for _, item := range raw {
		entries = append(entries, RemoteEntry{
			Name:      item.Name,
			IsDir:     item.IsDir,
			Path:      item.Path,
			Size:      item.Size,
			MimeType:  item.MimeType,
			ModTime:   item.ModTime,
			Encrypted: item.Encrypted,
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir != entries[j].IsDir {
			return entries[i].IsDir
		}
		return entries[i].Name < entries[j].Name
	})
	return entries, nil
}

func copyLogs(dst []LogEntry) []LogEntry {
	out := make([]LogEntry, len(dst))
	copy(out, dst)
	return out
}

func appendLog(logs []LogEntry, entry LogEntry) []LogEntry {
	logs = append(logs, entry)
	if len(logs) > 120 {
		return append([]LogEntry{}, logs[len(logs)-120:]...)
	}
	return logs
}

func drainJSONLogs(reader io.Reader, onLog func(LogEntry, *TransferStats)) {
	scanner := bufio.NewScanner(reader)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
		entry := LogEntry{Message: string(line)}
		var payload rcloneJSONLog
		if err := json.Unmarshal(line, &payload); err == nil {
			entry.Time = payload.Time
			entry.Level = payload.Level
			entry.Message = payload.Msg
			var stats *TransferStats
			if payload.Stats != nil {
				computed := &TransferStats{
					Bytes:          payload.Stats.Bytes,
					TotalBytes:     payload.Stats.TotalBytes,
					Transfers:      payload.Stats.Transfers,
					TotalTransfers: payload.Stats.TotalTransfers,
					Checks:         payload.Stats.Checks,
					TotalChecks:    payload.Stats.TotalChecks,
					Errors:         payload.Stats.Errors,
					Speed:          payload.Stats.Speed,
				}
				switch eta := payload.Stats.Eta.(type) {
				case float64:
					computed.EtaSeconds = eta
				}
				stats = computed
			}
			onLog(entry, stats)
			continue
		}
		onLog(entry, nil)
	}
}

func mountAdvice() []string {
	advice := []string{}
	switch runtime.GOOS {
	case "darwin":
		advice = append(advice, "macOS mounts require macFUSE.")
	case "windows":
		advice = append(advice, "Windows drive-letter mounts require WinFsp.")
	case "linux":
		advice = append(advice, "Linux mounts require FUSE support and user permissions.")
	}
	return advice
}
