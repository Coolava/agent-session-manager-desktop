"""Read Codex's persisted turn states without loading a thread or sending input."""

from contextlib import closing
import os
from pathlib import Path
import sqlite3
import subprocess
import time


def _runtime_started_at():
    if os.name != "nt":
        return None
    powershell = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"
    script = ("Get-Process -Name codex,codex-code-mode-host -ErrorAction SilentlyContinue | "
              "ForEach-Object { try { ([DateTimeOffset]$_.StartTime).ToUnixTimeSeconds() } catch {} } | "
              "Measure-Object -Minimum | Select-Object -ExpandProperty Minimum")
    try:
        result = subprocess.run([str(powershell), "-NoProfile", "-NonInteractive", "-Command", script],
                                capture_output=True, text=True, timeout=5, creationflags=subprocess.CREATE_NO_WINDOW)
        return float(result.stdout.strip()) if result.returncode == 0 and result.stdout.strip() else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def codex_activities(sessions, home, checked_at=None):
    checked_at = time.time() if checked_at is None else checked_at

    def observed(state, detail):
        return {"state": state, "detail": detail, "observed_at": checked_at, "source": "codex_history"}

    result = {s["key"]: observed("unknown", "Codex의 최근 턴 이력을 확인하지 못했습니다.") for s in sessions}
    if not sessions:
        return result
    try:
        databases = sorted(Path(home).glob("thread_history_*.sqlite"), key=lambda p: int(p.stem.split("_")[-1]), reverse=True)
        if not databases:
            return result
        with closing(sqlite3.connect(databases[0].resolve().as_uri() + "?mode=ro", uri=True, timeout=2)) as connection:
            connection.row_factory = sqlite3.Row
            required = {"thread_id", "turn_id", "rollout_ordinal", "status", "started_at", "completed_at"}
            if not required <= {row[1] for row in connection.execute("PRAGMA table_info(thread_turns)")}:
                raise ValueError("지원하지 않는 Codex 턴 이력 형식입니다.")
            turns = {row["thread_id"]: dict(row) for row in connection.execute(
                "SELECT t.thread_id, t.turn_id, t.status, t.started_at, t.completed_at FROM thread_turns t "
                "WHERE NOT EXISTS (SELECT 1 FROM thread_turns n WHERE n.thread_id = t.thread_id "
                "AND n.rollout_ordinal > t.rollout_ordinal)")}
        runtime_start = _runtime_started_at() if any(turns.get(s["id"], {}).get("status") == "inProgress" for s in sessions) else None
        for session in sessions:
            turn = turns.get(session["id"])
            if not turn:
                continue
            status = turn["status"]
            detail = f"Codex 최근 턴 {turn['turn_id']} · {status}. "
            if status == "completed":
                result[session["key"]] = observed("completed", detail + "최근 응답이 정상 종료되었습니다. 전체 업무 완료를 판정하지 않습니다.")
            elif status == "inProgress":
                if runtime_start is None:
                    result[session["key"]] = observed("unknown", detail + "진행 기록은 있으나 현재 Codex 실행 프로세스를 확인하지 못했습니다.")
                elif turn["started_at"] is None or turn["started_at"] < runtime_start:
                    result[session["key"]] = observed("unknown", detail + "현재 Codex 프로세스 시작 전의 미종료 기록이라 작업 중으로 판정하지 않습니다.")
                else:
                    result[session["key"]] = observed("working", detail + "현재 실행 수명 중 시작된 턴의 종료가 아직 기록되지 않았습니다. 도구 실행·승인 대기가 포함될 수 있습니다.")
            elif status == "interrupted":
                result[session["key"]] = observed("interrupted", detail + "최근 응답이 중단되었습니다. 정상 완료가 아닙니다.")
            elif status == "failed":
                result[session["key"]] = observed("error", detail + "최근 응답이 오류로 종료되었습니다.")
            else:
                result[session["key"]] = observed("unknown", detail + "알 수 없는 턴 상태입니다.")
    except (OSError, ValueError, sqlite3.Error) as error:
        return {s["key"]: observed("unknown", "Codex 상태 조회 실패: " + str(error)) for s in sessions}
    return result
