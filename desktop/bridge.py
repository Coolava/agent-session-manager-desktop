"""Desktop metadata and window bridge; never submits a model prompt."""

from dataclasses import asdict
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import sys
from uuid import UUID

MODULE_ROOT = Path(os.environ.get("SESSION_MANAGER_PYTHON_ROOT", Path(__file__).resolve().parents[2] / "Session_Manager"))
sys.path.insert(0, str(MODULE_ROOT))
from session_manager import ManagerError, SessionManager
from session_manager.groups import GroupStore
from codex_activity import codex_activities


def codex_home():
    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))


def codex_sessions(home=None):
    home = Path(home) if home is not None else codex_home()
    databases = sorted(home.glob("state_*.sqlite"), key=lambda p: int(p.stem.split("_")[-1]), reverse=True)
    if not databases:
        return [], ["Codex의 로컬 세션 데이터베이스를 찾지 못했습니다."]
    sessions = []
    with closing(sqlite3.connect(databases[0].resolve().as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
        connection.row_factory = sqlite3.Row
        columns = {row[1] for row in connection.execute("PRAGMA table_info(threads)")}
        required = {"id", "title", "cwd", "updated_at", "archived"}
        if not required <= columns:
            raise ValueError("지원하지 않는 Codex 세션 데이터베이스 형식입니다.")
        name = "name" if "name" in columns else "NULL AS name"
        recency = "COALESCE(recency_at_ms, updated_at * 1000) AS recency_at_ms" if "recency_at_ms" in columns else "updated_at * 1000 AS recency_at_ms"
        visible = "archived = 0"
        if "thread_source" in columns:
            visible += " AND (thread_source IS NULL OR thread_source NOT IN ('subagent', 'guardian_review'))"
        if "source" in columns:
            visible += " AND source NOT LIKE '%subagent%'"
        for row in connection.execute(f"SELECT id, title, {name}, cwd, {recency} FROM threads WHERE {visible}"):
            identifier = str(UUID(row["id"]))
            member = ["codex", "local", identifier]
            sessions.append({"key": json.dumps(member, separators=(",", ":")), "member": member,
                             "provider": "codex", "id": identifier, "title": row["name"] or row["title"] or identifier,
                             "cwd": (row["cwd"] or "").removeprefix("\\\\?\\"), "environment": "local", "host": "local",
                             "lastActivity": row["recency_at_ms"] or 0})
    return sessions, []


def claude_sessions(manager):
    result = []
    for session in manager.list_sessions():
        if session.environment not in ("local", "ssh"):
            continue
        member = ["claude", session.account_id + ":" + session.organization_id, session.id]
        result.append({"key": json.dumps(member, separators=(",", ":")), "member": member,
                       "provider": "claude", "id": session.id, "title": session.title, "cwd": session.origin_cwd or session.cwd,
                       "environment": session.environment, "host": (session.ssh.host + (f":{session.ssh.port}" if session.ssh.port != 22 else "")) if session.ssh else "local",
                       "account": session.account_id, "organization": session.organization_id, "lastActivity": session.last_activity_at})
    return result, [str(warning) for warning in manager.store.warnings]


def group_store():
    roaming = Path(os.environ.get("APPDATA", Path.home() / "AppData/Roaming"))
    return GroupStore(roaming / "DesktopSessionManager/groups.json")


def snapshot(manager):
    sessions, warnings = claude_sessions(manager)
    try:
        codex, notices = codex_sessions()
        sessions.extend(codex)
        warnings.extend(notices)
    except (OSError, ValueError, sqlite3.Error) as error:
        warnings.append("Codex 조회 실패: " + str(error))
    groups, group_error = [], ""
    try:
        groups = [asdict(group) for group in group_store().load()]
    except ManagerError as error:
        group_error = error.message
    return {"sessions": sorted(sessions, key=lambda s: s["lastActivity"], reverse=True),
            "groups": groups, "warnings": warnings, "groupError": group_error}


def resolve_session(manager, key):
    # Resolve against current metadata; frontend-supplied titles/paths are never executable input.
    provider, _, _ = json.loads(key)
    if provider == "claude":
        sessions, _ = claude_sessions(manager)
    elif provider == "codex":
        sessions, _ = codex_sessions()
    else:
        raise ValueError("지원하지 않는 Desktop 앱입니다.")
    matches = [session for session in sessions if session["key"] == key]
    if len(matches) != 1:
        raise ValueError("해당 세션을 찾을 수 없습니다. 목록을 새로고침하세요.")
    return matches[0]


def dispatch(request, manager=None):
    manager = manager or SessionManager()
    action = request["action"]
    if action == "snapshot":
        return snapshot(manager)
    if action == "codex-activities":
        sessions, _ = codex_sessions()
        return codex_activities(sessions, codex_home())
    if action == "activities":
        sessions = manager.list_sessions()
        by_key = {}
        identities = {(s.account_id, s.organization_id, s.id): s for s in sessions}
        for batch in manager.iter_activities(sessions):
            for identity, activity in batch.items():
                session = identities[identity]
                key = json.dumps(["claude", session.account_id + ":" + session.organization_id, session.id], separators=(",", ":"))
                by_key[key] = asdict(activity)
        return by_key
    if action == "open":
        session = resolve_session(manager, request["key"])
        url = ("claude://claude.ai/epitaxy/" + session["id"] if session["provider"] == "claude"
               else "codex://threads/" + str(UUID(session["id"])))
        os.startfile(url)
        return {"requested": True, "provider": session["provider"], "session_id": session["id"]}
    store = group_store()
    if action == "create-group":
        return asdict(store.create(request["name"]))
    if action == "rename-group":
        return [asdict(group) for group in store.rename(request["id"], request["name"])]
    if action == "delete-group":
        return [asdict(group) for group in store.delete(request["id"])]
    if action in ("add-member", "remove-member"):
        session = resolve_session(manager, request["key"])
        return [asdict(group) for group in store.set_members(request["id"], [session["member"]], add=action == "add-member")]
    raise ValueError("지원하지 않는 동작입니다.")


def main():
    try:
        request = json.load(sys.stdin)
        result = {"ok": True, "data": dispatch(request)}
    except (ManagerError, OSError, ValueError, KeyError, sqlite3.Error) as error:
        result = {"ok": False, "error": error.message if isinstance(error, ManagerError) else str(error)}
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
