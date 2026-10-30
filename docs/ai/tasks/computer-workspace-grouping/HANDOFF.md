# Claude ‘이 컴퓨터’ 자동 묶음

- 날짜: 2026-10-30 (Asia/Seoul)
- 단계: 완료
- 스킬: software-change-workflow
- 대상: `D:/repos/intellian/Session_Manager_Desktop`

## 완료 내용

- `frontend/src/DesktopApp.svelte`에서 로컬 Claude의 `scratch-workspaces/<account>/<organization>/scratch-...` 경로에 공통 키와 ‘이 컴퓨터’ 이름을 사용한다. 슬래시·역슬래시·대소문자와 끝 구분자를 처리한다.
- Project Folders에 하나의 항목으로 표시하고 선택하면 해당 대화를 모두 보여준다. 기존 경로 기반 필터가 같은 공통 키를 사용한다.
- 일반 프로젝트, Codex, SSH는 기존 경로 분류를 유지한다. 사용자 GROUPS, 원본 메타데이터, Python/Go 인터페이스는 변경하지 않았다.
- 검색·새로고침·대화 열기는 기존 동작을 사용한다. 세션 행과 상세 화면에는 원래 경로를 보존한다.
- 변경 파일: 위 Svelte 파일, `frontend/tests/desktop/sessions.spec.mjs`, 이 작업의 PLAN/HANDOFF, `verification/desktop-computer-workspaces.png`.

## 검증 결과

- `npm run check`: 오류 0개, 기존 경고 111개/29개 파일.
- `npx playwright test --config playwright.desktop.config.mjs`: 11개 통과. 기존 9개와 신규 2개(여러 scratch 경로 합산·검색·새로고침·실제 ID 열기 요청, 일반 scratch 프로젝트·Codex·SSH 경계)를 확인했다.
- `scripts/build-desktop.ps1`: 성공. `desktop/build/bin/desktop-session-manager.exe`를 갱신했다.
- 새 브라우저 캡처에서 ‘이 컴퓨터’ 하나와 필터된 대화 2개를 시각 확인했다.
- 실제 읽기 전용 메타데이터를 브라우저 bridge 응답으로 공급한 검증: 전체 428개 세션, scratch 경로 10개가 ‘이 컴퓨터’ 1개로 합쳐지고 13개 대화가 조회됐다. 통합 후 Project Folders는 74개다.
- 실제 데이터 검증용 스크립트/JSON은 무시되는 `frontend/test-results/computer-grouping-live.*`에 보관했다. 상태/열기/그룹 변경은 실제 앱에 요청하지 않았다.
- 자체 diff 검토: 표시 분류·선택 키가 일치하며 일반 경로 키와 충돌하지 않는다. 저장 데이터 변경과 의존성 추가가 없다. `git diff --check` 통과.
- 검증 후 이 작업 파일만 scoped commit한다. 기존 untracked `verification/desktop-replacement-backup/`은 제외한다.

## 제한과 적용

- 사용자의 ‘이 컴퓨터’ 해석을 기준으로 확인된 scratch 작업공간을 묶었다. Claude 자체 화면의 전체 분류 규칙을 복제한 것은 아니다. 내부 경로 구조가 바뀌면 재확인이 필요하다.
- 빌드 당시 실행 중인 `desktop-session-manager` 프로세스는 없었다. 다음 실행부터 갱신된 바이너리가 적용된다.
- 실제 Claude 대화 열기는 실행하지 않았다. 브라우저에서 열기 요청이 올바른 원본 key를 사용하는지 검증했다.
