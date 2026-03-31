package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	desktop, err := NewDesktopService()
	if err != nil {
		log.Fatal(err)
	}

	app := application.New(application.Options{
		Name:        "Fero",
		Description: "Desktop rclone control plane",
		Services: []application.Service{
			application.NewService(&SystemService{desktop: desktop}),
			application.NewService(&RemoteService{desktop: desktop}),
			application.NewService(&TransferService{desktop: desktop}),
			application.NewService(&MountService{desktop: desktop}),
		},
		Assets: application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Mac:    application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
		OnShutdown: func() {
			desktop.Shutdown()
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "Fero",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 48,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(9, 11, 18),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
