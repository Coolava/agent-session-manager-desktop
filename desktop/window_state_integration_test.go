//go:build integration && windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Explicit integration run only: opens the built manager with isolated settings.
func TestWindowStateLifecycle(t *testing.T) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	setDPI := windowUser32.NewProc("SetThreadDpiAwarenessContext")
	previous, _, _ := setDPI.Call(^uintptr(3)) // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
	defer setDPI.Call(previous)

	executable, err := filepath.Abs("build/bin/desktop-session-manager.exe")
	if err != nil {
		t.Fatal(err)
	}
	appData := t.TempDir()
	path := filepath.Join(appData, "DesktopSessionManager", "window-state.json")

	handle, closeWindow := launchStateTestWindow(t, executable, appData)
	placement := stateTestPlacement(t, handle)
	if placement.ShowCmd != 1 {
		t.Fatalf("first launch state = %d", placement.ShowCmd)
	}
	// Use a different reachable position and size, within the current work area.
	placement.NormalPosition.Left += 24
	placement.NormalPosition.Top += 24
	placement.NormalPosition.Right -= 24
	placement.NormalPosition.Bottom -= 24
	applyStateTestPlacement(t, handle, placement)
	want := stateTestPlacement(t, handle).state()
	closeWindow()
	assertSavedState(t, path, want)

	handle, closeWindow = launchStateTestWindow(t, executable, appData)
	if got := stateTestPlacement(t, handle).state(); got != want {
		t.Fatalf("normal relaunch = %+v, want %+v", got, want)
	}
	placement = stateTestPlacement(t, handle)
	placement.ShowCmd = 3
	applyStateTestPlacement(t, handle, placement)
	want.Maximized = true
	closeWindow()
	assertSavedState(t, path, want)

	handle, closeWindow = launchStateTestWindow(t, executable, appData)
	if got := stateTestPlacement(t, handle).state(); got != want {
		t.Fatalf("maximized relaunch = %+v, want %+v", got, want)
	}
	placement = stateTestPlacement(t, handle)
	placement.ShowCmd = 1
	applyStateTestPlacement(t, handle, placement)
	if got := stateTestPlacement(t, handle); got.ShowCmd != 1 || got.NormalPosition != want.NormalPosition {
		t.Fatalf("restore from maximized lost normal bounds: %+v", got)
	}
	closeWindow()

	for _, maximized := range []bool{false, true} {
		want.Maximized = maximized
		if err := writeWindowState(path, want); err != nil {
			t.Fatal(err)
		}
		handle, closeWindow = launchStateTestWindow(t, executable, appData)
		windowUser32.NewProc("ShowWindow").Call(handle, 6) // SW_MINIMIZE
		if got := stateTestPlacement(t, handle); got.ShowCmd != 2 {
			t.Fatalf("window did not minimize: %+v", got)
		}
		closeWindow()
		assertSavedState(t, path, want)
		handle, closeWindow = launchStateTestWindow(t, executable, appData)
		if got := stateTestPlacement(t, handle).state(); got != want {
			t.Fatalf("relaunch after minimize (max=%v) = %+v, want %+v", maximized, got, want)
		}
		closeWindow()
	}

	for _, data := range []string{`{broken`, `{"normalPosition":{"left":10,"top":10,"right":-10,"bottom":-10}}`} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		handle, closeWindow = launchStateTestWindow(t, executable, appData)
		got := stateTestPlacement(t, handle)
		if got.ShowCmd != 1 || got.NormalPosition.Right <= got.NormalPosition.Left {
			t.Fatalf("invalid settings prevented normal startup: %+v", got)
		}
		closeWindow()
		if _, err := readWindowState(path); err != nil {
			t.Fatalf("invalid state was not replaced on close: %v", err)
		}
	}

	want = windowState{windowRect{90000, 90000, 91400, 90900}, false}
	if err := writeWindowState(path, want); err != nil {
		t.Fatal(err)
	}
	handle, closeWindow = launchStateTestWindow(t, executable, appData)
	got := stateTestPlacement(t, handle)
	if got.NormalPosition.Left == 90000 || got.NormalPosition.Top == 90000 {
		t.Fatalf("offscreen window was not repositioned: %+v", got)
	}
	closeWindow()
	t.Log("normal/maximized relaunch, restore bounds, both minimized states, corrupt settings and offscreen recovery passed")
}

func launchStateTestWindow(t *testing.T, executable, appData string) (uintptr, func()) {
	t.Helper()
	cmd := exec.Command(executable)
	cmd.Env = append(os.Environ(), "APPDATA="+appData)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	closed := false
	t.Cleanup(func() {
		if !closed {
			_ = cmd.Process.Kill()
			<-done
		}
	})
	class, err := windows.UTF16PtrFromString(windowClassName)
	if err != nil {
		t.Fatal(err)
	}
	var handle uintptr
	for deadline := time.Now().Add(20 * time.Second); time.Now().Before(deadline); {
		handle, _, _ = findWindowEx.Call(0, handle, uintptr(unsafe.Pointer(class)), 0)
		if handle != 0 {
			var processID uint32
			getWindowProcessID.Call(handle, uintptr(unsafe.Pointer(&processID)))
			visible, _, _ := windowUser32.NewProc("IsWindowVisible").Call(handle)
			if processID == uint32(cmd.Process.Pid) && visible != 0 {
				return handle, func() {
					t.Helper()
					if closed {
						return
					}
					windowUser32.NewProc("PostMessageW").Call(handle, 0x10, 0, 0) // WM_CLOSE
					select {
					case err := <-done:
						closed = true
						if err != nil {
							t.Fatalf("app exit: %v", err)
						}
					case <-time.After(10 * time.Second):
						t.Fatal("app did not close")
					}
				}
			}
		} else {
			time.Sleep(50 * time.Millisecond)
		}
	}
	t.Fatal("app window did not become visible")
	return 0, nil
}

func stateTestPlacement(t *testing.T, handle uintptr) windowPlacement {
	t.Helper()
	var placement windowPlacement
	placement.Length = uint32(unsafe.Sizeof(placement))
	if ok, _, err := getWindowPlacement.Call(handle, uintptr(unsafe.Pointer(&placement))); ok == 0 {
		t.Fatal(err)
	}
	return placement
}

func applyStateTestPlacement(t *testing.T, handle uintptr, placement windowPlacement) {
	t.Helper()
	if ok, _, err := setWindowPlacement.Call(handle, uintptr(unsafe.Pointer(&placement))); ok == 0 {
		t.Fatal(err)
	}
}

func assertSavedState(t *testing.T, path string, want windowState) {
	t.Helper()
	got, err := readWindowState(path)
	if err != nil || got != want {
		t.Fatalf("saved state = %+v, %v; want %+v", got, err, want)
	}
}
