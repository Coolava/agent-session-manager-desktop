import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

import claude_groups


def integer(value):
    encoded = bytearray()
    while value >= 128:
        encoded.append((value & 127) | 128)
        value >>= 7
    return bytes(encoded) + bytes([value])


def string(value):
    return integer(len(value)) + value


def checksum(data):
    crc = 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = (crc >> 1) ^ (0x82F63B78 if crc & 1 else 0)
    crc ^= 0xFFFFFFFF
    return (((crc >> 15) | (crc << 17)) + 0xA282EAD8) & 0xFFFFFFFF


def log(records):
    result = bytearray()
    for record in records:
        cursor = 0
        while cursor < len(record):
            remaining = 32768 - len(result) % 32768
            if remaining < 7:
                result.extend(b"\x00" * remaining)
                remaining = 32768
            fragment = record[cursor:cursor + remaining - 7]
            first, last = cursor == 0, cursor + len(fragment) == len(record)
            kind = 1 if first and last else 2 if first else 4 if last else 3
            result.extend(struct.pack("<IHB", checksum(bytes([kind]) + fragment), len(fragment), kind) + fragment)
            cursor += len(fragment)
    return bytes(result)


def batch(sequence, value, key=claude_groups.GROUP_KEY):
    return struct.pack("<QI", sequence, 1) + (b"\x00" + string(key) if value is None else b"\x01" + string(key) + string(value))


def group_state(name="Improve_Workflow", encoding="latin-1", assignments=None):
    scope = {"groups": [{"id": "group-1", "name": name}],
             "assignments": assignments if assignments is not None else {"code:local_one": "group-1"}}
    text = json.dumps({"value": {"account/org": scope}}, ensure_ascii=False).encode(encoding)
    return (b"\x00" if encoding == "utf-16-le" else b"\x01") + text


def table(entries, compressed=False):
    def block(items):
        result, previous = bytearray(), b""
        for key, value in items:
            shared = 0
            while shared < min(len(previous), len(key)) and previous[shared] == key[shared]:
                shared += 1
            result.extend(integer(shared) + integer(len(key) - shared) + integer(len(value)) + key[shared:] + value)
            previous = key
        return bytes(result) + struct.pack("<II", 0, 1)

    def stored(payload, compression):
        if compression:
            length = len(payload) - 1
            width = max(1, (length.bit_length() + 7) // 8)
            payload = integer(len(payload)) + bytes([(59 + width) << 2]) + length.to_bytes(width, "little") + payload
        kind = bytes([int(compression)])
        return payload + kind + struct.pack("<I", checksum(payload + kind)), len(payload)

    data, size = stored(block(entries), compressed)
    index, index_size = stored(block([(b"z", integer(0) + integer(size))]), False)
    footer = (integer(0) + integer(0) + integer(len(data)) + integer(index_size)).ljust(40, b"\x00")
    return data + index + footer + claude_groups.TABLE_MAGIC


class ClaudeGroupsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "CURRENT").write_bytes(b"MANIFEST-000001\n")
        self.manifest(b"\x02\x0a")  # Current WAL number 10.

    def manifest(self, *records):
        (self.root / "MANIFEST-000001").write_bytes(log(records))

    def add_table(self, number, sequence, value, compressed=False):
        key = claude_groups.GROUP_KEY + ((sequence << 8) | int(value is not None)).to_bytes(8, "little")
        (self.root / f"{number:06}.ldb").write_bytes(table([(key, value or b"")], compressed))
        return b"\x07\x00" + integer(number) + integer(1) + string(b"a") + string(b"z")

    def read(self):
        groups, warnings = claude_groups.read_groups(self.root)
        self.assertEqual(warnings, [])
        return groups

    def test_reads_compressed_table_and_preserves_all_files(self):
        edit = self.add_table(3, 100, group_state("그룹", "utf-16-le"), compressed=True)
        self.manifest(b"\x02\x0a" + edit)
        before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.iterdir()}
        self.assertEqual(self.read()[("account/org", "local_one")], {"id": "group-1", "name": "그룹"})
        self.assertEqual({p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.root.iterdir()}, before)

    def test_latest_wal_wins_and_refreshes_then_deletion_clears_assignment(self):
        self.manifest(b"\x02\x0a" + self.add_table(3, 100, group_state("Old")))
        wal = self.root / "000010.log"
        wal.write_bytes(log([batch(102, group_state("New")), batch(101, group_state("Earlier"))]))
        self.assertEqual(self.read()[("account/org", "local_one")]["name"], "New")
        wal.write_bytes(log([batch(103, None)]))
        self.assertEqual(self.read(), {})
        wal.write_bytes(log([batch(104, group_state(assignments={}))]))
        self.assertEqual(self.read(), {})

    def test_latin1_group_names_and_table_tombstones(self):
        self.manifest(b"\x02\x0a" + self.add_table(3, 100, group_state("Café")))
        self.assertEqual(self.read()[("account/org", "local_one")]["name"], "Café")
        self.manifest(b"\x02\x0a" + self.add_table(3, 100, group_state("Café")) + self.add_table(4, 101, None))
        self.assertEqual(self.read(), {})

    def test_manifest_excludes_obsolete_table_and_old_logs(self):
        obsolete = self.add_table(3, 100, group_state("Obsolete"))
        current = self.add_table(4, 99, group_state("Current"))
        self.manifest(b"\x02\x0a" + obsolete, b"\x06\x00\x03" + current)
        (self.root / "000009.log").write_bytes(log([batch(200, group_state("Old log"))]))
        self.assertEqual(self.read()[("account/org", "local_one")]["name"], "Current")

    def test_fragmented_log_and_incomplete_append_do_not_erase_complete_record(self):
        large = group_state("Group " + "x" * 70000)
        wal = log([batch(101, large)])
        (self.root / "000010.log").write_bytes(wal + log([batch(102, group_state("Not committed"))])[:10])
        self.assertEqual(self.read()[("account/org", "local_one")]["name"], "Group " + "x" * 70000)

    def test_unknown_group_and_non_code_assignments_are_ignored_with_scope_isolation(self):
        state = json.loads(group_state()[1:])
        state["value"]["account/org"]["assignments"].update({"code:local_unknown": "deleted", "chat:local_chat": "group-1"})
        state["value"]["other/org"] = {"groups": [{"id": "group-1", "name": "Other"}], "assignments": {"code:local_one": "group-1"}}
        raw = b"\x01" + json.dumps(state).encode()
        (self.root / "000010.log").write_bytes(log([batch(101, raw)]))
        groups = self.read()
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[("other/org", "local_one")]["name"], "Other")

    def test_corruption_and_unsupported_state_report_warning_without_writes(self):
        for raw in (b"\x01broken", b"\x01[]", b'\x01{"value":[]}', b'\x01{"value":{"account/org":{}}}'):
            with self.subTest(raw=raw):
                (self.root / "000010.log").write_bytes(log([batch(100, raw)]))
                groups, warnings = claude_groups.read_groups(self.root)
                self.assertEqual(groups, {})
                self.assertTrue(warnings)
        wal = bytearray(log([batch(100, group_state())]))
        wal[10] ^= 1
        (self.root / "000010.log").write_bytes(wal)
        self.assertTrue(claude_groups.read_groups(self.root)[1])

    def test_missing_store_and_compaction_retry(self):
        self.assertEqual(claude_groups.read_groups(self.root / "absent"), ({}, []))
        with patch.object(claude_groups, "_read_key", side_effect=[FileNotFoundError(), group_state()]):
            self.assertEqual(self.read()[("account/org", "local_one")]["name"], "Improve_Workflow")

    def test_snappy_copy_forms_and_overlapping_copy(self):
        for copy in (b"\x01\x04", b"\x0e\x04\x00", b"\x0f\x04\x00\x00\x00"):
            self.assertEqual(claude_groups._snappy(b"\x08\x0cabcd" + copy), b"abcdabcd")
        self.assertEqual(claude_groups._snappy(b"\x0a\x00a\x15\x01"), b"a" * 10)
        with self.assertRaises(ValueError):
            claude_groups._snappy(b"\x08\x01\x00")


if __name__ == "__main__":
    unittest.main()
