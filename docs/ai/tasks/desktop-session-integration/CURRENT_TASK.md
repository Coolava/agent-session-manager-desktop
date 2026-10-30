# Desktop 세션 통합 관리자

- 날짜: 2026-10-30 (Asia/Seoul)
- 저장소: D:/repos/intellian/Session_Manager_Desktop
- 브랜치: desktop-session-integration
- upstream 기준: 2ee0449d8721a2d32433ba8515667dcd5318b143
- 현재 단계: 구현과 최종 검증 완료

## 현재 승인 요구사항

원본 앱의 디자인을 활용해 Claude/Codex Desktop의 기존 세션을 조회하고 해당 앱에서 연다. 세션 목록, 검색, 그룹, 상태 화면을 연결한다.

**최종 사용자 지시: “그냥 새 창 열기 말고 Session을 열기만 하자.”**

이 지시가 이전 독립 창 필수 조건과 UI 자동화 검증 계획을 대체한다. 최종 구현은 검증된 세션 ID의 대화 URL만 OS에 전달한다. 새 창 강제 생성, Computer Use, UI 자동화, 프롬프트 전송 및 세션 복제를 사용하지 않는다.

## 성공 기준

- 실제 Desktop 메타데이터를 읽고, 선택한 세션 ID에 해당하는 앱 URL을 전달한다.
- 열기 중 중복 입력을 막으며 요청 실패를 화면에 표시한다.
- OS에 링크를 전달한 결과와 Desktop 화면 전환 완료를 구분한다.
- 그룹 편집은 관리자 전용 저장소만 변경한다.
- 기존 Python 프로젝트와 Desktop 설치 파일/대화 원본은 수정하지 않는다.

## 검증 범위

현재 Windows의 로컬 기존 세션에 대해 두 Desktop 링크 전달을 확인했다. Claude SSH는 기존 모듈을 재사용하며 이번 실제 열기 검증 대상에는 포함하지 않았다. 새 대화 생성과 클라우드/Codex 원격 세션은 범위 밖이다.
