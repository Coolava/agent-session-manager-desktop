# 그룹 UX 개선 인계

- 날짜: 2026-11-02 (Asia/Seoul)
- 에이전트: Codex
- 스킬: software-change-workflow
- 상태: implementation / 전체 계획 승인, Step 1 완료

## 완료한 일

- Desktop 화면, 자동 분류 helper, bridge, 공용 그룹 저장 구현 및 기존 작업 SPEC을 확인했다.
- 사용자가 그룹 할당을 일회성 복사가 아닌 영구 연결로 확정했다. 새 세션도 사용자 그룹에 계속 포함한다.
- CURRENT_TASK.md와 PLAN.md를 작성했다. 제품 코드·사용자 데이터·빌드 파일은 변경하지 않았다.
- Node Desktop 분류/트리 19개 및 Desktop Python 48개 기준 테스트가 통과했다. 빌드와 브라우저 검증은 이번 계획 단계에서는 실행하지 않았다.

## 변경 파일

- 이 디렉터리의 CURRENT_TASK.md, PLAN.md, HANDOFF.md만 새로 작성했다.
- 기존 미추적 verification/desktop-replacement-backup/은 사용자 소유 상태로 두었다.

## 결정과 가정

- 확정: Groups 한 목록, Agent/반반 혼합 아이콘, 세션·그룹 우클릭 할당, 할당 화면의 그룹 생성, 사용자 분류 우선, 그룹 연결의 미래 세션 포함.
- 계획 제안: 이름순 평면 표시, 다중 소속 보존, 직접 배정 우선, 사용자 그룹 간 연결 및 순환 방지. 상세는 PLAN.md 참조.
- 위험 High: Desktop 전용 저장 형식 확장 및 여러 계층 변경. 공용 Python/Tk와 원본 앱 데이터는 범위 밖이다.
- 미확인: 실제 사용자 그룹 파일과 실행 중 프로세스 상태. 이번 단계에서는 읽거나 수정할 필요가 없었다.

## 다음 작업

- 사용자 계획 승인 후 Step 1을 구현하고 검증·자체 검토·범위 커밋한다. 이후 승인된 Step 순서대로 진행한다.
- 승인 요청 근거: software-change-workflow Stage 4의 “Do not proceed to implementation until the plan is acknowledged.”
- 현재는 계획 단계이므로 구현 커밋을 만들지 않았다. 문서는 검토 가능한 작업 트리 파일로 남겼다.
- 최종 단계에서 Groups 목록/할당 모달 캡처, 최소 창 크기, 키보드 포커스, 새 세션 연결과 해제 복귀를 확인한다.

## 승인 및 Step 1 결과

- 사용자: “좋아. 이 계획대로 구현하고 검증까지 진행해줘.” 전체 Step 진행이 승인되었다. 위의 계획 단계 기록은 이력이다.
- desktop/desktop_groups.py가 공용 GroupStore의 이름 변경·멤버 편집을 재사용하면서 Desktop 전용 v1/v2 읽기와 v2 원자 저장을 담당한다. 공용 Python/Tk는 수정하지 않았다.
- v2 그룹은 기존 id/name/members와 links를 보관한다. link는 kind/name과 user id 또는 automatic selectors(key, 선택 root)로 구성된다. 표시 이름은 동일성 비교에서 제외한다.
- assign-session은 최신 세션을 resolve한 뒤 대상 소속 전체를 한 번에 저장한다. assign-group은 동일 source의 대상 그룹들을 한 번에 갱신한다. 그룹 삭제는 해당 사용자 그룹에 대한 참조를 제거한다.
- 자기/순환/없는 사용자 그룹·중복 대상/잘못된 식별자를 거부한다. 기존 rename/member/create가 다른 연결을 유실하지 않는지 확인했다.
- 최초 신규 테스트는 미구현 모듈 import 오류로 실패한 뒤 구현했다. 전체 Desktop Python 55개 통과. Windows Desktop 빌드 성공. diff --check 통과.
- 자체 검토: Go의 기존 그룹 변경 mutex를 그대로 사용한다. 원본 앱 저장소/실제 사용자 그룹 파일은 쓰지 않았다. 저장 실패·손상 파일 보존과 provider/계정 분리를 테스트했다.
- 다음: Step 2 공통 분류와 연결 우선순위 구현. Step 1 파일만 범위 커밋한다.
