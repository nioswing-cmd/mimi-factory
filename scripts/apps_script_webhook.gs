/**
 * 미미팩토리 — 시트 상태 자동 기록 + 텔레그램 알림 + 상태 드롭다운 (멀티탭판)
 * ────────────────────────────────────────────────
 * 설치 방법 (구글 시트에서):
 *  1) 시트 열기 → 상단 메뉴 [확장 프로그램] → [Apps Script]
 *  2) 이 파일 내용을 전부 붙여넣기 (기존 코드 교체)
 *  3) 아래 TELEGRAM_TOKEN / CHAT_ID 를 본인 값으로 수정 (없으면 빈칸 유지 = 알림 생략)
 *  4) 우상단 [배포] → [새 배포] → 유형 '웹 앱'
 *     - 실행 계정: 나  /  액세스 권한: 모든 사용자
 *     (코드만 교체하는 경우 재배포 불필요 — doPost 로직이 바뀌었으면
 *      [배포] → [배포 관리] → 연필 아이콘 → 버전 '새 버전' → 배포)
 *  5) 웹 앱 URL을 파이프라인 환경변수 WEBHOOK_URL 에 등록
 *  6) 상단 함수 선택에서 setupStatusDropdown 고르고 ▶ 실행 1회
 *     → 모든 탭의 '상태' 열에 대기/긴급/중지 드롭다운 생성
 *
 * 멀티탭: 탭이 곧 유형(시트1=독서퀴즈, 도파민 실험실=테스트, 둘의 피크닉=친해지기).
 * 열 위치는 1행 머리글 이름(제목/상태/url/완료일)으로 찾으므로 열을 옮겨도 동작한다.
 * 상태 값: 대기(순서대로 생산) / 긴급(최우선) / 중지(건너뜀) / 완료·실패(시스템 기록)
 */

var TELEGRAM_TOKEN = "";   // 예: "123456:ABC-DEF..."  (비우면 알림 생략)
var CHAT_ID = "";          // 예: "987654321"

/** 머리글에서 열 번호 찾기 (1부터). 없으면 -1 */
function colOf_(sheet, name) {
  var last = Math.max(1, sheet.getLastColumn());
  var head = sheet.getRange(1, 1, 1, last).getValues()[0];
  for (var j = 0; j < head.length; j++) {
    if (String(head[j]).toLowerCase().indexOf(name) !== -1) return j + 1;
  }
  return -1;
}

/** gid로 탭 찾기. 없으면 첫 탭 */
function sheetByGid_(gid) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === String(gid)) return sheets[i];
  }
  return sheets[0];
}

function doPost(e) {
  var p = e.parameter;                 // row, gid, status, url, date, title
  var sheet = sheetByGid_(p.gid || "0");
  var row = parseInt(p.row, 10);

  var cs = colOf_(sheet, "상태"), cu = colOf_(sheet, "url"), cd = colOf_(sheet, "완료일");
  if (cs > 0) sheet.getRange(row, cs).setValue(p.status);
  if (p.url && cu > 0) {
    // 클릭하면 바로 열리는 하이퍼링크로 기록
    sheet.getRange(row, cu).setFormula('=HYPERLINK("' + p.url + '","🔗 열기")');
  }
  if (p.date && cd > 0) sheet.getRange(row, cd).setValue(p.date);

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

/** 모든 탭의 '상태' 열에 드롭다운 설치 — 1회만 실행하면 됨 */
function setupStatusDropdown() {
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["대기", "긴급", "중지", "완료", "실패"], true)
    .setAllowInvalid(true)
    .setHelpText("대기: 순서대로 생산 · 긴급: 최우선 생산 · 중지: 건너뜀")
    .build();
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    var cs = colOf_(sheet, "상태");
    if (cs > 0) sheet.getRange(2, cs, 999).setDataValidation(rule);
  });
}

/** 기존에 텍스트로 적힌 URL들을 클릭 가능한 링크로 일괄 변환 — 1회만 실행하면 됨 */
function linkifyExistingUrls() {
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sheet) {
    var cu = colOf_(sheet, "url");
    if (cu < 1) return;
    var last = sheet.getLastRow();
    if (last < 2) return;
    var vals = sheet.getRange(2, cu, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var v = String(vals[i][0]).trim();
      if (v.indexOf("http") === 0) {  // 이미 링크(🔗 열기)로 바뀐 셀은 건너뜀
        sheet.getRange(i + 2, cu).setFormula('=HYPERLINK("' + v + '","🔗 열기")');
      }
    }
  });
}

/** 어느 탭이든 제목을 새로 적으면 상태를 자동으로 '대기'로 — 기본값 역할 */
function onEdit(e) {
  var r = e.range;
  var sheet = r.getSheet();
  if (r.getRow() < 2) return;
  if (r.getColumn() !== colOf_(sheet, "제목")) return;
  var cs = colOf_(sheet, "상태");
  if (cs < 1) return;
  var statusCell = sheet.getRange(r.getRow(), cs);
  if (e.value && !statusCell.getValue()) statusCell.setValue("대기");
}
