# Codex 프로젝트 미지정 대화 자동 묶음

- 날짜: 2026-10-30 (Asia/Seoul)
- 단계: 완료
- 스킬: software-change-workflow
- 대상: `D:/repos/intellian/Session_Manager_Desktop`

## 구현

- `desktop/bridge.py`가 기존 Codex SQLite 인덱스와 같은 `CODEX_HOME`의 `.codex-global-state.json`에서 `projectless-thread-ids`를 읽고, 각 Codex 세션의 ID에 대응하는 `projectless` 불리언을 반환한다.
- 경로 이름·기본 작업 경로·DB의 비어 있는 `project_id`를 분류 근거로 사용하지 않는다. 실제 전역 상태 목록에는 저장소 cwd를 가진 대화도 포함돼 있다.
- 상태 파일 부재 시 기존 폴더 분류를 유지한다. 손상 JSON·지원하지 않는 형식·읽기 오류 시 알림을 반환하고 세션 조회는 유지한다. 원본 상태 파일과 SQLite는 수정하지 않는다.
- `frontend/src/DesktopApp.svelte`에서 로컬 Codex의 `projectless === true`와 기존 로컬 Claude scratch 조건을 ‘이 컴퓨터’ 공통 키로 묶는다. 환경·호스트는 키에 유지한다.
- 명시적 프로젝트 미지정 세션은 cwd가 비어 있어도 사이드바에 포함한다. 일반 Codex 세션, SSH, 사용자 GROUPS와 세션 ID·원래 작업 경로는 유지한다.
- 변경 파일: 위 Python/Svelte, `desktop/test_bridge.py`, `frontend/tests/desktop/sessions.spec.mjs`, 이 작업 문서와 `verification/desktop-codex-projectless.png`.

## 검증

- `python -m unittest discover -s desktop -p 'test_*.py' -v`: 22개 통과. 같은 cwd의 서로 다른 ID 분류, 전역 상태 변경 후 재조회, 손상/형식 오류/읽기 오류 시 조회 유지, 파일과 DB 보존을 확인했다.
- `npm run check`: 오류 0개, 기존 경고 111개/29개 파일.
- `npx playwright test --config playwright.desktop.config.mjs`: 최종 12개 통과. 제공자 통합, 빈 cwd, 검색·새로고침·열기 요청과 원래 경로 보존, 같은 cwd의 일반 Codex 대화와 미지정 대화 구분을 확인했다.
- 최초 브라우저 실행은 신규 검색 검증 1개가 실패했다. `Codex local`은 환경명 local에도 일치하므로 두 행이 정상 반환됐다. 테스트 검색어를 `SessionManager Codex`로 바꿔 경로 기반 검색으로 검증했고 전체 재실행이 통과했다. 제품 검색 코드는 바꾸지 않았다.
- `scripts/build-desktop.ps1`: 성공. `desktop/build/bin/desktop-session-manager.exe` 갱신.
- 빌드된 `desktop/assets` 화면에 실제 읽기 전용 스냅샷을 공급한 UI 검증: 전체 428개 세션, ‘이 컴퓨터’ 1개, Claude 13개+Codex 57개=70개 대화. 표시된 대화 제목 전체를 기대 목록과 비교했다. 통합 후 Project Folders 36개. 경고 없음.
- 새 모의 데이터 캡처를 시각 확인했다. ‘이 컴퓨터’ 한 항목에서 Claude·Codex·빈 작업 경로 대화가 함께 표시된다.
- 자체 diff 검토 및 `git diff --check` 통과. 의존성·원본 저장 형식·실행/열기 프로토콜 변경 없음. 실제 대화 열기·그룹 변경은 요청하지 않았다.
- 작업 파일만 scoped commit한다. 기존 untracked `verification/desktop-replacement-backup/`은 제외한다.

## 적용과 제한

- Desktop Session Manager를 다시 실행하면 갱신된 실행 파일이 적용된다.
- Codex 내부 상태의 `projectless-thread-ids` 키가 변경되면 재검증이 필요하다. 분류 정보 부재 시 경로 기반 추측을 추가하지 않는다.
- 실제 데이터 UI 검증의 JSON/스크립트는 무시되는 `frontend/test-results/codex-projectless-live.*`에 보관했다.
