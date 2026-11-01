# 프로젝트 루트 통합 표시 — 완료

- 날짜: 2026-11-02 (Asia/Seoul)
- 스킬: software-change-workflow
- 대상: D:/repos/intellian/Session_Manager_Desktop
- 상태: PLAN.md Step 1 구현·검증·자체 검토 완료. 이번 변경만 scoped commit한다.

## 구현

- bridge의 codexAssignment는 실제 원본 명시 배정의 ID/종류를 전달한다. 경로 추정과 프로젝트 미지정은 null이다. 명시 배정의 native ID 매핑, 지원하지 않는/삭제된 참조도 구별한다. 기존 codexProject/projectCwd와 원본 SQLite/상태 JSON은 보존한다.
- desktopProjects.ts가 루트별 명시 배정을 먼저 모아 분류한다. 배정 0개는 루트 통합, 1개는 미배정도 함께 표시, 여러 개는 명시 배정별 항목과 미배정 루트를 각각 유지한다. 제공자·계정별 ID가 다르면 동명이어도 분리한다. 알려지지 않은 명시 배정은 다른 배정과 합치지 않고 미배정 세션도 흡수하지 않는다.
- 기존 부모 상속·scratch/프로젝트 미지정·GROUPS·원래 경로·세션 키·열기·상태는 보존한다. 루트 통합 결과는 목록/필터/선택에 공통 적용하고, 통합 이름 검색과 상세의 통합 프로젝트 표시를 추가했다.
- 기존 화면 영역을 보존한다. ALT Test는 기존 CODEX PROJECTS의 한 항목에 Claude와 Codex 세션을 함께 표시한다.

## 검증

- 변경 전 Python 47개, Node 세션 트리 6개 통과.
- 신규 Python 테스트는 codexAssignment 부재로 실패했다. 새 통합 기대를 적용한 브라우저 테스트도 기존 폴더 5개 대신 4개 기대에서 실패하는 것을 확인한 뒤 구현했다. 기존 원본 그룹 테스트의 항상 폴더 분리 기대도 변경된 요구에 맞게 갱신했다.
- 최종 `python -m unittest discover -s desktop -p 'test_*.py'`: 48개 통과. 명시/추정/삭제 참조/미지정, native ID 매핑과 원본 보존 확인.
- `node --test frontend/tests/desktopProjects.test.mjs frontend/tests/desktopSessionTree.test.mjs`: 15개 통과. 동일 루트, Windows/UNC/SSH/POSIX, 다른 ID/계정/제공자, 부모 상속, 명시 충돌, 미배정 bridge 방지, 삭제 참조, 순서/이름 변경을 확인했다.
- Desktop Playwright 전체: 31개 통과. 마지막 삭제 참조 보호 보완 후 영향받는 브라우저 5개도 재확인해 통과했다. 원래 세션 열기는 mock 호출을 대조했다.
- `npm run check`: 오류 0개, 기존 경고 111개/29개 파일.
- Desktop Go `go test ./...`: 통과(일반 테스트 파일 없음). `go vet ./...`: 통과.
- `scripts/build-desktop.ps1`: 성공, desktop/build/bin/desktop-session-manager.exe 갱신.
- 실제 읽기 전용 스냅샷 433개(Claude 122/Codex 311), 경고 없음. ALT Test는 Codex 18개 모두 명시 배정, Claude 5개 미배정. 최종 분류 33개 항목이며 ALT Test 전체 23개가 하나로 합쳐지는 것을 확인했다.
- 빌드된 desktop/assets 화면에 스냅샷을 주입해 ALT Test 선택 후 실제 행의 모든 세션 키를 기대 23개와 대조했다. 별도 ALT Test 폴더가 사라지고 pageerror 0개, 최소 960px 폭에서 가로 넘침 없음. 실제 앱 열기 요청은 하지 않았다.
- 캡처: verification/desktop-unified-projects-live.png, verification/desktop-unified-project-conflicts.png. 두 화면을 시각 확인했다.
- 캡처 보조 도구는 Playwright가 임시 스냅샷을 정리해 최초 파일 읽기에 실패했다. 스냅샷 재생성 후 보조 HTTP 응답의 헤더 처리 오류를 고쳐 정상 검증했다. 제품 코드 오류는 아니며 보조 스크립트/실데이터는 무시되는 test-results에만 두었다.
- 자체 diff 검토와 git diff --check 통과. 기존 테스트가 재생성한 과거 캡처는 원복하고 이번 새 캡처만 포함한다. 기존 untracked verification/desktop-replacement-backup은 제외한다.

## 적용과 제한

- Desktop Session Manager를 다시 실행하면 빌드된 새 화면이 적용된다.
- 명시 배정 하나인 루트에 미배정 세션을 합치는 것은 승인한 동일 루트 규칙의 적용이다. 원본 앱에는 배정을 쓰지 않는다.
- 원본 ID가 다른 명시 그룹/프로젝트는 동일 루트·동명이어도 분리한다. 수동 영구 연결 UI, 모든 보조 루트의 교차 제공자 매칭, Git/symlink 조회는 추가하지 않았다.
- 최종 실행 파일 자체의 WebView 창 조작은 하지 않았다. 빌드 산출 프론트엔드와 실제 스냅샷으로 표시를 검증했다.
- SPEC-INDEX 생성/동기화 요청은 없었다. task-local SPEC/PLAN/WORKING-SPEC/HANDOFF를 갱신했다.
