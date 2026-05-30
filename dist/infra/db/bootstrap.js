"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapDatabase = bootstrapDatabase;
const default_plans_1 = require("../../domain/plans/default-plans");
function bootstrapDatabase(sqlite) {
    sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      display_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      trial_used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      code TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      days INTEGER NOT NULL,
      traffic_bytes INTEGER NOT NULL,
      device_limit INTEGER NOT NULL,
      price_label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_trial INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_code TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      receipt_file_id TEXT,
      receipt_text TEXT,
      admin_note TEXT,
      target_service_id INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_code) REFERENCES plans(code)
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_code TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      sub_id TEXT NOT NULL UNIQUE,
      client_uuid TEXT NOT NULL,
      inbound_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      traffic_bytes INTEGER NOT NULL,
      last_usage_up INTEGER NOT NULL DEFAULT 0,
      last_usage_down INTEGER NOT NULL DEFAULT 0,
      last_sync_at INTEGER,
      reminded_3d_at INTEGER,
      reminded_1d_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (plan_code) REFERENCES plans(code)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      closed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      sender_user_id INTEGER,
      sender_admin_id INTEGER,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
  `);
    const statement = sqlite.prepare(`
    INSERT OR IGNORE INTO plans (
      code,
      title,
      days,
      traffic_bytes,
      device_limit,
      price_label,
      enabled,
      is_trial
    ) VALUES (
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?,
      ?
    )
  `);
    for (const plan of default_plans_1.defaultPlans) {
        statement.run([
            plan.code,
            plan.title,
            plan.days,
            plan.trafficBytes,
            plan.deviceLimit,
            plan.priceLabel,
            plan.enabled ? 1 : 0,
            plan.isTrial ? 1 : 0
        ]);
        statement.reset();
    }
    statement.free();
}
