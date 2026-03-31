package main

import "testing"

func TestDefaultSettingsNormalized(t *testing.T) {
	got := (Settings{}).normalized()
	if got.DefaultTransfers != 4 || got.DefaultCheckers != 8 || got.RcloneVersionPin == "" {
		t.Fatalf("unexpected normalized settings: %+v", got)
	}
}

func TestMountAdvicePresent(t *testing.T) {
	advice := mountAdvice()
	if len(advice) == 0 {
		t.Fatal("expected mount advice")
	}
}
