//go:build integration

package main

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

// Explicit integration runs only. Ordinary go test never dispatches Desktop links.
func TestLiveDesktopBridge(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	app := &App{ctx: context.Background(), root: root}
	result, err := app.Call(map[string]interface{}{"action": "snapshot"})
	if err != nil {
		t.Fatal(err)
	}
	snapshot := result.(map[string]interface{})
	sessions := snapshot["sessions"].([]interface{})
	if len(sessions) == 0 {
		t.Fatal("No Desktop metadata was returned")
	}
	t.Logf("Live Desktop sessions: %d", len(sessions))
	if claudeID := os.Getenv("DESKTOP_SESSION_SMOKE_CLAUDE"); claudeID != "" {
		found := false
		for _, item := range sessions {
			session := item.(map[string]interface{})
			if session["provider"] != "claude" || session["id"] != claudeID {
				continue
			}
			found = true
			opened, err := app.Call(map[string]interface{}{"action": "open", "key": session["key"]})
			if err != nil {
				t.Fatal(err)
			}
			if opened.(map[string]interface{})["session_id"] != claudeID {
				t.Fatalf("Wrong Claude session: %v", opened)
			}
			t.Logf("Dispatched Claude Desktop session: %s", claudeID)
		}
		if !found {
			t.Fatal("Claude test session was not found")
		}
	}
	thread := os.Getenv("DESKTOP_SESSION_SMOKE_THREAD")
	if thread == "" {
		return
	}
	key, err := json.Marshal([]string{"codex", "local", thread})
	if err != nil {
		t.Fatal(err)
	}
	opened, err := app.Call(map[string]interface{}{"action": "open", "key": string(key)})
	if err != nil {
		t.Fatal(err)
	}
	request := opened.(map[string]interface{})
	if request["session_id"] != thread || request["requested"] != true {
		t.Fatalf("Wrong Desktop link request: %v", request)
	}
	t.Logf("Dispatched Codex Desktop session: %s", thread)
}

func TestLiveCodexActivity(t *testing.T) {
	root, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	app := &App{ctx: context.Background(), root: root}
	result, err := app.Call(map[string]interface{}{"action": "codex-activities"})
	if err != nil {
		t.Fatal(err)
	}
	activities := result.(map[string]interface{})
	if len(activities) == 0 {
		t.Fatal("No Codex activity observations returned")
	}
	t.Logf("Codex activity observations: %d", len(activities))
	if thread := os.Getenv("DESKTOP_ACTIVITY_SMOKE_THREAD"); thread != "" {
		key, err := json.Marshal([]string{"codex", "local", thread})
		if err != nil {
			t.Fatal(err)
		}
		activity := activities[string(key)].(map[string]interface{})
		if activity["state"] != "working" {
			t.Fatalf("Expected active test thread, got %v", activity)
		}
		t.Log("Current active thread is working")
	}
}
