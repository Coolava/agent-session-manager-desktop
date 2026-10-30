from contextlib import closing
import hashlib
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from codex_activity import codex_activities


class CodexActivityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.session = {"id": "parent", "key": '["codex","local","parent"]'}
        self.path = self.home / "thread_history_1.sqlite"
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute("CREATE TABLE thread_turns(thread_id TEXT, turn_id TEXT, rollout_ordinal INTEGER, status TEXT, started_at INTEGER, completed_at INTEGER)")

    def turn(self, status, ordinal=1, started=150, completed=None, thread="parent"):
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute("INSERT INTO thread_turns VALUES(?,?,?,?,?,?)", (thread, f"turn-{ordinal}", ordinal, status, started, completed))

    def read(self, runtime_start=100):
        with patch("codex_activity._runtime_started_at", return_value=runtime_start):
            return codex_activities([self.session], self.home, checked_at=200)[self.session["key"]]

    def test_active_turn_after_current_runtime_start_is_working(self):
        self.turn("inProgress")
        self.assertEqual(self.read()["state"], "working")

    def test_new_turn_overrides_previous_completion_by_ordinal_not_time(self):
        self.turn("completed", ordinal=10, started=190, completed=195)
        self.turn("inProgress", ordinal=11, started=150)
        self.assertEqual(self.read()["state"], "working")

    def test_explicit_completion_survives_app_exit_and_preserves_database(self):
        self.turn("completed", completed=180)
        before = hashlib.sha256(self.path.read_bytes()).hexdigest()
        with patch("codex_activity._runtime_started_at") as runtime:
            result = codex_activities([self.session], self.home, checked_at=200)[self.session["key"]]
        self.assertEqual(result["state"], "completed")
        self.assertEqual(result["observed_at"], 200)
        runtime.assert_not_called()
        self.assertEqual(hashlib.sha256(self.path.read_bytes()).hexdigest(), before)

    def test_child_completion_does_not_complete_parent(self):
        self.turn("inProgress")
        self.turn("completed", ordinal=99, completed=180, thread="child")
        self.assertEqual(self.read()["state"], "working")

    def test_interruption_and_failure_are_not_normal_completion(self):
        self.turn("interrupted")
        self.assertEqual(self.read()["state"], "interrupted")
        self.turn("failed", ordinal=2, completed=180)
        self.assertEqual(self.read()["state"], "error")

    def test_orphaned_progress_from_before_runtime_is_unknown(self):
        self.turn("inProgress", started=50)
        self.assertEqual(self.read()["state"], "unknown")
        self.assertIn("프로세스 시작 전", self.read()["detail"])

    def test_progress_without_runtime_is_unknown(self):
        self.turn("inProgress")
        self.assertEqual(self.read(runtime_start=None)["state"], "unknown")

    def test_missing_history_or_turn_stays_unknown_without_creating_files(self):
        self.assertEqual(self.read()["state"], "unknown")
        missing = self.home / "missing"
        result = codex_activities([self.session], missing, checked_at=200)
        self.assertEqual(result[self.session["key"]]["state"], "unknown")
        self.assertFalse(missing.exists())

    def test_corrupt_or_unsupported_schema_fails_closed(self):
        self.path.write_bytes(b"broken sqlite")
        self.assertEqual(self.read()["state"], "unknown")
        self.path.unlink()
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute("CREATE TABLE thread_turns(thread_id TEXT)")
        self.assertEqual(self.read()["state"], "unknown")

    def test_unknown_status_is_not_completed(self):
        self.turn("futureStatus")
        self.assertEqual(self.read()["state"], "unknown")


if __name__ == "__main__":
    unittest.main()
