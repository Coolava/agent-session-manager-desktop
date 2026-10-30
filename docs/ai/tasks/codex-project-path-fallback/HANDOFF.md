# Codex 등록 프로젝트 경로 보조 분류 — 완료

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 대상: D:/repos/intellian/Session_Manager_Desktop

## 변경

- `desktop/bridge.py`가 SQLite와 기존 전역 상태의 모든 유효한 프로젝트 루트를 경로 후보로 수집한다. 기존 대표 루트는 표시용으로 유지하고 보조 루트도 매칭에 사용한다.
- 배정이 없는 로컬 Codex 대화의 cwd를 프로젝트 루트/하위 폴더와 비교한다. Windows 경로의 대소문자·구분자·끝 구분자·점 경로를 정규화하고, POSIX는 대소문자를 보존한다. 절대 경로만 사용하며 폴더 경계·드라이브·UNC 서버 경계를 구분한다.
- 가장 긴 일치 루트를 선택하고, 해당 길이에 프로젝트 ID가 하나일 때만 배정한다. 같은 ID의 중복 루트는 허용하지만 서로 다른 ID의 동률에서는 기존 폴더 분류를 유지한다.
- 프로젝트 미지정과 명시적 SQLite/전역 상태 배정이 우선한다. 유효한 프로젝트를 찾지 못하는 명시적 배정이나 remote 배정도 다른 local 프로젝트로 경로 추정하지 않는다.
- 현재 CODEX_HOME의 기존 ID 매핑을 재사용한다. native 프로젝트가 유효하면 stale legacy 루트는 후보에서 제외한다. 이름/경로 유사성으로 프로젝트를 병합하지 않는다.
- 기존 codexProject 응답을 사용하므로 프런트엔드/Claude 분류/사용자 GROUPS/열기 프로토콜 변경은 없다. cwd/세션 키는 그대로이고 원본 파일에는 쓰지 않는다.

## 검증

- 신규 핵심 테스트의 exact/하위/보조 루트 및 최장 루트 검증이 구현 전 실패하는 것을 확인했다.
- `python -m unittest discover -s desktop -p 'test_*.py'`: 최종 47개 통과. Windows 표기/점 경로와 원본 hash·JSON 보존, 경계/드라이브/상대/빈 경로, POSIX case/UNC 서버 분리, 최장 루트/같은 프로젝트 중복/다른 ID 동률, 미지정·명시적 배정 우선, 삭제된 명시적 ID, SQLite 보조 루트, native/legacy ID 중복 제거와 stale legacy 루트 제외를 검증했다.
- 기존 invalid-assignment 테스트에서 assignment=None은 이제 보조 경로 대상이므로 별도 새 테스트의 정상 분류 사례로 옮겼다. 유효하지 않은 프로젝트/remote 배정의 기존 폴더 유지 검증은 보존했다.
- `npx playwright test --config playwright.desktop.config.mjs`: 29개 통과. 기존 프로젝트/Claude 그룹 분리, 동명 ID 분리, 검색·새로고침·상세·열기·트리·사용자 그룹·상태 검증 유지.
- `npm run check`: 오류 0개, 기존 경고 111개/29개 파일.
- `scripts/build-desktop.ps1`: 성공. desktop/build/bin/desktop-session-manager.exe 갱신.
- 실제 수정 전 Codex 스냅샷을 무시되는 .tools/codex-path-fallback-before.json에 저장하고 수정 후 전체 대조했다. 기존 명시적 배정 116개의 프로젝트 ID/이름이 모두 일치하고, 모든 세션 ID/키/cwd/projectless가 보존됐다. 추가 경로 배정 129개, 최종 프로젝트 배정 245개, 미지정 57개, 일반 폴더 8개. 조회 알림 없음.
- 실제 전체 스냅샷 432개를 빌드된 desktop/assets에 주입했다. 프로젝트 14개를 각각 선택해 표시된 모든 세션 키를 기대 목록과 비교했다. UDCM_Calibration의 Codex 119개와 worktree 검색 5개, 새로고침 후 선택 유지도 확인했다. 브라우저 pageerror 0개.
- `verification/desktop-codex-project-paths-live.png`를 시각 확인했다. 실제 스냅샷/스크립트는 무시되는 frontend/test-results에 보관한다. 실제 앱 세션 열기나 그룹 쓰기는 하지 않았다.
- 자체 diff 검토와 git diff --check 통과. 변경 범위는 bridge·Python 테스트·이 작업 문서·새 캡처뿐이며 기존 untracked verification/desktop-replacement-backup은 제외한다.

## 적용과 제한

- Desktop Session Manager를 다시 실행하면 갱신된 실행 파일이 적용된다. bridge 분류는 스냅샷 새로고침 시 재계산한다.
- 상대 경로, 미등록 경로, 서로 다른 프로젝트 ID가 같은 최장 루트를 공유하는 경우는 기존 폴더 분류에 남는다. 프로젝트를 원본 앱에 새로 배정하거나 변경하지 않는다.
- 실제 파일 존재·symlink·Git worktree 관계를 추가 추정하지 않는다. 등록된 경로와 저장된 cwd를 문자열 경계 기준으로 비교한다.
