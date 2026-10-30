# 부모·하위 세션 표시

- 날짜: 2026-10-30 (Asia/Seoul)
- 단계: 구현·검증·Windows 빌드 완료
- 스킬: software-change-workflow
- 승인: 사용자가 부모 아래 접기/펼치기, 검색 시 조상 표시, 고아 세션 유지, 자식 전용 폴더 생략 제안을 승인하고 구현·빌드를 요청했다.

## 변경

- 공용 `Session_Manager/session_manager/models.py`에 기본값이 있는 `parent_session_id`, `side_session_name`을 마지막에 추가했다. 기존 생성자 호출은 유지된다.
- 공용 `storage.py`는 명시적 `spawnedFrom.sideSession === true`의 부모 ID·이름을 전달한다. 관계 구조가 잘못돼도 대화 자체는 버리지 않는다. 원본 JSON을 수정하지 않는다.
- Desktop `bridge.py`는 Claude 제공자·계정·조직을 포함한 부모 key와 하위 이름을 전달한다. 같은 ID의 다른 계정/조직 또는 제공자에 연결하지 않는다. Codex 내부 subagent 제외 규칙은 유지했다.
- `frontend/src/lib/utils/desktopSessionTree.ts`에 여러 단계 계층 구성, 가족 최근 활동 정렬, 누락·순환·자기 참조 분리, 필터·검색 조상 문맥 및 표시 행 생성을 구현했다.
- `DesktopApp.svelte`: 기본 접힘, 별도 화살표 버튼으로 펼침/접기, 검색 자동 펼침과 검색 중 수동 접기, 계층 들여쓰기, 하위 개수와 별도 작업 중 요약, 부모 이동 링크, 부모 확인 불가 표시를 추가했다. 하위 이름을 목록에 표시하고 원래 제목은 tooltip·상세 화면에 유지한다.
- 부모 자신의 상태와 시간은 하위 상태로 덮어쓰지 않는다. 하위 작업 중 요약은 상태 관찰 만료 시 사라진다. 펼침 상태는 조회 갱신 후 유지되며 앱 시작 시에는 접혀 있다.
- 폴더 필터는 조회 가능한 최상위 부모의 작업 위치를 따른다. 자식 전용 폴더는 숨기고, 같은 경로에 독립 대화가 있으면 유지한다. 부모를 못 찾으면 자신의 경로와 독립 행으로 접근한다.
- 사용자 그룹은 실제 멤버만 필터 기준으로 사용한다. 자식만 그룹 멤버인 경우 부모 문맥은 자동 펼쳐 보이고 멤버가 아닌 형제는 넣지 않는다. 그룹 저장 데이터·원본 열기 key·URI 프로토콜은 유지했다.
- 기존 기본/최소 크기·컴퓨터 묶음 캡처를 갱신하고, 새 계층 기본/최소 크기 캡처 2개를 추가했다.

## 검증

- 공용 Python: `python -m unittest discover -s tests -p 'test_*.py' -v` — 67개 통과. 기존 Tk GUI/조회·열기·그룹 회귀 포함.
- Desktop Python: `python -m unittest discover -s desktop -p 'test_*.py' -v` — 23개 통과. 실제 SessionStore→bridge 관계 전달과 계정·조직 구분, 원본 파일 보존 포함.
- 계층 helper: `node --test tests/desktopSessionTree.test.mjs` — 5개 통과. 중첩·정렬·검색·그룹 범위·누락·순환·자기 참조·제공자/계정 격리 확인.
- Desktop 브라우저: 전체 16개 통과 후, 계획된 하위 상태 만료 검증 1개를 추가해 해당 테스트도 통과했다. 현재 파일은 기존/신규 합계 17개 테스트를 포함한다.
- 최초 브라우저 실행은 15개 통과/1개 실패였다. 하위 상태 구분점 앞 공백이 Svelte에서 제거되는 표시 문제를 명시적 문자열 공백으로 수정한 뒤 전체 16개가 통과했다. 기존 검색·필터·그룹·상태·열기 테스트도 통과했다.
- `npm run check`: 최종 오류 0개, 기존 경고 111개/29개 파일. DesktopApp 및 새 helper 오류 없음.
- `scripts/build-desktop.ps1`: 성공. `desktop/build/bin/desktop-session-manager.exe` 갱신.
- 빌드된 `desktop/assets`를 실제 읽기 전용 메타데이터 응답으로 확인했다. 전체 429개, 부모에 연결되는 하위 11개, 기본 접힌 행 418개, 부모 누락 0개, 조회 경고 없음. `t3-aw`, `t3-wf`가 `wf- 워크플로우 압축 및 링크` 아래에서 펼쳐지고, `t3-aw` 검색 시 부모와 자식 2행이 표시됐다. 자식 상세 제목과 부모 이동 링크도 확인했다.
- 1380×880 및 960×640 모의 화면을 시각 확인했다. 중첩 들여쓰기·상태 열·작업 폴더가 겹치지 않고 가로 overflow가 없다.
- 실제 대화 열기·원본 그룹 변경·프롬프트 전송은 수행하지 않았다. 열기 요청의 원본 key는 mock bridge로 검증했다.
- 자체 검토: 관계 정보만으로 연결하며 이름/경로 추측 없음. 순환 관계가 대화를 누락시키거나 무한 순회를 만들지 않는다. 필터에 포함되지 않은 형제는 그룹 결과에 추가하지 않는다. 의존성 추가와 Go 변경 없음. `git diff --check` 통과.

## 체크포인트와 적용

- Desktop 변경은 이 작업만 scoped commit한다. 기존 untracked `verification/desktop-replacement-backup/`은 제외했다.
- 공용 Python 폴더는 Git 저장소가 아니므로 `SHARED-CHANGES.patch`에 이 작업 변경을 기록하고 `SHARED-CHECKPOINT.json`에 검증한 3개 파일의 SHA256을 남겼다. Desktop 빌드는 해당 공용 Python 모듈을 계속 사용한다.
- 빌드된 실행 파일 SHA256: `2043F419171E47F57FC383FFC74445BA4C28AF00051E73D70A3891A1EBB4BE29`.
- 앱을 다시 실행하면 적용된다. 실제 UI 검증용 JSON/스크립트는 무시되는 `frontend/test-results/hierarchy-live.*`에 보관했다.
- Claude가 내부 관계 형식을 바꾸면 재검증이 필요하다. 관계 정보가 없는 세션은 기존 독립 세션으로 유지한다.
