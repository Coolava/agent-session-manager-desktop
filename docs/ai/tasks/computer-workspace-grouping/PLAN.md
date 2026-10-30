# Claude 임시 작업공간 자동 묶음

- 날짜: 2026-10-30 (Asia/Seoul)
- 요청: Claude Desktop의 ‘이 컴퓨터’처럼 scratch 작업공간을 자동으로 묶는다.
- 스킬: software-change-workflow
- 위험: Medium — 단일 화면의 폴더 분류·필터 변경. 원본 메타데이터와 저장 형식은 변경하지 않는다.
- 실행 범위: 사용자의 자동 grouping 요청에 따라 아래 표시 변경을 구현한다.

## 확인 사실과 가정

- Project Folders는 조회한 세션의 환경·호스트·cwd를 중복 제거한 목록이다.
- 현재 scratch 항목은 모두 로컬 Claude이며 `scratch-workspaces/<account>/<organization>/scratch-...` 경로를 갖는다. 현재 스냅샷은 10개 경로, 13개 세션이다.
- 별도의 프로젝트/그룹 식별자는 조회 모델에 없다. Claude 자체 UI의 정확한 내부 분류 규칙은 확인하지 않았다.
- 사용자가 말한 자동 grouping은 이 scratch 항목들을 ‘이 컴퓨터’ 하나로 합치는 것으로 해석한다. 일반 프로젝트와 사용자 GROUPS는 기존대로 둔다.

## Step 1 — 표시·필터 구현 및 검증

- `frontend/src/DesktopApp.svelte`에서 로컬 Claude 내부 scratch 경로에 공통 폴더 키와 ‘이 컴퓨터’ 이름을 사용한다.
- 일반 프로젝트의 `scratch-...` 이름만으로는 분류하지 않는다. Codex·SSH 세션도 이 묶음에 넣지 않는다.
- 묶음 클릭, 검색, 새로고침, 대화 선택·열기는 기존 세션 ID로 동작해야 한다. 상세 화면의 원래 경로는 보존한다.
- 변경 범위: 위 Svelte 파일, 관련 기존 브라우저 검증, 이 작업 문서. Python/Go와 그룹 저장 파일은 변경하지 않는다.
- 검증: 실제 스냅샷 분류 확인, Desktop 브라우저 테스트(여러 scratch 폴더의 합산·필터·검색·새로고침·열기·일반 폴더 보존), `npm run check`, `scripts/build-desktop.ps1`, UI 캡처 확인, `git diff --check`.
- 완료 후 scoped commit: `Group Claude scratch workspaces under this computer`.

## 위험과 제한

- Claude 내부 경로 구조가 바뀌면 분류 규칙 재확인이 필요하다. 현재 관찰한 디렉터리 구조로만 제한하여 일반 프로젝트 오분류를 줄인다.
- Claude 앱에서 ‘이 컴퓨터’에 포함되는 모든 종류의 세션을 완전히 재현한다고 보장하지 않는다. 이번 범위는 확인된 scratch 작업공간이다.
