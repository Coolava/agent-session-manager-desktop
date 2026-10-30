# Codex 프로젝트 미지정 대화 자동 묶음

- 날짜: 2026-10-30 (Asia/Seoul)
- 요청: Codex에서도 폴더를 별도로 지정하지 않은 대화를 자동 분류한다.
- 스킬: software-change-workflow
- 범위: 기존 ‘이 컴퓨터’ 표시 분류를 Codex로 확장한다. 사용자의 후속 요청에 따라 구현한다.
- 위험: Medium — 읽기 전용 bridge 응답에 선택적 표시 플래그를 추가하고 기존 화면 분류에 사용한다. 원본 저장 형식·데이터·실행·그룹 저장은 변경하지 않는다.

## 확인 사실과 결정

- Codex의 `CODEX_HOME/.codex-global-state.json`에는 명시적인 `projectless-thread-ids` 배열이 있다.
- 현재 조회되는 Codex 대화 307개 중 57개가 이 목록에 포함되며, 작업 경로는 39개다. 이 중 19개는 일반 저장소 경로이므로 경로 이름·날짜나 DB `project_id IS NULL`만으로 분류하면 UI의 실제 프로젝트 미지정 상태와 달라진다.
- 이전 기본 작업 경로 `Documents/Codex/<date>/<name>`와 현재 `F:/Codex/LocalSession/<date>/<name>`를 모두 명시적 ID 목록으로 처리한다. 특정 사용자 경로를 하드코딩하지 않는다.
- 로컬 Claude scratch 및 Codex 프로젝트 미지정 대화는 같은 환경·호스트의 ‘이 컴퓨터’ 하나로 합친다. 상세 화면과 세션 ID는 보존한다.

## Step 1 — 메타데이터 전달·화면 분류 확장

- `desktop/bridge.py`: 전역 상태 파일을 읽기 전용으로 열고 Codex 세션에 `projectless` 불리언을 전달한다. 파일이 없으면 기존 경로 분류를 유지한다. 손상·형식 변경·읽기 실패는 알림을 반환하고 대화 조회는 유지한다.
- `frontend/src/DesktopApp.svelte`: 로컬 Codex의 `projectless === true`를 기존 ‘이 컴퓨터’ 판별에 추가하고 Claude와 공통 키를 사용한다. 빈 cwd도 명시적 프로젝트 미지정 세션이면 사이드바 묶음에 포함한다.
- `desktop/test_bridge.py`, `frontend/tests/desktop/sessions.spec.mjs`: 일반 경로에 명시된 ID와 같은 경로의 미지정되지 않은 ID를 구분하고, 상태 갱신·손상 파일 보존·누락 파일, 두 제공자 합산·빈 cwd·검색·선택·열기·일반 프로젝트 보존을 검증한다.
- 검증: Python Desktop 테스트, 기존 Desktop 브라우저 테스트, `npm run check`, Windows 빌드, 실제 메타데이터를 주입한 읽기 전용 UI 확인, 캡처 시각 확인, `git diff --check`와 자체 diff 검토.
- 완료 후 scoped commit: `Group Codex projectless chats under this computer`.

## 제한

- 전역 상태 파일의 내부 키가 바뀌면 재확인이 필요하다. 명시적 목록을 사용할 수 없을 때 경로 패턴이나 프로젝트 ID 부재를 근거로 추측하지 않는다.
