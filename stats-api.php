<?php
/* 미미팩토리 실측 통계 API
   - GET  ?action=get            → 전체 집계 {qid:[c0,c1,c2,c3], ...}
   - POST action=vote&qid=&opt=  → 해당 문항 선택 +1, {qid:[...]} 반환
   저장: data/stats.json (flock으로 동시성 보호, data/는 .htaccess로 직접 접근 차단)
   실패 시엔 항상 '{}' — 앱은 참고치로 폴백한다. */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$dir  = __DIR__ . '/data';
$file = $dir . '/stats.json';
if (!is_dir($dir)) { @mkdir($dir, 0755, true); }

$action = isset($_POST['action']) ? $_POST['action'] : (isset($_GET['action']) ? $_GET['action'] : 'get');

if ($action === 'vote' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  $qid = isset($_POST['qid']) ? preg_replace('/[^a-z0-9_\-]/i', '', $_POST['qid']) : '';
  $opt = isset($_POST['opt']) ? (int)$_POST['opt'] : -1;
  if ($qid === '' || strlen($qid) > 24 || $opt < 0 || $opt > 3) { echo '{}'; exit; }

  $fp = @fopen($file, 'c+');
  if (!$fp) { echo '{}'; exit; }
  if (flock($fp, LOCK_EX)) {
    $raw  = stream_get_contents($fp);
    $data = json_decode($raw, true);
    if (!is_array($data)) $data = array();
    if (!isset($data[$qid]) || !is_array($data[$qid])) $data[$qid] = array(0, 0, 0, 0);
    $data[$qid][$opt] = (int)$data[$qid][$opt] + 1;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($data));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    echo json_encode(array($qid => $data[$qid]));
  } else {
    fclose($fp);
    echo '{}';
  }
  exit;
}

/* action=get */
if (!file_exists($file)) { echo '{}'; exit; }
$j = json_decode(file_get_contents($file), true);
echo is_array($j) ? json_encode($j) : '{}';
