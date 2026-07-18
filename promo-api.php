<?php
/* 미미팩토리 프로모션 토글 API (밤의 서재 풀버전 오픈)
   - GET  ?action=get                          → {"open":true|false, "until":unix|0}
   - POST action=set&open=0|1&hours=0|24|168&pin= → PIN(SHA-256) 검증 후 저장
   저장: data/promo.json (flock, data/는 .htaccess로 직접 접근 차단)
   실패 시엔 항상 닫힘으로 폴백. PIN 원문은 서버에 저장하지 않음(해시만). */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$PIN_HASH = '1f9f53d0acb2304704e08e764d6b94252a37d89f9d086499f68aa46db1e194bc';

$dir  = __DIR__ . '/data';
$file = $dir . '/promo.json';
if (!is_dir($dir)) { @mkdir($dir, 0755, true); }

$action = isset($_POST['action']) ? $_POST['action'] : (isset($_GET['action']) ? $_GET['action'] : 'get');

if ($action === 'set' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $pin = isset($_POST['pin']) ? (string)$_POST['pin'] : '';
  if (!hash_equals($PIN_HASH, hash('sha256', $pin))) {
    http_response_code(403);
    echo '{"error":"pin"}';
    exit;
  }
  $open  = isset($_POST['open']) && $_POST['open'] === '1';
  $hours = isset($_POST['hours']) ? (int)$_POST['hours'] : 0;
  if ($hours < 0 || $hours > 24 * 90) $hours = 0;   // 최대 90일
  $until = ($open && $hours > 0) ? time() + $hours * 3600 : 0;

  $fp = @fopen($file, 'c+');
  if (!$fp) { echo '{"open":false}'; exit; }
  if (flock($fp, LOCK_EX)) {
    $data = array('open' => $open, 'until' => $until, 'set_at' => time());
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
  } else {
    fclose($fp);
  }
  echo json_encode(array('open' => $open, 'until' => $until));
  exit;
}

/* action=get */
$open = false; $until = 0;
if (file_exists($file)) {
  $j = json_decode(@file_get_contents($file), true);
  if (is_array($j) && !empty($j['open'])) {
    $until = isset($j['until']) ? (int)$j['until'] : 0;
    $open  = ($until === 0) || (time() < $until);
  }
}
echo json_encode(array('open' => $open, 'until' => $open ? $until : 0));
