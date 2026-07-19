<?php
function getDatabaseConnection() {
    static $pdo = null;

    if ($pdo === null) {
        $dbFile = __DIR__ . '/timeclock.sqlite';
        $pdo = new PDO('sqlite:' . $dbFile);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state_json TEXT NOT NULL
            )
        ");
    }

    return $pdo;
}

function getStoredState() {
    $pdo = getDatabaseConnection();
    $stmt = $pdo->query('SELECT state_json FROM app_state WHERE id = 1');
    $row = $stmt->fetch();

    if (!$row) {
        return ['employees' => [], 'records' => []];
    }

    $decoded = json_decode($row['state_json'], true);
    return is_array($decoded) ? $decoded : ['employees' => [], 'records' => []];
}

function saveStoredState(array $state): void {
    $pdo = getDatabaseConnection();
    $json = json_encode($state, JSON_UNESCAPED_UNICODE);

    $pdo->prepare('INSERT INTO app_state (id, state_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json')
        ->execute([$json]);
}
