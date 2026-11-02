import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import bridge  # Installs the shared Python module path.
from desktop_groups import GroupStore
from session_manager.models import ManagerError


def automatic(name="Project"):
    return {"kind": "automatic", "name": name, "selectors": [
        {"key": json.dumps(["root", "local", "local", "d:/repo"], separators=(",", ":"))}]}


class DesktopGroupsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "groups.json"
        self.store = GroupStore(self.path)

    def test_v1_is_read_without_writing_and_migrates_on_edit(self):
        original = json.dumps({"version": 1, "groups": [
            {"id": "old", "name": "Old", "members": [["claude", "account", "session"]]}]})
        self.path.write_text(original, encoding="utf-8")
        self.assertEqual(self.store.load()[0].links, ())
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)
        self.store.assign_link(automatic(), ["old"])
        restored = GroupStore(self.path).load()[0]
        self.assertEqual(restored.members, (("claude", "account", "session"),))
        self.assertEqual(restored.links[0]["name"], "Project")
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))["version"], 2)

    def test_existing_edits_preserve_links_and_renamed_source_is_the_same_link(self):
        a = self.store.create("A")
        b = self.store.create("B")
        self.store.assign_link(automatic(), [a.id])
        self.store.rename(a.id, "Renamed")
        self.store.set_members(a.id, [["codex", "local", "one"]])
        self.store.create("C")
        self.assertEqual(self.store.load()[0].links, (automatic(),))
        self.store.assign_link(automatic("New project name"), [b.id])
        groups = self.store.load()
        self.assertEqual(groups[0].links, ())
        self.assertEqual(groups[1].links[0]["name"], "New project name")
        self.assertEqual(groups[0].members, (("codex", "local", "one"),))

    def test_session_assignment_is_atomic_and_separates_accounts_and_providers(self):
        a = self.store.create("A")
        b = self.store.create("B")
        members = [["claude", "a", "same"], ["claude", "b", "same"], ["codex", "a", "same"]]
        for member in members:
            self.store.set_members(a.id, [member])
        self.store.assign_member(members[0], [b.id])
        groups = self.store.load()
        self.assertEqual(groups[0].members, tuple(map(tuple, members[1:])))
        self.assertEqual(groups[1].members, (tuple(members[0]),))
        before = self.path.read_bytes()
        with self.assertRaises(ManagerError):
            self.store.assign_member(members[0], [a.id, "deleted"])
        self.assertEqual(self.path.read_bytes(), before)
        self.store.assign_member(members[0], [])
        self.assertFalse(self.store.load()[1].members)

    def test_user_links_reject_cycles_self_and_missing_sources_without_writing(self):
        a, b, c = [self.store.create(name) for name in "ABC"]
        source = lambda group: {"kind": "user", "id": group.id, "name": group.name}
        self.store.assign_link(source(a), [b.id])
        self.store.assign_link(source(b), [c.id])
        before = self.path.read_bytes()
        for link, targets in [(source(c), [a.id]), (source(a), [a.id]),
                              ({"kind": "user", "id": "gone", "name": "Gone"}, [a.id]),
                              (source(a), [b.id, b.id])]:
            with self.assertRaises(ManagerError):
                self.store.assign_link(link, targets)
            self.assertEqual(self.path.read_bytes(), before)
        self.store.delete(a.id)
        self.assertEqual(self.store.load()[0].links, ())
        self.assertEqual(self.store.load()[1].links[0]["id"], b.id)

    def test_selector_order_does_not_duplicate_links_and_unlink_restores_empty_target(self):
        a = self.store.create("A")
        source = automatic()
        source["selectors"].append({"key": json.dumps(["desktop-source", "claude", "local", "local", "account", "group", "cg"]),
                                    "root": json.dumps(["root", "local", "local", "d:/repo"])})
        self.store.assign_link(source, [a.id])
        source["selectors"].reverse()
        self.store.assign_link(source, [a.id])
        self.assertEqual(len(self.store.load()[0].links), 1)
        self.store.assign_link(source, [])
        self.assertEqual(self.store.load()[0].links, ())

    def test_broken_files_and_save_failures_preserve_original_bytes(self):
        a = self.store.create("A")
        before = self.path.read_bytes()
        with patch("desktop_groups.atomic_write", side_effect=OSError("disk full")):
            with self.assertRaisesRegex(ManagerError, "disk full"):
                self.store.assign_link(automatic(), [a.id])
        self.assertEqual(self.path.read_bytes(), before)
        invalid = [b"broken", b'{"version":99,"groups":[]}',
                   json.dumps({"version": 2, "groups": [{"id": "a", "name": "A", "members": [],
                       "links": [{"kind": "automatic", "name": "Invalid", "selectors": []}]}]}).encode()]
        for value in invalid:
            self.path.write_bytes(value)
            with self.assertRaises(ManagerError):
                self.store.create("Should not overwrite")
            self.assertEqual(self.path.read_bytes(), value)


if __name__ == "__main__":
    unittest.main()
