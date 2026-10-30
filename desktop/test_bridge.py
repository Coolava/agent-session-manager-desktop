import hashlib
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock, patch

import bridge
from session_manager.models import Session
from session_manager.storage import SessionStore


class DesktopBridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.identifier = "00000000-0000-4000-8000-000000000001"

    def database(self, version=5):
        path = self.home / f"state_{version}.sqlite"
        with closing(sqlite3.connect(path)) as connection, connection:
            connection.execute("CREATE TABLE threads(id TEXT, title TEXT, name TEXT, cwd TEXT, updated_at INTEGER, recency_at_ms INTEGER, archived INTEGER)")
            connection.execute("INSERT INTO threads VALUES(?,?,?,?,?,?,?)", (self.identifier, "Original request", "Desktop title", r"\\?\D:\project", 123, None, 0))
            connection.execute("INSERT INTO threads VALUES(?,?,?,?,?,?,?)", ("00000000-0000-4000-8000-000000000002", "Archived", None, "D:/project", 456, None, 1))
        return path

    def manager(self):
        manager = Mock()
        manager.list_sessions.return_value = [Session("local_" + self.identifier, self.identifier, "Claude conversation", "local", "D:/project", "D:/project", False, 456000, "account", "organization")]
        manager.store.warnings = []
        return manager

    def test_codex_uses_desktop_name_and_preserves_database(self):
        path = self.database()
        before = hashlib.sha256(path.read_bytes()).hexdigest()
        sessions, warnings = bridge.codex_sessions(self.home)
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["title"], "Desktop title")
        self.assertEqual(sessions[0]["cwd"], r"D:\project")
        self.assertEqual(sessions[0]["lastActivity"], 123000)
        self.assertFalse(sessions[0]["projectless"])
        self.assertEqual(warnings, [])
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), before)
        self.assertFalse((self.home / ".codex-global-state.json").exists())

    def test_codex_projectless_ids_are_authoritative_and_refresh_without_mutating_state(self):
        database = self.database()
        other_id = "00000000-0000-4000-8000-000000000003"
        with closing(sqlite3.connect(database)) as connection, connection:
            connection.execute("INSERT INTO threads VALUES(?,?,?,?,?,?,?)", (other_id, "Same folder", None, r"\\?\D:\project", 123, None, 0))
        state_path = self.home / ".codex-global-state.json"
        contents = json.dumps({"projectless-thread-ids": [self.identifier]})
        state_path.write_text(contents, encoding="utf-8")
        before = hashlib.sha256(database.read_bytes()).hexdigest()
        sessions, warnings = bridge.codex_sessions(self.home)
        self.assertEqual({s["id"]: s["projectless"] for s in sessions}, {self.identifier: True, other_id: False})
        self.assertEqual({s["cwd"] for s in sessions}, {r"D:\project"})
        self.assertEqual(warnings, [])
        self.assertEqual(state_path.read_text(encoding="utf-8"), contents)
        self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(), before)
        state_path.write_text(json.dumps({"projectless-thread-ids": []}), encoding="utf-8")
        sessions, _ = bridge.codex_sessions(self.home)
        self.assertTrue(all(not s["projectless"] for s in sessions))

    def test_codex_broken_projectless_state_keeps_sessions_and_is_not_overwritten(self):
        self.database()
        state_path = self.home / ".codex-global-state.json"
        for contents in ("broken JSON", "[]", '{"projectless-thread-ids":{}}', '{"projectless-thread-ids":[{}]}'):
            with self.subTest(contents=contents):
                state_path.write_text(contents, encoding="utf-8")
                sessions, warnings = bridge.codex_sessions(self.home)
                self.assertEqual([s["id"] for s in sessions], [self.identifier])
                self.assertFalse(sessions[0]["projectless"])
                self.assertTrue(warnings)
                self.assertEqual(state_path.read_text(encoding="utf-8"), contents)

    def test_codex_unreadable_projectless_state_keeps_sessions(self):
        self.database()
        with patch.object(Path, "read_text", side_effect=PermissionError("read denied")):
            sessions, warnings = bridge.codex_sessions(self.home)
        self.assertEqual([s["id"] for s in sessions], [self.identifier])
        self.assertFalse(sessions[0]["projectless"])
        self.assertIn("read denied", warnings[0])

    def test_missing_database_does_not_create_one(self):
        sessions, warnings = bridge.codex_sessions(self.home)
        self.assertEqual(sessions, [])
        self.assertTrue(warnings)
        self.assertEqual(list(self.home.iterdir()), [])

    def project_state(self):
        return {"local-projects": {"local-project": {"rootPaths": [r"D:\project", "E:/second-root"]}},
                "thread-project-assignments": {self.identifier: {"projectKind": "local", "projectId": "local-project"}}}

    def test_codex_project_assignment_preserves_worktree_and_refreshes(self):
        database = self.database()
        with closing(sqlite3.connect(database)) as connection, connection:
            connection.execute("UPDATE threads SET cwd = ?", (r"F:\worktrees\abcd\project",))
        state = self.project_state()
        state_path = self.home / ".codex-global-state.json"
        contents = json.dumps(state)
        state_path.write_text(contents, encoding="utf-8")
        before = hashlib.sha256(database.read_bytes()).hexdigest()
        sessions, warnings = bridge.codex_sessions(self.home)
        self.assertEqual(sessions[0]["projectCwd"], r"D:\project")
        self.assertEqual(sessions[0]["cwd"], r"F:\worktrees\abcd\project")
        self.assertEqual(warnings, [])
        self.assertEqual(state_path.read_text(encoding="utf-8"), contents)
        self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(), before)
        state["local-projects"]["local-project"]["rootPaths"] = ["D:/moved"]
        state_path.write_text(json.dumps(state), encoding="utf-8")
        self.assertEqual(bridge.codex_sessions(self.home)[0][0]["projectCwd"], "D:/moved")
        with patch.object(bridge, "codex_home", return_value=self.home), patch.object(bridge.os, "startfile", create=True) as start:
            bridge.dispatch({"action": "open", "key": sessions[0]["key"]}, self.manager())
        start.assert_called_once_with("codex://threads/" + self.identifier)

    def test_codex_projectless_wins_over_project_assignment(self):
        self.database()
        state = self.project_state()
        state["projectless-thread-ids"] = [self.identifier]
        (self.home / ".codex-global-state.json").write_text(json.dumps(state), encoding="utf-8")
        sessions, warnings = bridge.codex_sessions(self.home)
        self.assertTrue(sessions[0]["projectless"])
        self.assertFalse(sessions[0].get("projectCwd"))
        self.assertEqual(warnings, [])

    def test_codex_missing_unknown_remote_and_invalid_projects_keep_cwd(self):
        self.database()
        for patch_state in ({}, {"local-projects": {}}, {"local-projects": {"local-project": {"rootPaths": []}}},
                            {"local-projects": {"local-project": {"rootPaths": [123]}}},
                            {"thread-project-assignments": {self.identifier: {"projectKind": "remote", "projectId": "local-project"}}},
                            {"thread-project-assignments": {self.identifier: None}}):
            state = {**self.project_state(), **patch_state} if patch_state else {}
            with self.subTest(state=state):
                (self.home / ".codex-global-state.json").write_text(json.dumps(state), encoding="utf-8")
                sessions, _ = bridge.codex_sessions(self.home)
                self.assertEqual(sessions[0]["cwd"], r"D:\project")
                self.assertFalse(sessions[0].get("projectCwd"))

    def test_codex_invalid_project_containers_do_not_lose_projectless_or_sessions(self):
        self.database()
        for key in ("local-projects", "thread-project-assignments"):
            state = {**self.project_state(), key: [], "projectless-thread-ids": [self.identifier]}
            (self.home / ".codex-global-state.json").write_text(json.dumps(state), encoding="utf-8")
            sessions, warnings = bridge.codex_sessions(self.home)
            self.assertEqual(len(sessions), 1)
            self.assertTrue(sessions[0]["projectless"])
            self.assertTrue(warnings)

    def test_codex_invalid_projectless_list_does_not_lose_valid_project_assignment(self):
        self.database()
        state = {**self.project_state(), "projectless-thread-ids": {}}
        (self.home / ".codex-global-state.json").write_text(json.dumps(state), encoding="utf-8")
        sessions, warnings = bridge.codex_sessions(self.home)
        self.assertEqual(sessions[0]["projectCwd"], r"D:\project")
        self.assertFalse(sessions[0]["projectless"])
        self.assertTrue(warnings)

    def test_codex_sqlite_projects_precede_legacy_assignments_and_use_first_root(self):
        database = self.database()
        with closing(sqlite3.connect(database)) as connection, connection:
            connection.execute("ALTER TABLE threads ADD COLUMN project_id TEXT")
            connection.execute("UPDATE threads SET project_id = 'current-project'")
            connection.execute("CREATE TABLE projects(id TEXT PRIMARY KEY, name TEXT)")
            connection.execute("INSERT INTO projects VALUES('current-project', 'Current')")
            connection.execute("CREATE TABLE project_roots(project_id TEXT, position INTEGER, path TEXT)")
            connection.executemany("INSERT INTO project_roots VALUES('current-project',?,?)", [(1, "E:/second"), (0, r"\\?\D:\current")])
        state_path = self.home / ".codex-global-state.json"
        state_path.write_text(json.dumps(self.project_state()), encoding="utf-8")
        before = hashlib.sha256(database.read_bytes()).hexdigest()
        self.assertEqual(bridge.codex_sessions(self.home)[0][0]["projectCwd"], r"D:\current")
        state_path.unlink()
        self.assertEqual(bridge.codex_sessions(self.home)[0][0]["projectCwd"], r"D:\current")
        state_path.write_text("broken JSON", encoding="utf-8")
        sessions, warnings = bridge.codex_sessions(self.home)
        self.assertEqual(sessions[0]["projectCwd"], r"D:\current")
        self.assertTrue(warnings)
        state_path.write_text(json.dumps({**self.project_state(), "projectless-thread-ids": [self.identifier]}), encoding="utf-8")
        self.assertFalse(bridge.codex_sessions(self.home)[0][0]["projectCwd"])
        self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(), before)
        with closing(sqlite3.connect(database)) as connection, connection:
            connection.execute("UPDATE threads SET project_id = 'deleted-project'")
        state_path.write_text(json.dumps(self.project_state()), encoding="utf-8")
        self.assertEqual(bridge.codex_sessions(self.home)[0][0]["projectCwd"], r"D:\project")

    def test_internal_subagents_and_guardian_reviews_are_not_desktop_chats(self):
        path = self.database()
        with closing(sqlite3.connect(path)) as connection, connection:
            connection.execute("ALTER TABLE threads ADD COLUMN thread_source TEXT")
            connection.execute("UPDATE threads SET thread_source = 'user'")
            for kind in ("subagent", "guardian_review"):
                connection.execute("INSERT INTO threads(id,title,cwd,updated_at,archived,thread_source) VALUES(?,?,?,?,?,?)", ("00000000-0000-4000-8000-000000000003", "Internal helper", "D:/project", 999, 0, kind))
        sessions, _ = bridge.codex_sessions(self.home)
        self.assertEqual([s["title"] for s in sessions], ["Desktop title"])

    def test_latest_numeric_schema_is_selected(self):
        self.database(5)
        newest = self.database(10)
        with closing(sqlite3.connect(newest)) as connection, connection:
            connection.execute("UPDATE threads SET name = 'New schema'")
        sessions, _ = bridge.codex_sessions(self.home)
        self.assertEqual(sessions[0]["title"], "New schema")

    def test_claude_open_is_independent_of_broken_codex_metadata(self):
        manager = self.manager()
        key = bridge.claude_sessions(manager)[0][0]["key"]
        with patch.object(bridge, "codex_sessions", side_effect=sqlite3.DatabaseError("corrupt")), patch.object(bridge.os, "startfile", create=True) as start:
            result = bridge.dispatch({"action": "open", "key": key}, manager)
        start.assert_called_once_with("claude://claude.ai/epitaxy/local_" + self.identifier)
        self.assertTrue(result["requested"])
        manager.open_session.assert_not_called()

    def test_codex_open_dispatches_only_the_validated_thread_link(self):
        self.database()
        with patch.object(bridge, "codex_home", return_value=self.home), patch.object(bridge.os, "startfile", create=True) as start:
            session = bridge.codex_sessions()[0][0]
            result = bridge.dispatch({"action": "open", "key": session["key"]}, self.manager())
        start.assert_called_once_with("codex://threads/" + self.identifier)
        self.assertEqual(result["session_id"], self.identifier)

    def test_forged_or_stale_session_cannot_dispatch_a_link(self):
        with patch.object(bridge, "codex_sessions", return_value=([], [])), patch.object(bridge.os, "startfile", create=True) as run:
            with self.assertRaises(ValueError):
                bridge.dispatch({"action": "open", "key": json.dumps(["codex", "local", "$(unexpected)"])}, self.manager())
        run.assert_not_called()

    def test_identical_ids_across_providers_do_not_share_group_membership(self):
        self.database()
        with patch.object(bridge, "codex_home", return_value=self.home):
            snapshot = bridge.snapshot(self.manager())
        keys = [session["key"] for session in snapshot["sessions"]]
        self.assertEqual(len(keys), 2)
        self.assertEqual(len(set(keys)), 2)

    def test_claude_parent_keys_stay_in_the_childs_account_and_organization(self):
        parent_id = "local_00000000-0000-4000-8000-000000000099"
        original = json.dumps({"sessionId": "local_" + self.identifier, "title": "Child", "cwd": "D:/child", "spawnedFrom": {"sessionId": parent_id, "sideSession": True, "name": "t3-aw"}})
        for account, org in (("account-a", "org-a"), ("account-b", "org-b")):
            path = self.home / account / org / ("local_" + self.identifier + ".json")
            path.parent.mkdir(parents=True)
            path.write_text(original, encoding="utf-8")
        manager = self.manager()
        manager.store = SessionStore(self.home)
        manager.list_sessions.side_effect = manager.store.list
        sessions, warnings = bridge.claude_sessions(manager)
        self.assertEqual([json.loads(s["parentKey"]) for s in sessions], [["claude", "account-a:org-a", parent_id], ["claude", "account-b:org-b", parent_id]])
        self.assertEqual([s["childName"] for s in sessions], ["t3-aw", "t3-aw"])
        self.assertEqual(warnings, [])
        for path in self.home.glob("*/*/*.json"):
            self.assertEqual(path.read_text(encoding="utf-8"), original)

    def test_broken_groups_are_reported_and_never_overwritten(self):
        path = self.home / "groups.json"
        path.write_text("broken groups", encoding="utf-8")
        with patch.object(bridge, "group_store", return_value=bridge.GroupStore(path)), patch.object(bridge, "codex_sessions", return_value=([], [])):
            snapshot = bridge.snapshot(self.manager())
            self.assertTrue(snapshot["groupError"])
            self.assertEqual(len(snapshot["sessions"]), 1)
            with self.assertRaises(bridge.ManagerError):
                bridge.dispatch({"action": "create-group", "name": "Should not overwrite"}, self.manager())
        self.assertEqual(path.read_text(encoding="utf-8"), "broken groups")


if __name__ == "__main__":
    unittest.main()
