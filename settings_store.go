package main

import (
	"encoding/json"
	"os"
)

func loadSettings(path string) (Settings, error) {
	defaults := defaultSettings()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaults, nil
		}
		return Settings{}, err
	}
	var out Settings
	if err := json.Unmarshal(data, &out); err != nil {
		return Settings{}, err
	}
	return out.normalized(), nil
}

func saveSettings(path string, settings Settings) error {
	payload, err := json.MarshalIndent(settings.normalized(), "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o644)
}
