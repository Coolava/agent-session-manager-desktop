package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

const windowClassName = "DesktopSessionManagerWindow"

var (
	windowUser32       = windows.NewLazySystemDLL("user32.dll")
	findWindowEx       = windowUser32.NewProc("FindWindowExW")
	getWindowProcessID = windowUser32.NewProc("GetWindowThreadProcessId")
	getWindowPlacement = windowUser32.NewProc("GetWindowPlacement")
	setWindowPlacement = windowUser32.NewProc("SetWindowPlacement")
)

type windowPoint struct{ X, Y int32 }

type windowRect struct {
	Left   int32 `json:"left"`
	Top    int32 `json:"top"`
	Right  int32 `json:"right"`
	Bottom int32 `json:"bottom"`
}

type windowPlacement struct {
	Length, Flags, ShowCmd   uint32
	MinPosition, MaxPosition windowPoint
	NormalPosition           windowRect
}

type windowState struct {
	NormalPosition windowRect `json:"normalPosition"`
	Maximized      bool       `json:"maximized"`
}

func (p windowPlacement) state() windowState {
	// WPF_RESTORETOMAXIMIZED preserves the state before minimising.
	return windowState{p.NormalPosition, p.ShowCmd == 3 || (p.ShowCmd == 2 && p.Flags&2 != 0)}
}

func windowStatePath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "DesktopSessionManager", "window-state.json"), nil
}

func readWindowState(path string) (windowState, error) {
	var state windowState
	data, err := os.ReadFile(path)
	if err != nil {
		return state, err
	}
	if err := json.Unmarshal(data, &state); err != nil {
		return state, err
	}
	r := state.NormalPosition
	if r.Right <= r.Left || r.Bottom <= r.Top {
		return state, fmt.Errorf("invalid saved window rectangle")
	}
	return state, nil
}

func writeWindowState(path string, state windowState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), "window-state-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, writeErr := file.Write(data)
	closeErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), path)
}

func desktopWindowHandle() (uintptr, error) {
	class, err := windows.UTF16PtrFromString(windowClassName)
	if err != nil {
		return 0, err
	}
	var handle uintptr
	for {
		handle, _, _ = findWindowEx.Call(0, handle, uintptr(unsafe.Pointer(class)), 0)
		if handle == 0 {
			return 0, fmt.Errorf("Desktop Session Manager window not found")
		}
		var processID uint32
		getWindowProcessID.Call(handle, uintptr(unsafe.Pointer(&processID)))
		if processID == uint32(os.Getpid()) {
			return handle, nil
		}
	}
}

func restoreDesktopWindow() error {
	path, err := windowStatePath()
	if err != nil {
		return err
	}
	state, err := readWindowState(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	handle, err := desktopWindowHandle()
	if err != nil {
		return err
	}
	placement := windowPlacement{ShowCmd: 1, NormalPosition: state.NormalPosition}
	placement.Length = uint32(unsafe.Sizeof(placement))
	if state.Maximized {
		placement.ShowCmd = 3
	}
	// Keep workspace coordinates paired with SetWindowPlacement. Windows also
	// moves a completely offscreen rectangle onto an available monitor.
	if ok, _, err := setWindowPlacement.Call(handle, uintptr(unsafe.Pointer(&placement))); ok == 0 {
		return fmt.Errorf("restore window placement: %w", err)
	}
	return nil
}

func saveDesktopWindow() error {
	handle, err := desktopWindowHandle()
	if err != nil {
		return err
	}
	var placement windowPlacement
	placement.Length = uint32(unsafe.Sizeof(placement))
	if ok, _, err := getWindowPlacement.Call(handle, uintptr(unsafe.Pointer(&placement))); ok == 0 {
		return fmt.Errorf("read window placement: %w", err)
	}
	path, err := windowStatePath()
	if err != nil {
		return err
	}
	return writeWindowState(path, placement.state())
}
