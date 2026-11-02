package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestWindowStateRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings", "window-state.json")
	for _, maximized := range []bool{false, true} {
		want := windowState{windowRect{-1800, 80, -600, 880}, maximized}
		if err := writeWindowState(path, want); err != nil {
			t.Fatal(err)
		}
		got, err := readWindowState(path)
		if err != nil || got != want {
			t.Fatalf("saved state = %+v, %v; want %+v", got, err, want)
		}
	}
	files, err := filepath.Glob(filepath.Join(filepath.Dir(path), "*.tmp"))
	if err != nil || len(files) != 0 {
		t.Fatalf("temporary files remain: %v, %v", files, err)
	}
}

func TestReadWindowStateRejectsInvalidFiles(t *testing.T) {
	path := filepath.Join(t.TempDir(), "window-state.json")
	if _, err := readWindowState(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("missing file: %v", err)
	}
	for _, data := range []string{
		`{`, `null`, `{}`, `{"normalPosition":{"left":100,"top":100,"right":50,"bottom":500}}`,
		`{"normalPosition":{"left":0,"top":100,"right":1000,"bottom":100}}`,
	} {
		if err := os.WriteFile(path, []byte(data), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := readWindowState(path); err == nil {
			t.Errorf("accepted invalid state %s", data)
		}
	}
}

func TestWindowStateBeforeMinimizing(t *testing.T) {
	for _, test := range []struct {
		name        string
		show, flags uint32
		maximized   bool
	}{
		{"normal", 1, 0, false},
		{"maximized", 3, 0, true},
		{"minimized normal", 2, 0, false},
		{"minimized maximized", 2, 2, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			p := windowPlacement{ShowCmd: test.show, Flags: test.flags, NormalPosition: windowRect{100, 80, 1300, 880}}
			got := p.state()
			if got.Maximized != test.maximized || got.NormalPosition != p.NormalPosition {
				t.Fatalf("state = %+v", got)
			}
		})
	}
}

func TestWindowStateSaveFailurePreservesExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "window-state.json")
	want := windowState{windowRect{50, 60, 1250, 860}, false}
	if err := writeWindowState(path, want); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0400); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(path, 0600) })
	changed := want
	changed.Maximized = true
	if err := writeWindowState(path, changed); err == nil {
		t.Fatal("replacing a read-only settings file unexpectedly succeeded")
	}
	got, err := readWindowState(path)
	if err != nil || got != want {
		t.Fatalf("existing file changed: %+v, %v", got, err)
	}
}
