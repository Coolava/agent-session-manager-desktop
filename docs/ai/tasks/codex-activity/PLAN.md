# Codex 상태 표시

- 요청: Codex도 작업 중인지 완료됐는지 표시한다.
- 날짜: 2026-10-30 (Asia/Seoul)
- 위험도: Medium. 읽기 전용 상태 조회와 기존 상태 UI를 연결하는 단일 구현 Step.
- 승인 근거: 사용자의 직접 구현 요청. 세션 열기 방식과 Computer Use 금지 조건은 유지한다.

## 사실 / 가정

현재 설치본은 thread_history_1.sqlite의 thread_turns에 명시적 inProgress/completed/interrupted/failed를 기록한다. 현재 대화는 inProgress이며 과거 completed 및 interrupted도 확인했다. 이는 OpenAI 공식 App Server의 턴 상태 정의와 일치한다. 또한 몇 달 전의 미종료 inProgress 기록이 존재한다.

완료는 최근 응답의 정상 종료이며 전체 업무의 완성도가 아니다. 현재 엔진 프로세스보다 앞서 시작한 미종료 턴을 현재 작업 중으로 간주하지 않는다. 같은 엔진 수명 중의 비정상 종료까지 정확하게 검증하는 live RPC 연결은 이번 범위에 포함하지 않는다.

## Step 1 — 구현과 검증

- desktop/codex_activity.py: 읽기 전용 최신 턴 조회와 상태 매핑. 현재 runtime 시작 시각은 Windows 기본 프로세스 조회로 확인한다. 누락/미지원/조회 실패/과거 미종료 기록은 확인 불가.
- desktop/bridge.py: 별도 codex-activities 액션. Claude 조회와 독립적으로 갱신한다.
- frontend/src/DesktopApp.svelte: Codex 고정 unknown 제거, provider별 독립 조회, 중단 표시. 기존 5초 갱신/15초 관찰 만료를 유지한다.
- 테스트: 최신 ordinal 우선, 완료→새 작업, 중단/실패, 오래된 미종료, 엔진 없음, DB 부재/손상, provider 격리, UI 상태 전환과 만료.
- 실제 검증: 이 대화의 진행 상태와 기존 정상 종료 기록을 읽기 전용으로 확인. 새 프롬프트 전송과 UI 자동화는 사용하지 않는다.
- 전용 빌드/타입 검사/관련 테스트 후 하나의 scoped commit. HANDOFF와 README를 갱신하고 실행 중인 관리자만 새 빌드로 재실행한다.

## 범위 제한

설치된 Codex/Claude, 원본 Python 프로젝트, 대화 원본은 수정하지 않는다. 대화 본문은 조회하지 않으며 외부 API/프롬프트/새 엔진을 시작하지 않는다. 그룹/세션 열기 및 무관한 원본 테스트는 변경하지 않는다.

## 근거

- https://learn.chatgpt.com/docs/app-server (턴 상태 및 turn/completed)
- 현재 로컬 thread_history_1.sqlite의 테이블/인덱스/상태 값 확인
