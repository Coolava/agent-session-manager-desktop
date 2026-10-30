# Codex 등록 프로젝트 경로 보조 분류

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 승인: 사용자가 등록 경로 보조 분류와 명시적 배정 우선 적용을 요청했다.
- 위험: Medium — 읽기 전용 bridge의 분류 결정 변경. 화면과 원본 쓰기는 변경하지 않는다.
- 상태: Step 1 구현·검증 완료. 결과는 HANDOFF.md 참조.

## 결정

- 프로젝트 미지정은 이 컴퓨터로 유지한다. SQLite/전역 상태의 명시적 프로젝트 배정은 경로보다 우선한다. 참조 대상이 없거나 remote 배정인 경우도 다른 local 프로젝트로 추정하지 않는다.
- 명시적 배정이 없는 Codex 대화에 등록된 모든 루트(첫 루트와 보조 루트)를 비교한다. 프로젝트 경로와 같거나 하위 폴더여야 하며 가장 구체적인 경로를 우선한다. 같은 최장 경로의 다른 프로젝트 ID가 경합하면 기존 폴더 분류를 유지한다.
- Windows 절대 경로는 대소문자/구분자/끝 구분자/점 경로를 정규화하고 폴더 경계를 지킨다. POSIX 절대 경로는 대소문자를 유지한다. 상대 경로, 다른 드라이브/서버, 비슷한 폴더명, 미등록 경로를 추정하지 않는다. 실제 폴더나 symlink를 조회하지 않는다.
- 현재 CODEX_HOME의 명시적 legacy→native 매핑과 native 프로젝트 ID를 사용해 중복 후보를 제거한다. native 등록이 있으면 구형 루트 복사본은 경로 후보로 쓰지 않는다. Claude 데이터나 다른 호스트 정보는 후보로 사용하지 않는다.
- 기존 codexProject 응답과 CODEX PROJECTS 표시를 사용한다. cwd/세션 ID/열기/사용자 GROUPS/Claude 원본 그룹을 유지한다. 분류 결과를 원본 저장소에 쓰지 않는다.

## Step 1

1. desktop/bridge.py에 경로 정규화와 최장·유일 후보 선택을 추가하고, 모든 유효한 루트를 수집한다.
2. desktop/test_bridge.py에서 exact/하위/보조 루트, 명시적 우선, 미지정, 경계/드라이브/상대 경로, 중첩 루트, 동률 경합, ID 매핑 중복 제거, 갱신과 원본 보존을 검증한다.
3. 전체 Desktop Python/Playwright, 타입 검사, Windows 빌드를 실행한다. 실제 수정 전 배정과 수정 후 배정을 비교해 기존 배정을 유지하고 추가 129개가 등록 프로젝트로 이동하는지, 나머지 8개/미지정 57개가 보존되는지 확인한다. 실데이터 UI에서도 모든 프로젝트 멤버와 원래 세션 경로를 대조하고 캡처한다.
4. 자체 diff 검토 후 HANDOFF를 남기고 `Classify unassigned Codex sessions by registered project paths`로 scoped commit한다.

- 변경 범위: bridge, 관련 Python 테스트, 이 작업 문서, 새 검증 캡처. 공용 Python/Tk/의존성/원본 데이터/기존 untracked verification/desktop-replacement-backup은 제외한다.
- 제한: 명시적 배정의 우선순위를 유지하므로, 원본 앱에서 프로젝트 미지정으로 지정한 대화는 등록 경로에 있어도 자동 배정하지 않는다.
