# CODEX PROJECTS — 완료

- 날짜: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 대상: D:/repos/intellian/Session_Manager_Desktop

## 구현

- bridge가 기존 projectCwd와 함께 `codexProject: {id, name}`을 전달한다. SQLite 이름/ID를 우선 사용하고, 구형 전역 상태의 명시적 local 프로젝트 배정을 지원한다. 이름이 없는 프로젝트는 기존 대표 루트 폴더명을 사용한다.
- `app-server-project-id-by-legacy-project-id-by-host`에서 현재 CODEX_HOME(원래/해석된 경로)의 명시적 매핑만 사용한다. 연결된 native 프로젝트가 유효하면 구형 ID를 native ID로 정규화해 서로 다른 저장 형식의 동일 프로젝트가 중복되지 않게 했다. 다른 호스트, 이름/루트 유사성으로 연결하지 않는다.
- 사이드바의 읽기 전용 CODEX PROJECTS에 원래 이름을 표시한다. 제공자/환경/호스트/멤버 범위/프로젝트 ID로 키를 생성해 같은 이름과 루트라도 ID가 다르면 분리한다. 해당 대화는 PROJECT FOLDERS 목록에서 제외한다.
- Claude 원본 그룹, 사용자 GROUPS, 일반 폴더와 병합하지 않는다. 프로젝트 미지정은 이 컴퓨터, 배정 없는 대화는 기존 폴더 분류를 유지한다. cwd를 근거로 새 프로젝트 배정을 추정하지 않는다.
- 프로젝트명 검색, 상세 화면의 프로젝트명, 이름 변경 후 선택 유지와 배정 제거 후 범위 초기화를 확인했다. 원래 작업 경로와 세션 ID/열기 동작은 보존한다.

## 검증

- 신규 Python 검증 2개가 프로젝트 필드 부재로 실패하는 것을 확인하고 구현했다.
- `python -m unittest discover -s desktop -p 'test_*.py'`: 41개 통과. 원본 ID/이름, SQLite 우선순위, 현재 호스트의 ID 매핑/다른 호스트 격리, 이름 fallback, 미지정/잘못된 배정의 프로젝트 필드 부재, 원본 내용/hash와 갱신을 확인했다.
- `npx playwright test --config playwright.desktop.config.mjs`: 29개 통과. 명시적 worktree 합산과 일반 Claude 폴더 분리, 같은 이름/루트의 서로 다른 ID 분리, 같은 이름의 Claude 그룹/Codex 프로젝트/일반 폴더 분리, 이름 변경과 배정 제거, 검색/새로고침/상세/원래 세션 열기를 확인했다. 기존 상태·트리·그룹 테스트도 통과했다.
- `npm run check`: 오류 0개, 기존 경고 111개/29개 파일.
- `scripts/build-desktop.ps1`: 성공. desktop/build/bin/desktop-session-manager.exe 갱신.
- 빌드된 desktop/assets에 실제 읽기 전용 스냅샷을 주입했다. 전체 432개(Claude 122/Codex 310), CODEX PROJECTS 12개에 직접 배정 116개, Codex 미지정 57개, 폴더 fallback 137개. PROJECT FOLDERS 22개, CLAUDE GROUPS 4개. 알림/pageerror 없음.
- 실제 프로젝트 12개를 모두 선택해 각 프로젝트의 모든 표시 세션 키를 기대 목록과 비교했고 총 116개 배정이 일치했다. Codex workflow_improvement 6개와 Claude Improve_Workflow의 기존 대화 2개는 서로 다른 목록으로 표시된다. UDCM_Calibration 프로젝트 배정은 45개이며, 나머지 같은 cwd의 미배정 대화는 폴더에 남는다.
- 검증 캡처를 시각 확인했다: verification/desktop-codex-projects.png, verification/desktop-source-classification.png, verification/desktop-codex-projects-live.png. 실제 스냅샷과 스크립트는 무시되는 frontend/test-results에 보관했다. 실제 대화 열기/그룹 쓰기는 요청하지 않았다.
- 자체 diff 검토와 git diff --check 통과. 제품 의존성·원본 저장 형식·공용 Python/Tk·Claude 그룹 reader 변경 없음. 기존 untracked verification/desktop-replacement-backup은 제외하고 scoped commit한다.

## 적용과 제한

- Desktop Session Manager를 다시 실행하면 새 화면이 적용된다.
- 같은 이름이 다른 영역에 있을 수 있다. 원본 프로젝트/Claude 그룹/실제 폴더는 서로 다른 기준이므로 자동 병합하지 않는다.
- 기존과 같이 유효한 대표 루트가 있는 프로젝트를 지원한다. 지원하지 않는/없는 배정은 원래 경로로 분류한다. 원본 저장 키나 스키마가 바뀌면 재검증이 필요하다.
