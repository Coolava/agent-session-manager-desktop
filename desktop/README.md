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

그룹 파일은 기존 version 1을 읽고 첫 편집부터 version 2로 원자 저장합니다. version 2는 기존 `id/name/members`와 그룹별 `links`를 보관합니다. 연결은 `kind/name`과 사용자 그룹 `id`, 또는 자동 그룹의 안정 식별자 `selectors`(`key`, 선택 `root`)로 저장합니다. 이름 변경은 연결의 동일성을 바꾸지 않습니다. 구버전 Desktop 실행 파일은 version 2를 읽지 못할 수 있습니다. 공용 Python/Tk의 그룹 파일 형식은 변경하지 않습니다.

`WORKSPACE` 바로 아래 `My Groups` 영역에 사용자 지정 그룹을 표시합니다. 제목 오른쪽 `+` 버튼을 누르면 제목 아래에 새 그룹 이름 입력칸이 열리고, 생성 성공 후 닫힙니다. 그 아래 `Groups`에는 자동 분류 그룹을 Agent 구분 없이 모아 표시하며, 각 영역은 이름순으로 정렬합니다. 왼쪽 패널에는 세션·그룹 개수를 표시하지 않습니다. 실제 소속 세션에 따라 Claude·Codex 아이콘을 표시하고, 혼합 그룹에는 왼쪽 Claude/오른쪽 Codex를 반씩 표시합니다. 아이콘에는 문맥 표시 부모를 포함하지 않습니다. 동명 항목은 원본 출처와 경로 힌트로 구별합니다.

세션·그룹 행을 우클릭하거나 Shift+F10/메뉴 키를 눌러 `그룹 할당…`을 선택합니다. 할당 창에서 여러 사용자 그룹을 선택하고 `할당 적용`을 누르며, 같은 창에서 새 그룹을 만들 수 있습니다. 세션은 직접 소속을 편집합니다. 그룹은 그룹 자체를 영구 연결하므로 이후 새 세션도 함께 분류됩니다. 사용자 그룹끼리도 연결할 수 있고 자기 자신/순환 연결은 거부합니다. 그룹 화면의 `연결된 그룹`에서 숨겨진 자동 그룹의 연결을 변경·해제할 수 있습니다.

세션 직접 배정이 자동 그룹 연결보다 우선합니다. 직접 소속을 먼저 제외해 자동 분류한 뒤 그룹 연결을 적용하고, 사용자 그룹에 포함된 세션은 자동 목록에서 제외합니다. 사용자 그룹 연결의 소속은 중복 없는 합집합입니다. 선택 해제나 그룹 삭제 후 남은 수동 소속/연결이 없으면 자동 분류로 돌아갑니다. 전체 세션·제공자별 목록에서는 계속 조회할 수 있습니다. 그룹을 읽지 못하면 자동 목록을 숨기고 마지막으로 확인한 직접 소속과 전체 세션 조회를 유지하며 편집을 차단합니다.

나머지 세션은 루트별로 묶습니다. 같은 루트·같은 이름의 Claude 그룹과 Codex 프로젝트에 연결 대상이 각각 하나이면 한 그룹으로 통합합니다. 이름이 다르거나 같은 제공자/계정의 동명 대상이 여러 개이면 분리하고, 그 루트의 미배정 세션은 별도 폴더로 둡니다. 원본 그룹의 다른 경로 세션까지 자동으로 가져오지 않습니다. 원래 작업 경로·세션 열기와 기존 ‘이 컴퓨터’ 분류는 유지됩니다. 통합 이름이나 사용자 그룹명으로 검색할 수 있고, 상세에서 원본 메타데이터를 확인할 수 있습니다. 필터에 속하지 않는 부모가 필요하면 ‘문맥 표시’로 구분합니다.

현재 환경에서는 Claude Desktop 4.29.0, Codex 26.1027 계열을 대상으로 확인했습니다. Desktop 앱 업데이트로 URL 또는 저장 메타데이터가 바뀌면 재검증이 필요합니다.

## 실행 의존성

- Windows, Python 3.10 이상, WebView2 Runtime, 각 Desktop 앱의 URI 연결이 필요합니다.
- Claude 조회/상태는 기존 Python 프로젝트를 재사용합니다. 기본 위치는 현재 저장소와 나란한 `../Session_Manager`입니다. 다른 경로라면 실행 전에 `SESSION_MANAGER_PYTHON_ROOT`를 지정합니다.
- Codex는 `CODEX_HOME` 또는 `~/.codex`의 로컬 SQLite 인덱스를 읽기 전용으로 조회합니다. 내부 하위 에이전트·자동 검토 기록과 보관 대화는 제외합니다.
- 새 작성 화면 생성, 클라우드 대화 및 Codex 원격 호스트 연동은 구현 범위에 포함하지 않습니다. Claude SSH는 기존 모듈을 재사용하며 이번 작업의 실제 열기 검증은 로컬을 대상으로 했습니다.

사이드바의 `설정`에서 자동 갱신 사용 여부와 주기(1~3600초)를 변경합니다. 기본값은 켜짐/5초이며 변경 즉시 적용되고 앱을 다시 열어도 유지됩니다. 상단 새로고침 버튼은 수동 갱신을 실행하며 문구가 바뀌지 않습니다. 별도 LED는 자동 갱신을 켜면 초록색으로 유지되고, 목록·그룹·Claude/Codex 상태 조회 오류 또는 조회 알림이 있으면 빨간색으로 표시됩니다. 해당 오류가 해소되면 초록색으로 복구되고, 자동 갱신을 끄면 LED가 숨겨집니다.

Claude 상태는 기존 엔진/브리지 관찰 결과를 사용합니다. Codex는 `thread_history_*.sqlite`의 최근 턴 상태를 읽기 전용으로 조회합니다. `inProgress`는 작업 중, `completed`는 완료, `interrupted`는 중단, `failed`는 오류로 표시합니다. 두 앱은 설정한 주기에 따라 독립 조회하며, 관찰이 15초 이상 지연되면 확인 불가로 표시합니다. 주기를 15초 이상으로 설정하면 다음 조회 전까지 확인 불가로 표시될 수 있습니다. 완료는 최근 응답의 정상 종료이며 전체 업무의 완성도를 뜻하지 않습니다.

Codex 진행 기록은 Windows의 현재 Codex 프로세스 시작 시각과 비교합니다. 엔진을 확인할 수 없거나 그보다 오래된 미종료 기록은 확인 불가로 처리합니다. 같은 프로세스 수명 안의 비정상 중단까지 확인하는 실시간 RPC 연결은 아니므로, 종료 이벤트가 저장되지 않은 경우 진행 기록이 남을 수 있습니다. 조회에는 Windows 기본 PowerShell의 프로세스 조회를 사용하며 화면 입력/Computer Use/모델 요청은 사용하지 않습니다. 상태 연동 플러그인이 없어도 대화 링크 열기는 가능합니다.

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
