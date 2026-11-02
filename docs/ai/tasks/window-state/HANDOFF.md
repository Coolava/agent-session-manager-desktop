# 창 위치·상태 복원

- 날짜: 2026-11-02 (Asia/Seoul)
- 상태: 구현·자체 검토·검증·Windows 실행 파일 빌드 완료.
- 스킬: software-change-workflow, verify-triage.
- 요청: 앱 재실행 시 이전 윈도우 위치와 상태를 기억한다.
- 가정: 상태는 일반/최대화이며 최소화 종료 시에는 최소화 직전 상태로 보이게 연다.

## 구현

- `desktop/main.go`: 고유 Windows 창 클래스, DOM 준비 후 최초 1회 복원, 종료 직전 저장을 연결했다.
- `desktop/window_state_windows.go`: 현재 프로세스 창만 찾고 GetWindowPlacement/SetWindowPlacement로 일반 창 영역과 최대화 상태를 보존한다. 주기적 조회나 frontend 코드는 추가하지 않았다.
- `%APPDATA%/DesktopSessionManager/window-state.json`을 임시 파일에서 교체 저장한다. 그룹 파일·대화 원본은 변경하지 않는다.
- 저장 파일이 없으면 기본 창, JSON/영역이 잘못되면 오류 로그와 함께 기본 창으로 열린다. 저장 실패는 종료를 막지 않는다.
- 최대화해도 원래 일반 창 크기·위치를 보존한다. 최소화한 채 종료하면 일반/최대화 상태로 보이게 연다.
- 완전히 화면 밖으로 벗어난 위치는 Windows SetWindowPlacement의 보정에 맡긴다.
- 기존 `golang.org/x/sys`의 Windows API 로더를 직접 사용하므로 go.mod에서 indirect를 해제했다. 의존성 추가나 버전 변경은 없다.
- `desktop/README.md`에 저장 동작과 통합 검사 명령을 기록했다.
- 기존 수정 중이던 `frontend/src/DesktopApp.svelte`와 `verification/desktop-replacement-backup/`은 변경·커밋 대상에서 제외했다. 실행 파일은 현재 frontend 내용을 포함해 빌드했다.

## 검증

- `desktop`: `go test ./...` 통과. 저장/교체, 음수 모니터 좌표, 잘못된 JSON·영역, 최소화 전 상태, 저장 실패 시 기존 파일 보존 검사.
- `desktop`: `go vet ./...`, `go vet -tags integration ./...` 통과.
- `scripts/build-desktop.ps1` 통과. `desktop/build/bin/desktop-session-manager.exe` 갱신.
- `go test -tags integration -run '^TestWindowStateLifecycle$' -v -count=1` 통과. 임시 APPDATA로 실제 실행 파일을 여러 번 열고 WM_CLOSE로 정상 종료했다. 일반 위치·크기 재실행, 최대화 재실행, 최대화 해제 후 일반 영역, 일반/최대화 각각의 최소화 종료, 손상·잘못된 영역 파일, 완전히 화면 밖 좌표 복원을 검증했다.
- 최초 통합 검사는 GUI 프로세스에 HideWindow를 지정해 첫 창 표시가 숨겨져 실패했다. 같은 실행 파일의 숨김 실행/일반 실행을 분리 진단해 테스트 실행 옵션 문제임을 확인했고, GUI 실행에 불필요한 HideWindow를 제거한 뒤 통과했다. 제품 설정·동작을 바꿔 검사 실패를 우회하지 않았다.
- 자체 검토: 공개 바인딩·세션 동작·그룹 저장 형식 변화 없음. 스코프 외 소스 수정 없음.

## 한계·후속

- 정상 종료 시 저장한다. 강제 프로세스 종료·전원 차단 직전 변경까지 저장하는 기능은 범위 밖이다.
- 실제 모니터 탈착/서로 다른 DPI 모니터 간 이동은 별도 수동 검증하지 않았다. 음수 좌표 저장과 Windows 화면 밖 보정은 검사했다.
- 남은 구현 단계는 없다. 새 실행 파일로 한 번 정상 종료한 시점부터 사용자의 창 상태가 저장된다.
