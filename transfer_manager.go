package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sort"
	"strings"
	"sync"
	"time"
)

type transferRuntime struct {
	job    *TransferJob
	cancel context.CancelFunc
	cmd    *exec.Cmd
}

type TransferManager struct {
	backend *RcloneBackend
	mu      sync.RWMutex
	jobs    map[string]*transferRuntime
}

func NewTransferManager(backend *RcloneBackend) *TransferManager {
	return &TransferManager{backend: backend, jobs: map[string]*transferRuntime{}}
}

func (m *TransferManager) Start(req TransferRequest) (TransferJob, error) {
	op := strings.ToLower(strings.TrimSpace(req.Operation))
	if req.Name == "" {
		req.Name = strings.ToUpper(op)
	}
	switch op {
	case "copy", "copyto", "sync", "move":
		if err := validateRequired("source", req.Source); err != nil {
			return TransferJob{}, err
		}
		if err := validateRequired("destination", req.Destination); err != nil {
			return TransferJob{}, err
		}
	case "delete", "purge", "lsjson":
		if err := validateRequired("source", req.Source); err != nil {
			return TransferJob{}, err
		}
	default:
		return TransferJob{}, fmt.Errorf("unsupported operation %q", req.Operation)
	}

	settings := m.backend.Settings()
	transfers := req.Transfers
	if transfers <= 0 {
		transfers = settings.DefaultTransfers
	}
	checkers := req.Checkers
	if checkers <= 0 {
		checkers = settings.DefaultCheckers
	}

	args := []string{op}
	switch op {
	case "copy", "copyto", "sync", "move":
		args = append(args, req.Source, req.Destination)
	default:
		args = append(args, req.Source)
	}
	args = append(args,
		"--use-json-log",
		"--stats=1s",
		"-vv",
		"--transfers", fmt.Sprintf("%d", transfers),
		"--checkers", fmt.Sprintf("%d", checkers),
	)
	if req.DryRun {
		args = append(args, "--dry-run")
	}
	args = append(args, req.ExtraArgs...)

	cmd, err := m.backend.baseCommand(args...)
	if err != nil {
		return TransferJob{}, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return TransferJob{}, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return TransferJob{}, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd = exec.CommandContext(ctx, cmd.Path, cmd.Args[1:]...)
	stdout, err = cmd.StdoutPipe()
	if err != nil {
		cancel()
		return TransferJob{}, err
	}
	stderr, err = cmd.StderrPipe()
	if err != nil {
		cancel()
		return TransferJob{}, err
	}

	job := &TransferJob{
		ID:          fmt.Sprintf("job-%d", time.Now().UnixNano()),
		Name:        req.Name,
		Operation:   op,
		Source:      req.Source,
		Destination: req.Destination,
		Status:      "starting",
		StartedAt:   time.Now().UTC().Format(time.RFC3339),
		Logs:        []LogEntry{},
	}

	runtimeState := &transferRuntime{job: job, cancel: cancel, cmd: cmd}
	m.mu.Lock()
	m.jobs[job.ID] = runtimeState
	m.mu.Unlock()

	if err := cmd.Start(); err != nil {
		cancel()
		m.mu.Lock()
		delete(m.jobs, job.ID)
		m.mu.Unlock()
		return TransferJob{}, err
	}

	m.update(job.ID, func(job *TransferJob) { job.Status = "running" })
	go m.track(job.ID, ctx, stdout, stderr, cmd)
	return m.snapshot(job.ID), nil
}

func (m *TransferManager) track(id string, ctx context.Context, stdout, stderr io.ReadCloser, cmd *exec.Cmd) {
	var wg sync.WaitGroup
	consume := func(reader io.ReadCloser) {
		defer wg.Done()
		drainJSONLogs(reader, func(entry LogEntry, stats *TransferStats) {
			m.update(id, func(job *TransferJob) {
				job.Logs = appendLog(job.Logs, entry)
				if stats != nil {
					job.Stats = *stats
				}
			})
		})
	}
	wg.Add(2)
	go consume(stdout)
	go consume(stderr)
	err := cmd.Wait()
	wg.Wait()
	m.update(id, func(job *TransferJob) {
		job.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		switch {
		case errors.Is(ctx.Err(), context.Canceled):
			job.Status = "cancelled"
		case err != nil:
			job.Status = "failed"
			job.Error = err.Error()
			if exitErr, ok := err.(*exec.ExitError); ok {
				job.ExitCode = exitErr.ExitCode()
			}
		default:
			job.Status = "completed"
		}
	})
}

func (m *TransferManager) update(id string, apply func(*TransferJob)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if runtimeState, ok := m.jobs[id]; ok {
		apply(runtimeState.job)
	}
}

func (m *TransferManager) snapshot(id string) TransferJob {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if runtimeState, ok := m.jobs[id]; ok {
		copyJob := *runtimeState.job
		copyJob.Logs = copyLogs(runtimeState.job.Logs)
		return copyJob
	}
	return TransferJob{}
}

func (m *TransferManager) List() []TransferJob {
	m.mu.RLock()
	defer m.mu.RUnlock()
	jobs := make([]TransferJob, 0, len(m.jobs))
	for _, runtimeState := range m.jobs {
		copyJob := *runtimeState.job
		copyJob.Logs = copyLogs(runtimeState.job.Logs)
		jobs = append(jobs, copyJob)
	}
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].StartedAt > jobs[j].StartedAt })
	return jobs
}

func (m *TransferManager) Cancel(id string) error {
	m.mu.RLock()
	runtimeState, ok := m.jobs[id]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("transfer %s not found", id)
	}
	runtimeState.cancel()
	return nil
}

func (m *TransferManager) ActiveCount() int {
	count := 0
	for _, job := range m.List() {
		if job.Status == "running" || job.Status == "starting" {
			count++
		}
	}
	return count
}

func (m *TransferManager) Shutdown() {
	m.mu.RLock()
	runtimes := make([]*transferRuntime, 0, len(m.jobs))
	for _, runtimeState := range m.jobs {
		runtimes = append(runtimes, runtimeState)
	}
	m.mu.RUnlock()
	for _, runtimeState := range runtimes {
		runtimeState.cancel()
	}
}
