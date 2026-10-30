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
from claude_groups import read_groups as read_claude_groups


def codex_home():
    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))


def project_root(paths):
    if isinstance(paths, list) and paths and isinstance(paths[0], str) and paths[0].strip():
        return paths[0].removeprefix("\\\\?\\")
    return ""


def project_info(identifier, name, root):
    if not isinstance(identifier, str) or not identifier or not root:
        return None
    label = name if isinstance(name, str) and name.strip() else root.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]
    return {"id": identifier, "name": label, "root": root}


def codex_sessions(home=None):
    home = Path(home) if home is not None else codex_home()
    databases = sorted(home.glob("state_*.sqlite"), key=lambda p: int(p.stem.split("_")[-1]), reverse=True)
    if not databases:
        return [], ["Codex의 로컬 세션 데이터베이스를 찾지 못했습니다."]
    state, projectless_ids, warnings = {}, set(), []
    try:
        state = json.loads((home / ".codex-global-state.json").read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            raise ValueError("지원하지 않는 Codex 전역 상태 형식입니다.")
    except FileNotFoundError:
        pass
    except (OSError, ValueError) as error:
        state = {}
        warnings.append("Codex 프로젝트 분류를 읽지 못했습니다: " + str(error))
    try:
        identifiers = state.get("projectless-thread-ids", [])
        if not isinstance(identifiers, list) or any(not isinstance(value, str) for value in identifiers):
            raise ValueError("지원하지 않는 Codex 프로젝트 미지정 목록 형식입니다.")
        projectless_ids = set(identifiers)
    except ValueError as error:
        warnings.append("Codex 프로젝트 미지정 대화 분류를 읽지 못했습니다: " + str(error))
    assignments, legacy_projects = {}, {}
    try:
        projects = state.get("local-projects", {})
        assignments = state.get("thread-project-assignments", {})
        if not isinstance(projects, dict) or not isinstance(assignments, dict):
            raise ValueError("지원하지 않는 Codex 프로젝트 배정 형식입니다.")
        legacy_projects = {key: project_info(key, value.get("name"), project_root(value.get("rootPaths")))
                           for key, value in projects.items() if isinstance(value, dict)}
    except ValueError as error:
        assignments = {}
        warnings.append("Codex 프로젝트 배정을 읽지 못했습니다: " + str(error))
    aliases = {}
    mappings = state.get("app-server-project-id-by-legacy-project-id-by-host", {})
    if isinstance(mappings, dict):
        for location in (str(home.resolve()), str(home)):
            mapping = mappings.get("local:" + location)
            if isinstance(mapping, dict):
                aliases.update({key: value for key, value in mapping.items() if isinstance(value, str)})
    sessions = []
    with closing(sqlite3.connect(databases[0].resolve().as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
        connection.row_factory = sqlite3.Row
        columns = {row[1] for row in connection.execute("PRAGMA table_info(threads)")}
        required = {"id", "title", "cwd", "updated_at", "archived"}
        if not required <= columns:
            raise ValueError("지원하지 않는 Codex 세션 데이터베이스 형식입니다.")
        name = "name" if "name" in columns else "NULL AS name"
        project_id = "project_id" if "project_id" in columns else "NULL AS project_id"
        native_projects = {}
        project_columns = {row[1] for row in connection.execute("PRAGMA table_info(projects)")}
        root_columns = {row[1] for row in connection.execute("PRAGMA table_info(project_roots)")}
        if {"id"} <= project_columns and {"project_id", "position", "path"} <= root_columns:
            try:
                project_name = "p.name" if "name" in project_columns else "NULL AS name"
                for row in connection.execute(f"SELECT p.id, {project_name}, r.path FROM projects p JOIN project_roots r ON r.project_id = p.id ORDER BY r.position"):
                    native_projects.setdefault(row["id"], project_info(row["id"], row["name"], project_root([row["path"]])))
            except sqlite3.Error as error:
                warnings.append("Codex 프로젝트 루트를 읽지 못했습니다: " + str(error))
        recency = "COALESCE(recency_at_ms, updated_at * 1000) AS recency_at_ms" if "recency_at_ms" in columns else "updated_at * 1000 AS recency_at_ms"
        visible = "archived = 0"
        if "thread_source" in columns:
            visible += " AND (thread_source IS NULL OR thread_source NOT IN ('subagent', 'guardian_review'))"
        if "source" in columns:
            visible += " AND source NOT LIKE '%subagent%'"
        for row in connection.execute(f"SELECT id, title, {name}, cwd, {project_id}, {recency} FROM threads WHERE {visible}"):
            identifier = str(UUID(row["id"]))
            member = ["codex", "local", identifier]
            assignment = assignments.get(identifier)
            legacy_project = None
            if isinstance(assignment, dict) and assignment.get("projectKind") == "local" and isinstance(assignment.get("projectId"), str):
                legacy_id = assignment["projectId"]
                legacy_project = native_projects.get(aliases.get(legacy_id)) or legacy_projects.get(legacy_id)
            project = None if identifier in projectless_ids else native_projects.get(row["project_id"]) or legacy_project
            sessions.append({"key": json.dumps(member, separators=(",", ":")), "member": member,
                             "provider": "codex", "id": identifier, "title": row["name"] or row["title"] or identifier,
                             "cwd": (row["cwd"] or "").removeprefix("\\\\?\\"), "environment": "local", "host": "local",
                             "projectless": identifier in projectless_ids,
                             "projectCwd": project["root"] if project else "",
                             "codexProject": {key: project[key] for key in ("id", "name")} if project else None,
                             "lastActivity": row["recency_at_ms"] or 0})
    return sessions, warnings


def claude_sessions(manager):
    source_groups, warnings = read_claude_groups()
    result = []
    for session in manager.list_sessions():
        if session.environment not in ("local", "ssh"):
            continue
        member = ["claude", session.account_id + ":" + session.organization_id, session.id]
        parent = ["claude", member[1], session.parent_session_id] if session.parent_session_id else None
        result.append({"key": json.dumps(member, separators=(",", ":")), "member": member,
                       "provider": "claude", "id": session.id, "title": session.title, "cwd": session.origin_cwd or session.cwd,
                       "environment": session.environment, "host": (session.ssh.host + (f":{session.ssh.port}" if session.ssh.port != 22 else "")) if session.ssh else "local",
                       "account": session.account_id, "organization": session.organization_id, "lastActivity": session.last_activity_at,
                       "parentKey": json.dumps(parent, separators=(",", ":")) if parent else None,
                       "childName": session.side_session_name,
                       "claudeGroup": source_groups.get((session.account_id + "/" + session.organization_id, session.id))})
    return result, [str(warning) for warning in manager.store.warnings] + warnings


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
