<?php
header('Content-Type: application/json; charset=utf-8');

$configFile = __DIR__ . '/api-config.php';
if (is_file($configFile)) {
  require $configFile;
}

function configured_api_key($provider, $fallback = '') {
  if ($fallback) return $fallback;
  if ($provider === 'gemini') {
    $env = getenv('GEMINI_API_KEY');
    if ($env) return $env;
    return $GLOBALS['GEMINI_API_KEY'] ?? '';
  }
  if ($provider === 'groq') {
    $env = getenv('GROQ_API_KEY');
    if ($env) return $env;
    return $GLOBALS['GROQ_API_KEY'] ?? '';
  }
  return '';
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  echo json_encode([
    'ok' => true,
    'message' => 'API proxy aktif. Test için uygulamadaki AI API Test butonunu kullanın.',
    'version' => '2026-07-22-05-02',
    'supports' => [
      'curl' => function_exists('curl_init'),
      'allow_url_fopen' => (bool) ini_get('allow_url_fopen'),
    ],
    'models' => [
      'gemini' => 'gemini-3.6-flash',
      'groq' => 'llama-3.1-8b-instant',
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
$provider = $input['provider'] ?? '';
$apiKey = configured_api_key($provider, $input['apiKey'] ?? '');

if (!$apiKey || !in_array($provider, ['gemini', 'groq'], true)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'API sağlayıcı veya anahtar eksik. Ayarlardan girin veya public_html/api-config.php içine ekleyin.'], JSON_UNESCAPED_UNICODE);
  exit;
}

function post_json($url, $headers, $payload) {
  $encoded = json_encode($payload, JSON_UNESCAPED_UNICODE);
  if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $encoded);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return [$status, $body, $error];
  }

  $context = stream_context_create([
    'http' => [
      'method' => 'POST',
      'header' => implode("\r\n", $headers),
      'content' => $encoded,
      'timeout' => 15,
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

if ($provider === 'gemini') {
  $models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  $apiVersions = ['v1beta', 'v1'];
  $lastMessage = 'Gemini API testi başarısız.';
  foreach ($models as $model) {
    foreach ($apiVersions as $apiVersion) {
      [$status, $body, $error] = post_json(
        'https://generativelanguage.googleapis.com/' . $apiVersion . '/models/' . $model . ':generateContent?key=' . urlencode($apiKey),
        ['Content-Type: application/json'],
        ['contents' => [['parts' => [['text' => 'Merhaba. Sadece OK yaz.']]]]]
      );
      if ($status >= 200 && $status < 300) {
        echo json_encode(['ok' => true, 'message' => 'Gemini API testi başarılı. Model: ' . $apiVersion . ' / ' . $model], JSON_UNESCAPED_UNICODE);
        exit;
      }
      $decodedError = json_decode((string) $body, true);
      $bodyMessage = isset($decodedError['error']['message']) ? ' - ' . $decodedError['error']['message'] : '';
      $lastMessage = 'Gemini ' . $apiVersion . ' / ' . $model . ' HTTP ' . $status . $bodyMessage . ($error ? ' - ' . $error : '');
    }
  }
  echo json_encode(['ok' => false, 'message' => $lastMessage], JSON_UNESCAPED_UNICODE);
  exit;
}

[$status, $body, $error] = post_json(
  'https://api.groq.com/openai/v1/chat/completions',
  ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
  ['model' => 'llama-3.1-8b-instant', 'messages' => [['role' => 'user', 'content' => 'Merhaba. Sadece OK yaz.']], 'max_tokens' => 8]
);

echo json_encode([
  'ok' => $status >= 200 && $status < 300,
  'message' => $status >= 200 && $status < 300 ? 'Groq API testi başarılı.' : 'Groq API testi başarısız: HTTP ' . $status . ($error ? ' - ' . $error : '')
], JSON_UNESCAPED_UNICODE);
