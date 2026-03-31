package main

import (
	"os"
	"path/filepath"
)

func resolveAppPaths(appName string) (AppPaths, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return AppPaths{}, err
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return AppPaths{}, err
	}
	appDir := filepath.Join(configDir, appName)
	logsDir := filepath.Join(appDir, "logs")
	rcloneDir := filepath.Join(appDir, "rclone")
	settingsPath := filepath.Join(appDir, "settings.json")
	rcloneConfigPath := filepath.Join(rcloneDir, "rclone.conf")
	bundledRoot := filepath.Join("resources", "rclone")
	for _, dir := range []string{appDir, logsDir, rcloneDir, filepath.Join(cacheDir, appName)} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return AppPaths{}, err
		}
	}
	return AppPaths{
		AppDir:            appDir,
		CacheDir:          filepath.Join(cacheDir, appName),
		LogDir:            logsDir,
		SettingsPath:      settingsPath,
		RcloneConfigPath:  rcloneConfigPath,
		BundledBinaryRoot: bundledRoot,
	}, nil
}
