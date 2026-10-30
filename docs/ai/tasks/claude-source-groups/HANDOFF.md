# Claude 원본 사용자 그룹 — 완료

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 대상: D:/repos/intellian/Session_Manager_Desktop

## 변경

- `desktop/claude_groups.py`가 APPDATA/Claude/Local Storage/leveldb의 canonical `LSS-persisted.dframe-group-scopes` 키를 파일 읽기만으로 조회한다. CURRENT/MANIFEST의 active 테이블과 WAL을 읽어 sequence 순 최신 값/삭제를 적용한다. Snappy, prefix-compressed entries, CRC32C, 분할 로그, Chromium Latin-1/UTF-16 문자열을 지원한다. DB를 열거나 잠금·복구·원본 쓰기를 하지 않는다.
- Compaction 중 파일 변경은 한 번 재시도한다. 저장소 부재는 기존 분류 유지, 손상·지원하지 않는 형식·읽기 실패는 알림과 함께 폴더 분류로 돌아간다. 구형 dframe-store 복사본을 fallback으로 읽지 않아 삭제 배정을 복원하지 않는다.
- bridge가 계정/조직/세션 ID에 맞는 `claudeGroup: {id, name}`을 전달한다. Codex 메타데이터와 공용 Python/Tk 코드는 변경하지 않았다.
- `CLAUDE GROUPS`는 읽기 전용 원본 그룹 목록이다. 키는 제공자+계정/조직+그룹 ID이므로 Codex 프로젝트, 동명 폴더, 다른 계정과 다른 ID의 동명 그룹을 병합하지 않는다. 기존 GROUPS 저장과 편집은 유지한다.
- 명시적 그룹은 폴더/scratch 분류보다 우선하고, 미배정 자식은 가장 가까운 부모의 분류를 따른다. 명시적 자식 그룹은 부모와 다른 그룹에 표시되며 부모 행은 트리 문맥으로 보인다. 그룹 배정이 제거되면 선택 범위를 전체로 돌리고 기존 폴더 분류를 복원한다.
- 그룹명 검색과 상세 화면의 원본 그룹 표시를 추가했다. 원래 cwd·세션 키·열기 프로토콜·상태/사용자 GROUPS 동작은 보존한다.

## 검증

- 신규 bridge 테스트가 원본 그룹 필드 부재로 실패하는 것을 확인한 뒤 통합 코드를 구현했다.
- `python -m unittest discover -s desktop -p 'test_*.py'`: 최종 39개 통과. 압축 테이블·최신 WAL·table/WAL tombstone·배정 제거·compaction의 obsolete 파일 제외·분할 및 불완전 append·CRC 오류·인코딩·계정 격리·갱신·전체 fixture 파일 hash 보존을 확인했다.
- 추가한 Latin-1 테스트에 테스트 변수 범위 오류가 한 번 있었고 fixture 위치만 바로잡은 뒤 전체 Python 테스트가 통과했다.
- `npx playwright test --config playwright.desktop.config.mjs`: 최종 28개 통과. 원본 그룹/동명 Codex 및 폴더/동명 다른 계정과 그룹 ID 분리, scratch 그룹 우선, 배정 삭제 후 fallback, 자식 별도 배정, 검색·새로고침·상세·원래 세션 열기를 확인했다. 최초 부분 실행은 상세의 그룹명 표시 누락으로 1개 실패했고 상세 표시 추가 후 전체가 통과했다.
- `npm run check`: 오류 0개, 기존 경고 111개/29개 파일.
- `scripts/build-desktop.ps1`: 성공. `desktop/build/bin/desktop-session-manager.exe` 갱신.
- 실제 읽기 전용 스냅샷: 전체 432개, Claude 122개/Codex 310개, 원본 그룹 4개에 직접 배정 9개. 알림 없음. 빌드된 desktop/assets를 실제 스냅샷으로 렌더링해 Improve_Workflow의 직접 배정 2개와 하위 4개 총 6개의 모든 세션 키를 기대 목록과 대조했다. `intellian` 폴더 항목은 없어지고 Codex workflow_improvement는 별도로 남는다. 그룹명/제목 검색, 그룹 선택, 브라우저 pageerror 0개 확인.
- 독립 비교: 원본 LevelDB 파일을 TemporaryDirectory로 복사한 뒤, 기존 도구에 포함된 native classic-level로 그 복사본을 열었다. canonical 키의 SHA-256이 새 reader와 일치했다. 네이티브 모듈은 검증에만 사용했으며 제품 의존성으로 추가하지 않았다. 복사본은 검증 종료 후 정리했다.
- 모의 및 실제 캡처를 시각 확인: `verification/desktop-claude-source-groups.png`, `verification/desktop-claude-source-groups-live.png`. 실제 스냅샷/검증 스크립트는 무시되는 frontend/test-results에 보관한다. 실제 대화 열기와 원본 그룹 편집은 하지 않았다.
- 자체 diff 검토 및 git diff --check 통과. 기존 untracked verification/desktop-replacement-backup은 제외하고 이 변경만 scoped commit한다.

## 적용 및 제한

- Desktop Session Manager를 다시 실행하면 새 화면이 적용된다. 원본 그룹 배정은 5초 새로고침마다 다시 읽는다.
- 현재 원본 저장소의 조회 시간은 약 1초다. 캐시로 원본 변경을 늦추는 동작은 추가하지 않았다.
- Claude의 내부 저장 경로나 canonical 키/형식이 변경되면 재검증이 필요하다. 읽지 못하면 경고를 표시하고 기존 폴더 분류를 사용한다. 지원하지 않는 이름·대화 내용에 근거한 추측이나 Codex 자동 병합은 하지 않는다.

## 형식 참고

- [LevelDB table format](https://github.com/google/leveldb/blob/main/doc/table_format.md), [log format](https://github.com/google/leveldb/blob/main/doc/log_format.md), [version edits](https://github.com/google/leveldb/blob/main/db/version_edit.cc), [Snappy format](https://github.com/google/snappy/blob/main/format_description.txt).
- [Chromium storage string encoding](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/storage/cached_storage_area.cc).
