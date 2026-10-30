# Claude 원본 사용자 그룹 분류

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 승인: 사용자가 Claude 사용자 그룹 배정 반영과 Codex 프로젝트 자동 병합 금지를 명시했다.
- 위험: Medium. 읽기 전용 메타데이터와 기존 사이드바 분류만 변경한다.
- 상태: Step 1 구현·검증 완료. 결과는 HANDOFF.md 참조.

## 확인 사실과 결정

- Claude의 Local Storage/leveldb에는 `LSS-persisted.dframe-group-scopes`가 있고, value 아래 계정/조직별 groups와 assignments가 저장된다. `code:local_<id>`가 원본 그룹 ID를 가리킨다.
- Improve_Workflow에는 사용자 홈에서 실행한 대화 2개가 명시적으로 배정되어 있다. 주제·cwd로 추측하지 않는다.
- LevelDB를 열거나 복구하지 않고 CURRENT/MANIFEST가 지정한 테이블 및 현재 로그만 파일 읽기로 해석한다. 최신 sequence와 tombstone, Snappy, 분할 로그를 지원한다. 새 패키지나 원본 쓰기를 추가하지 않는다.
- 현재 확인한 canonical 키만 사용한다. 이전 dframe-store 복사본으로 돌아가 삭제된 그룹을 복원하지 않는다. 읽기·형식 오류는 알림과 함께 기존 폴더 분류로 돌아간다.
- CLAUDE GROUPS 영역을 추가한다. 그룹 키는 제공자+계정/조직+원본 그룹 ID이며 이름·폴더·Codex 프로젝트로 병합하지 않는다. 기존 사용자 GROUPS 편집은 별개로 유지한다.
- 명시적 배정은 scratch/폴더보다 우선한다. 자식 대화는 자신의 명시적 배정이 있으면 이를 사용하고, 없으면 가장 가까운 부모의 분류를 따른다. 그룹 필터의 자식 검색에서는 기존 트리가 부모를 문맥으로 표시한다.

## Step 1

1. `desktop/claude_groups.py`에 필요한 키만 반환하는 읽기 전용 reader를 구현하고 bridge가 계정/조직별 배정을 세션에 전달한다.
2. DesktopApp와 세션 모델에 원본 그룹을 반영하고 별도 목록·필터·검색·상세 표시를 추가한다. ID·cwd·열기·그룹 편집·기존 Codex 분류는 보존한다.
3. Python fixture 테스트로 최신 WAL/삭제/compaction/압축/손상·원본 보존·scope 분리·갱신을, Playwright로 원본 그룹/Codex/동명 계정 분리·자식 배정·폴더 fallback·검색·새로고침·열기를 검증한다.
4. Python 전체 Desktop 테스트, Playwright, npm check, Windows 빌드, 실제 읽기 전용 스냅샷 UI와 캡처를 확인한다. 자체 diff 검토 후 HANDOFF를 남기고 scoped commit한다.

- 완료 기준: 예시 대화 2개가 Improve_Workflow에 모이고 Codex workflow_improvement와 분리된다. 실제 원본 데이터에 쓰기 없음.
- 체크포인트: `Classify Claude sessions using original user groups`.
- 제외: 공용 Python 저장 형식·이전 Tk GUI, 원본 앱 그룹 편집/이동, 사용자 그룹 자동 생성, 다른 제공자의 분류 변경, 기존 verification/desktop-replacement-backup.
- 형식 참고: google/leveldb의 doc/table_format.md, doc/log_format.md, db/version_edit.cc와 google/snappy의 format_description.txt.
