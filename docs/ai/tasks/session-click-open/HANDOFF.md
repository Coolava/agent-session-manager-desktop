# Desktop 세션 클릭 열기 / 우클릭 상세

- 날짜: 2026-10-30 (Asia/Seoul)
- 상태: 구현·검증·Windows 빌드 완료.
- 스킬: software-change-workflow.
- 승인: 사용자가 Desktop 앱에 해당 동작 구현을 명시적으로 요청했다.

## 변경

- DesktopApp.svelte의 세션 행 한 번 클릭은 기존 openSession을 실행하고 목록을 유지한다. Claude/Codex/하위 세션 모두 원래 key를 전달한다.
- 두 번째 연속 클릭(detail >= 2)은 열기를 실행하지 않으며 기존 opening 잠금도 유지했다.
- 우클릭 메뉴의 ‘세션 상세’는 기존 상세 화면으로 이동한다. 우클릭/상세 이동 자체는 외부 앱을 열지 않는다.
- 메뉴는 측정한 크기로 화면 안에 배치한다. 바깥 클릭, Esc/Tab, 스크롤, 창 크기 변경 및 포커스 상실로 닫힌다. Esc/Tab은 원래 행에 포커스를 돌려준다.
- ContextMenu 키와 Shift+F10으로 메뉴에 진입하고 Enter로 선택할 수 있다. 갱신으로 대상 세션이 사라지면 메뉴를 닫는다.
- 기존 검색·폴더·그룹·상태·계층·상세 화면의 그룹 편집 및 부모 이동은 유지했다. Python GUI/bridge/Go API와 의존성은 변경하지 않았다.
- 기존 상세 진입 테스트를 우클릭 경로로 갱신하고, 클릭 열기·빠른 응답 더블클릭·메뉴 대상·키보드·위치/닫기·하위 클릭 검증을 추가했다.

## 검증과 자체 검토

- Desktop Playwright: 최초 23개 통과, 위치 검증을 실제 MouseEvent로 강화하고 하위 클릭 테스트 추가 후 최종 24개 통과(29.1초).
- npm run check: 오류 0개, 기존 경고 111개/29개 파일. DesktopApp에 새 경고 없음.
- scripts/build-desktop.ps1: 성공. desktop/build/bin/desktop-session-manager.exe 갱신, 빌드된 assets에 ‘세션 상세’ 포함 확인.
- 960×640 화면의 우하단 메뉴 배치 캡처를 시각 확인했다. 메뉴가 잘리거나 가로 overflow가 생기지 않는다. 캡처: frontend/test-results/desktop-session-menu.png(ignored).
- git diff --check 통과. 자체 검토상 요청 밖 UI/API/저장 형식 변경 없음. 기존 untracked verification/desktop-replacement-backup/은 제외한다.
- 테스트는 모의 bridge로 실제 마우스/키보드 UI 입력과 요청 key를 검증했다. 실제 Claude/Codex 세션 열기는 실행하지 않았다.
- 테스트 mock 지연 설정 수정 중 작업 디렉터리를 잘못 지정한 파일 경로 오류 1회가 있었으며 올바른 파일에 적용 후 최종 전체 검증을 통과했다.

## 적용 및 체크포인트

- 이 작업의 소스·테스트·계획·인계만 scoped commit한다. 빌드 생성물은 저장소 ignore 규칙에 따라 로컬에 유지한다.
- 바탕화면 바로가기의 기록된 대상은 위 빌드 실행 파일이다. 앱을 재실행하면 적용된다.
- 남은 구현 작업 없음. 실제 외부 Desktop 앱 연결 결과는 기존 bridge/URI 동작에 따른다.
