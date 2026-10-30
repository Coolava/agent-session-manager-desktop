# Codex 프로젝트 정보 분류 — 완료

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 프로젝트: D:/repos/intellian/Session_Manager_Desktop

## 구현 결과

- `desktop/bridge.py`는 Codex 전역 상태의 local 프로젝트/대화 배정을 읽는다. SQLite의 `threads.project_id`와 `projects`/`project_roots`를 사용할 수 있으면 우선하며, position 순 첫 루트가 대표 폴더다. 구형 DB와 상태 파일 부재도 지원한다.
- 프로젝트 미지정이 최우선이며, 알 수 없는/지원하지 않는 배정은 기존 cwd로 분류한다. 상태 파일 읽기, projectless 목록, 프로젝트 배정 형식 오류를 분리해 하나의 오류가 다른 유효한 분류나 세션 목록을 제거하지 않게 했다.
- `projectCwd`를 분류용 필드로 전달하고 사이드바 키·이름·정렬·툴팁과 검색에 반영했다. 같은 Windows 로컬 경로의 대소문자·구분자·끝 구분자 차이를 키에서 정규화하여 Claude의 원본 폴더 항목과도 합친다. SSH 키는 유지한다.
- 원래 cwd, ID, 열기 요청, 사용자 그룹과 부모·자식 구조는 보존한다. 분류는 부모 관계를 추정하지 않는다. 원본 SQLite와 상태 JSON은 읽기 전용이다.

## 검증

- 변경 전 신규 Python 테스트 2개가 projectCwd 부재로 실패하고, 신규 UI 테스트가 폴더 5개 대신 7개를 표시해 실패하는 것을 확인했다.
- `python -m unittest discover -s desktop -p 'test_*.py'`: 최종 29개 통과. 전역 배정·재조회·원본 파일 hash/내용 보존, SQLite 우선순위/루트 순서, 미지정 우선순위, 누락·손상·유효하지 않은 배정과 실패 분리를 확인했다.
- `npx playwright test --config playwright.desktop.config.mjs`: 26개 통과. worktree/Claude 합산, 다른 경로의 동명 폴더 분리, 빈 cwd, 프로젝트 미지정 우선순위, 대표 폴더/원래 경로 검색, 새로고침, 상세 경로·원래 세션 열기를 확인했다. 기존 그룹·트리·열기·상태 검증도 통과했다.
- `npm run check`: 오류 0개, 기존 경고 111개/29개 파일.
- `scripts/build-desktop.ps1`: 성공. `desktop/build/bin/desktop-session-manager.exe` 갱신.
- 빌드된 desktop/assets에 실제 읽기 전용 스냅샷을 주입한 UI 검증: 전체 432개 세션, Project Folders 27개, UDCM_Calibration 1개. 선택된 행의 전체 세션 키를 기대 141개(Claude 22개+Codex 119개)와 비교해 일치했다. 실제 worktree 5개 모두 대표 경로 D:/repos/intellian/UDCM_Calibration으로 반환된다. State 생성 계속 대화 검색도 확인했다. 스냅샷 경고와 브라우저 pageerror 없음.
- 모의/실제 UI 캡처를 시각 검토했다: `verification/desktop-codex-project-folders.png`, `verification/desktop-codex-project-folders-live.png`.
- 자체 diff 검토 및 `git diff --check` 통과. 의존성·원본 저장 형식·실행 프로토콜 변경 없음. 실제 대화 열기/그룹 쓰기는 하지 않았다. 실데이터 UI 주입 JSON/스크립트와 상세 로그는 무시되는 frontend/test-results에 보관했다.

## 적용 및 제한

- Desktop Session Manager를 다시 실행하면 새 실행 파일이 적용된다.
- 여러 루트의 프로젝트는 첫 루트를 대표로 사용한다. 같은 루트는 Project Folders 한 항목으로 묶는다. 프로젝트 표시 이름을 바꾸는 기능은 추가하지 않았다.
- Codex 내부 상태 키나 SQLite 스키마가 변경되면 재검증이 필요하다. 명시적 프로젝트 배정이 없으면 Git 경로나 worktree 이름으로 추정하지 않는다.
- 작업 변경만 scoped commit한다. 기존 untracked verification/desktop-replacement-backup은 제외한다.
