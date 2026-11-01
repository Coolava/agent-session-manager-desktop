# 프로젝트 루트 통합 표시 구현

- 날짜: 2026-11-02 (Asia/Seoul)
- 스킬: software-change-workflow
- 승인: 사용자의 규칙 확정 및 “그렇게 개선작업 해줘” 요청에 따라 구현한다.
- 위험: Medium — 기존 읽기 전용 bridge의 선택 필드와 단일 화면 분류 변경. 원본 저장 형식/데이터는 변경하지 않는다.

## 확인 사실과 구현 기준

- SPEC.md R-011~R-013을 적용한다. 동일 루트는 자동 통합, 서로 다른 명시 배정은 분리, 복수 배정이 있는 루트의 미배정은 별도다.
- bridge는 Codex 경로 추정과 명시 배정을 현재 같은 codexProject 필드로 전달하므로 구별할 선택 메타데이터가 필요하다. 참조가 사라진 명시 배정도 경로 추정으로 덮어쓰지 않는다.
- 같은 루트에 명시 배정이 하나이면 미배정도 그 항목으로 통합한다. 이는 “동일 루트 통합, 명시적으로 다른 경우만 분리”의 적용으로 사용자에게 설명했다.
- 명시 배정의 동일성은 기존 원본 ID/제공자/계정/환경·호스트 범위로 비교한다. 이름만 같은 배정은 합치지 않는다.
- 실제 원본 경로/명시 Codex 대표 루트로 비교한다. Windows 로컬 경로는 기존 대소문자/구분자 정규화를 유지·보완한다. SSH와 POSIX 경로는 대소문자를 유지하고 호스트를 구분한다. 임의 상위 경로/제목 추정은 추가하지 않는다.
- 기존 Claude 부모 분류 상속, 원본 그룹과 Codex 프로젝트 영역, scratch/프로젝트 미지정의 이 컴퓨터 분류, GROUPS 편집, ID/원래 경로/열기는 보존한다. 서로 다른 명시 배정은 미배정 세션을 통해 합치지 않는다.
- 일반 미배정 루트는 PROJECT FOLDERS, 유일한 명시 배정에 합쳐진 세션은 그 원본 그룹/프로젝트 항목에서 함께 표시한다. 별도 화면·수동 연결 기능·의존성은 추가하지 않는다.
- 기존 untracked verification/desktop-replacement-backup과 공용 Python/Tk는 작업 범위 밖이다.

## Step 1 — 구현·검증·체크포인트

1. desktop/bridge.py에 Codex의 실제 명시 배정 정보(경로 추정은 null)를 선택 필드로 추가한다. 기존 codexProject/projectCwd 응답은 보존한다. Python 테스트로 명시/추정/미지정/삭제된 배정 및 원본 보존을 확인한다.
2. Desktop 전용 분류 helper를 추가해 부모 분류, 루트별 명시 배정 수집, 유일 배정 통합, 복수 배정 분리 순서로 결정한다. 화면은 이 결과를 목록·필터·선택에 공통 사용한다.
3. 단위/브라우저 테스트로 동일 루트, 같은 이름 다른 ID, 다른 호스트/루트, 미배정 bridge 방지, inferred Codex 충돌, 새로고침 재분류, 부모·자식 및 원래 세션 열기를 확인한다.
4. 전체 Desktop Python, 관련 Node 테스트, Desktop Playwright, npm check, Go test/vet, Windows 빌드, 실제 읽기 전용 ALT Test 분류 및 화면 캡처를 확인한다. 실패는 원인과 함께 기록한다.
5. diff 자체 검토와 HANDOFF를 작성하고 이번 변경만 `Unify desktop project roots while preserving explicit assignments`로 커밋한다.

- 예상 파일: bridge/테스트, DesktopApp.svelte, desktopSessionTree.ts의 선택 타입, 새 desktopProjects.ts 및 관련 단위/브라우저 테스트, desktop/README.md, 이 작업 문서와 새 검증 캡처.
- 완료 기준: 확정 분류 규칙이 자동 적용되고 기존 그룹·상태·검색·트리·원래 세션 열기가 회귀하지 않으며 빌드 실행 파일이 갱신된다.
