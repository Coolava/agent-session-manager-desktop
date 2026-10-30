# 구현 계획: Desktop 세션 통합 관리자

## 최종 범위

사용자의 최종 지시로 새 창 강제 열기 요구를 철회하고 기존 세션 링크 열기로 단순화했다. 위험도 Medium: Desktop 메타데이터 조회와 별도 Wails 실행 경로를 추가한다. 설치된 앱과 기존 대화 원본은 수정하지 않는다.

## 확인한 사실과 구현 선택

- 원본은 Wails/Go, Svelte, xterm.js 기반이다. 기존 App.startup에는 터미널 부수 효과와 음성 입력 의존성이 있다.
- 기존 디자인 토큰/CSS와 AgentIcon을 활용하는 Desktop 전용 Svelte 진입점을 만들었다.
- 별도 desktop Go 모듈은 원본과 같은 Wails 2.14를 사용한다. 원본 터미널/음성 기능을 초기화하지 않는다.
- Python 표준 라이브러리와 기존 Session_Manager 모듈로 Claude 메타데이터/상태/그룹 저장을 재사용한다.
- Codex는 읽기 전용 SQLite 인덱스를 사용한다. Desktop name을 우선하고 내부 하위 에이전트·자동 검토·보관 기록은 제외한다.
- Claude/Codex 대화 URL을 os.startfile로 전달한다. 링크 열기에는 기존 Claude 창 플러그인이 필요하지 않다.

## Step 1 — Clone과 연동 조사: 완료

별도 clone과 기준 커밋을 고정하고 원본 프런트엔드 빌드/타입 검사/테스트 기준선을 확인했다. 초기 독립 창 실험 기록은 historical_only인 desktop-window-contract.json에 남겼다. 이는 최종 구현의 요구나 보장 조건이 아니다.

체크포인트: c3b5e00 (조사와 기준 문서).

## Step 2 — Desktop 전용 실행 경로와 세션 열기: 완료

대상: desktop/main.go, desktop/bridge.py, frontend Desktop 진입점/화면, 빌드 스크립트.

원본 토큰과 아이콘을 활용한 화면을 실제 메타데이터와 연결한다. 선택 키는 현재 메타데이터에서 재해석하고, 해당 provider의 URL만 전달한다. UI는 링크 전달 요청을 성공 메시지로 표현하며 화면 전환 완료를 주장하지 않는다.

검증: 원본과 별도의 Windows 실행 파일 빌드, Python의 위조/소멸 ID 거절 및 provider별 URL 테스트, Go→Python 실제 두 Desktop 링크 전달, 브라우저 선택/열기/실패/중복 입력 검사.

체크포인트: Desktop 실행 경로·테스트·화면의 scoped feature commit.

## Step 3 — 그룹/상태/회귀와 전달: 완료

계정/provider별 키와 환경/호스트/폴더 필터를 구분한다. 관리자 전용 그룹 생성/이름 변경/삭제/세션 추가/제외를 연결하고 손상 파일을 덮어쓰지 않는다. Claude 상태는 기존 판정 규칙을 재사용하고 15초 이후 확인 불가로 표시한다. Codex 실시간 상태는 확인 불가로 명시한다.

검증: Python 9개, 브라우저 7개, 타입 검사, Go 검사, 실제 링크 전달, 기본/최소 창 크기 화면 확인. 마지막 빌드와 실행 안내, 검증 근거/HANDOFF를 저장한다.

체크포인트: 최종 검증 기록과 실행 안내의 scoped documentation commit.

## 한계와 제외 범위

현재 Codex 실시간 상태, 새 대화 생성, 클라우드/Codex 원격 세션, upstream의 무관한 테스트 이식성 수정은 포함하지 않는다. 원본의 Windows 테스트 실패와 음성 빌드 도구 부재를 Desktop 전용 실행 파일의 통과로 덮어쓰지 않는다.
