<?php
header('Content-Type: application/json; charset=utf-8');

$configFile = __DIR__ . '/api-config.php';
if (is_file($configFile)) {
  require $configFile;
}

function configured_gemini_key($fallback = '') {
  if ($fallback) return $fallback;
  $env = getenv('GEMINI_API_KEY');
  if ($env) return $env;
  return $GLOBALS['GEMINI_API_KEY'] ?? '';
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  echo json_encode([
    'ok' => true,
    'message' => 'Import proxy aktif.',
    'version' => '2026-07-22-19-15',
    'has_config_file' => is_file(__DIR__ . '/api-config.php'),
    'has_gemini_key' => (bool) configured_gemini_key(''),
    'supports' => [
      'curl' => function_exists('curl_init'),
      'allow_url_fopen' => (bool) ini_get('allow_url_fopen'),
    ],
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'message' => 'Sadece POST desteklenir.'], JSON_UNESCAPED_UNICODE);
  exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$apiKey = configured_gemini_key($input['apiKey'] ?? '');
$imageData = $input['imageData'] ?? '';
$mimeType = $input['mimeType'] ?? 'image/png';

if (!$apiKey || !$imageData) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'Gemini API anahtarı veya görsel eksik. Ayarlardan girin veya public_html/api-config.php içine ekleyin.'], JSON_UNESCAPED_UNICODE);
  exit;
}

$prompt = <<<'PROMPT'
Bu görsel bir 112 ASHİ aylık personel/görevlendirme tablosudur.
Tablodaki HER PERSONEL SATIRINI oku. Başlıkları veya boş satırları alma.
Türkçe karakterleri koru. Excel'e çevirme, sadece JSON döndür.
Kolon mantığı: AD SOYAD, UNVAN, G.GÖREV DURUMU, İZİNLER, GEÇİCİ GÖREV TARİHLERİ, YOLLUK DURUMU.
UNVAN değerlerini en yakın şu değerlerden biri olarak yaz: Doktor, Paramedik, ATT, Sürücü, Sürücü ATT, Sürücü Paramedik.
SRC ATT varsa Sürücü ATT yaz. AABT varsa Paramedik, SRC AABT veya SRC PARAMEDİK varsa Sürücü Paramedik yaz. SÜREKLİ İŞÇİ/SÜRÜCÜ varsa Sürücü yaz.
Kırmızı renkte olan ve GEÇİCİ GÖREVDE yazan satırları kesinlikle atlama; bunlar da personeldir. Başka istasyona geçici görevlendirilen personeli sonuçta tut.
Kadro: SÜREKLİ İŞÇİ/4D ise 4D İşçi, diğerleri Memur.
Yıllık izin hücresinde 10 YILLIK İZİN gibi değer varsa annualLeaveDays alanına sadece sayıyı yaz.
Geçici görev ve yolluk bilgilerini ilgili alanlara yaz.
Sadece JSON array döndür. Örnek:
[
  {
    "fullName": "AD SOYAD",
    "title": "Doktor",
    "cadre": "Memur",
    "annualLeaveDays": "10",
    "leaveNote": "YILLIK İZİN",
    "assignmentStatus": "GEÇİCİ GÖREVDE",
    "temporaryAssignmentDates": "ŞEHZADELER 8 NOLU ASHİ AĞUSTOS",
    "allowance": "YOLLUKSUZ"
  }
]
PROMPT;

function post_json($url, $payload) {
  $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $encoded);
    curl_setopt($ch, CURLOPT_TIMEOUT, 45);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return [$status, $body, $error];
  }

  $context = stream_context_create([
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/json\r\n",
      'content' => $encoded,
      'timeout' => 45,
      'ignore_errors' => true,
    ],
  ]);
  $body = @file_get_contents($url, false, $context);
  $status = 0;
  if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
    $status = (int) $matches[1];
  }
  $error = $body === false ? 'Sunucuda cURL yok ve allow_url_fopen kapalı olabilir.' : '';
  return [$status, $body, $error];
}

$payload = [
  'contents' => [[
    'parts' => [
      ['text' => $prompt],
      ['inline_data' => ['mime_type' => $mimeType, 'data' => $imageData]],
    ],
  ]],
  'generationConfig' => [
    'temperature' => 0,
    'responseMimeType' => 'application/json',
    'maxOutputTokens' => 16384,
  ],
];

$models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
$apiVersions = ['v1beta', 'v1'];
$lastMessage = 'Gemini görsel okuma başarısız.';

foreach ($models as $model) {
  foreach ($apiVersions as $apiVersion) {
    [$status, $body, $error] = post_json(
      'https://generativelanguage.googleapis.com/' . $apiVersion . '/models/' . $model . ':generateContent?key=' . urlencode($apiKey),
      $payload
    );
    if ($status >= 200 && $status < 300) {
      $decoded = json_decode($body, true);
      $text = '';
      foreach (($decoded['candidates'][0]['content']['parts'] ?? []) as $part) {
        $text .= $part['text'] ?? '';
      }
      echo json_encode(['ok' => true, 'model' => $model, 'api_version' => $apiVersion, 'text' => $text], JSON_UNESCAPED_UNICODE);
      exit;
    }
    $bodyMessage = '';
    $decodedError = json_decode((string) $body, true);
    if (isset($decodedError['error']['message'])) {
      $bodyMessage = ' - ' . $decodedError['error']['message'];
    }
    $lastMessage = 'Gemini ' . $apiVersion . ' / ' . $model . ' HTTP ' . $status . $bodyMessage . ($error ? ' - ' . $error : '');
  }
}

http_response_code(502);
echo json_encode(['ok' => false, 'message' => $lastMessage], JSON_UNESCAPED_UNICODE);
