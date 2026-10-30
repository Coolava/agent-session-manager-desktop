"""Read Claude's group assignment key without opening or modifying its LevelDB."""

import json
import os
from pathlib import Path
import re
import struct

GROUP_KEY = b"_https://claude.ai\x00\x01LSS-persisted.dframe-group-scopes"
TABLE_MAGIC = b"\x57\xfb\x80\x8b\x24\x75\x47\xdb"


def _varint(data, offset):
    value = 0
    for shift in range(0, 70, 7):
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
    raise ValueError("Invalid LevelDB integer")


def _string(data, offset):
    length, offset = _varint(data, offset)
    end = offset + length
    if end > len(data):
        raise ValueError("Truncated LevelDB string")
    return data[offset:end], end


def _crc_entry(value):
    for _ in range(8):
        value = (value >> 1) ^ (0x82F63B78 if value & 1 else 0)
    return value


_CRC_TABLE = tuple(_crc_entry(value) for value in range(256))


def _checksum(data):
    crc = 0xFFFFFFFF
    for byte in data:
        crc = _CRC_TABLE[(crc ^ byte) & 255] ^ (crc >> 8)
    crc ^= 0xFFFFFFFF
    return (((crc >> 15) | (crc << 17)) + 0xA282EAD8) & 0xFFFFFFFF


def _records(data):
    fragments = None
    for start in range(0, len(data), 32768):
        block = data[start:start + 32768]
        offset = 0
        while offset + 7 <= len(block):
            checksum, length, kind = struct.unpack_from("<IHB", block, offset)
            if kind == 0 and length == 0:
                break
            end = offset + 7 + length
            if end > len(block):
                if start + len(block) == len(data):
                    return  # The writer may still be appending the final record.
                raise ValueError("Truncated LevelDB log")
            payload = block[offset + 7:end]
            if checksum != _checksum(bytes([kind]) + payload):
                raise ValueError("LevelDB log checksum mismatch")
            offset = end
            if kind == 1:
                fragments = None
                yield payload
            elif kind == 2:
                fragments = bytearray(payload)
            elif kind in (3, 4) and fragments is not None:
                fragments.extend(payload)
                if kind == 4:
                    yield bytes(fragments)
                    fragments = None
            else:
                raise ValueError("Unsupported LevelDB log record")


def _manifest(data):
    tables, log_number, previous_log = set(), 0, 0
    for record in _records(data):
        offset = 0
        while offset < len(record):
            tag, offset = _varint(record, offset)
            if tag == 1:
                comparator, offset = _string(record, offset)
                if comparator != b"leveldb.BytewiseComparator":
                    raise ValueError("Unsupported LevelDB comparator")
            elif tag in (2, 3, 4, 9):
                number, offset = _varint(record, offset)
                if tag == 2:
                    log_number = number
                elif tag == 9:
                    previous_log = number
            elif tag in (5, 6, 7):
                _, offset = _varint(record, offset)  # level
                if tag == 5:
                    _, offset = _string(record, offset)
                    continue
                number, offset = _varint(record, offset)
                if tag == 6:
                    tables.discard(number)
                else:
                    _, offset = _varint(record, offset)  # file size
                    _, offset = _string(record, offset)  # smallest key
                    _, offset = _string(record, offset)  # largest key
                    tables.add(number)
            else:
                raise ValueError("Unsupported LevelDB manifest tag")
    return tables, log_number, previous_log


def _snappy(data):
    size, offset = _varint(data, 0)
    output = bytearray()
    while offset < len(data):
        tag = data[offset]
        offset += 1
        kind = tag & 3
        if kind == 0:
            length = tag >> 2
            if length >= 60:
                width = length - 59
                length = int.from_bytes(data[offset:offset + width], "little")
                offset += width
            length += 1
            output.extend(data[offset:offset + length])
            offset += length
        else:
            if kind == 1:
                length = 4 + ((tag >> 2) & 7)
                distance = ((tag & 224) << 3) | data[offset]
                offset += 1
            else:
                length = 1 + (tag >> 2)
                width = 2 if kind == 2 else 4
                distance = int.from_bytes(data[offset:offset + width], "little")
                offset += width
            if not 0 < distance <= len(output):
                raise ValueError("Invalid Snappy copy")
            chunk = output[-distance:]
            output.extend((chunk * ((length + distance - 1) // distance))[:length])
        if len(output) > size:
            raise ValueError("Invalid Snappy size")
    if offset != len(data) or len(output) != size:
        raise ValueError("Truncated Snappy block")
    return bytes(output)


def _block(data, handle):
    offset, cursor = _varint(handle, 0)
    length, _ = _varint(handle, cursor)
    end = offset + length
    if end + 5 > len(data):
        raise ValueError("Truncated LevelDB table block")
    kind = data[end]
    if int.from_bytes(data[end + 1:end + 5], "little") != _checksum(data[offset:end + 1]):
        raise ValueError("LevelDB table checksum mismatch")
    if kind == 0:
        return data[offset:end]
    if kind == 1:
        return _snappy(data[offset:end])
    raise ValueError("Unsupported LevelDB compression")


def _entries(data):
    end = len(data) - 4 * (int.from_bytes(data[-4:], "little") + 1)
    if end < 0:
        raise ValueError("Invalid LevelDB restart array")
    offset, key = 0, b""
    while offset < end:
        shared, offset = _varint(data, offset)
        length, offset = _varint(data, offset)
        value_length, offset = _varint(data, offset)
        if shared > len(key) or offset + length + value_length > end:
            raise ValueError("Invalid LevelDB table entry")
        key = key[:shared] + data[offset:offset + length]
        offset += length
        yield key, data[offset:offset + value_length]
        offset += value_length


def _table_entries(data):
    if len(data) < 48 or data[-8:] != TABLE_MAGIC:
        raise ValueError("Unsupported LevelDB table")
    footer = data[-48:-8]
    _, cursor = _varint(footer, 0)
    _, cursor = _varint(footer, cursor)
    for _, handle in _entries(_block(data, footer[cursor:])):
        yield from _entries(_block(data, handle))


def _batch_entries(data):
    sequence, count = struct.unpack_from("<QI", data)
    offset, entries = 12, []
    for index in range(count):
        kind = data[offset]
        key, offset = _string(data, offset + 1)
        if kind == 1:
            value, offset = _string(data, offset)
        elif kind == 0:
            value = b""
        else:
            raise ValueError("Unsupported LevelDB write operation")
        entries.append((key + ((sequence + index) << 8 | kind).to_bytes(8, "little"), value))
    if offset != len(data):
        raise ValueError("Invalid LevelDB write batch")
    return entries


def _read_key(directory):
    current = (directory / "CURRENT").read_bytes()
    name = current.decode("ascii").strip()
    if not re.fullmatch(r"MANIFEST-\d+", name):
        raise ValueError("Invalid LevelDB manifest name")
    manifest = directory / name
    version = manifest.read_bytes()
    tables, log_number, previous_log = _manifest(version)
    latest, result = -1, None

    def accept(entries):
        nonlocal latest, result
        for key, value in entries:
            if key[:-8] != GROUP_KEY:
                continue
            tag = int.from_bytes(key[-8:], "little")
            if tag >> 8 > latest:
                if tag & 255 not in (0, 1):
                    raise ValueError("Unsupported LevelDB key type")
                latest, result = tag >> 8, value if tag & 255 else None

    for number in tables:
        path = directory / f"{number:06}.ldb"
        if not path.exists():
            path = directory / f"{number:06}.sst"
        accept(_table_entries(path.read_bytes()))
    for path in directory.glob("*.log"):
        if path.stem.isdigit() and (int(path.stem) >= log_number or int(path.stem) == previous_log):
            for record in _records(path.read_bytes()):
                accept(_batch_entries(record))
    if (directory / "CURRENT").read_bytes() != current or manifest.stat().st_size != len(version):
        raise OSError("Claude group storage changed during reading")
    return result


def read_groups(directory=None):
    if directory is None:
        roaming = Path(os.environ.get("APPDATA", Path.home() / "AppData/Roaming"))
        directory = roaming / "Claude/Local Storage/leveldb"
    directory = Path(directory)
    if not directory.exists():
        return {}, []
    try:
        # A compaction can remove a table between reading MANIFEST and the table.
        for attempt in range(2):
            try:
                raw = _read_key(directory)
                break
            except OSError:
                if attempt:
                    raise
        if raw is None:
            return {}, []
        if not raw or raw[0] not in (0, 1):
            raise ValueError("Unsupported Chromium string encoding")
        state = json.loads(raw[1:].decode("utf-16-le" if raw[0] == 0 else "latin-1"))
        if not isinstance(state, dict) or not isinstance(state.get("value"), dict):
            raise ValueError("Unsupported Claude group state")
        result = {}
        for scope, value in state["value"].items():
            if not isinstance(value, dict) or not isinstance(value.get("groups"), list) or not isinstance(value.get("assignments"), dict):
                raise ValueError("Unsupported Claude group scope")
            groups = {group["id"]: {"id": group["id"], "name": group["name"]} for group in value["groups"]
                      if isinstance(group, dict) and isinstance(group.get("id"), str) and group["id"]
                      and isinstance(group.get("name"), str) and group["name"].strip()}
            for session, identifier in value["assignments"].items():
                if session.startswith("code:local_") and isinstance(identifier, str) and identifier in groups:
                    result[(scope, session.removeprefix("code:"))] = groups[identifier]
        return result, []
    except (OSError, ValueError, IndexError, struct.error) as error:
        return {}, ["Claude 원본 그룹을 읽지 못했습니다: " + str(error)]
