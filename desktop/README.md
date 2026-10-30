# Desktop Session Manager

Agent Session Manager Desktop의 Svelte 디자인 토큰과 아이콘을 활용하여 Claude/Codex Desktop 대화를 조회하고 여는 Windows 실행 경로입니다.

## 실행

저장소 루트의 `Start Desktop Manager.cmd` 또는 `desktop/build/bin/desktop-session-manager.exe`를 실행합니다.

- Claude/Codex별 조회, 검색, 환경·호스트·작업 폴더별 필터를 제공합니다.
- 세션을 선택한 뒤 `Desktop에서 열기`를 누르거나 목록 행을 더블클릭합니다.
- Claude는 `claude://claude.ai/epitaxy/<Desktop session ID>`, Codex는 `codex://threads/<thread ID>`를 Windows에 전달합니다.
- 결과 메시지는 OS에 열기를 요청했다는 뜻입니다. Desktop 앱의 실제 화면 전환 완료까지 보장하는 응답은 아닙니다.
- 앱이 선택한 창에 대화를 엽니다. 별도 창 생성, 화면 캡처, UI 자동화, 프롬프트 전송은 사용하지 않습니다.
- 그룹은 `%APPDATA%/DesktopSessionManager/groups.json`에 보관합니다. 그룹 변경·삭제는 원본 대화를 수정하지 않습니다.

현재 환경에서는 Claude Desktop 4.29.0, Codex 26.1027 계열을 대상으로 확인했습니다. Desktop 앱 업데이트로 URL 또는 저장 메타데이터가 바뀌면 재검증이 필요합니다.

## 실행 의존성

- Windows, Python 3.10 이상, WebView2 Runtime, 각 Desktop 앱의 URI 연결이 필요합니다.
- Claude 조회/상태는 기존 Python 프로젝트를 재사용합니다. 기본 위치는 현재 저장소와 나란한 `../Session_Manager`입니다. 다른 경로라면 실행 전에 `SESSION_MANAGER_PYTHON_ROOT`를 지정합니다.
- Codex는 `CODEX_HOME` 또는 `~/.codex`의 로컬 SQLite 인덱스를 읽기 전용으로 조회합니다. 내부 하위 에이전트·자동 검토 기록과 보관 대화는 제외합니다.
- 새 작성 화면 생성, 클라우드 대화 및 Codex 원격 호스트 연동은 구현 범위에 포함하지 않습니다. Claude SSH는 기존 모듈을 재사용하며 이번 작업의 실제 열기 검증은 로컬을 대상으로 했습니다.

Claude 상태는 기존 엔진/브리지 관찰 결과이며 15초가 지나면 확인 불가로 표시합니다. 완료는 최근 응답의 정상 종료를 의미합니다. Codex의 실시간 실행 상태는 아직 연결하지 않아 확인 불가로 표시합니다. 상태 연동 플러그인이 없어도 대화 링크 열기는 가능합니다.

## 빌드와 검증

```powershell
cd frontend
npm ci
cd ..
./scripts/build-desktop.ps1

python -m unittest discover -s desktop -p 'test_*.py' -v
cd frontend
npm run check
npx playwright test --config playwright.desktop.config.mjs
cd ../desktop
go test ./...
go vet ./...
```

빌드 스크립트는 PATH의 Go를 사용하며, 로컬 `.tools/go/bin/go.exe`가 있으면 우선 사용합니다. 기존과 같은 Wails 2.14와 Svelte를 사용합니다. Desktop 전용 진입점에는 터미널 및 음성 입력 패키지를 연결하지 않아 tmux/psmux, PortAudio, MSYS2가 필요하지 않습니다.

`go test -tags integration -run TestLiveDesktopBridge -v`는 실제 메타데이터를 읽습니다. `DESKTOP_SESSION_SMOKE_THREAD` 또는 `DESKTOP_SESSION_SMOKE_CLAUDE`에 실제 ID를 지정한 경우에만 해당 대화 열기 링크도 전달합니다. 일반 테스트는 Desktop 앱을 조작하지 않습니다.

원본 앱의 README와 MIT LICENSE를 함께 보존합니다. 원본 터미널 앱은 기존 빌드 경로로 유지되며 Desktop 전용 실행 경로는 이 디렉터리에 분리되어 있습니다.
