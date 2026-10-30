# Desktop 세션 통합 관리자

- 날짜: 2026-10-30 (Asia/Seoul)
- 저장소: D:/repos/intellian/Session_Manager_Desktop
- 브랜치: desktop-session-integration
- upstream: https://github.com/izll/agent-session-manager-desktop
- 기준 커밋: 2ee0449d8721a2d32433ba8515667dcd5318b143
- 단계: Step 1의 로컬 기존 세션 검증 완료 → Step 2 최소 UI 연결

## 요청과 승인

사용자는 원본 앱의 디자인을 활용하여 터미널 실행을 Desktop 세션 창 열기로 교체하고자 한다. Claude는 Claude Desktop, Codex는 Codex Desktop에서 선택한 세션을 독립 창으로 연다.

사용자는 2026-10-30에 별도 clone → Desktop 연동 검증 → 최소 UI 연결 → 목록/그룹/상태 연결 순서를 승인했다.

추가 결정: **Codex 독립 창 열기는 필수이며, 기존 창에서 대화로 이동하는 대체 동작을 허용하지 않는다. 해당 연동 검증을 먼저 완료한다.**

추가 승인과 제약: UI 자동화 연동의 구현·검증을 허용했으며, 이후 **Computer Use 도구는 사용하지 말 것**을 지시했다. 현재 검증 경로는 C#의 Windows UI Automation API로 의미 기반 메뉴를 호출하고 공식 URI를 여는 방법이다. 캡처/좌표/키보드 입력은 사용하지 않는다.

## 성공 기준

- 지정한 기존 세션 ID와 실제 별도 OS 창에 열린 대화가 일치한다.
- 기존 Desktop 대화 원본이나 앱 설치 파일을 수정하지 않는다.
- 프롬프트 전송이나 세션 복제를 창 열기로 대신하지 않는다.
- 독립 창 연동 검증을 통과한 뒤 원본 디자인에 실제 세션 목록과 열기 액션을 연결한다.

SSH 세션과 새 대화 작성 화면의 독립 창 지원 여부는 기존 대화와 따로 검증한다. 지원되지 않는 기능을 지원한다고 표시하지 않는다.
