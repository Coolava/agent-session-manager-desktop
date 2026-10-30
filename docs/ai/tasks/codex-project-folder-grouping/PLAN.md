# Codex 프로젝트 정보로 Project Folders 분류

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 위험: Medium — 읽기 전용 메타데이터와 단일 화면의 분류 변경.
- 승인 근거: 프로젝트 배정 정보로 원본과 worktree를 묶는 설명에 대한 사용자의 구현 요청.
- 상태: Step 1 구현·검증 완료. 결과는 HANDOFF.md 참조.

## 확인 사실과 결정

- UDCM_Calibration의 worktree 대화 5개는 전역 상태의 `thread-project-assignments`에서 같은 local 프로젝트에 배정되어 있다. `local-projects`의 `rootPaths`는 원본 저장소를 가리킨다.
- SQLite에는 `projects`, `project_roots`, `threads.project_id`도 있지만 현재 실제 세션의 project_id는 모두 NULL이다. 새 형식과 구형 전역 상태를 함께 지원한다.
- 우선순위: 명시적 프로젝트 미지정 → SQLite의 유효한 프로젝트 배정 → 전역 상태의 유효한 local 배정 → 기존 cwd.
- 여러 루트의 프로젝트는 position 순 첫 번째 루트를 대표 폴더로 쓴다. 같은 루트의 Claude와 Codex는 기존 Project Folders 의미에 맞게 합친다. Windows 드라이브 절대 경로는 구분자·대소문자·끝 구분자를 키에서 정규화한다.
- 분류용 선택 필드 `projectCwd`를 추가한다. 원래 cwd, ID, 세션 열기, 사용자 GROUPS, Claude 부모·자식 관계와 SSH 분류는 보존한다. 부모 관계를 추측하거나 worktree 이름으로 프로젝트를 추정하지 않는다.
- 파일 부재·알 수 없는 배정은 cwd로 돌아간다. 읽기/형식 오류는 알림과 함께 목록을 유지한다. projectless 해석과 프로젝트 정보 해석은 서로 실패를 전파하지 않는다.

## Step 1 — 읽기·분류·검증

1. bridge와 기존 Desktop 모델/화면에 projectCwd를 전달하고 목록 키·이름·정렬·툴팁·검색에서 사용한다.
2. Python 테스트로 JSON/SQLite 우선순위, 루트 순서, 미지정, 갱신, 누락·손상, 원본 보존을 확인한다. 브라우저 테스트로 worktree 통합, Claude 합산, 다른 루트 분리, 검색·갱신·상세·열기 보존을 확인한다.
3. Python Desktop 전체 테스트, Desktop Playwright, npm check, Windows 빌드, 실제 메타데이터를 사용한 UI 확인과 캡처, diff 자체 검토를 수행한다.
4. HANDOFF에 결과를 기록하고 이 범위만 commit한다. 기존 untracked verification/desktop-replacement-backup은 제외한다.

- 예상 변경: desktop/bridge.py, desktop/test_bridge.py, frontend/src/DesktopApp.svelte, frontend/src/lib/utils/desktopSessionTree.ts, frontend/tests/desktop/sessions.spec.mjs, 작업 문서와 검증 캡처.
- 체크포인트: `Group desktop sessions using Codex project assignments`.
