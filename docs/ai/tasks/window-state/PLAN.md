# 창 위치·상태 복원

- 요청: 앱을 다시 실행할 때 이전 창 위치와 상태를 기억한다.
- 대상: Desktop Session Manager의 `desktop/main.go` 및 새 창 상태 모듈.
- 위험도: Medium. 창 시작·종료 동작과 별도 설정 파일을 추가한다.
- 확인: Desktop 전용 진입점은 Wails 2.14이며 현재 1380×880 고정 초기 크기만 사용한다.
- 가정: 위치·크기와 일반/최대화 상태를 복원한다. 최소화 종료는 최소화 직전 일반/최대화 상태로 연다.
- 보존: 세션 조회·열기·그룹 데이터와 기존 frontend 수정 사항.
- 저장: `%APPDATA%/DesktopSessionManager/window-state.json`, 기존 그룹 파일과 분리한다.

## Step 1 — 창 상태 저장·복원

- Windows GetWindowPlacement/SetWindowPlacement로 일반 창 영역과 최대화 여부를 보존한다. 좌표계 변환이나 주기적 polling을 추가하지 않는다.
- 앱 프로세스에 속하는 고유 클래스의 창만 찾는다. DOM 준비 후 복원하고 종료 직전에 원자 저장한다.
- 파일이 없거나 손상되면 기존 기본 창으로 연다. 저장 실패가 종료를 막지 않게 로그를 남긴다.
- 화면에서 완전히 벗어난 위치는 SetWindowPlacement의 Windows 보정 동작을 사용한다.
- 검증: 저장/읽기/손상 파일/최소화 상태의 단위 테스트, desktop Go test/vet, Windows 빌드 및 실제 실행 파일 재실행 검사.
- 완료 조건: 일반 위치·크기, 최대화 후 일반 크기 복원, 최소화 종료 및 잘못된 저장 파일의 복구를 확인한다.
- 검증 후 이 작업 파일만 대상으로 커밋하고 HANDOFF.md에 결과를 기록한다.

## 근거

- [Microsoft WINDOWPLACEMENT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-windowplacement)
- [Microsoft SetWindowPlacement](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowplacement)
