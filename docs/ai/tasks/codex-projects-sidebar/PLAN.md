# Codex 원본 프로젝트 목록 분리

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 승인: 사용자가 CODEX PROJECTS를 별도 영역으로 표시하라는 제안에 구현을 요청했다.
- 위험: Medium — 읽기 전용 bridge 필드와 사이드바 분류 변경.
- 상태: Step 1 구현·검증 완료. 결과는 HANDOFF.md 참조.

## 결정

- 명시적 프로젝트 배정이 있는 Codex 대화를 CODEX PROJECTS에 표시한다. 프로젝트 원래 이름과 ID를 전달하며, 이름·루트 경로가 같아도 서로 다른 ID나 Claude 그룹/일반 폴더와 병합하지 않는다.
- SQLite 프로젝트 우선, 기존 전역 상태 배정 fallback, 프로젝트 미지정 최우선은 유지한다. 유효한 대표 루트가 있는 기존 지원 프로젝트를 대상으로 한다. 이름이 없으면 대표 루트의 폴더명을 사용한다.
- 현재 CODEX_HOME에 해당하는 명시적 legacy→native ID 매핑이 있고 native 프로젝트도 유효하면 같은 프로젝트 ID로 정규화한다. 다른 호스트의 매핑은 사용하지 않는다.
- 미지정 대화는 이 컴퓨터, 프로젝트 배정이 없는 대화는 기존 폴더 분류에 남는다. 현재 실제 데이터 기준 각각 57개/137개이며 프로젝트 배정은 116개다. cwd만 보고 배정을 추측하지 않는다.
- 원래 cwd, ID, 열기, 검색·새로고침, Claude 원본 그룹/트리, 사용자 GROUPS 저장·편집을 유지한다. 제품 의존성·원본 저장 데이터·공용 Python/Tk 코드는 변경하지 않는다.

## Step 1

1. bridge의 선택 필드 codexProject에 ID/이름을 전달하고 기존 projectCwd를 보존한다.
2. CODEX PROJECTS 영역과 프로젝트 ID 기반 키·필터·검색·상세 표시를 추가한다. 해당 대화는 PROJECT FOLDERS에서 제외한다.
3. Python에서 원본 이름/ID·SQLite 우선순위·명시적 ID 매핑/호스트 격리·fallback·미지정 우선순위·원본 보존을, 브라우저에서 worktree 통합·이름/경로가 같은 다른 ID/제공자/폴더 분리·갱신·검색·상세/열기를 검증한다.
4. 전체 Desktop Python/Playwright, npm check, Windows 빌드, 실제 스냅샷 UI와 캡처, 자체 diff 검토를 완료하고 HANDOFF와 scoped commit을 남긴다.

- 예상 파일: desktop/bridge.py, desktop/test_bridge.py, frontend/src/DesktopApp.svelte, frontend/src/lib/utils/desktopSessionTree.ts, frontend/tests/desktop/sessions.spec.mjs, 작업 문서/검증 캡처.
- 체크포인트: `Show Codex projects in a separate sidebar section`.
- 기존 untracked verification/desktop-replacement-backup은 제외한다.
