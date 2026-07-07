# 🏭 미미팩토리 자동화 허브

**"시트에 한 줄 쓰면, 매일 아침 새 앱이 홈페이지에 걸린다."**

## 폴더 구조

| 위치 | 역할 |
|---|---|
| `index.html` | 허브 홈페이지 (apps.json을 읽어 카드 자동 렌더링) |
| `apps.json` | 앱 목록 매니페스트 — **홈페이지의 유일한 데이터 소스** |
| `apps/` | 완성된 퀴즈/테스트 HTML 파일들 |
| `.claude/skills/` | 스킬 4종 폴더를 여기에 복사 (quiz-to-read-a-book, book-palette-12, mimi-factory-webapp, dopamine-assessment-builder) |
| `scripts/build_from_sheet.py` | 자동 생산 스크립트 (시트 → Claude → 검증 → 배포) |
| `scripts/apps_script_webhook.gs` | 시트 상태 기록 + 텔레그램 알림 (구글 시트에 설치) |
| `.github/workflows/daily-build.yml` | 매일 06:00 KST 자동 실행 스케줄 |

## 구글 시트 열 구성 (1행은 머리글)

| A 유형 | B 제목 | C 작가/설명 | D 팔레트 | E 에디션 | F 상태 | G URL | H 완료일 |
|---|---|---|---|---|---|---|---|
| 독서퀴즈 | 데미안 | 헤르만 헤세 | (선택) | 프리미엄+티저 | 대기 | (자동) | (자동) |
| 테스트 | 사랑의 언어 진단 | 5가지 사랑의 언어 | | 무료 | 대기 | (자동) | (자동) |

## GitHub Secrets (Settings → Secrets and variables → Actions)

| 이름 | 값 | 필수 |
|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com에서 발급한 API 키 | ✅ |
| `SHEET_CSV_URL` | 시트 "웹에 게시" CSV 주소 | ✅ |
| `WEBHOOK_URL` | Apps Script 웹 앱 URL | 선택 |
| `SITE_URL` | 홈페이지 주소 (예: https://아이디.github.io/리포명) | 선택 |

## 수동으로 앱 추가하기 (자동화 없이)

1. 완성 HTML을 `apps/` 폴더에 업로드
2. `apps.json`의 `"apps"` 배열에 항목 하나 추가 (기존 항목 복사 후 수정)
3. 저장(commit)하면 1~2분 내 홈페이지에 자동 반영

---
"의미와재미공장" 미미팩토리 (주식회사 연:결 패밀리회사)
