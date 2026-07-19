<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'get') {
    echo json_encode(['state' => getStoredState()]);
    exit;
}

if ($method === 'POST' && $action === 'save') {
    $input = file_get_contents('php://input');
    $payload = json_decode($input, true);

    if (!is_array($payload) || !isset($payload['state'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid payload']);
        exit;
    }

    saveStoredState($payload['state']);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
