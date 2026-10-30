package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:assets
var assets embed.FS

type App struct {
	ctx     context.Context
	root    string
	opening sync.Mutex
	groups  sync.Mutex
}

func (a *App) Call(request map[string]interface{}) (interface{}, error) {
	action, _ := request["action"].(string)
	if action == "open" {
		if !a.opening.TryLock() {
			return nil, fmt.Errorf("세션 열기가 진행 중입니다. 완료될 때까지 기다려 주세요.")
		}
		defer a.opening.Unlock()
	} else if action != "snapshot" && action != "activities" {
		a.groups.Lock()
		defer a.groups.Unlock()
	}
	input, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(a.ctx, 50*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, "python", filepath.Join(a.root, "bridge.py"))
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	command.Stdin = bytes.NewReader(input)
	var stderr bytes.Buffer
	command.Stderr = &stderr
	output, runErr := command.Output()
	var reply struct {
		OK    bool        `json:"ok"`
		Data  interface{} `json:"data"`
		Error string      `json:"error"`
	}
	if err := json.Unmarshal(output, &reply); err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("Desktop 연동 시간이 초과되었습니다. 결과를 확인한 뒤 다시 시도하세요.")
		}
		return nil, fmt.Errorf("Desktop 연동을 실행하지 못했습니다: %v %s", runErr, stderr.String())
	}
	if !reply.OK {
		return nil, fmt.Errorf("%s", reply.Error)
	}
	return reply.Data, nil
}

func main() {
	executable, err := os.Executable()
	if err != nil {
		panic(err)
	}
	app := &App{root: filepath.Clean(filepath.Join(filepath.Dir(executable), "..", ".."))}
	web, err := fs.Sub(assets, "assets")
	if err != nil {
		panic(err)
	}
	err = wails.Run(&options.App{
		Title: "Desktop Session Manager", Width: 1380, Height: 880, MinWidth: 960, MinHeight: 640,
		Frameless: true, BackgroundColour: &options.RGBA{R: 10, G: 10, B: 15, A: 255},
		AssetServer: &assetserver.Options{Assets: web},
		OnStartup:   func(ctx context.Context) { app.ctx = ctx }, Bind: []interface{}{app},
	})
	if err != nil {
		panic(err)
	}
}
