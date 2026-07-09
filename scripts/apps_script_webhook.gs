/**
 * 미미팩토리 — 시트 상태 자동 기록 + 텔레그램 알림 + 상태 드롭다운
 * ────────────────────────────────────────────────
 * 설치 방법 (구글 시트에서):
 *  1) 시트 열기 → 상단 메뉴 [확장 프로그램] → [Apps Script]
 *  2) 이 파일 내용을 전부 붙여넣기
 *  3) 아래 TELEGRAM_TOKEN / CHAT_ID 를 본인 값으로 수정 (없으면 빈칸 유지 = 알림 생략)
 *  4) 우상단 [배포] → [새 배포] → 유형 '웹 앱'
 *     - 실행 계정: 나  /  액세스 권한: 모든 사용자
 *  5) 발급된 웹 앱 URL을 파이프라인 환경변수 WEBHOOK_URL 에 등록
 *  6) (선택) 상단 함수 선택에서 setupStatusDropdown 고르고 ▶ 실행 1회
 *     → F열에 대기/긴급/중지 드롭다운 생성. 이후 제목만 적으면 상태가 자동으로 '대기'가 됨.
 *
 * 상태 값 의미: 대기(순서대로 생산) / 긴급(최우선 생산) / 중지(건너뜀) / 완료·실패(시스템 기록)
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

/** F열(상태)에 드롭다운 설치 — 1회만 실행하면 됨 */
function setupStatusDropdown() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["대기", "긴급", "중지", "완료", "실패"], true) // true = 드롭다운 표시
    .setAllowInvalid(true)   // 웹훅이 다른 값을 써도 경고만 (차단 안 함)
    .setHelpText("대기: 순서대로 생산 · 긴급: 최우선 생산 · 중지: 건너뜀")
    .build();
  sheet.getRange("F2:F1000").setDataValidation(rule);
}

/** 제목(B열)을 새로 적으면 상태(F열)를 자동으로 '대기'로 — 기본값 역할 */
function onEdit(e) {
  var r = e.range;
  var sheet = r.getSheet();
  if (sheet.getIndex() !== 1) return;              // 첫 번째 시트만
  if (r.getColumn() !== 2 || r.getRow() < 2) return; // B열, 2행부터
  var statusCell = sheet.getRange(r.getRow(), 6);   // F열
  if (e.value && !statusCell.getValue()) statusCell.setValue("대기");
}
