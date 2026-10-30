# Handoff: Desktop 세션 통합 관리자

- 일자: 2026-10-30 (Asia/Seoul)
- 스킬: software-change-workflow
- 현재 단계: Step 1 로컬 기존 세션 검증 완료. Step 2 최소 UI 연결 준비.
- 사용자 결정: Codex 독립 창 필수. 기존 창 이동 대안 불허.

## 완료

- 별도 저장소 clone, upstream 커밋 고정 및 desktop-session-integration 브랜치 생성.
- npm ci --ignore-scripts 완료.
- 원본 npm run build 통과.
- 원본 npm run check: 오류 0개, 기존 경고 111개 / 29개 파일.
- 공식 Go 배포에서 Go 1.27.3을 .tools에 준비하고 SHA-256 대조 완료. 전역 설치/설정 변경 없음.
- 원본 Wails/터미널 의존성 및 기존 Claude Python 모듈 조사.
- Codex 설치 번들 읽기 전용 조사: OS 링크 처리와 내부 별도 창 메시지 분리를 확인. verification/desktop-window-contract.json 참조.

## 검증 상태

- npm test: 두 번 동일하게 1008개 중 984 통과, 24 실패. Windows의 URL.pathname/ESM import/구분자 및 Unix grep 사용을 확인했다. 원본 테스트/제품은 수정하지 않았다. .tools/upstream-frontend-test.log 및 재실행 로그 참조.
- go test ./...: PortAudio가 pkg-config를 찾지 못해 루트/음성 패키지 빌드 실패. 원본 CI는 MSYS2 UCRT64 GCC/pkgconf/PortAudio를 사용한다. 제품 소스 결함으로 판정하지 않음.
- go test ./session에서 sh를 가정한 테스트가 실패했다. 같은 테스트를 재현한 뒤 해당 명령의 PATH에만 Git의 bin/usr/bin을 추가하면 통과함을 확인했다.
- Codex: C# System.Windows.Automation에서 파일 메뉴의 새 창 InvokePattern 후 공식 대화 링크를 전달했다. 새 HWND 1574424가 생기고 기존 HWND 1246974와 같은 대상 문서 제목이 표시됨을 확인했다.
- Claude: 기존 브리지가 지정한 세션 ID의 성공 응답을 반환하고 해당 제목의 독립 HWND 5638184가 존재함을 확인했다.
- Computer Use는 사용자 지시에 따라 중단했다. 이후 검증은 네이티브 API만 사용했다. 설치 파일/보안 설정/메시지 본문은 변경하지 않았다.

## 변경 범위

- .gitignore에 /.tools/ 추가: 로컬 빌드 도구와 로그만 제외한다.
- 작업 문서와 검증 근거 추가.
- 제품 소스/테스트/의존성 버전 및 설치된 Desktop 앱/대화 원본 변경 없음.
- 기존 D:/repos/intellian/Session_Manager는 수정하지 않음.

## 미결 사항과 다음 작업

1. 검증한 Codex 네이티브 메뉴+URI 경로를 타임아웃, 새 HWND 확인, 대상 문서 확인이 있는 helper로 정리한다.
2. 기존 Claude Python 모듈을 재사용하는 Desktop bridge와 원본 스타일의 최소 UI를 연결한다.
3. 원본 전체 Windows 빌드가 필요하면 CI와 같은 UCRT64/PortAudio 도구 체인을 준비한다.
4. Step 1을 통과한 뒤에만 Step 2를 진행한다. 기존 창 이동이나 대화 복제를 독립 창 구현으로 보고하지 않는다.

Codex 설치 파일 수정이나 원격 디버깅으로 앱 내부 함수를 주입하는 접근은 선택하지 않았다. 외부 연동 가능성 미확보를 확정적인 불가능 판정으로 확대하지 않는다.
