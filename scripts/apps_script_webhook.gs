/**
 * 미미팩토리 — 시트 상태 자동 기록 + 텔레그램 알림
 * ────────────────────────────────────────────────
 * 설치 방법 (구글 시트에서):
 *  1) 시트 열기 → 상단 메뉴 [확장 프로그램] → [Apps Script]
 *  2) 이 파일 내용을 전부 붙여넣기
 *  3) 아래 TELEGRAM_TOKEN / CHAT_ID 를 본인 값으로 수정 (없으면 빈칸 유지 = 알림 생략)
 *  4) 우상단 [배포] → [새 배포] → 유형 '웹 앱'
 *     - 실행 계정: 나  /  액세스 권한: 모든 사용자
 *  5) 발급된 웹 앱 URL을 GitHub Secrets의 WEBHOOK_URL 에 등록
 */

var TELEGRAM_TOKEN = "";   // 예: "123456:ABC-DEF..."  (비우면 알림 생략)
var CHAT_ID = "";          // 예: "987654321"

function doPost(e) {
  var p = e.parameter;                 // row, status, url, date, title
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var row = parseInt(p.row, 10);

  sheet.getRange(row, 6).setValue(p.status);          // F열: 상태
  if (p.url)  sheet.getRange(row, 7).setValue(p.url); // G열: URL
  if (p.date) sheet.getRange(row, 8).setValue(p.date);// H열: 완료일

  if (TELEGRAM_TOKEN && CHAT_ID) {
    var emoji = p.status === "완료" ? "🌸" : "🚨";
    var msg = emoji + " 미미팩토리 " + p.status + ": " + p.title +
              (p.url ? "\n" + p.url : "");
    UrlFetchApp.fetch("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
      method: "post",
      payload: { chat_id: CHAT_ID, text: msg }
    });
  }
  return ContentService.createTextOutput("ok");
}
