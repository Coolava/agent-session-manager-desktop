# Desktop 세션 클릭 열기 / 우클릭 상세

- 승인: 사용자의 “Desktop app에 구현 해줘” 요청. 앞서 확인한 한 번 클릭 열기와 우클릭 상세 이동을 Desktop에 적용한다.
- 위험: Medium, 단일 화면의 입력 동작 변경.
- 확인: DesktopApp.svelte는 클릭 상세 / 더블클릭 열기이며 기존 openSession과 상세 카드가 있다. 이전 구현은 별도 Python GUI에만 존재한다.
- 가정: 상세 정보는 기존 상세 화면을 재사용하며 Claude/Codex 모두 같은 입력 규칙을 적용한다.
- 미확정 제품 결정: 없음.
- 범위: DesktopApp.svelte, Desktop 브라우저 테스트, 이 작업 문서 및 빌드 생성물. Python GUI/bridge/Go API는 변경하지 않는다.
- 보존: 검색·필터·그룹·상태·부모/하위 관계 및 열기 key, 펼침 버튼 동작.

## Step 1 — 구현·검증·빌드

1. 행 클릭은 기존 openSession으로 연결하고 연속 더블클릭 중복을 막는다. 우클릭 메뉴의 ‘세션 상세’는 해당 key로 기존 상세 화면을 연다.
2. 메뉴는 화면 안에 배치하고 바깥 클릭/Esc/스크롤/창 변경으로 닫는다. 키보드 메뉴 키 및 Shift+F10 접근을 지원한다.
3. 기존 상세 진입 테스트를 우클릭 경로로 갱신하고 클릭 열기·실패·메뉴 위치/닫기·하위 key를 검증한다.
4. Desktop Playwright 전체, npm run check, Windows scripts/build-desktop.ps1 및 git diff --check를 수행한다. 메뉴 화면을 시각 확인한다.
5. 자체 검토와 HANDOFF 기록 후 이 작업만 scoped commit한다.

완료 기준: 일반 클릭은 외부 열기만, 우클릭은 메뉴만, 메뉴 선택은 상세만 실행한다. Claude/Codex/하위 세션의 key를 보존하며 기존 회귀 테스트와 Windows 빌드가 통과한다.
