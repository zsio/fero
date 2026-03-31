package main

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

type mountRuntime struct {
	session *MountSession
	cancel  context.CancelFunc
	cmd     *exec.Cmd
}

type MountManager struct {
	backend *RcloneBackend
	mu      sync.RWMutex
	mounts  map[string]*mountRuntime
}

func NewMountManager(backend *RcloneBackend) *MountManager {
	return &MountManager{backend: backend, mounts: map[string]*mountRuntime{}}
}

func (m *MountManager) Start(req MountRequest) (MountSession, error) {
	if err := validateRequired("remote", req.Remote); err != nil {
		return MountSession{}, err
	}
	mountPoint := strings.TrimSpace(req.MountPoint)
	if runtime.GOOS == "windows" && strings.TrimSpace(req.DriveLetter) != "" {
		mountPoint = strings.TrimSpace(req.DriveLetter)
		if !strings.HasSuffix(mountPoint, ":") {
			mountPoint += ":"
		}
	}
	if err := validateRequired("mountPoint", mountPoint); err != nil {
		return MountSession{}, err
	}

	args := []string{"mount", req.Remote, mountPoint, "--use-json-log", "-vv"}
	if req.ReadOnly {
		args = append(args, "--read-only")
	}
	if req.AllowOther {
		args = append(args, "--allow-other")
	}
	if req.VolumeName != "" {
		args = append(args, "--volname", req.VolumeName)
	}
	args = append(args, req.ExtraArgs...)

	cmd, err := m.backend.baseCommand(args...)
	if err != nil {
		return MountSession{}, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd = exec.CommandContext(ctx, cmd.Path, cmd.Args[1:]...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return MountSession{}, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return MountSession{}, err
	}

	session := &MountSession{
		ID:         fmt.Sprintf("mount-%d", time.Now().UnixNano()),
		Remote:     req.Remote,
		MountPoint: mountPoint,
		Status:     "starting",
		StartedAt:  time.Now().UTC().Format(time.RFC3339),
		Logs:       []LogEntry{},
	}
	runtimeState := &mountRuntime{session: session, cancel: cancel, cmd: cmd}

	m.mu.Lock()
	m.mounts[session.ID] = runtimeState
	m.mu.Unlock()

	if err := cmd.Start(); err != nil {
		cancel()
		m.mu.Lock()
		delete(m.mounts, session.ID)
		m.mu.Unlock()
		return MountSession{}, err
	}
	m.update(session.ID, func(session *MountSession) { session.Status = "running" })
	go m.track(session.ID, ctx, stdout, stderr, cmd)
	return m.snapshot(session.ID), nil
}

func (m *MountManager) track(id string, ctx context.Context, stdout, stderr io.ReadCloser, cmd *exec.Cmd) {
	var wg sync.WaitGroup
	consume := func(reader io.ReadCloser) {
		defer wg.Done()
		drainJSONLogs(reader, func(entry LogEntry, _ *TransferStats) {
			m.update(id, func(session *MountSession) {
				session.Logs = appendLog(session.Logs, entry)
			})
		})
	}
	wg.Add(2)
	go consume(stdout)
	go consume(stderr)
	err := cmd.Wait()
	wg.Wait()
	m.update(id, func(session *MountSession) {
		session.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		switch {
		case ctx.Err() == context.Canceled:
			session.Status = "stopped"
		case err != nil:
			session.Status = "failed"
			session.Error = err.Error()
		default:
			session.Status = "completed"
		}
	})
}

func (m *MountManager) update(id string, apply func(*MountSession)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if runtimeState, ok := m.mounts[id]; ok {
		apply(runtimeState.session)
	}
}

func (m *MountManager) snapshot(id string) MountSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if runtimeState, ok := m.mounts[id]; ok {
		copySession := *runtimeState.session
		copySession.Logs = copyLogs(runtimeState.session.Logs)
		return copySession
	}
	return MountSession{}
}

func (m *MountManager) List() []MountSession {
	m.mu.RLock()
	defer m.mu.RUnlock()
	sessions := make([]MountSession, 0, len(m.mounts))
	for _, runtimeState := range m.mounts {
		copySession := *runtimeState.session
		copySession.Logs = copyLogs(runtimeState.session.Logs)
		sessions = append(sessions, copySession)
	}
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].StartedAt > sessions[j].StartedAt })
	return sessions
}

func (m *MountManager) Stop(id string) error {
	m.mu.RLock()
	runtimeState, ok := m.mounts[id]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("mount %s not found", id)
	}
	runtimeState.cancel()
	return nil
}

func (m *MountManager) ActiveCount() int {
	count := 0
	for _, mount := range m.List() {
		if mount.Status == "running" || mount.Status == "starting" {
			count++
		}
	}
	return count
}

func (m *MountManager) Shutdown() {
	m.mu.RLock()
	runtimes := make([]*mountRuntime, 0, len(m.mounts))
	for _, runtimeState := range m.mounts {
		runtimes = append(runtimes, runtimeState)
	}
	m.mu.RUnlock()
	for _, runtimeState := range runtimes {
		runtimeState.cancel()
	}
}
