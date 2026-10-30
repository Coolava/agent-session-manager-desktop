# Codex 상태 표시 — Handoff

- 일자: 2026-10-30 (Asia/Seoul)
- 상태: 구현/검증 완료
- 범위: 기존 Desktop 전용 앱의 Codex 상태 조회와 표시. 세션 열기/그룹 동작은 유지.

## 구현

- codex_activity.py가 Codex thread_history SQLite의 최신 rollout_ordinal 턴을 읽는다. 대화 본문, 최종 메시지, 도구 출력은 읽지 않는다.
- inProgress→작업 중, completed→완료, interrupted→중단, failed→오류. 없는/손상된/미지원 이력은 확인 불가.
- 진행 기록이 현재 Codex 엔진 프로세스보다 오래됐거나 엔진을 확인할 수 없으면 작업 중으로 표시하지 않는다. 현재 Windows 기본 PowerShell의 프로세스 시작 시각 조회를 사용한다.
- Codex/Claude 조회는 별도 요청으로 실행되어 한쪽의 지연이 다른 쪽 갱신을 막지 않는다. 5초 갱신 및 15초 관찰 만료를 유지한다.
- Computer Use, UI 자동화, 새 엔진, 모델 입력, 설정/원본 데이터 변경은 사용하지 않는다.

## 검증

- Python 전체 19개 통과(신규 Codex 상태 10개).
- 브라우저 전체 9개 통과: Codex 작업 중→완료→중단→작업 중, 느린 Claude 조회와 격리, Codex 관찰 만료 포함.
- 타입 오류 0, 원본 경고 111개 유지.
- Desktop 전용 빌드, go test/go vet 통과.
- 명시적 Go→Python live 검사: Codex 303개 상태, 현재 대화 working 확인. 직접 조회 분포 completed 282 / interrupted 19 / unknown 1 / working 1.
- 새 프롬프트로 완료를 유도하지 않았다. 실제 기존 완료 이력과 현재 진행 중 이력, fixture 전이 테스트로 검증했다.

## 판정의 의미와 한계

완료는 최근 응답의 정상 종료이며 전체 업무의 완성도를 의미하지 않는다. 작업 중은 현재 실행 수명 중 시작된 최신 턴의 미종료 기록이다. 프로세스의 시작 시각 비교는 오래된 고아 기록을 거르지만 특정 턴의 현재 생존을 실시간 RPC로 확인하는 것은 아니다. 같은 엔진 수명 안에서 종료 이벤트 없이 중단되면 진행 기록이 남을 수 있다.

Codex 내부 저장 구조는 버전 의존적이다. 지원하지 않는 형식은 확인 불가로 처리한다. 상세 근거는 세션 상세의 상태 근거에서 볼 수 있다.

## 체크포인트 / 재개

단일 기능 커밋으로 기록한다. 실행 경로는 desktop/build/bin/desktop-session-manager.exe, 시작 스크립트는 루트 Start Desktop Manager.cmd. 이번 요청에 남은 구현 단계는 없다. 정확한 live RPC 소유자 연결은 별도 확장 범위다.
