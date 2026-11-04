import logging
import re
import urllib.parse
import asyncio
import html
import traceback
import time
import os
import io
import json
import sqlite3
import zipfile
import tempfile
import shutil
import hashlib
import threading
import math
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from telegram.error import RetryAfter, Forbidden, TelegramError, BadRequest
from telegram.ext import TypeHandler
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
    CallbackQueryHandler,
    PicklePersistence,
    JobQueue,
    ConversationHandler
)
from telegram.constants import ParseMode

# Logging ကို set up လုပ်ပါ
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)


# ====================================================================
# 🗄️ SQLite storage, live settings, analytics, and safe .db.zip import
# Version: v7 — v6 plus Common 7 / Big / Small result rules
# ====================================================================
DB_PATH = Path(__file__).with_name("dice_game_bot.db")
PICKLE_PATH = Path(__file__).with_name("dice_game_bot.pickle")
# Automatic private backup destination explicitly configured by the owner.
BACKUP_CHAT_ID = 7439508908
BACKUP_DEBOUNCE_SECONDS = 15
BACKUP_MIN_INTERVAL_SECONDS = 300  # avoid flooding Telegram during busy betting periods
MAX_IMPORT_ZIP_BYTES = 20 * 1024 * 1024
MAX_IMPORT_DB_BYTES = 150 * 1024 * 1024
MAX_ARCHIVE_ROWS = 250_000
_STORE = None
_BACKUP_APP = None
_BROADCAST_LOCK = asyncio.Lock()


def _notify_backup_for_database_change(reason: str) -> None:
    """Queue a backup for writes made on the bot event-loop thread."""
    application = _BACKUP_APP
    if application is None:
        return
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        # Threaded bulk syncs are covered by the surrounding update/startup jobs.
        return
    try:
        request_auto_backup(application, reason)
    except Exception:
        logger.exception("Could not queue backup after database write: %s", reason)


def _analytics_safe(method_name: str, *args):
    """Keep reporting failures from interrupting bets, payouts, or payments."""
    store = _STORE
    if store is None:
        return
    try:
        getattr(store, method_name)(*args)
    except Exception:
        logger.exception("Analytics write failed: %s", method_name)


class SQLiteStore:
    """Small SQLite store for live configuration and user data.

    PicklePersistence is retained for backward compatibility with the existing
    bot. SQLite is the durable source for configurable settings and a second
    copy of user records. User ids are never replaced during DB imports.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(str(self.path), timeout=30, check_same_thread=False)
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self._create_schema()

    def _create_schema(self):
        with self.lock, self.conn:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY,
                    data_json TEXT NOT NULL,
                    updated_at REAL NOT NULL
                )
            """)
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at REAL NOT NULL
                )
            """)
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS import_archive (
                    source_name TEXT NOT NULL,
                    source_table TEXT NOT NULL,
                    row_hash TEXT NOT NULL,
                    row_json TEXT NOT NULL,
                    imported_at REAL NOT NULL,
                    PRIMARY KEY(source_name, source_table, row_hash)
                )
            """)
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS import_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_name TEXT NOT NULL,
                    imported_users INTEGER NOT NULL,
                    archived_rows INTEGER NOT NULL,
                    imported_at REAL NOT NULL
                )
            """)
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS analytics_bets (
                    bet_id TEXT PRIMARY KEY,
                    chat_id INTEGER NOT NULL,
                    round_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    bet_kind TEXT NOT NULL,
                    selection TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    multiplier REAL NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'pending',
                    payout INTEGER NOT NULL DEFAULT 0,
                    result INTEGER,
                    created_at REAL NOT NULL,
                    settled_at REAL
                )
            """)
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_bets_created ON analytics_bets(created_at)")
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_bets_settled ON analytics_bets(settled_at, status)")
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS analytics_costs (
                    event_id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    amount REAL NOT NULL,
                    user_id INTEGER,
                    created_at REAL NOT NULL,
                    description TEXT DEFAULT ''
                )
            """)
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_costs_created ON analytics_costs(created_at)")
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS analytics_cashflows (
                    event_id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    user_id INTEGER,
                    created_at REAL NOT NULL,
                    description TEXT DEFAULT ''
                )
            """)
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_analytics_cashflows_created ON analytics_cashflows(created_at)")

    def record_analytics_bet(self, bet: dict, chat_id: int, round_id: int, multiplier: float):
        """Persist an accepted stake once; survives bot restarts."""
        bet_id = str(bet.get("bet_id") or "")
        if not bet_id:
            return
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT OR IGNORE INTO analytics_bets "
                "(bet_id, chat_id, round_id, user_id, bet_kind, selection, amount, multiplier, status, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
                (bet_id, int(chat_id), int(round_id), int(bet["user_id"]), str(bet.get("bet_kind", "unknown")),
                 str(bet.get("selection", "")), int(bet.get("amount", 0)), float(multiplier), time.time()),
            )
        _notify_backup_for_database_change(f"bet {bet_id} recorded")

    def settle_analytics_bet(self, bet_id: str, status: str, payout: int, result: int, settled_at: float | None = None):
        if not bet_id:
            return
        with self.lock, self.conn:
            cursor = self.conn.execute(
                "UPDATE analytics_bets SET status=?, payout=?, result=?, settled_at=? "
                "WHERE bet_id=? AND status='pending'",
                (str(status), int(payout), int(result), float(settled_at or time.time()), str(bet_id)),
            )
        if cursor.rowcount:
            _notify_backup_for_database_change(f"bet {bet_id} settled")

    def record_analytics_cost(self, event_id: str, kind: str, amount: float, user_id: int | None = None, description: str = ""):
        if not event_id or float(amount or 0) <= 0:
            return
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT OR IGNORE INTO analytics_costs(event_id, kind, amount, user_id, created_at, description) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (str(event_id), str(kind), float(amount), int(user_id) if user_id is not None else None, time.time(), str(description)),
            )
        _notify_backup_for_database_change(f"cost recorded: {kind}")

    def record_analytics_cashflow(self, event_id: str, kind: str, amount: int, user_id: int | None = None, description: str = ""):
        if not event_id or int(amount or 0) <= 0:
            return
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT OR IGNORE INTO analytics_cashflows(event_id, kind, amount, user_id, created_at, description) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (str(event_id), str(kind), int(amount), int(user_id) if user_id is not None else None, time.time(), str(description)),
            )
        _notify_backup_for_database_change(f"cashflow recorded: {kind}")

    def analytics_report(self, start_ts: float, end_ts: float) -> dict:
        """Return realized results by settlement date, plus accepted pending stakes and tracked costs."""
        with self.lock:
            summary = self.conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(amount),0), COALESCE(SUM(payout),0), "
                "SUM(CASE WHEN status='win' THEN 1 ELSE 0 END), "
                "SUM(CASE WHEN status='loss' THEN 1 ELSE 0 END), "
                "COUNT(DISTINCT CAST(chat_id AS TEXT)||':'||CAST(round_id AS TEXT)) "
                "FROM analytics_bets WHERE created_at>=? AND created_at<? AND status IN ('win','loss')",
                (float(start_ts), float(end_ts)),
            ).fetchone()
            by_selection = self.conn.execute(
                "SELECT bet_kind, selection, COUNT(*), COALESCE(SUM(amount),0), COALESCE(SUM(payout),0), "
                "SUM(CASE WHEN status='win' THEN 1 ELSE 0 END), SUM(CASE WHEN status='loss' THEN 1 ELSE 0 END) "
                "FROM analytics_bets WHERE created_at>=? AND created_at<? AND status IN ('win','loss') "
                "GROUP BY bet_kind, selection ORDER BY SUM(amount) DESC",
                (float(start_ts), float(end_ts)),
            ).fetchall()
            pending = self.conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(amount),0), COALESCE(SUM(amount*multiplier),0) "
                "FROM analytics_bets WHERE created_at>=? AND created_at<? AND status='pending'",
                (float(start_ts), float(end_ts)),
            ).fetchone()
            pending_by_selection = self.conn.execute(
                "SELECT bet_kind, selection, COUNT(*), COALESCE(SUM(amount),0), COALESCE(SUM(amount*multiplier),0) "
                "FROM analytics_bets WHERE created_at>=? AND created_at<? AND status='pending' "
                "GROUP BY bet_kind, selection ORDER BY SUM(amount) DESC",
                (float(start_ts), float(end_ts)),
            ).fetchall()
            refunded = self.conn.execute(
                "SELECT COUNT(*), COALESCE(SUM(amount),0) FROM analytics_bets "
                "WHERE settled_at>=? AND settled_at<? AND status='refunded'",
                (float(start_ts), float(end_ts)),
            ).fetchone()
            costs = self.conn.execute(
                "SELECT kind, COALESCE(SUM(amount),0), COUNT(*) FROM analytics_costs "
                "WHERE created_at>=? AND created_at<? GROUP BY kind",
                (float(start_ts), float(end_ts)),
            ).fetchall()
            cost_details = self.conn.execute(
                "SELECT kind, description, COALESCE(SUM(amount),0), COUNT(*) FROM analytics_costs "
                "WHERE created_at>=? AND created_at<? GROUP BY kind, description ORDER BY SUM(amount) DESC LIMIT 8",
                (float(start_ts), float(end_ts)),
            ).fetchall()
            flows = self.conn.execute(
                "SELECT kind, COALESCE(SUM(amount),0), COUNT(*) FROM analytics_cashflows "
                "WHERE created_at>=? AND created_at<? GROUP BY kind",
                (float(start_ts), float(end_ts)),
            ).fetchall()
            total_records = self.conn.execute("SELECT COUNT(*) FROM analytics_bets").fetchone()[0]
            expected_rows = self.conn.execute(
                "SELECT bet_kind, selection, amount, multiplier FROM analytics_bets "
                "WHERE created_at>=? AND created_at<? AND status IN ('win','loss','pending')",
                (float(start_ts), float(end_ts)),
            ).fetchall()
        number_counts = {2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1}
        expected_stake = 0
        expected_payout = 0.0
        for bet_kind, selection, amount, multiplier in expected_rows:
            amount = int(amount or 0)
            multiplier = float(multiplier or 0)
            if bet_kind == "size":
                probability = (15 / 36) if str(selection) in {"အကြီး", "အသေး"} else 0.0
            elif bet_kind == "number":
                try:
                    probability = number_counts.get(int(selection), 0) / 36
                except (TypeError, ValueError):
                    probability = 0.0
            else:
                probability = 0.0
            expected_stake += amount
            expected_payout += amount * multiplier * probability
        expected_gross = expected_stake - expected_payout
        return {
            "settled_count": int(summary[0] or 0), "stake": int(summary[1] or 0),
            "payout": int(summary[2] or 0), "wins": int(summary[3] or 0),
            "losses": int(summary[4] or 0), "rounds": int(summary[5] or 0),
            "by_selection": by_selection,
            "pending_count": int(pending[0] or 0), "pending_stake": int(pending[1] or 0),
            "pending_possible_payout": int(round(float(pending[2] or 0))),
            "pending_by_selection": pending_by_selection,
            "refunded_count": int(refunded[0] or 0), "refunded_stake": int(refunded[1] or 0),
            "costs": {str(row[0]): (float(row[1] or 0), int(row[2] or 0)) for row in costs},
            "cost_details": cost_details,
            "cashflows": {str(row[0]): (int(row[1] or 0), int(row[2] or 0)) for row in flows},
            "expected_stake": int(expected_stake),
            "expected_gross": float(expected_gross),
            "total_records": int(total_records or 0),
        }

    def ensure_settings(self, defaults: dict):
        now = time.time()
        with self.lock, self.conn:
            for key, value in defaults.items():
                self.conn.execute(
                    "INSERT OR IGNORE INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)",
                    (key, json.dumps(value, ensure_ascii=False), now),
                )

    def load_settings(self) -> dict:
        with self.lock:
            rows = self.conn.execute("SELECT key, value_json FROM settings").fetchall()
        result = {}
        for key, value_json in rows:
            try:
                result[str(key)] = json.loads(value_json)
            except (TypeError, json.JSONDecodeError):
                logger.warning("Ignoring malformed setting %s in SQLite", key)
        return result

    def save_setting(self, key: str, value):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
                (key, json.dumps(value, ensure_ascii=False), time.time()),
            )
        _notify_backup_for_database_change(f"setting saved: {key}")

    @staticmethod
    def _encode_user(data: dict) -> str:
        return json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)

    def save_user(self, user_id: int, data: dict):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT INTO users(user_id, data_json, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at",
                (int(user_id), self._encode_user(data), time.time()),
            )
        _notify_backup_for_database_change(f"user {int(user_id)} saved")

    def save_users(self, users: dict):
        now = time.time()
        rows = []
        for user_id, data in users.items():
            try:
                rows.append((int(user_id), self._encode_user(data), now))
            except (TypeError, ValueError):
                logger.exception("Skipping invalid user record %r during SQLite sync", user_id)
        if not rows:
            return
        with self.lock, self.conn:
            self.conn.executemany(
                "INSERT INTO users(user_id, data_json, updated_at) VALUES (?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json, updated_at=excluded.updated_at",
                rows,
            )

    def load_users(self) -> dict:
        with self.lock:
            rows = self.conn.execute("SELECT user_id, data_json FROM users").fetchall()
        result = {}
        for user_id, data_json in rows:
            try:
                data = json.loads(data_json)
                if isinstance(data, dict):
                    result[int(user_id)] = data
            except (TypeError, json.JSONDecodeError):
                logger.warning("Ignoring malformed user record %s in SQLite", user_id)
        return result

    def insert_user_if_missing(self, user_id: int, data: dict) -> bool:
        with self.lock, self.conn:
            cursor = self.conn.execute(
                "INSERT OR IGNORE INTO users(user_id, data_json, updated_at) VALUES (?, ?, ?)",
                (int(user_id), self._encode_user(data), time.time()),
            )
            return cursor.rowcount == 1

    def insert_users_if_missing(self, records: list[tuple[int, dict]]) -> list[int]:
        """Import a batch in one transaction and return only genuinely new user ids."""
        if not records:
            return []
        unique_records = []
        seen = set()
        for user_id, data in records:
            uid = int(user_id)
            if uid not in seen:
                seen.add(uid)
                unique_records.append((uid, data))
        ids = [uid for uid, _ in unique_records]
        with self.lock, self.conn:
            existing = set()
            for offset in range(0, len(ids), 800):
                chunk = ids[offset:offset + 800]
                placeholders = ",".join("?" for _ in chunk)
                rows = self.conn.execute(
                    f"SELECT user_id FROM users WHERE user_id IN ({placeholders})", chunk
                ).fetchall()
                existing.update(int(row[0]) for row in rows)
            new_records = [(uid, data) for uid, data in unique_records if uid not in existing]
            now = time.time()
            self.conn.executemany(
                "INSERT OR IGNORE INTO users(user_id, data_json, updated_at) VALUES (?, ?, ?)",
                [(uid, self._encode_user(data), now) for uid, data in new_records],
            )
            return [uid for uid, _ in new_records]

    def insert_archive_rows(self, source_name: str, rows: list[tuple[str, dict]]) -> int:
        inserted = 0
        now = time.time()
        batch = []
        for table_name, row in rows[:MAX_ARCHIVE_ROWS]:
            row_json = json.dumps(row, ensure_ascii=False, separators=(",", ":"), default=str)
            digest = hashlib.sha256(row_json.encode("utf-8")).hexdigest()
            batch.append((source_name, table_name, digest, row_json, now))
        if batch:
            with self.lock, self.conn:
                before = self.conn.total_changes
                self.conn.executemany(
                    "INSERT OR IGNORE INTO import_archive(source_name, source_table, row_hash, row_json, imported_at) "
                    "VALUES (?, ?, ?, ?, ?)", batch,
                )
                inserted = self.conn.total_changes - before
        return inserted

    def record_import(self, source_name: str, imported_users: int, archived_rows: int):
        with self.lock, self.conn:
            self.conn.execute(
                "INSERT INTO import_history(source_name, imported_users, archived_rows, imported_at) VALUES (?, ?, ?, ?)",
                (source_name, int(imported_users), int(archived_rows), time.time()),
            )
        _notify_backup_for_database_change(f"database import completed: {source_name}")

    def counts(self) -> tuple[int, int, int]:
        with self.lock:
            users = self.conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            settings = self.conn.execute("SELECT COUNT(*) FROM settings").fetchone()[0]
            archived = self.conn.execute("SELECT COUNT(*) FROM import_archive").fetchone()[0]
        return int(users), int(settings), int(archived)

    def close(self):
        with self.lock:
            self.conn.close()


def get_setting(source, key: str):
    """Read a setting from either a CallbackContext or Application."""
    app = getattr(source, "application", None) or source
    bot_data = getattr(app, "bot_data", {})
    settings = bot_data.get("settings", {}) if isinstance(bot_data, dict) else {}
    if key in settings:
        return settings[key]
    return DEFAULT_SETTINGS.get(key)


def get_admin_ids(source=None) -> list[int]:
    """Return persisted bot-admin IDs, falling back to the original owners."""
    app = getattr(source, "application", None) or source
    bot_data = getattr(app, "bot_data", {}) if app is not None else {}
    settings = bot_data.get("settings", {}) if isinstance(bot_data, dict) else {}
    raw_ids = settings.get("ADMIN_IDS", ROOT_ADMIN_IDS) if isinstance(settings, dict) else ROOT_ADMIN_IDS
    result = []
    for value in raw_ids if isinstance(raw_ids, (list, tuple, set)) else ROOT_ADMIN_IDS:
        try:
            admin_id = int(value)
        except (TypeError, ValueError):
            continue
        if admin_id > 0 and admin_id not in result:
            result.append(admin_id)
    # The original owner accounts can never be accidentally removed from access.
    for owner_id in ROOT_ADMIN_IDS:
        if owner_id not in result:
            result.append(owner_id)
    return result


def is_bot_admin(source, user_id: int | None) -> bool:
    return user_id is not None and int(user_id) in get_admin_ids(source)


def is_root_admin(user_id: int | None) -> bool:
    return user_id is not None and int(user_id) in ROOT_ADMIN_IDS


def update_admin_ids(application: Application, admin_ids: list[int]) -> None:
    """Persist admin IDs in SQLite and expose them to all handlers immediately."""
    clean = []
    for value in admin_ids:
        admin_id = int(value)
        if admin_id > 0 and admin_id not in clean:
            clean.append(admin_id)
    for owner_id in ROOT_ADMIN_IDS:
        if owner_id not in clean:
            clean.append(owner_id)
    save_runtime_setting(application, "ADMIN_IDS", clean)


def save_runtime_setting(application: Application, key: str, value):
    application.bot_data.setdefault("settings", {})[key] = value
    if _STORE is not None:
        _STORE.save_setting(key, value)
    request_auto_backup(application, f"setting changed: {key}")


def _escape_legacy_markdown(value) -> str:
    """Escape user-controlled text before interpolating it into Telegram Markdown."""
    return re.sub(r"([_*`\[])", lambda match: "\\" + match.group(1), str(value or ""))


def _sqlite_quote(identifier: str) -> str:
    return '"' + str(identifier).replace('"', '""') + '"'


def _normalise_imported_user(row: dict) -> tuple[int, dict] | None:
    lower = {str(k).lower(): v for k, v in row.items()}
    id_value = None
    for key in ("user_id", "telegram_id", "telegram_user_id", "tg_id", "userid", "uid", "id"):
        if lower.get(key) not in (None, ""):
            id_value = lower[key]
            break
    try:
        user_id = int(id_value)
    except (TypeError, ValueError):
        return None
    if user_id <= 0:
        return None

    data = None
    for key in ("data_json", "user_data", "profile_json", "json_data", "data", "payload", "profile"):
        value = lower.get(key)
        if isinstance(value, str) and value.strip().startswith("{"):
            try:
                parsed = json.loads(value)
                if isinstance(parsed, dict):
                    data = parsed
                    break
            except json.JSONDecodeError:
                pass
        elif isinstance(value, dict):
            data = value
            break
    if data is None:
        data = dict(row)

    # Normalize commonly used legacy field names while preserving other fields.
    aliases = {
        "balance": ("balance", "main_balance", "main_balance_ks", "balance_ks", "wallet", "wallet_balance", "amount"),
        "referral_balance": ("referral_balance", "commission_balance", "ref_balance"),
        "referrals": ("referrals", "referral_count", "invites"),
        "referrer": ("referrer", "referrer_id", "refer_by"),
        "total_bet_cumulative": ("total_bet_cumulative", "total_bet", "total_wager"),
        "total_successful_deposit": ("total_successful_deposit", "total_deposit", "deposited_total", "approved_deposits"),
        "withdrawal_count": ("withdrawal_count", "withdrawals_count", "total_withdrawals"),
        "wager_since_last_withdrawal": ("wager_since_last_withdrawal", "turnover_since_withdrawal", "withdrawal_wager"),
        "full_name": ("full_name", "name", "first_name", "username"),
        "private_chat_started": ("private_chat_started", "started", "is_started"),
        "promo_bonus_claimed_from": ("promo_bonus_claimed_from", "promo_claimed", "bonus_claimed_from"),
    }
    original = {str(k).lower(): v for k, v in data.items()}
    normalized = dict(data)
    for target, candidates in aliases.items():
        for candidate in candidates:
            if original.get(candidate) not in (None, ""):
                normalized[target] = original[candidate]
                break

    normalized.setdefault("balance", 0)
    normalized.setdefault("referrals", 0)
    normalized.setdefault("referral_balance", 0)
    normalized.setdefault("referrer", None)
    normalized.setdefault("total_bet_cumulative", 0)
    normalized.setdefault("total_successful_deposit", normalized.get("first_deposit_amount", 0))
    normalized.setdefault("withdrawal_count", 0)
    normalized.setdefault("wager_since_last_withdrawal", 0)
    normalized.setdefault("promo_bonus_claimed_from", [])
    normalized.setdefault("full_name", f"User {user_id}")
    normalized.setdefault("private_chat_started", False)
    try:
        normalized["balance"] = max(0, int(float(normalized["balance"] or 0)))
        normalized["referrals"] = max(0, int(float(normalized["referrals"] or 0)))
        normalized["referral_balance"] = max(0, float(normalized["referral_balance"] or 0))
        normalized["total_bet_cumulative"] = max(0, int(float(normalized["total_bet_cumulative"] or 0)))
        normalized["total_successful_deposit"] = max(0, int(float(normalized["total_successful_deposit"] or 0)))
        normalized["withdrawal_count"] = max(0, int(float(normalized["withdrawal_count"] or 0)))
        normalized["wager_since_last_withdrawal"] = max(0, int(float(normalized["wager_since_last_withdrawal"] or 0)))
    except (TypeError, ValueError, OverflowError):
        return None
    if not isinstance(normalized.get("promo_bonus_claimed_from"), list):
        normalized["promo_bonus_claimed_from"] = []
    private_started = normalized.get("private_chat_started", False)
    if isinstance(private_started, str):
        normalized["private_chat_started"] = private_started.strip().lower() in {"1", "true", "yes", "y"}
    else:
        normalized["private_chat_started"] = bool(private_started)
    try:
        if normalized.get("referrer") not in (None, "", 0, "0"):
            normalized["referrer"] = int(normalized["referrer"])
        else:
            normalized["referrer"] = None
        normalized["promo_bonus_claimed_from"] = [int(x) for x in normalized["promo_bonus_claimed_from"] if str(x).isdigit()]
    except (TypeError, ValueError):
        normalized["referrer"] = None
        normalized["promo_bonus_claimed_from"] = []
    return user_id, normalized


def parse_database_zip(zip_bytes: bytes) -> tuple[str, list[tuple[int, dict]], list[tuple[str, dict]], list[str]]:
    """Safely read a ZIP containing one SQLite DB without executing uploaded code."""
    if len(zip_bytes) > MAX_IMPORT_ZIP_BYTES:
        raise ValueError("ZIP ဖိုင်အရွယ်အစား 20 MB ထက် မကျော်ရပါ။")
    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile as exc:
        raise ValueError("ဖိုင်သည် မှန်ကန်သော ZIP မဟုတ်ပါ။") from exc

    candidates = []
    total_uncompressed = 0
    with archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            # Reject path traversal and abnormally large archives.
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in Path(name).parts:
                continue
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_IMPORT_DB_BYTES:
                raise ValueError("ZIP ဖြည်ပြီး အရွယ်အစား 150 MB ထက်ကျော်နေပါသည်။")
            if info.file_size < 16 or info.file_size > MAX_IMPORT_DB_BYTES:
                continue
            suffix = Path(name).suffix.lower()
            if suffix in (".db", ".sqlite", ".sqlite3") or name.lower().endswith(".db.zip"):
                raw = archive.read(info)
                if raw.startswith(b"SQLite format 3\x00"):
                    candidates.append((name, raw))
        if not candidates:
            raise ValueError("ZIP ထဲတွင် SQLite .db / .sqlite ဖိုင်မတွေ့ပါ။")
        # Prefer a single DB file to avoid silently merging the wrong database.
        candidates.sort(key=lambda item: (0 if Path(item[0]).name.lower() in ("database.db", "data.db", "bot.db") else 1, -len(item[1])))
        source_name, db_bytes = candidates[0]

    users: dict[int, dict] = {}
    archived_rows: list[tuple[str, dict]] = []
    tables_found: list[str] = []
    with tempfile.NamedTemporaryFile(prefix="bot_import_", suffix=".db", delete=False) as temp:
        temp.write(db_bytes)
        temp_path = temp.name
    try:
        source_conn = sqlite3.connect(f"file:{temp_path}?mode=ro", uri=True, timeout=20)
        try:
            check = source_conn.execute("PRAGMA quick_check").fetchone()
            if not check or check[0] != "ok":
                raise ValueError("တင်ထားသော SQLite database ပျက်နေသည် (quick_check မအောင်မြင်ပါ။)")
            tables = source_conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
            for (table_name,) in tables:
                table_name = str(table_name)
                tables_found.append(table_name)
                rows = source_conn.execute(f"SELECT * FROM {_sqlite_quote(table_name)}")
                columns = [item[0] for item in rows.description or []]
                lowered = table_name.lower()
                user_like = lowered in {"users", "user", "user_data", "user_profiles", "bot_users", "players", "player", "accounts"}
                row_count = 0
                for raw_row in rows:
                    row_count += 1
                    row_dict = dict(zip(columns, raw_row))
                    normalized = _normalise_imported_user(row_dict) if user_like or (any(str(c).lower() in {"user_id", "telegram_id", "tg_id"} for c in columns) and any(str(c).lower() in {"balance", "main_balance", "wallet"} for c in columns)) else None
                    if normalized:
                        uid, payload = normalized
                        users.setdefault(uid, payload)
                    elif len(archived_rows) < MAX_ARCHIVE_ROWS:
                        archived_rows.append((table_name, row_dict))
                    if row_count > MAX_ARCHIVE_ROWS:
                        break
        finally:
            source_conn.close()
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass
    return source_name, list(users.items()), archived_rows, tables_found


# Admin setting form metadata: type, minimum, maximum, label.
SETTING_META = {
    "OVER_UNDER_MULTIPLIER": ("float", 0.1, 100.0, "အကြီး (8–12) / အသေး (2–6) ဆ"),
    "SIX_MULTIPLIER": ("float", 0.1, 100.0, "ဘုံအများဆုံး (Common 7) — အလယ်ဂဏန်း ၇ ဆ"),
    "DEFAULT_NUM_MULTIPLIER": ("float", 0.1, 100.0, "အခြားဂဏန်း ဆ"),
    "MINIMUM_BET": ("int", 1, 1_000_000_000_000, "အနည်းဆုံး လောင်းကြေး (Ks)"),
    "MINIMUM_DEPOSIT": ("int", 1, 1_000_000_000_000, "နောက်ပိုင်း ငွေသွင်းအနည်းဆုံး (Ks)"),
    "MINIMUM_FIRST_DEPOSIT": ("int", 1, 1_000_000_000_000, "ပထမဆုံး ငွေသွင်းအနည်းဆုံး (Ks)"),
    "MINIMUM_WITHDRAW": ("int", 1, 1_000_000_000_000, "အနည်းဆုံး ငွေထုတ် (Ks)"),
    "FIRST_WITHDRAW_DEPOSIT_REQUIRED": ("int", 0, 1_000_000_000_000, "ပထမဆုံး ငွေထုတ်ရန် စုစုပေါင်းသွင်းငွေ (Ks)"),
    "WITHDRAW_WAGER_PERCENT": ("percent", 0, 100, "နောက်ပိုင်း ငွေထုတ်အတွက် လောင်းကြေးရာခိုင်နှုန်း (%)"),
    "WELCOME_BONUS": ("int", 0, 1_000_000_000_000, "Welcome Bonus (Ks)"),
    "KPAY_PHONE": ("text", 0, 40, "KPay ဖုန်းနံပါတ်"),
    "KPAY_NAME": ("text", 0, 80, "KPay အကောင့်အမည်"),
    "WAVE_PHONE": ("text", 0, 40, "Wave ဖုန်းနံပါတ်"),
    "WAVE_NAME": ("text", 0, 80, "Wave အကောင့်အမည်"),
    "PROMO_BET_THRESHOLD": ("int", 1, 1_000_000_000_000, "Referral Bonus ပြည့်မည့် လောင်းကြေး (Ks)"),
    "PROMO_BONUS_AMOUNT": ("int", 0, 1_000_000_000_000, "Referral Bonus ပမာဏ (Ks)"),
    "COMMISSION_RATE": ("percent", 0, 100, "Referral Commission (%)"),
    "MINIMUM_TRANSFER_AMOUNT": ("int", 1, 1_000_000_000_000, "Referral balance လွှဲရန် အနည်းဆုံး (Ks)"),
    "ROUND_DURATION_SECONDS": ("int", 10, 3600, "Round တစ်ပွဲ လောင်းချိန် (စက္ကန့်)"),
    "NEXT_ROUND_DELAY_SECONDS": ("int", 0, 3600, "Round ပြီးနောက် နောက်ပွဲအထိ ကြားချိန် (စက္ကန့်)"),
    "GAME_GROUP_LINK": ("url", 0, 250, "Game Group Link"),
}

SETTING_SECTIONS = {
    "odds": ["OVER_UNDER_MULTIPLIER", "SIX_MULTIPLIER", "DEFAULT_NUM_MULTIPLIER"],
    "money": ["MINIMUM_BET", "MINIMUM_DEPOSIT", "MINIMUM_FIRST_DEPOSIT", "MINIMUM_WITHDRAW", "FIRST_WITHDRAW_DEPOSIT_REQUIRED", "WITHDRAW_WAGER_PERCENT", "WELCOME_BONUS"],
    "payments": ["KPAY_PHONE", "KPAY_NAME", "WAVE_PHONE", "WAVE_NAME"],
    "referrals": ["PROMO_BET_THRESHOLD", "PROMO_BONUS_AMOUNT", "COMMISSION_RATE", "MINIMUM_TRANSFER_AMOUNT"],
    "round": ["ROUND_DURATION_SECONDS", "NEXT_ROUND_DELAY_SECONDS"],
    "group": ["GAME_GROUP_LINK"],
}


def _setting_display(key: str, value) -> str:
    if key in {"COMMISSION_RATE", "WITHDRAW_WAGER_PERCENT"}:
        return f"{float(value) * 100:g}%"
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def _admin_home_markup() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎲 လောင်းကြေးဆ", callback_data="admin:odds"), InlineKeyboardButton("💰 Bonus / Limit", callback_data="admin:money")],
        [InlineKeyboardButton("🏦 KPay / Wave", callback_data="admin:payments"), InlineKeyboardButton("🧑‍🤝‍🧑 Referral", callback_data="admin:referrals")],
        [InlineKeyboardButton("⏱ Round Settings", callback_data="admin:round"), InlineKeyboardButton("🔗 Group Link", callback_data="admin:group")],
        [InlineKeyboardButton("📣 Broadcast", callback_data="admin:broadcast"), InlineKeyboardButton("🗄 DB ZIP Import", callback_data="admin:import")],
        [InlineKeyboardButton("👤 User Balance", callback_data="admin:balance"), InlineKeyboardButton("📊 Statistics", callback_data="admin:stats")],
        [InlineKeyboardButton("🧾 Add Expense", callback_data="admin:expense")],
        [InlineKeyboardButton("📦 Backup Now", callback_data="admin:backup_now")],
        [InlineKeyboardButton("👮 Admin Management", callback_data="admin:admins"), InlineKeyboardButton("🛑 Close All Rounds", callback_data="admin:rounds:close")],
        [InlineKeyboardButton("✖️ Close", callback_data="admin:close")],
    ])


def _admin_section_markup(section: str) -> InlineKeyboardMarkup:
    rows = []
    for key in SETTING_SECTIONS.get(section, []):
        label = SETTING_META[key][3]
        rows.append([InlineKeyboardButton(f"✏️ {label}", callback_data=f"admin:set:{key}")])
    rows.append([InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")])
    return InlineKeyboardMarkup(rows)


def _admin_home_text(context: ContextTypes.DEFAULT_TYPE) -> str:
    keys = ["OVER_UNDER_MULTIPLIER", "SIX_MULTIPLIER", "DEFAULT_NUM_MULTIPLIER", "WELCOME_BONUS", "MINIMUM_DEPOSIT", "MINIMUM_WITHDRAW", "FIRST_WITHDRAW_DEPOSIT_REQUIRED", "WITHDRAW_WAGER_PERCENT"]
    lines = ["🛠 *ADMIN CONTROL PANEL*", "━━━━━━━━━━━━━━━━━━"]
    for key in keys:
        value = get_setting(context, key)
        lines.append(f"• *{SETTING_META[key][3]}:* `{_setting_display(key, value)}`")
    lines.append(f"\n👮 *လက်ရှိ Admin အရေအတွက်:* `{len(get_admin_ids(context))}`")
    lines.append(f"📦 *Auto Backup:* `{BACKUP_CHAT_ID}` (၅ မိနစ်အတွင်း တစ်ကြိမ်ထက်မပို)")
    lines.append("အောက်ပါ Menu မှ Setting နှင့် ပွဲစဉ်များကို စီမံနိုင်ပါသည်။")
    return "\n".join(lines)


# ====================================================================
# ⚠️ Configuration Section ⚠️
# ====================================================================
TOKEN = "9282752425:AAHx61YXDCqXeq82BfJs1dXN42UCYbgB6wg"  # Bot token supplied by the owner
ROOT_ADMIN_IDS = [8848725791, 8471450975]
# Backward-compatible constant; runtime permission checks use get_admin_ids().
ADMIN_IDS = ROOT_ADMIN_IDS[:]
GAME_GROUP_LINK = "https://t.me/wingogp"

# လောင်းကြေးအဆများ
OVER_UNDER_MULTIPLIER = 1.9
# Legacy setting key retained for existing DBs; it now controls exact total 7 (Common 7).
SIX_MULTIPLIER = 3.9
DEFAULT_NUM_MULTIPLIER = 2.9

MINIMUM_BET, MINIMUM_DEPOSIT, WELCOME_BONUS = 100, 3000, 500
# The previous mistaken first-deposit rule is reset to the normal deposit minimum.
MINIMUM_FIRST_DEPOSIT = 3000
FIRST_WITHDRAW_DEPOSIT_REQUIRED = 5000
WITHDRAW_WAGER_PERCENT = 0.50
KPAY_PHONE, WAVE_PHONE = "09753499023", "09753499023"
PROMO_BET_THRESHOLD, PROMO_BONUS_AMOUNT = 2000, 500
COMMISSION_RATE = 0.01

# ❗️❗️❗️ Feature အသစ်အတွက် Configuration ❗️❗️❗️
MINIMUM_TRANSFER_AMOUNT = 5000 # မိတ်ဆက်ခမှ Main Balance သို့ အနည်းဆုံးပြောင်းနိုင်သော ပမာဏ

# Conversation States
CHOOSE_ACTION, DEPOSIT_CHOOSE_METHOD, DEPOSIT_ENTER_AMOUNT, DEPOSIT_UPLOAD_RECEIPT, \
WITHDRAW_ENTER_AMOUNT, WITHDRAW_CHOOSE_METHOD, WITHDRAW_ENTER_PHONE, WITHDRAW_ENTER_NAME, ADMIN_AWAIT_RECEIPT = range(9)

# ====================================================================
# 💾 Helper Functions
# ====================================================================
def user_has_completed_first_deposit(user_data: dict, welcome_bonus: int | None = None) -> bool:
    """Return first-deposit status, safely grandfathering old records.

    The earlier bot did not retain a deposit ledger/status on each user. It is
    therefore impossible to distinguish an old user who deposited and spent
    their balance from one who only used bonuses. To avoid forcing existing
    players to make a second "first" deposit, legacy records without this field
    are grandfathered. Accounts created by this version explicitly start False.
    """
    if "has_successful_deposit" in user_data:
        value = user_data.get("has_successful_deposit")
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y"}
        return bool(value)

    # Legacy accounts have no reliable deposit history. Preserve their access.
    user_data["has_successful_deposit"] = True
    user_data["first_deposit_legacy_migrated"] = True
    return True


def required_deposit_minimum(context: ContextTypes.DEFAULT_TYPE, user_data: dict) -> tuple[int, bool]:
    """Return (minimum amount, is_first_deposit) for the current player."""
    standard_minimum = int(get_setting(context, "MINIMUM_DEPOSIT"))
    if user_has_completed_first_deposit(user_data, int(get_setting(context, "WELCOME_BONUS"))):
        return standard_minimum, False
    first_minimum = int(get_setting(context, "MINIMUM_FIRST_DEPOSIT"))
    return max(standard_minimum, first_minimum), True


def ensure_withdrawal_tracking(user_data: dict) -> None:
    """Add withdrawal-cycle fields to old and new user records without losing data."""
    if not isinstance(user_data, dict):
        return
    if "total_successful_deposit" not in user_data:
        # Only seed verified historical deposit money when the old version recorded it.
        try:
            historical_first = int(float(user_data.get("first_deposit_amount", 0) or 0))
        except (TypeError, ValueError, OverflowError):
            historical_first = 0
        user_data["total_successful_deposit"] = max(0, historical_first)
    if "withdrawal_count" not in user_data:
        user_data["withdrawal_count"] = 0
    if "wager_since_last_withdrawal" not in user_data:
        user_data["wager_since_last_withdrawal"] = 0
    if not isinstance(user_data.get("pending_withdrawal"), (dict, type(None))):
        user_data["pending_withdrawal"] = None
    if not isinstance(user_data.get("pending_deposit"), (dict, type(None))):
        user_data["pending_deposit"] = None
    for key in ("total_successful_deposit", "withdrawal_count", "wager_since_last_withdrawal", "total_withdrawn"):
        try:
            user_data[key] = max(0, int(float(user_data.get(key, 0) or 0)))
        except (TypeError, ValueError, OverflowError):
            user_data[key] = 0


def required_wager_for_withdrawal(context: ContextTypes.DEFAULT_TYPE, amount: int) -> int:
    """Calculate turnover required for a later withdrawal; default is 50% of amount."""
    percent_ratio = max(0.0, min(1.0, float(get_setting(context, "WITHDRAW_WAGER_PERCENT"))))
    return int(math.ceil(int(amount) * percent_ratio))


def withdrawal_eligibility_message(context: ContextTypes.DEFAULT_TYPE, user_data: dict, amount: int) -> str | None:
    """Return a user-facing reason when a withdrawal does not meet the current rules."""
    ensure_withdrawal_tracking(user_data)
    if user_data.get("pending_withdrawal"):
        return "⏳ သင့်မှာ ငွေထုတ်တောင်းဆိုမှုတစ်ခု စစ်ဆေးဆဲရှိနေပါတယ်။ အရင်တောင်းဆိုမှု ပြီးဆုံးသည်အထိ စောင့်ပေးပါ။"

    withdrawal_count = int(user_data.get("withdrawal_count", 0))
    if withdrawal_count == 0:
        required_deposit = int(get_setting(context, "FIRST_WITHDRAW_DEPOSIT_REQUIRED"))
        deposited = int(user_data.get("total_successful_deposit", 0))
        if deposited < required_deposit:
            remaining = required_deposit - deposited
            return (
                "❌ ပထမဆုံး ငွေထုတ်ရန် အတည်ပြုပြီးသား ငွေသွင်းစုစုပေါင်း "
                f"{required_deposit:,} Ks ပြည့်ရပါမယ်။\n"
                f"လက်ရှိသွင်းပြီး: {deposited:,} Ks\n"
                f"ထပ်မံသွင်းရန်: {remaining:,} Ks"
            )
        return None

    required_wager = required_wager_for_withdrawal(context, amount)
    wagered = int(user_data.get("wager_since_last_withdrawal", 0))
    if wagered < required_wager:
        remaining = required_wager - wagered
        percent = float(get_setting(context, "WITHDRAW_WAGER_PERCENT")) * 100.0
        return (
            f"❌ ငွေထုတ်ရန် လောင်းကြေးမပြည့်သေးပါ။\n"
            f"ထုတ်ယူမည့်ငွေ: {int(amount):,} Ks\n"
            f"လိုအပ်သည့် လောင်းကြေး: {required_wager:,} Ks ({percent:g}%)\n"
            f"လက်ရှိဆော့ထားပြီး: {wagered:,} Ks\n"
            f"ထပ်ဆော့ရန်: {remaining:,} Ks"
        )
    return None


def initialize_user_data(context: ContextTypes.DEFAULT_TYPE, user_id: int, full_name: str, referrer_id: int = None):
    if 'users' not in context.bot_data: context.bot_data['users'] = {}
    is_new_user = user_id not in context.bot_data['users']
    if is_new_user:
        welcome_amount = int(get_setting(context, 'WELCOME_BONUS'))
        context.bot_data['users'][user_id] = {
            'balance': welcome_amount, 'referrals': 0, 'referral_balance': 0,
            'referrer': referrer_id, 'total_bet_cumulative': 0, 'promo_bonus_claimed_from': [], 'private_chat_started': False, 'has_successful_deposit': False
        }
        if welcome_amount > 0:
            _analytics_safe("record_analytics_cost", f"welcome:{user_id}", "welcome_bonus", welcome_amount, user_id, "Welcome bonus issued")
        if referrer_id:
            if referrer_id not in context.bot_data['users']:
                 referrer_welcome = int(get_setting(context, 'WELCOME_BONUS'))
                 context.bot_data['users'][referrer_id] = {
                    'balance': referrer_welcome, 'referrals': 0, 'referral_balance': 0, 'referrer': None,
                    'total_bet_cumulative': 0, 'promo_bonus_claimed_from': [], 'full_name': 'Referrer', 'private_chat_started': False, 'has_successful_deposit': False
                }
                 if referrer_welcome > 0:
                     _analytics_safe("record_analytics_cost", f"welcome:{referrer_id}", "welcome_bonus", referrer_welcome, referrer_id, "Welcome bonus issued to referrer profile")
            context.bot_data['users'][referrer_id]['referrals'] += 1
    context.bot_data['users'][user_id]['full_name'] = full_name
    user_has_completed_first_deposit(
        context.bot_data['users'][user_id], int(get_setting(context, 'WELCOME_BONUS'))
    )
    ensure_withdrawal_tracking(context.bot_data['users'][user_id])
    if _STORE is not None:
        _STORE.save_user(user_id, context.bot_data['users'][user_id])
        if referrer_id and referrer_id in context.bot_data['users']:
            _STORE.save_user(referrer_id, context.bot_data['users'][referrer_id])

async def is_group_admin(context: ContextTypes.DEFAULT_TYPE, chat_id: int, user_id: int) -> bool:
    if is_bot_admin(context, user_id): return True
    try:
        chat_admins = await context.bot.get_chat_administrators(chat_id)
        return user_id in [admin.user.id for admin in chat_admins]
    except Exception: return False


# Bet confirmations are delivered privately to the player.
async def delete_user_message(message) -> bool:
    try:
        await message.delete()
        return True
    except Exception as exc:
        # Telegram requires the bot to be an administrator with Delete Messages permission.
        logger.warning("Could not delete group message %s: %s", getattr(message, "message_id", "?"), exc)
        return False


async def notify_player(context: ContextTypes.DEFAULT_TYPE, user_id: int, text: str) -> bool:
    try:
        await context.bot.send_message(chat_id=user_id, text=text)
        return True
    except Exception as exc:
        # Do not post a public fallback: the user requested confirmations visible only to them.
        logger.info("Could not send private notice to user %s. They must /start the bot first: %s", user_id, exc)
        return False


def track_round_cleanup_message(chat_data: dict, message) -> None:
    chat_data.setdefault("round_cleanup_message_ids", []).append(message.message_id)


async def clear_round_cleanup_messages(bot, chat_id: int, chat_data: dict) -> None:
    message_ids = chat_data.pop("round_cleanup_message_ids", [])
    for message_id in message_ids:
        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
        except Exception as exc:
            logger.debug("Round message %s already removed or not deletable: %s", message_id, exc)

# ====================================================================
# ⚙️ Private Chat Keyboard
# ====================================================================
def get_main_reply_keyboard():
    return ReplyKeyboardMarkup([
        [KeyboardButton("ကစားနည်း💡"), KeyboardButton("စတင်ကစားရန်🚀")],
        [KeyboardButton("ငွေသွင်း/ငွေထုတ်🏦"), KeyboardButton("ကိုယ်ပိုင်အချက်အလက်")],
        [KeyboardButton("မိတ်ဆက်ခယူပြီး ငွေရှာနည်း🤑")]
    ], resize_keyboard=True)

# ====================================================================
# 🎲 Reliable Per-Group Round Engine
# ====================================================================
ROUND_DURATION_SECONDS = 60
NEXT_ROUND_DELAY_SECONDS = 60
DICE_ANIMATION_SECONDS = 4

DEFAULT_SETTINGS = {
    "ADMIN_IDS": ROOT_ADMIN_IDS[:],
    "OVER_UNDER_MULTIPLIER": OVER_UNDER_MULTIPLIER,
    "SIX_MULTIPLIER": SIX_MULTIPLIER,
    "DEFAULT_NUM_MULTIPLIER": DEFAULT_NUM_MULTIPLIER,
    "MINIMUM_BET": MINIMUM_BET,
    "MINIMUM_DEPOSIT": MINIMUM_DEPOSIT,
    "MINIMUM_FIRST_DEPOSIT": MINIMUM_FIRST_DEPOSIT,
    "MINIMUM_WITHDRAW": MINIMUM_DEPOSIT,
    "FIRST_WITHDRAW_DEPOSIT_REQUIRED": FIRST_WITHDRAW_DEPOSIT_REQUIRED,
    "WITHDRAW_WAGER_PERCENT": WITHDRAW_WAGER_PERCENT,
    "WELCOME_BONUS": WELCOME_BONUS,
    "KPAY_PHONE": KPAY_PHONE,
    "KPAY_NAME": "",
    "WAVE_PHONE": WAVE_PHONE,
    "WAVE_NAME": "",
    "PROMO_BET_THRESHOLD": PROMO_BET_THRESHOLD,
    "PROMO_BONUS_AMOUNT": PROMO_BONUS_AMOUNT,
    "COMMISSION_RATE": COMMISSION_RATE,
    "MINIMUM_TRANSFER_AMOUNT": MINIMUM_TRANSFER_AMOUNT,
    "ROUND_DURATION_SECONDS": ROUND_DURATION_SECONDS,
    "NEXT_ROUND_DELAY_SECONDS": NEXT_ROUND_DELAY_SECONDS,
    "GAME_GROUP_LINK": GAME_GROUP_LINK,
}
_ROUND_LOCKS: dict[int, asyncio.Lock] = {}


def _round_lock(chat_id: int) -> asyncio.Lock:
    """Return a process-local lock; locks are intentionally not persisted."""
    lock = _ROUND_LOCKS.get(chat_id)
    if lock is None:
        lock = asyncio.Lock()
        _ROUND_LOCKS[chat_id] = lock
    return lock


def _remove_jobs(job_queue, name: str) -> None:
    if job_queue is None:
        return
    for job in job_queue.get_jobs_by_name(name):
        job.schedule_removal()


def _round_status(chat_data: dict) -> str:
    # Compatibility with older PicklePersistence data.
    if "round_status" in chat_data:
        return chat_data["round_status"]
    return "open" if chat_data.get("betting_open", False) else "waiting"


def _schedule_next_round(application: Application, chat_id: int, completed_round_id: int,
                         delay: float | None = None) -> None:
    if delay is None:
        delay = float(get_setting(application, "NEXT_ROUND_DELAY_SECONDS"))
    job_queue = application.job_queue
    if job_queue is None:
        logger.error("JobQueue unavailable; cannot schedule next round for chat %s", chat_id)
        return
    _remove_jobs(job_queue, f"start_next_{chat_id}")
    chat_data = application.chat_data[chat_id]
    chat_data["next_round_at"] = time.time() + max(0.0, delay)
    job_queue.run_once(
        auto_start_next_round_job,
        max(0.0, delay),
        chat_id=chat_id,
        data=completed_round_id,
        name=f"start_next_{chat_id}",
    )


async def _start_new_round_logic(context: ContextTypes.DEFAULT_TYPE, chat_id: int) -> bool:
    """Open one round in this chat and schedule its deadline exactly once."""
    application = context.application
    job_queue = application.job_queue
    if job_queue is None:
        logger.error("JobQueue unavailable; refusing to open round in chat %s", chat_id)
        return False

    async with _round_lock(chat_id):
        chat_data = application.chat_data[chat_id]
        status = _round_status(chat_data)
        if status in ("open", "settling"):
            return False

        # Cancel stale jobs before opening a new round.
        _remove_jobs(job_queue, f"close_{chat_id}")
        _remove_jobs(job_queue, f"start_next_{chat_id}")
        await clear_round_cleanup_messages(application.bot, chat_id, chat_data)

        application.bot_data["round_counter"] = int(application.bot_data.get("round_counter", 0)) + 1
        round_id = application.bot_data["round_counter"]
        now = time.time()
        chat_data.update({
            "round_status": "open",
            "betting_open": True,
            "current_bets": [],
            "closed_bets": [],
            "round_id": round_id,
            "round_opened_at": now,
            "round_deadline": now + float(get_setting(application, "ROUND_DURATION_SECONDS")),
            "round_settings": {
                "OVER_UNDER_MULTIPLIER": float(get_setting(application, "OVER_UNDER_MULTIPLIER")),
                "SIX_MULTIPLIER": float(get_setting(application, "SIX_MULTIPLIER")),
                "DEFAULT_NUM_MULTIPLIER": float(get_setting(application, "DEFAULT_NUM_MULTIPLIER")),
                "MINIMUM_BET": int(get_setting(application, "MINIMUM_BET")),
            },
            "round_cleanup_message_ids": [],
            "next_round_at": None,
        })

        try:
            job_queue.run_once(
                close_betting_job,
                float(get_setting(application, "ROUND_DURATION_SECONDS")),
                chat_id=chat_id,
                data=round_id,
                name=f"close_{chat_id}",
            )
            opening_message = await application.bot.send_message(
                chat_id=chat_id,
                text=f"🎲 *ပွဲစဉ် {round_id} — လောင်းကြေးဖွင့်ပါပြီ။* ({int(get_setting(application, 'ROUND_DURATION_SECONDS'))} စက္ကန့်)",
                parse_mode=ParseMode.MARKDOWN,
            )
            track_round_cleanup_message(chat_data, opening_message)
            logger.info("Round %s opened in chat %s", round_id, chat_id)
            return True
        except Exception:
            _remove_jobs(job_queue, f"close_{chat_id}")
            chat_data.update({
                "round_status": "waiting",
                "betting_open": False,
                "current_bets": [],
                "round_deadline": None,
            })
            logger.exception("Could not open round in chat %s", chat_id)
            return False


def apply_round_timing_setting(application: Application, key: str, value: int) -> tuple[int, int]:
    """Apply an Admin timing edit to live round timers without duplicating jobs."""
    job_queue = application.job_queue
    if job_queue is None:
        return 0, 0
    now = time.time()
    open_updated = 0
    waiting_updated = 0

    if key == "ROUND_DURATION_SECONDS":
        for chat_id, chat_data in list(application.chat_data.items()):
            if _round_status(chat_data) != "open" or not chat_data.get("betting_open", False):
                continue
            round_id = chat_data.get("round_id")
            opened_at = float(chat_data.get("round_opened_at") or now)
            deadline = opened_at + int(value)
            chat_data["round_deadline"] = deadline
            _remove_jobs(job_queue, f"close_{chat_id}")
            job_queue.run_once(
                close_betting_job,
                max(0.1, deadline - now),
                chat_id=chat_id,
                data=round_id,
                name=f"close_{chat_id}",
            )
            open_updated += 1

    elif key == "NEXT_ROUND_DELAY_SECONDS":
        for chat_id, chat_data in list(application.chat_data.items()):
            if _round_status(chat_data) != "waiting":
                continue
            completed_id = chat_data.get("last_completed_round_id")
            if completed_id is None:
                continue
            _schedule_next_round(application, chat_id, int(completed_id), float(value))
            waiting_updated += 1

    return open_updated, waiting_updated


async def auto_start_next_round_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    job = context.job
    chat_id = job.chat_id
    expected_completed_round = job.data
    chat_data = context.application.chat_data[chat_id]
    if _round_status(chat_data) != "waiting":
        return
    if chat_data.get("last_completed_round_id") != expected_completed_round:
        return
    deadline = chat_data.get("next_round_at")
    if deadline is not None and time.time() + 0.05 < deadline:
        _schedule_next_round(context.application, chat_id, expected_completed_round, deadline - time.time())
        return
    await _start_new_round_logic(context, chat_id)


async def _refund_round_bets(application: Application, bets: list[dict], chat_id: int,
                             round_id: int, reason: str) -> None:
    """Refund stakes when a round cannot produce a valid dice result."""
    refunded_by_user: dict[int, int] = {}
    for bet in bets:
        user_id = bet.get("user_id")
        amount = int(bet.get("amount", 0))
        _analytics_safe("settle_analytics_bet", str(bet.get("bet_id", "")), "refunded", 0, 0)
        user_data = application.bot_data.get("users", {}).get(user_id)
        if user_data is not None and amount > 0:
            user_data["balance"] = int(user_data.get("balance", 0)) + amount
            ensure_withdrawal_tracking(user_data)
            # A voided/refunded bet must not count toward withdrawal turnover.
            user_data["wager_since_last_withdrawal"] = max(
                0, int(user_data.get("wager_since_last_withdrawal", 0)) - amount
            )
            if _STORE is not None:
                _STORE.save_user(user_id, user_data)
            refunded_by_user[user_id] = refunded_by_user.get(user_id, 0) + amount
    for user_id, amount in refunded_by_user.items():
        await notify_player(
            _ApplicationContext(application), user_id,
            f"⚠️ ပွဲစဉ် {round_id} ကို ရလဒ်မထုတ်နိုင်သဖြင့် ပယ်ဖျက်လိုက်ပါသည်။\n"
            f"💰 လောင်းကြေး {amount:,} Ks ကို ပြန်အမ်းပြီးပါပြီ။\n{reason}",
        )
    request_auto_backup(application, f"round {round_id} refunded")


def classify_dice_total(total: int) -> str:
    """Classify the sum of two dice using the game's mutually exclusive rules."""
    value = int(total)
    if value == 7:
        return "common"
    if 8 <= value <= 12:
        return "big"
    if 2 <= value <= 6:
        return "small"
    return "invalid"


class _ApplicationContext:
    """Tiny adapter so the shared private-notification helper can use an Application."""
    def __init__(self, application: Application):
        self.bot = application.bot


async def _calculate_and_announce_results(application: Application, chat_id: int,
                                           round_id: int, bets_to_check: list[dict]) -> None:
    """Roll dice once, calculate payouts, privately notify players, then schedule next round."""
    dice_values: tuple[int, int] | None = None
    try:
        dice_one = await application.bot.send_dice(chat_id=chat_id, emoji="🎲")
        track_round_cleanup_message(application.chat_data[chat_id], dice_one)
        dice_two = await application.bot.send_dice(chat_id=chat_id, emoji="🎲")
        track_round_cleanup_message(application.chat_data[chat_id], dice_two)
        await asyncio.sleep(DICE_ANIMATION_SECONDS)
        dice_values = (dice_one.dice.value, dice_two.dice.value)
    except Exception as exc:
        logger.exception("Dice result failed for round %s in chat %s: %s", round_id, chat_id, exc)
        await _refund_round_bets(
            application, bets_to_check, chat_id, round_id,
            "နောက်ပွဲကို တစ်မိနစ်အကြာ အလိုအလျောက် ပြန်ဖွင့်ပါမည်။",
        )
        try:
            void_message = await application.bot.send_message(
                chat_id=chat_id,
                text=f"⚠️ *ပွဲစဉ် {round_id} ကို ပယ်ဖျက်လိုက်ပါသည်။* လောင်းကြေးများ ပြန်အမ်းပြီးပါပြီ။",
                parse_mode=ParseMode.MARKDOWN,
            )
            track_round_cleanup_message(application.chat_data[chat_id], void_message)
        except Exception:
            logger.exception("Could not post void-round notice for chat %s", chat_id)
        chat_data = application.chat_data[chat_id]
        chat_data["closed_bets"] = []
        chat_data["round_status"] = "waiting"
        chat_data["betting_open"] = False
        chat_data["last_completed_round_id"] = round_id
        _schedule_next_round(application, chat_id, round_id)
        return

    die_one, die_two = dice_values
    total_result = die_one + die_two
    winners: list[dict] = []
    outcomes_by_user: dict[int, list[str]] = {}
    round_settings = application.chat_data[chat_id].get("round_settings", {})
    round_over_under = float(round_settings.get("OVER_UNDER_MULTIPLIER", get_setting(application, "OVER_UNDER_MULTIPLIER")))
    round_seven = float(round_settings.get("SIX_MULTIPLIER", get_setting(application, "SIX_MULTIPLIER")))
    round_default = float(round_settings.get("DEFAULT_NUM_MULTIPLIER", get_setting(application, "DEFAULT_NUM_MULTIPLIER")))

    for bet in bets_to_check:
        try:
            user_id = int(bet["user_id"])
            user_data = application.bot_data.get("users", {}).get(user_id)
            if user_data is None:
                continue
            amount = int(bet.get("amount", 0))
            bet_kind = bet.get("bet_kind")
            selection = bet.get("selection")

            # Compatibility with bets created by the previous release.
            if bet_kind is None:
                old_text = str(bet.get("bet_text", ""))
                old_ou = re.fullmatch(r"(အကြီး|အသေး)\s+(\d+)", old_text)
                old_num = re.fullmatch(r"(\d{1,2})\s+(\d+)", old_text)
                if old_ou:
                    bet_kind, selection = "size", old_ou.group(1)
                elif old_num:
                    bet_kind, selection = "number", int(old_num.group(1))
                    amount = int(old_num.group(2))

            multiplier = 0.0
            if bet_kind == "size":
                result_class = classify_dice_total(total_result)
                if (selection == "အကြီး" and result_class == "big") or (selection == "အသေး" and result_class == "small"):
                    multiplier = round_over_under
            elif bet_kind == "number" and int(selection) == total_result:
                multiplier = round_seven if total_result == 7 else round_default

            display_bet = bet.get("bet_display") or bet.get("bet_text") or str(selection)
            if multiplier > 0:
                payout = int(amount * multiplier)
                profit = payout - amount
                _analytics_safe("settle_analytics_bet", str(bet.get("bet_id", "")), "win", payout, total_result)
                old_balance = int(user_data.get("balance", 0))
                user_data["balance"] = old_balance + payout
                if _STORE is not None:
                    _STORE.save_user(user_id, user_data)
                winners.append({
                    "full_name": str(bet.get("full_name", "Player")),
                    "bet_display": str(display_bet),
                    "amount": amount,
                    "payout": payout,
                    "profit": profit,
                    "new_balance": user_data["balance"],
                })
                outcomes_by_user.setdefault(user_id, []).append(
                    f"✅ {display_bet} — နိုင်ငွေ {payout:,} Ks (အမြတ် {profit:,} Ks)"
                )
            else:
                _analytics_safe("settle_analytics_bet", str(bet.get("bet_id", "")), "loss", 0, total_result)
                current_balance = int(user_data.get("balance", 0))
                outcomes_by_user.setdefault(user_id, []).append(
                    f"❌ {display_bet} — ရှုံးပါသည်။\n💳 လက်ကျန် {current_balance:,} Ks"
                )
        except Exception:
            logger.exception("Could not settle a bet in round %s: %r", round_id, bet)

    result_class = classify_dice_total(total_result)
    result_class_label = {
        "common": "ဘုံအများဆုံး (Common 7) — အလယ်ဂဏန်း",
        "big": "အကြီး (Big)",
        "small": "အသေး (Small)",
    }.get(result_class, "မသတ်မှတ်နိုင်သော ရလဒ်")
    result_lines = [
        f"🎉 <b>ပွဲစဉ် {round_id} ရလဒ်</b>",
        f"🎲 <b>ရလဒ်:</b> {die_one} + {die_two} = <b>{total_result}</b>",
        f"📌 <b>အမျိုးအစား:</b> {result_class_label}",
        "━━━━━━━━━━━━━━",
    ]
    if not bets_to_check:
        result_lines.append("ဒီပွဲစဉ်မှာ လောင်းကြေးမရှိပါ။")
    elif not winners:
        result_lines.append("ကံထူးသူမရှိပါ။")
    else:
        for winner in winners:
            result_lines.append(
                f"👤 {html.escape(winner['full_name'])} — {html.escape(winner['bet_display'])}\n"
                f"✅ {winner['payout']:,} Ks (အမြတ် {winner['profit']:,} Ks)"
            )

    result_text = "\n".join(result_lines)
    try:
        # Telegram message limit is 4096 characters; keep a safety margin.
        while result_text:
            chunk = result_text[:3900]
            if len(result_text) > 3900:
                split_at = chunk.rfind("\n")
                if split_at > 1000:
                    chunk = chunk[:split_at]
            result_message = await application.bot.send_message(
                chat_id=chat_id, text=chunk, parse_mode=ParseMode.HTML
            )
            track_round_cleanup_message(application.chat_data[chat_id], result_message)
            result_text = result_text[len(chunk):].lstrip("\n")
    except Exception:
        logger.exception("Could not announce result for round %s in chat %s", round_id, chat_id)

    for user_id, outcome_lines in outcomes_by_user.items():
        user_data = application.bot_data.get("users", {}).get(user_id, {})
        dm_text = (
            f"🎲 ပွဲစဉ် {round_id} ရလဒ်\n"
            f"အံစာတုံး: {die_one} + {die_two} = {total_result}\n\n"
            + "\n".join(outcome_lines)
            + f"\n\n💳 လက်ကျန်ငွေ: {int(user_data.get('balance', 0)):,} Ks"
        )
        await notify_player(_ApplicationContext(application), user_id, dm_text)

    chat_data = application.chat_data[chat_id]
    chat_data["closed_bets"] = []
    chat_data["current_bets"] = []
    chat_data["betting_open"] = False
    chat_data["round_status"] = "waiting"
    chat_data["last_completed_round_id"] = round_id
    logger.info("Round %s settled in chat %s; winners=%s", round_id, chat_id, len(winners))
    request_auto_backup(application, f"round {round_id} settled")
    _schedule_next_round(application, chat_id, round_id)


async def _close_round_logic(application: Application, chat_id: int,
                              expected_round_id: int | None = None) -> bool:
    """Atomically stop betting, snapshot accepted bets, and settle exactly once."""
    async with _round_lock(chat_id):
        chat_data = application.chat_data[chat_id]
        if _round_status(chat_data) != "open" or not chat_data.get("betting_open", False):
            return False
        round_id = chat_data.get("round_id")
        if expected_round_id is not None and round_id != expected_round_id:
            return False
        chat_data["round_status"] = "settling"
        chat_data["betting_open"] = False
        bets_to_check = list(chat_data.get("current_bets", []))
        chat_data["closed_bets"] = bets_to_check
        chat_data["current_bets"] = []
        _remove_jobs(application.job_queue, f"close_{chat_id}")

    await clear_round_cleanup_messages(application.bot, chat_id, application.chat_data[chat_id])
    await _calculate_and_announce_results(application, chat_id, int(round_id), bets_to_check)
    return True


async def close_all_open_rounds(application: Application) -> tuple[int, int]:
    """Close and settle every currently open round across all known group chats.

    Per-chat locks inside _close_round_logic prevent duplicate settlement when
    the automatic timer fires at the same time as an admin close request.
    """
    active_chat_ids = []
    for chat_id, chat_data in list(application.chat_data.items()):
        if _round_status(chat_data) == "open" and chat_data.get("betting_open", False):
            active_chat_ids.append(int(chat_id))

    if not active_chat_ids:
        return 0, 0

    semaphore = asyncio.Semaphore(5)

    async def close_one(chat_id: int):
        async with semaphore:
            chat_data = application.chat_data.get(chat_id, {})
            round_id = chat_data.get("round_id")
            bet_count = len(chat_data.get("current_bets", []))
            closed = await _close_round_logic(application, chat_id)
            return (1, bet_count) if closed else (0, 0)

    results = await asyncio.gather(
        *(close_one(chat_id) for chat_id in active_chat_ids),
        return_exceptions=True,
    )
    closed_count = 0
    bet_count = 0
    for result in results:
        if isinstance(result, Exception):
            logger.error("Global round close task failed: %r", result)
            continue
        closed_count += result[0]
        bet_count += result[1]
    return closed_count, bet_count


async def close_betting_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    await _close_round_logic(
        context.application, context.job.chat_id,
        expected_round_id=context.job.data,
    )


async def recover_round_jobs(application: Application) -> None:
    """Rebuild timers after restart because JobQueue jobs are not persisted."""
    now = time.time()
    for chat_id, chat_data in list(application.chat_data.items()):
        status = _round_status(chat_data)
        if status == "open":
            round_id = chat_data.get("round_id")
            deadline = float(chat_data.get("round_deadline") or now)
            delay = max(0.1, deadline - now)
            _remove_jobs(application.job_queue, f"close_{chat_id}")
            application.job_queue.run_once(
                close_betting_job,
                delay,
                chat_id=chat_id,
                data=round_id,
                name=f"close_{chat_id}",
            )
            logger.info("Recovered open round %s in chat %s with %.1fs remaining", round_id, chat_id, delay)
        elif status == "settling":
            # A crash occurred after bets were closed but before a result was committed.
            # Since the dice outcome cannot be reconstructed safely, refund the saved stakes.
            round_id = int(chat_data.get("round_id", 0))
            bets = list(chat_data.get("closed_bets", []))
            await _refund_round_bets(
                application, bets, chat_id, round_id,
                "Bot ပြန်လည်စတင်ချိန်တွင် ရလဒ်မပြည့်စုံသဖြင့် ပြန်အမ်းခြင်းဖြစ်ပါသည်။",
            )
            chat_data.update({
                "round_status": "waiting",
                "betting_open": False,
                "closed_bets": [],
                "current_bets": [],
                "last_completed_round_id": round_id,
            })
            try:
                await application.bot.send_message(
                    chat_id=chat_id,
                    text=f"⚠️ ပွဲစဉ် {round_id} ကို Bot ပြန်လည်စတင်မှုကြောင့် ပယ်ဖျက်ပြီး လောင်းကြေးများ ပြန်အမ်းထားပါသည်။",
                )
            except Exception:
                logger.exception("Could not post recovered-round refund notice in chat %s", chat_id)
            _schedule_next_round(application, chat_id, round_id)
        elif status == "waiting" and chat_data.get("last_completed_round_id") is not None:
            completed_id = int(chat_data["last_completed_round_id"])
            next_at = float(chat_data.get("next_round_at") or now)
            _schedule_next_round(application, chat_id, completed_id, max(0.1, next_at - now))

# ====================================================================
# 💳 Payment Conversation Functions (No Changes in this section)
# ====================================================================
async def payment_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    keyboard = [[InlineKeyboardButton("💵 ငွေသွင်းရန်", callback_data="start_deposit"), InlineKeyboardButton("💸 ငွေထုတ်ရန်", callback_data="start_withdraw")], [InlineKeyboardButton("✖️ ပယ်ဖျက်မည်", callback_data="cancel_payment")]]
    if update.callback_query:
        await update.callback_query.edit_message_text("ကျေးဇူးပြု၍ လုပ်ဆောင်ချက်ကို ရွေးချယ်ပါ:", reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        await update.message.reply_text("ကျေးဇူးပြု၍ လုပ်ဆောင်ချက်ကို ရွေးချယ်ပါ:", reply_markup=InlineKeyboardMarkup(keyboard))
    return CHOOSE_ACTION

async def start_deposit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    user = query.from_user
    user_data = context.bot_data.get("users", {}).get(user.id)
    if user_data is not None:
        ensure_withdrawal_tracking(user_data)
        if user_data.get("pending_deposit"):
            await query.edit_message_text("⏳ သင့်ငွေသွင်းတောင်းဆိုမှုကို Admin က စစ်ဆေးနေပါသည်။ ပြီးဆုံးသည်အထိ စောင့်ပေးပါ။")
            return ConversationHandler.END
    keyboard = [[InlineKeyboardButton("KPay", callback_data="deposit_kpay"), InlineKeyboardButton("Wave", callback_data="deposit_wave")], [InlineKeyboardButton("🔙 နောက်သို့", callback_data="back_to_payment_start")]]
    await query.edit_message_text("ငွေဖြည့်သွင်းရန် Payment Method ရွေးချယ်ပါ:", reply_markup=InlineKeyboardMarkup(keyboard))
    return DEPOSIT_CHOOSE_METHOD

async def deposit_choose_method(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    method = query.data.split('_')[1]
    user = query.from_user
    initialize_user_data(context, user.id, user.full_name)
    user_data = context.bot_data['users'][user.id]
    context.user_data['deposit_method'] = method
    phone = get_setting(context, 'KPAY_PHONE') if method == 'kpay' else get_setting(context, 'WAVE_PHONE')
    account_name = get_setting(context, 'KPAY_NAME') if method == 'kpay' else get_setting(context, 'WAVE_NAME')
    account_line = f"အကောင့်အမည်: {account_name}\n" if account_name else ""
    minimum, is_first_deposit = required_deposit_minimum(context, user_data)
    minimum_label = "ပထမဆုံး ငွေသွင်း အနည်းဆုံး" if is_first_deposit else "အနည်းဆုံး ငွေသွင်းပမာဏ"
    await query.edit_message_text(
        f"သင် {method.upper()} ကို ရွေးချယ်ထားပါသည်။\n\n"
        f"ကျေးဇူးပြု၍ အောက်ပါအကောင့်သို့ ငွေလွှဲပေးပါ:\n{account_line}{phone}\n\n"
        f"ပြီးလျှင် သင်ဖြည့်သွင်းလိုသော ငွေပမာဏကို ရိုက်ထည့်ပေးပါ။\n"
        f"{minimum_label}: {minimum:,} Ks"
    )
    return DEPOSIT_ENTER_AMOUNT

async def deposit_enter_amount(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    if user is None:
        await update.message.reply_text("အသုံးပြုသူအချက်အလက် မရရှိပါ။ /start ပြန်လုပ်ပါ။")
        return ConversationHandler.END
    initialize_user_data(context, user.id, user.full_name)
    user_data = context.bot_data['users'][user.id]
    minimum, is_first_deposit = required_deposit_minimum(context, user_data)
    try:
        amount = int((update.message.text or "").strip().replace(",", ""))
        if amount <= 0:
            raise ValueError
        if amount < minimum:
            label = "ပထမဆုံး ငွေသွင်း အနည်းဆုံး" if is_first_deposit else "အနည်းဆုံး ငွေသွင်းပမာဏ"
            await update.message.reply_text(f"❗️{label}မှာ {minimum:,} Ks ဖြစ်ပါသည်။")
            return DEPOSIT_ENTER_AMOUNT
    except ValueError:
        await update.message.reply_text("❗️မှန်ကန်သော ငွေပမာဏကို ဂဏန်းဖြင့် ရိုက်ထည့်ပါ။")
        return DEPOSIT_ENTER_AMOUNT
    context.user_data['deposit_amount'] = amount
    context.user_data['deposit_is_first'] = is_first_deposit
    await update.message.reply_text(
        f"သင် {amount:,} Ks ဖြည့်သွင်းမည်။\n\n"
        "ကျေးဇူးပြု၍ ငွေလွှဲပြေစာ (screenshot) ကို ပေးပို့ပါ။"
    )
    return DEPOSIT_UPLOAD_RECEIPT

async def deposit_upload_receipt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    user_data = context.bot_data.get("users", {}).get(user.id)
    if user_data is None:
        await update.message.reply_text("အကောင့်အချက်အလက် မတွေ့ပါ။ /start ပြန်လုပ်ပါ။")
        return ConversationHandler.END
    ensure_withdrawal_tracking(user_data)
    if user_data.get("pending_deposit"):
        await update.message.reply_text("⏳ ယခင်ငွေသွင်းတောင်းဆိုမှုကို Admin စစ်ဆေးနေဆဲဖြစ်ပါသည်။")
        context.user_data.clear()
        return ConversationHandler.END

    amount = int(context.user_data.get("deposit_amount", 0))
    method = str(context.user_data.get("deposit_method", "kpay")).upper()
    is_first_deposit = bool(context.user_data.get('deposit_is_first', False))
    first_label = "\nType: ပထမဆုံး ငွေသွင်း" if is_first_deposit else ""
    request_id = uuid.uuid4().hex[:12]
    user_data["pending_deposit"] = {
        "request_id": request_id,
        "amount": amount,
        "method": method,
        "requested_at": time.time(),
        "status": "pending",
    }
    if _STORE is not None:
        _STORE.save_user(user.id, user_data)

    caption = (
        f"*💰 ငွေသွင်းတောင်းဆိုမှု*\nUser: {_escape_legacy_markdown(user.full_name)}\nID: `{user.id}`\n"
        f"Method: {method}\nAmount: `{amount:,}` Ks{first_label}\nRequest: `{request_id}`"
    )
    keyboard = [[
        InlineKeyboardButton("✅ လက်ခံမည်", callback_data=f"approve_deposit:{user.id}:{amount}:{request_id}"),
        InlineKeyboardButton("❌ ငြင်းပယ်မည်", callback_data=f"decline_payment:{user.id}:{request_id}"),
    ]]
    delivered_to_admin = 0
    for admin_id in get_admin_ids(context):
        try:
            await context.bot.send_photo(
                chat_id=admin_id,
                photo=update.message.photo[-1].file_id,
                caption=caption,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode=ParseMode.MARKDOWN,
            )
            delivered_to_admin += 1
        except TelegramError as exc:
            logger.warning("Could not send deposit request to Admin %s: %s", admin_id, exc)
    if delivered_to_admin == 0:
        user_data["pending_deposit"] = None
        if _STORE is not None:
            _STORE.save_user(user.id, user_data)
        await update.message.reply_text("❌ Admin ထံ တောင်းဆိုမှုမပို့နိုင်ပါ။ ပြန်လည်ကြိုးစားပါ။")
    else:
        await update.message.reply_text("✅ တောင်းဆိုမှုကို Admin ထံ ပေးပို့ထားပါသည်။ ခေတ္တစောင့်ပါ။")
    context.user_data.clear()
    return ConversationHandler.END

async def start_withdraw(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    user = query.from_user
    user_data = context.bot_data.get("users", {}).get(user.id)
    if user_data is None:
        initialize_user_data(context, user.id, user.full_name)
        user_data = context.bot_data["users"][user.id]
    ensure_withdrawal_tracking(user_data)
    pending = user_data.get("pending_withdrawal")
    if pending:
        await query.edit_message_text(
            "⏳ သင့်ငွေထုတ်တောင်းဆိုမှုကို Admin က စစ်ဆေးနေပါသည်။ ပြီးဆုံးသည်အထိ စောင့်ပေးပါ။"
        )
        return ConversationHandler.END
    minimum = int(get_setting(context, 'MINIMUM_WITHDRAW'))
    await query.edit_message_text(
        f"သင်ထုတ်ယူလိုသော ငွေပမာဏကို ရိုက်ထည့်ပေးပါ။ (အနည်းဆုံး {minimum:,} Ks)"
    )
    return WITHDRAW_ENTER_AMOUNT


async def withdraw_enter_amount(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    user_data = context.bot_data.get("users", {}).get(user.id)
    if user_data is None:
        initialize_user_data(context, user.id, user.full_name)
        user_data = context.bot_data["users"][user.id]
    ensure_withdrawal_tracking(user_data)
    try:
        amount = int((update.message.text or "").replace(",", "").strip())
        minimum = int(get_setting(context, 'MINIMUM_WITHDRAW'))
        if amount < minimum:
            await update.message.reply_text(f"❗️အနည်းဆုံး {minimum:,} Ks မှစ၍ ထုတ်ယူနိုင်ပါသည်။")
            return WITHDRAW_ENTER_AMOUNT
        if amount <= 0:
            raise ValueError
        if user_data.get("pending_withdrawal"):
            await update.message.reply_text("⏳ သင့်မှာ ငွေထုတ်တောင်းဆိုမှုတစ်ခု စစ်ဆေးဆဲရှိနေပါသည်။")
            return ConversationHandler.END
        if int(user_data.get('balance', 0)) < amount:
            await update.message.reply_text("❗️လက်ကျန်ငွေ မလုံလောက်ပါ။")
            context.user_data.clear()
            return ConversationHandler.END
        eligibility_error = withdrawal_eligibility_message(context, user_data, amount)
        if eligibility_error:
            await update.message.reply_text(eligibility_error)
            context.user_data.clear()
            return ConversationHandler.END
    except ValueError:
        await update.message.reply_text("❗️ဂဏန်းအပေါင်းကိန်းကိုသာ ရိုက်ထည့်ပါ။")
        return WITHDRAW_ENTER_AMOUNT

    context.user_data['withdraw_amount'] = amount
    keyboard = [
        [InlineKeyboardButton("KPay", callback_data="withdraw_kpay"), InlineKeyboardButton("Wave", callback_data="withdraw_wave")],
        [InlineKeyboardButton("🔙 နောက်သို့", callback_data="back_to_payment_start")],
    ]
    await update.message.reply_text("ငွေထုတ်ယူမည့် Payment Method ကိုရွေးပါ:", reply_markup=InlineKeyboardMarkup(keyboard))
    return WITHDRAW_CHOOSE_METHOD


async def withdraw_choose_method(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data['withdraw_method'] = query.data.split('_')[1]
    await query.edit_message_text("သင်၏ ငွေလက်ခံမည့် ဖုန်းနံပါတ်ကို ရိုက်ထည့်ပေးပါ။")
    return WITHDRAW_ENTER_PHONE


async def withdraw_enter_phone(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    phone = (update.message.text or "").strip()
    if not phone or len(phone) > 40:
        await update.message.reply_text("မှန်ကန်သော ဖုန်းနံပါတ်ကို ထည့်ပေးပါ။")
        return WITHDRAW_ENTER_PHONE
    context.user_data['withdraw_phone'] = phone
    await update.message.reply_text("သင်၏ ငွေလက်ခံမည့် အကောင့်အမည်ကို ရိုက်ထည့်ပေးပါ။")
    return WITHDRAW_ENTER_NAME


async def withdraw_enter_name(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    user = update.effective_user
    account_name = (update.message.text or "").strip()
    if not account_name or len(account_name) > 80:
        await update.message.reply_text("မှန်ကန်သော အကောင့်အမည်ကို ထည့်ပေးပါ။")
        return WITHDRAW_ENTER_NAME

    user_data = context.bot_data.get("users", {}).get(user.id)
    if user_data is None:
        await update.message.reply_text("အကောင့်အချက်အလက် မတွေ့ပါ။ /start ပြန်လုပ်ပေးပါ။")
        return ConversationHandler.END
    ensure_withdrawal_tracking(user_data)
    amount = int(context.user_data.get("withdraw_amount", 0))
    eligibility_error = withdrawal_eligibility_message(context, user_data, amount)
    if eligibility_error:
        await update.message.reply_text(eligibility_error)
        context.user_data.clear()
        return ConversationHandler.END
    if int(user_data.get("balance", 0)) < amount:
        await update.message.reply_text("❗️လက်ကျန်ငွေ မလုံလောက်တော့ပါ။")
        context.user_data.clear()
        return ConversationHandler.END

    request_id = uuid.uuid4().hex[:12]
    method = str(context.user_data.get("withdraw_method", "kpay")).upper()
    phone = str(context.user_data.get("withdraw_phone", ""))
    wager_snapshot = int(user_data.get("wager_since_last_withdrawal", 0))
    pending = {
        "request_id": request_id,
        "amount": amount,
        "method": method,
        "phone": phone,
        "account_name": account_name,
        "requested_at": time.time(),
        "status": "pending",
        "wager_snapshot": wager_snapshot,
    }

    # Reserve the withdrawal amount immediately so multiple pending requests or
    # concurrent bets cannot spend the same wallet funds.
    user_data["balance"] = int(user_data.get("balance", 0)) - amount
    user_data["pending_withdrawal"] = pending
    if _STORE is not None:
        _STORE.save_user(user.id, user_data)

    if int(user_data.get("withdrawal_count", 0)) == 0:
        rule_text = (
            f"ပထမဆုံး ငွေထုတ်ခွင့် — အတည်ပြုပြီးငွေသွင်းစုစုပေါင်း "
            f"{int(user_data.get('total_successful_deposit', 0)):,} / "
            f"{int(get_setting(context, 'FIRST_WITHDRAW_DEPOSIT_REQUIRED')):,} Ks"
        )
    else:
        required = required_wager_for_withdrawal(context, amount)
        rule_text = (
            f"လောင်းကြေးလိုအပ်ချက် — {required:,} Ks / "
            f"ဆော့ထားပြီး {wager_snapshot:,} Ks"
        )

    details = (
        f"💸 ငွေထုတ်တောင်းဆိုမှု\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"User: {user.full_name}\n"
        f"ID: {user.id}\n"
        f"Amount: {amount:,} Ks\n"
        f"Method: {method}\n"
        f"Phone: {phone}\n"
        f"Name: {account_name}\n"
        f"{rule_text}\n"
        f"Request: {request_id}"
    )
    keyboard = [[
        InlineKeyboardButton("✅ လက်ခံမည်", callback_data=f"approve_withdraw:{user.id}:{request_id}"),
        InlineKeyboardButton("❌ ငြင်းပယ်မည်", callback_data=f"decline_withdraw:{user.id}:{request_id}"),
    ]]

    delivered_to_admin = 0
    for admin_id in get_admin_ids(context):
        try:
            await context.bot.send_message(
                chat_id=admin_id,
                text=details,
                reply_markup=InlineKeyboardMarkup(keyboard),
            )
            delivered_to_admin += 1
        except TelegramError as exc:
            logger.warning("Could not send withdrawal request to Admin %s: %s", admin_id, exc)

    if delivered_to_admin == 0:
        # No Admin received the request, so release the reserved funds safely.
        user_data["balance"] = int(user_data.get("balance", 0)) + amount
        user_data["pending_withdrawal"] = None
        if _STORE is not None:
            _STORE.save_user(user.id, user_data)
        await update.message.reply_text("❌ Admin ထံ တောင်းဆိုမှုမပို့နိုင်ပါ။ လက်ကျန်ငွေကို ပြန်လည်ထည့်ပေးထားပါသည်။")
        context.user_data.clear()
        return ConversationHandler.END

    await update.message.reply_text(
        "✅ ငွေထုတ်တောင်းဆိုမှုကို Admin ထံ ပေးပို့ပြီးပါပြီ။\n"
        f"💰 {amount:,} Ks ကို စစ်ဆေးနေစဉ် ယာယီ reserve လုပ်ထားပါသည်။\n"
        f"လက်ကျန်ငွေ: {int(user_data.get('balance', 0)):,} Ks"
    )
    context.user_data.clear()
    return ConversationHandler.END


async def cancel_payment(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    await query.edit_message_text("လုပ်ဆောင်ချက်ကို ပယ်ဖျက်လိုက်ပါသည်။")
    context.user_data.clear()
    return ConversationHandler.END

async def back_to_payment_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    keyboard = [[InlineKeyboardButton("💵 ငွေသွင်းရန်", callback_data="start_deposit"), InlineKeyboardButton("💸 ငွေထုတ်ရန်", callback_data="start_withdraw")], [InlineKeyboardButton("✖️ ပယ်ဖျက်မည်", callback_data="cancel_payment")]]
    await query.edit_message_text("ကျေးဇူးပြု၍ လုပ်ဆောင်ချက်ကို ရွေးချယ်ပါ:", reply_markup=InlineKeyboardMarkup(keyboard))
    return CHOOSE_ACTION

async def admin_await_receipt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    target_user_id = int(context.user_data.get("receipt_for_user_id", 0))
    request_id = str(context.user_data.get("receipt_for_request_id", ""))
    target_data = context.bot_data.get("users", {}).get(target_user_id)
    if target_data is None:
        await update.message.reply_text("❗ User record မတွေ့ပါ။ /cancel ဖြင့် Admin action ကို ပယ်ဖျက်ပါ။")
        return ADMIN_AWAIT_RECEIPT
    ensure_withdrawal_tracking(target_data)
    pending = target_data.get("pending_withdrawal")
    if not isinstance(pending, dict) or pending.get("request_id") != request_id or pending.get("status") != "awaiting_receipt":
        await update.message.reply_text("❗ ဤငွေထုတ်တောင်းဆိုမှု မရှိတော့ပါ။ /cancel ဖြင့် ထွက်နိုင်ပါသည်။")
        return ADMIN_AWAIT_RECEIPT

    amount = int(pending.get("amount", context.user_data.get("receipt_for_amount", 0)))
    caption = (
        f"✅ ငွေထုတ်ပေးချေမှု အောင်မြင်ပါသည်။\n"
        f"ပမာဏ: {amount:,} Ks\n"
        "နောက်တစ်ကြိမ် ငွေထုတ်ရန် လောင်းကြေးတိုးတက်မှုကို 0 မှ ပြန်စထားပါသည်။"
    )
    try:
        await context.bot.send_photo(
            chat_id=target_user_id,
            photo=update.message.photo[-1].file_id,
            caption=caption,
        )
    except TelegramError as exc:
        logger.exception("Could not deliver withdrawal receipt to user %s", target_user_id)
        await update.message.reply_text(
            f"❌ User ထံ ပြေစာမပို့နိုင်ပါ။ Pending request ကို မပိတ်သေးပါ။\n{str(exc)[:300]}\nဓာတ်ပုံကို ထပ်ပို့ပါ သို့မဟုတ် /cancel လုပ်ပါ။"
        )
        return ADMIN_AWAIT_RECEIPT

    # Only a successfully delivered payout receipt completes the withdrawal cycle.
    target_data["withdrawal_count"] = int(target_data.get("withdrawal_count", 0)) + 1
    target_data["total_withdrawn"] = int(target_data.get("total_withdrawn", 0)) + amount
    _analytics_safe("record_analytics_cashflow", f"withdrawal:{request_id}", "withdrawal_paid", amount, target_user_id, "Withdrawal receipt successfully delivered")
    target_data["last_withdrawal_amount"] = amount
    target_data["last_withdrawal_at"] = time.time()
    target_data["wager_since_last_withdrawal"] = 0
    target_data["pending_withdrawal"] = None
    if _STORE is not None:
        _STORE.save_user(target_user_id, target_data)
    await update.message.reply_text(
        f"✅ {target_user_id} သို့ {amount:,} Ks ပြေစာပို့ပြီးပါပြီ။\n"
        "Withdrawal count တိုးပြီး လောင်းကြေး requirement ကို 0 မှ ပြန်စထားပါသည်။"
    )
    context.user_data.clear()
    return ConversationHandler.END


async def cancel_admin_action(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    target_user_id = int(context.user_data.get("receipt_for_user_id", 0) or 0)
    request_id = str(context.user_data.get("receipt_for_request_id", ""))
    target_data = context.bot_data.get("users", {}).get(target_user_id)
    released_amount = 0
    if target_data is not None and request_id:
        ensure_withdrawal_tracking(target_data)
        pending = target_data.get("pending_withdrawal")
        if isinstance(pending, dict) and pending.get("request_id") == request_id:
            released_amount = int(pending.get("amount", 0))
            target_data["balance"] = int(target_data.get("balance", 0)) + released_amount
            target_data["pending_withdrawal"] = None
            if _STORE is not None:
                _STORE.save_user(target_user_id, target_data)
            try:
                await context.bot.send_message(
                    chat_id=target_user_id,
                    text=f"⚠️ Admin က ငွေထုတ်လုပ်ဆောင်မှုကို ပယ်ဖျက်လိုက်ပါသည်။ {released_amount:,} Ks ကို လက်ကျန်ငွေထဲ ပြန်ထည့်ပေးထားပါသည်။",
                )
            except TelegramError:
                pass
    suffix = f"\n{released_amount:,} Ks ကို User လက်ကျန်ငွေထဲ ပြန်ထည့်ပြီးပါပြီ။" if released_amount else ""
    await update.message.reply_text("Admin action cancelled." + suffix)
    context.user_data.clear()
    return ConversationHandler.END


# ====================================================================
# 📝 Command Handlers (No Changes in this section)
# ====================================================================
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    referrer_id = None
    if context.args and context.args[0].isdigit():
        potential_referrer_id = int(context.args[0])
        if potential_referrer_id != user.id:
            referrer_id = potential_referrer_id
    
    is_new = user.id not in context.bot_data.get('users', {})
    initialize_user_data(context, user.id, user.full_name, referrer_id)
    if update.message.chat.type == "private":
        context.bot_data["users"][user.id]["private_chat_started"] = True
    
    if update.message.chat.type == 'private':
        if is_new:
            await update.message.reply_text(f"🎉 Bot ကိုစတင်အသုံးပြုသည့်အတွက် Welcome Bonus {int(get_setting(context, 'WELCOME_BONUS'))} Ks လက်ဆောင်ရရှိပါသည်။")
        
        welcome_text = (
            "မင်္ဂလာပါ Xin Aiii မှ ကြိုဆိုပါတယ်! 🎉\n\n"
            "🎁 အကောင့်ဖွင့်ပြီးပါပြီ။\n"
            "ကစားနည်း၊ ငွေသွင်း/ငွေထုတ်နဲ့ မိတ်ဆက်ခအချက်အလက်တွေကို အောက်က Menu မှာ ကြည့်နိုင်ပါတယ်။"
        )
        await update.message.reply_text(text=welcome_text, reply_markup=get_main_reply_keyboard())
    elif update.effective_chat.type in ("group", "supergroup"):
        await update.message.reply_text("👋 Xin Ai အံစာတုန်း Bot is active! Admin မှ /startround ဖြင့် ပွဲစဉ်စတင်ရန် စောင့်ဆိုင်းပါ။")

async def start_round_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user, chat = update.effective_user, update.effective_chat
    if chat is None or chat.type not in ("group", "supergroup"):
        return
    if not await is_group_admin(context, chat.id, user.id):
        await delete_user_message(update.effective_message)
        return
    await delete_user_message(update.effective_message)
    started = await _start_new_round_logic(context, chat.id)
    if not started:
        await notify_player(context, user.id, "⚠️ ပွဲစဉ်တစ်ခု ဖွင့်ထားပြီးသား သို့မဟုတ် စနစ်မရနိုင်သေးပါ။")


async def closeround_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """An authorized group admin closes every currently open bot round."""
    user, chat = update.effective_user, update.effective_chat
    if chat is None or chat.type not in ("group", "supergroup"):
        return
    # Closing globally affects every linked game group, so only configured bot admins may do it.
    if not is_bot_admin(context, user.id):
        await delete_user_message(update.effective_message)
        return
    await delete_user_message(update.effective_message)
    closed_count, bet_count = await close_all_open_rounds(context.application)
    if closed_count:
        await notify_player(
            context, user.id,
            f"✅ Group အားလုံးရှိ ဖွင့်ထားသော Round {closed_count} ခုကို ပိတ်ပြီး ရလဒ်တွက်နေပါပြီ။\n"
            f"လက်ခံထားသော လောင်းကြေး: {bet_count:,} ခု",
        )
    else:
        await notify_player(context, user.id, "ℹ️ လက်ရှိဖွင့်ထားတဲ့ Round မရှိပါ။")

async def addbalance_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if not is_bot_admin(context, user.id): return
    if len(context.args) != 2:
        await update.message.reply_text("Usage: /addbalance <user_id> <amount>")
        return
    try:
        target_id, amount = int(context.args[0]), int(context.args[1])
        if amount <= 0: raise ValueError
        if target_id not in context.bot_data.get('users', {}):
            await update.message.reply_text(f"User {target_id} not found. They must start the bot first.")
            return
        context.bot_data['users'][target_id]['balance'] += amount
        if _STORE is not None: _STORE.save_user(target_id, context.bot_data['users'][target_id])
        new_balance = context.bot_data['users'][target_id]['balance']
        await update.message.reply_text(f"✅ Successfully added {amount} to {target_id}.\nNew Balance: {new_balance} Ks")
        await context.bot.send_message(chat_id=target_id, text=f"Admin မှ သင့်အကောင့်ထဲသို့ {amount} Ks ဖြည့်သွင်းပေးလိုက်ပါသည်။")
    except (ValueError, IndexError):
        await update.message.reply_text("Invalid user ID or amount.")
    except Exception as e:
        await update.message.reply_text(f"An error occurred: {e}")

async def removebalance_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if not is_bot_admin(context, user.id): return
    if len(context.args) != 2:
        await update.message.reply_text("Usage: /removebalance <user_id> <amount>")
        return
    try:
        target_id, amount = int(context.args[0]), int(context.args[1])
        if amount <= 0: raise ValueError
        if target_id not in context.bot_data.get('users', {}):
            await update.message.reply_text(f"User {target_id} not found.")
            return
        if context.bot_data['users'][target_id]['balance'] < amount:
            await update.message.reply_text(f"Cannot remove {amount}. User's balance is only {context.bot_data['users'][target_id]['balance']}.")
            return
        context.bot_data['users'][target_id]['balance'] -= amount
        if _STORE is not None: _STORE.save_user(target_id, context.bot_data['users'][target_id])
        new_balance = context.bot_data['users'][target_id]['balance']
        await update.message.reply_text(f"✅ Successfully removed {amount} from {target_id}.\nNew Balance: {new_balance} Ks")
        await context.bot.send_message(chat_id=target_id, text=f"Admin မှ သင့်အကောင့်ထဲမှ {amount} Ks ကို နုတ်ယူလိုက်ပါသည်။")
    except (ValueError, IndexError):
        await update.message.reply_text("Invalid user ID or amount.")

async def addadmin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user is None or not is_root_admin(user.id) or update.effective_chat.type != "private":
        return
    if len(context.args) != 1:
        await update.effective_message.reply_text("အသုံးပြုပုံ: /addadmin USER_ID")
        return
    try:
        target_id = int(context.args[0])
        if target_id <= 0:
            raise ValueError
    except ValueError:
        await update.effective_message.reply_text("မှန်ကန်သော Telegram User ID ထည့်ပါ။")
        return
    admins = get_admin_ids(context)
    if target_id in admins:
        await update.effective_message.reply_text("ဤသူသည် Admin ဖြစ်ပြီးသားပါ။")
        return
    admins.append(target_id)
    update_admin_ids(context.application, admins)
    await update.effective_message.reply_text(f"✅ Admin ထည့်ပြီးပါပြီ: {target_id}")


async def removeadmin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    if user is None or not is_root_admin(user.id) or update.effective_chat.type != "private":
        return
    if len(context.args) != 1:
        await update.effective_message.reply_text("အသုံးပြုပုံ: /removeadmin USER_ID")
        return
    try:
        target_id = int(context.args[0])
        if target_id <= 0:
            raise ValueError
    except ValueError:
        await update.effective_message.reply_text("မှန်ကန်သော Telegram User ID ထည့်ပါ။")
        return
    if target_id in ROOT_ADMIN_IDS:
        await update.effective_message.reply_text("Owner Admin ကို ဖယ်ရှား၍မရပါ။")
        return
    admins = get_admin_ids(context)
    if target_id not in admins:
        await update.effective_message.reply_text("Admin စာရင်းထဲ မရှိပါ။")
        return
    update_admin_ids(context.application, [admin_id for admin_id in admins if admin_id != target_id])
    await update.effective_message.reply_text(f"✅ Admin ခွင့်ပြုချက် ဖယ်ရှားပြီးပါပြီ: {target_id}")


async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.type in ("group", "supergroup"):
        await delete_user_message(update.effective_message)
        keyboard = [
            [InlineKeyboardButton("ကစားနည်း", callback_data="grp_how_to_play"), InlineKeyboardButton("လက်ကျန်ငွေ", callback_data="grp_balance")],
            [InlineKeyboardButton("ငွေသွင်းရန်", callback_data="grp_deposit"), InlineKeyboardButton("ငွေထုတ်ရန်", callback_data="grp_withdraw")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text("ကျေးဇူးပြု၍ အောက်ပါ Menu မှ ရွေးချယ်ပါ:", reply_markup=reply_markup)

# ====================================================================
# 💬 Message Handler
# ====================================================================
async def private_text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if context.user_data.pop("admin_skip_message_id", None) == update.effective_message.message_id:
        return
    text = update.message.text
    user = update.effective_user
    initialize_user_data(context, user.id, user.full_name)
    context.bot_data["users"][user.id]["private_chat_started"] = True

    if text == "ကစားနည်း💡":
        how_to_play_text = f"""🎲 *အံစာတုန်း ကစားနည်း နှင့် လျော်ကြေး* 🎲
➖➖➖➖➖➖➖➖➖➖
✅ Bot မှ အံစာတုန်း ၂ လုံးကို ခေါက်ပြီး ထွက်လာသော ပေါင်းလဒ်ဖြင့် အနိုင်အရှုံး ဆုံးဖြတ်ပါမည်။

✅ *အကြီး / အသေး လောင်းခြင်း — {float(get_setting(context, 'OVER_UNDER_MULTIPLIER')):g} ဆ*
- `အကြီး 1000` ➡️ ပေါင်းလဒ် ၈၊ ၉၊ ၁၀၊ ၁၁၊ ၁၂ ထွက်လျှင် နိုင်ပါသည်။
- `အသေး 1000` ➡️ ပေါင်းလဒ် ၂၊ ၃၊ ၄၊ ၅၊ ၆ ထွက်လျှင် နိုင်ပါသည်။
❗️ပေါင်းလဒ် ၇ သည် အကြီး/အသေး မဟုတ်ဘဲ သီးခြား အလယ်ဂဏန်း ဖြစ်ပါသည်။

✅ *ဘုံအများဆုံး (Common 7) — အလယ်ဂဏန်းကို သီးခြားလောင်းခြင်း*
- `7 1000` ➡️ ပေါင်းလဒ် ၇ တိတိကျကျ ထွက်လျှင် နိုင်ပါသည်။ ({get_setting(context, 'SIX_MULTIPLIER')} ဆ)

✅ *အခြားဂဏန်းအတိအကျ လောင်းခြင်း*
- `6 1000` ➡️ ပေါင်းလဒ် ၆ ထွက်လျှင် နိုင်ပါသည်။ ({get_setting(context, 'DEFAULT_NUM_MULTIPLIER')} ဆ)
- `12 1000` ➡️ ပေါင်းလဒ် ၁၂ ထွက်လျှင် နိုင်ပါသည်။ ({get_setting(context, 'DEFAULT_NUM_MULTIPLIER')} ဆ)
- `2 1000` ➡️ ပေါင်းလဒ် ၂ ထွက်လျှင် နိုင်ပါသည်။ ({get_setting(context, 'DEFAULT_NUM_MULTIPLIER')} ဆ)
(ကျန်ဂဏန်းများအားလုံးလည်း {get_setting(context, 'DEFAULT_NUM_MULTIPLIER')} ဆ ဖြစ်ပါသည်။)

🇲🇲 ⏰နေ့လည် 12 PM ကနေ ည 12 AM အတွင်း ကစားနိုင်ပါသည်။"""
        await update.message.reply_text(how_to_play_text, parse_mode=ParseMode.MARKDOWN)
        
    elif text == "စတင်ကစားရန်🚀":
        caption_text = "⛔️ ကစားအဖွဲ့သို့ ဝင်ရောက်ပြီး Admin မှ ပွဲစဉ်စတင်သည်နှင့် လောင်းကြေးတင်နိုင်ပါပြီ။"
        inline_keyboard = InlineKeyboardMarkup([[InlineKeyboardButton("ကစားအဖွဲ့သို့ Join ရန်", url=get_setting(context, 'GAME_GROUP_LINK'))]])
        await update.message.reply_text(caption_text, reply_markup=inline_keyboard)
        
    # ❗️❗️❗️ "ကိုယ်ပိုင်အချက်အလက်" ကို Feature အသစ်အတွက် ပြင်ဆင်ထားပါသည် ❗️❗️❗️
    elif text == "ကိုယ်ပိုင်အချက်အလက်":
        user_data = context.bot_data['users'][user.id]
        balance = user_data.get('balance', 0)
        referral_balance = user_data.get('referral_balance', 0)
        first_deposit_done = user_has_completed_first_deposit(
            user_data, int(get_setting(context, 'WELCOME_BONUS'))
        )
        first_deposit_status = "ပြီးပါပြီ ✅" if first_deposit_done else f"မပြီးသေးပါ (အနည်းဆုံး {int(get_setting(context, 'MINIMUM_FIRST_DEPOSIT')):,} Ks)"
        ensure_withdrawal_tracking(user_data)
        withdrawal_count = int(user_data.get("withdrawal_count", 0))
        total_deposited = int(user_data.get("total_successful_deposit", 0))
        current_wager = int(user_data.get("wager_since_last_withdrawal", 0))
        if withdrawal_count == 0:
            withdrawal_progress = (
                f"ပထမဆုံးထုတ်ရန် သွင်းငွေ: {total_deposited:,} / "
                f"{int(get_setting(context, 'FIRST_WITHDRAW_DEPOSIT_REQUIRED')):,} Ks"
            )
        else:
            withdrawal_progress = (
                f"နောက်တစ်ကြိမ်ထုတ်ရန် လက်ရှိဆော့ထားပြီး: {current_wager:,} Ks "
                f"({float(get_setting(context, 'WITHDRAW_WAGER_PERCENT')) * 100:g}% စည်းမျဉ်း)"
            )
        pending_status = "\n▪️ *ငွေထုတ်တောင်းဆိုမှု:* စစ်ဆေးဆဲ ⏳" if user_data.get("pending_withdrawal") else ""
        
        info_text = f"""👤 *ကိုယ်ပိုင်အချက်အလက်*
➖➖➖➖➖➖➖➖➖➖
▪️ *အကောင့် ID:* `{user.id}`
▪️ *အမည်:* {_escape_legacy_markdown(user.full_name)}
▪️ *ပင်မလက်ကျန်ငွေ:* `{balance}` Ks
▪️ *ပထမဆုံး ငွေသွင်း:* {first_deposit_status}
▪️ *ငွေထုတ်စည်းမျဉ်း:* {withdrawal_progress}{pending_status}
▪️ *မိတ်ဆက်ခလက်ကျန်:* `{int(referral_balance)}` Ks"""
        
        keyboard = []
        # မိတ်ဆက်ခ 5000 ပြည့်မှ ခလုတ်ပေါ်ရန် စစ်ဆေးခြင်း
        if referral_balance >= get_setting(context, 'MINIMUM_TRANSFER_AMOUNT'):
            keyboard.append([InlineKeyboardButton(f"💸 မိတ်ဆက်ခကို ပင်မလက်ကျန်ငွေသို့ပြောင်းရန်", callback_data="transfer_referral_balance")])
        
        reply_markup = InlineKeyboardMarkup(keyboard) if keyboard else None
        await update.message.reply_text(info_text, parse_mode=ParseMode.MARKDOWN, reply_markup=reply_markup)

    elif text == "မိတ်ဆက်ခယူပြီး ငွေရှာနည်း🤑":
        bot_username = context.bot.username
        referral_link = f"https://t.me/{bot_username}?start={user.id}"
        user_data = context.bot_data['users'][user.id]
        commission_rate = float(get_setting(context, 'COMMISSION_RATE')) * 100
        promo_threshold = int(get_setting(context, 'PROMO_BET_THRESHOLD'))
        promo_bonus = int(get_setting(context, 'PROMO_BONUS_AMOUNT'))
        transfer_minimum = int(get_setting(context, 'MINIMUM_TRANSFER_AMOUNT'))
        invite_message = (
            "🎲 မင်္ဂလာပါ သူငယ်ချင်းရေ!\n"
            "ဒီ Dice Game Bot မှာ အကောင့်ဖွင့်ပြီး ကစားနည်းနဲ့ အကောင့်အချက်အလက်တွေကို လေ့လာကြည့်ပါ။\n\n"
            f"🎁 မိတ်ဆက် Bonus: ဖိတ်ခေါ်ထားသူက စုစုပေါင်းလောင်းကြေး {promo_threshold:,} Ks ပြည့်ပါက {promo_bonus:,} Ks Bonus ရရှိနိုင်ပါတယ်။\n"
            f"💸 Referral Commission: အရည်အချင်းပြည့်မီတဲ့ လောင်းကြေးများအပေါ် {commission_rate:.0f}% ကို Referral Balance ထဲ စုဆောင်းပေးပါတယ်။\n"
            "စည်းကမ်းချက်များနှင့် သတ်မှတ်ချက်များအရသာ အကျုံးဝင်ပါတယ်။\n\n"
            "👇 ဒီလင့်ခ်ကနေ ဝင်ရောက်ကြည့်ပါ။"
        )
        share_url = "https://t.me/share/url?" + urllib.parse.urlencode({"url": referral_link, "text": invite_message})
        referral_text = f"""🔗 *သင်၏ ဖိတ်ခေါ်လင့်ခ်*
`{referral_link}`

🎁 *မိတ်ဆက် Bonus*
ဖိတ်ခေါ်ထားသူတစ်ဦးက စုစုပေါင်းလောင်းကြေး `{promo_threshold:,} Ks` ပြည့်ပါက `{promo_bonus:,} Ks` Bonus ရရှိနိုင်ပါတယ်။

💸 *Referral Commission*
အရည်အချင်းပြည့်မီတဲ့ လောင်းကြေးများအပေါ် `{commission_rate:.0f}%` ကို Referral Balance ထဲ စုဆောင်းပေးပါတယ်။

👥 *ဖိတ်ခေါ်ထားသူ:* `{user_data.get('referrals', 0)}` ယောက်
💰 *Referral Balance:* `{int(user_data.get('referral_balance', 0)):,} Ks`
🔓 *Main Balance သို့လွှဲရန်:* `{transfer_minimum:,} Ks` ပြည့်ရပါမယ်။

_စည်းကမ်းချက်များနှင့် သတ်မှတ်ချက်များအရသာ အကျုံးဝင်ပါတယ်။_"""
        inline_keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("📤 မျှဝေမည်", url=share_url)],
            [InlineKeyboardButton("👥 ဖိတ်ခေါ်ထားသူများကြည့်ရန်", callback_data="view_referrals")],
            [InlineKeyboardButton("🎁 Bonus အစီအစဉ်", callback_data="promo_info")],
        ])
        await update.message.reply_text(text=referral_text, reply_markup=inline_keyboard, parse_mode=ParseMode.MARKDOWN)

async def group_text_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.effective_message
    user = update.effective_user
    chat = update.effective_chat
    if message is None or user is None or chat is None or chat.type not in ("group", "supergroup"):
        return

    text = (message.text or "").strip()
    if not text:
        return
    initialize_user_data(context, user.id, user.full_name)
    is_admin = await is_group_admin(context, chat.id, user.id)
    chat_data = context.application.chat_data[chat.id]
    round_settings = chat_data.get("round_settings", {})
    round_over_under = float(round_settings.get("OVER_UNDER_MULTIPLIER", get_setting(context, "OVER_UNDER_MULTIPLIER")))
    round_seven = float(round_settings.get("SIX_MULTIPLIER", get_setting(context, "SIX_MULTIPLIER")))
    round_default = float(round_settings.get("DEFAULT_NUM_MULTIPLIER", get_setting(context, "DEFAULT_NUM_MULTIPLIER")))
    round_minimum_bet = int(round_settings.get("MINIMUM_BET", get_setting(context, "MINIMUM_BET")))
    if _round_status(chat_data) != "open" or not chat_data.get("betting_open", False):
        if not is_admin:
            await delete_user_message(message)
        return

    match_ou = re.fullmatch(r"(အကြီး|အသေး)\s+(\d+)", text)
    match_num = re.fullmatch(r"(\d{1,2})\s+(\d+)", text)
    if not match_ou and not match_num:
        if not is_admin:
            await delete_user_message(message)
        return

    # Delete the original bet text before any private processing, keeping the group clean.
    deleted = await delete_user_message(message)
    if not deleted:
        await notify_player(
            context, user.id,
            "❗️လောင်းကြေးကို လက်မခံနိုင်သေးပါ။ Bot ကို Group Admin ခန့်ပြီး Delete Messages Permission ပေးပါ။",
        )
        return

    if match_ou:
        bet_type, amount_text = match_ou.groups()
        amount = int(amount_text)
        bet_kind, selection = "size", bet_type
        bet_description = f"{bet_type} — {amount:,} Ks ({round_over_under:g} ဆ)"
    else:
        number_text, amount_text = match_num.groups()
        number_bet = int(number_text)
        amount = int(amount_text)
        if not 2 <= number_bet <= 12:
            await notify_player(context, user.id, "❗️နံပါတ်ကို 2 မှ 12 အတွင်း ရွေးပေးပါ။")
            return
        bet_kind, selection = "number", number_bet
        multiplier = round_seven if number_bet == 7 else round_default
        number_label = "ဘုံအများဆုံး (Common 7)" if number_bet == 7 else f"ဂဏန်း {number_bet}"
        bet_description = f"{number_label} — {amount:,} Ks ({multiplier:g} ဆ)"

    if amount < round_minimum_bet:
        await notify_player(context, user.id, f"❗️အနည်းဆုံး လောင်းကြေးမှာ {round_minimum_bet:,} Ks ဖြစ်ပါတယ်။")
        return
    if amount <= 0:
        await notify_player(context, user.id, "❗️လောင်းကြေးပမာဏ မမှန်ကန်ပါ။")
        return

    accepted = False
    error_text = None
    confirmation_text = None
    referral_message = None
    async with _round_lock(chat.id):
        # Re-check round status/deadline under the same lock used by the close job.
        chat_data = context.application.chat_data[chat.id]
        current_round_id = chat_data.get("round_id")
        deadline = float(chat_data.get("round_deadline") or 0)
        if _round_status(chat_data) != "open" or not chat_data.get("betting_open", False):
            error_text = "⏰ လောင်းကြေးပိတ်သွားပါပြီ။ နောက်ပွဲကို စောင့်ပေးပါ။"
        elif deadline and time.time() >= deadline:
            error_text = "⏰ လောင်းချိန်စေ့သွားပါပြီ။ နောက်ပွဲကို စောင့်ပေးပါ။"
        else:
            user_data = context.bot_data["users"][user.id]
            if not user_data.get("private_chat_started", False):
                error_text = "❗️အရင်ဆုံး Bot ကို Private Chat မှာဖွင့်ပြီး /start လုပ်ပေးပါ။ ပြီးမှ Group မှာ လောင်းကြေးတင်နိုင်ပါမယ်။"
            else:
                user_balance = int(user_data.get("balance", 0))
                if user_balance < amount:
                    error_text = f"❗️လက်ကျန်ငွေ မလုံလောက်ပါ။\n💰 လက်ကျန်ငွေ: {user_balance:,} Ks"
                else:
                    user_data["balance"] = user_balance - amount
                    ensure_withdrawal_tracking(user_data)
                    user_data["total_bet_cumulative"] = int(user_data.get("total_bet_cumulative", 0)) + amount
                    user_data["wager_since_last_withdrawal"] = int(user_data.get("wager_since_last_withdrawal", 0)) + amount
                    if _STORE is not None:
                        _STORE.save_user(user.id, user_data)
                    bet_number = len(chat_data.setdefault("current_bets", [])) + 1
                    bet_id = f"{chat.id}:{current_round_id}:{user.id}:{bet_number}"
                    accepted_bet = {
                        "bet_id": bet_id,
                        "user_id": user.id,
                        "full_name": user.full_name,
                        "bet_text": text,
                        "bet_display": bet_description,
                        "bet_kind": bet_kind,
                        "selection": selection,
                        "amount": amount,
                    }
                    chat_data["current_bets"].append(accepted_bet)
                    accepted_multiplier = (round_over_under if bet_kind == "size" else (round_seven if int(selection) == 7 else round_default))
                    _analytics_safe("record_analytics_bet", accepted_bet, chat.id, int(current_round_id), accepted_multiplier)
                    accepted = True
                    confirmation_text = (
                        "✅ လောင်းကြေးအောင်မြင်ပါပြီ။\n"
                        f"🎲 ပွဲစဉ်: {current_round_id}\n"
                        f"📌 {bet_description}\n"
                        f"💳 လက်ကျန်ငွေ: {user_data['balance']:,} Ks"
                    )

                    referrer_id = user_data.get("referrer")
                    if referrer_id:
                        referrer_data = context.bot_data.get("users", {}).get(referrer_id)
                        if referrer_data is not None:
                            commission = amount * get_setting(context, "COMMISSION_RATE")
                            referrer_data["referral_balance"] = float(referrer_data.get("referral_balance", 0)) + commission
                            if _STORE is not None:
                                _STORE.save_user(referrer_id, referrer_data)
                                _analytics_safe("record_analytics_cost", f"commission:{bet_id}", "referral_commission", commission, referrer_id, f"Commission from bet {bet_id}")
                            claimed_from = referrer_data.setdefault("promo_bonus_claimed_from", [])
                            if user.id not in claimed_from and user_data["total_bet_cumulative"] >= get_setting(context, "PROMO_BET_THRESHOLD"):
                                bonus_amount = int(get_setting(context, "PROMO_BONUS_AMOUNT"))
                                referrer_data["referral_balance"] += bonus_amount
                                claimed_from.append(user.id)
                                if _STORE is not None:
                                    _STORE.save_user(referrer_id, referrer_data)
                                    _analytics_safe("record_analytics_cost", f"referral-bonus:{referrer_id}:{user.id}", "referral_bonus", bonus_amount, referrer_id, f"Referral bonus from user {user.id}")
                                referral_message = (
                                    referrer_id,
                                    f"🎉 Bonus ရရှိပါပြီ! သင်ဖိတ်ခေါ်ထားသော {user.full_name} ၏ စုစုပေါင်းလောင်းကြေး "
                                    f"{int(get_setting(context, 'PROMO_BET_THRESHOLD')):,} Ks ပြည့်သွားသည့်အတွက် {int(get_setting(context, 'PROMO_BONUS_AMOUNT')):,} Ks ရရှိပါသည်။",
                                )

    if not accepted and error_text:
        await notify_player(context, user.id, error_text)
        # If the deadline passed before the timer callback ran, close the round now.
        if "အချိန်" in error_text or "လောင်းချိန်" in error_text:
            await _close_round_logic(context.application, chat.id, expected_round_id=current_round_id)
        return

    if accepted and confirmation_text:
        await notify_player(context, user.id, confirmation_text)
    if referral_message:
        referrer_id, message_text = referral_message
        try:
            await context.bot.send_message(chat_id=referrer_id, text=message_text)
        except Exception as exc:
            logger.info("Could not send referral bonus to %s: %s", referrer_id, exc)


# ====================================================================
# 🔘 Unified Inline Button Click Handler
# ====================================================================
async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user = query.from_user
    await query.answer()
    data = query.data

    if data.startswith(("approve_", "decline_")):
        if not is_bot_admin(context, user.id): return
        parts = data.split(':')
        action, target_user_id_str = parts[0], parts[1]
        target_user_id = int(target_user_id_str)

        if action == "approve_deposit":
            target_data = context.bot_data.get('users', {}).get(target_user_id)
            if target_data is None or len(parts) < 4:
                await query.message.reply_text("❗ Deposit request record မတွေ့ပါ။ User ကို ပြန်တောင်းဆိုခိုင်းပါ။")
                await query.edit_message_reply_markup(reply_markup=None)
                return
            ensure_withdrawal_tracking(target_data)
            request_id = parts[3]
            pending_deposit = target_data.get("pending_deposit")
            if not isinstance(pending_deposit, dict) or pending_deposit.get("request_id") != request_id or pending_deposit.get("status") != "pending":
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("ℹ️ ဤ Deposit request ကို အခြား Admin က ဆောင်ရွက်ပြီးဖြစ်ပါသည်။")
                return
            amount = int(pending_deposit.get("amount", parts[2]))
            if amount != int(parts[2]):
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("❗ Deposit amount မကိုက်ညီပါ။")
                return
            first_deposit = not user_has_completed_first_deposit(
                target_data, int(get_setting(context, 'WELCOME_BONUS'))
            )
            required_minimum = (
                max(int(get_setting(context, 'MINIMUM_DEPOSIT')), int(get_setting(context, 'MINIMUM_FIRST_DEPOSIT')))
                if first_deposit else int(get_setting(context, 'MINIMUM_DEPOSIT'))
            )
            if amount < required_minimum:
                await query.message.reply_text(
                    f"❗ ဤငွေသွင်းမှု၏ အနည်းဆုံးပမာဏ {required_minimum:,} Ks ဖြစ်ရပါမည်။\n"
                    "တောင်းဆိုမှုကို လက်မခံထားပါ။ User ကို ငွေသွင်းတောင်းဆိုမှုအသစ် ပြုလုပ်ခိုင်းပါ။"
                )
                await query.edit_message_reply_markup(reply_markup=None)
                return
            ensure_withdrawal_tracking(target_data)
            target_data['balance'] = int(target_data.get('balance', 0)) + amount
            target_data['total_successful_deposit'] = int(target_data.get('total_successful_deposit', 0)) + amount
            _analytics_safe("record_analytics_cashflow", f"deposit:{request_id}", "deposit_received", amount, target_user_id, "Admin-approved deposit")
            target_data["pending_deposit"] = None
            if first_deposit:
                target_data['has_successful_deposit'] = True
                target_data['first_deposit_amount'] = amount
                target_data['first_deposit_approved_at'] = time.time()
            if _STORE is not None:
                _STORE.save_user(target_user_id, target_data)
            old_caption = query.message.caption or ""
            first_note = "\nပထမဆုံး ငွေသွင်းပြီး" if first_deposit else ""
            await query.edit_message_caption(
                caption=old_caption + f"\n\n✅ Approved by {user.full_name}{first_note}",
                parse_mode=ParseMode.MARKDOWN,
                reply_markup=None,
            )
            try:
                await context.bot.send_message(
                    chat_id=target_user_id,
                    text=f"✅ သင်၏ ငွေဖြည့်တောင်းဆိုမှု ({amount:,} Ks) အောင်မြင်ပါသည်။"
                         + ("\nပထမဆုံး ငွေသွင်းခြင်း ပြီးမြောက်ပါပြီ။" if first_deposit else ""),
                )
            except TelegramError as exc:
                logger.info("Could not notify deposit user %s after approval: %s", target_user_id, exc)
        elif action == "approve_withdraw":
            if len(parts) < 3:
                await query.edit_message_text("❗ Withdrawal request ID မပါပါ။")
                return
            request_id = parts[2]
            target_data = context.bot_data.get("users", {}).get(target_user_id)
            if target_data is None:
                await query.edit_message_text("❗ User record မတွေ့ပါ။")
                return
            ensure_withdrawal_tracking(target_data)
            pending = target_data.get("pending_withdrawal")
            if not isinstance(pending, dict) or pending.get("request_id") != request_id or pending.get("status") != "pending":
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("ℹ️ ဤ Withdrawal request သည် ပြီးဆုံးပြီး သို့မဟုတ် သက်တမ်းမရှိတော့ပါ။")
                return
            amount = int(pending.get("amount", 0))
            pending["status"] = "awaiting_receipt"
            pending["approved_by"] = int(user.id)
            pending["approved_at"] = time.time()
            target_data["pending_withdrawal"] = pending
            if _STORE is not None:
                _STORE.save_user(target_user_id, target_data)
            original = query.message.text or ""
            await query.edit_message_text(
                original + f"\n\n✅ Approved by {user.full_name}\nပြေစာပုံကို ယခုပို့ပါ။\nRequest: {request_id}",
                reply_markup=None,
            )
            context.user_data["receipt_for_user_id"] = target_user_id
            context.user_data["receipt_for_amount"] = amount
            context.user_data["receipt_for_request_id"] = request_id
            return ADMIN_AWAIT_RECEIPT
        elif action == "decline_withdraw":
            if len(parts) < 3:
                await query.edit_message_reply_markup(reply_markup=None)
                return
            request_id = parts[2]
            target_data = context.bot_data.get("users", {}).get(target_user_id)
            released_amount = 0
            valid_pending = False
            if target_data is not None:
                ensure_withdrawal_tracking(target_data)
                pending = target_data.get("pending_withdrawal")
                if isinstance(pending, dict) and pending.get("request_id") == request_id and pending.get("status") == "pending":
                    released_amount = int(pending.get("amount", 0))
                    target_data["balance"] = int(target_data.get("balance", 0)) + released_amount
                    target_data["pending_withdrawal"] = None
                    valid_pending = True
                    if _STORE is not None:
                        _STORE.save_user(target_user_id, target_data)
            if not valid_pending:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("ℹ️ ဤ Withdrawal request ကို အခြား Admin က အရင်ဆုံး ဆောင်ရွက်ပြီးဖြစ်ပါသည်။")
                return
            original = query.message.text or ""
            await query.edit_message_text(
                original + f"\n\n❌ Declined by {user.full_name}\nလက်ကျန်ငွေပြန်အမ်း: {released_amount:,} Ks",
                reply_markup=None,
            )
            try:
                await context.bot.send_message(
                    chat_id=target_user_id,
                    text=(
                        "❌ သင်၏ ငွေထုတ်တောင်းဆိုမှုကို Admin မှ ငြင်းပယ်လိုက်ပါသည်။\n"
                        f"{released_amount:,} Ks ကို လက်ကျန်ငွေထဲ ပြန်ထည့်ပေးထားပါသည်။\n"
                        "လောင်းကြေးတိုးတက်မှုကို မဖျက်ထားပါ။"
                    ),
                )
            except TelegramError as exc:
                logger.info("Could not notify user %s about declined withdrawal: %s", target_user_id, exc)
        elif action == "decline_payment":
            if len(parts) >= 3:
                target_data = context.bot_data.get("users", {}).get(target_user_id)
                request_id = parts[2]
                pending_deposit = target_data.get("pending_deposit") if target_data else None
                if not isinstance(pending_deposit, dict) or pending_deposit.get("request_id") != request_id or pending_deposit.get("status") != "pending":
                    await query.edit_message_reply_markup(reply_markup=None)
                    await query.message.reply_text("ℹ️ ဤ Deposit request ကို အခြား Admin က ဆောင်ရွက်ပြီးဖြစ်ပါသည်။")
                    return
                target_data["pending_deposit"] = None
                if _STORE is not None:
                    _STORE.save_user(target_user_id, target_data)
            original_message = query.message.text or query.message.caption or ""
            new_text = original_message + f"\n\n❌ Declined by {user.full_name}"
            if query.message.photo:
                await query.edit_message_caption(caption=new_text, parse_mode=ParseMode.MARKDOWN, reply_markup=None)
            else:
                await query.edit_message_text(text=new_text, parse_mode=ParseMode.MARKDOWN, reply_markup=None)
            try:
                await context.bot.send_message(chat_id=target_user_id, text="❌ သင်၏ ငွေလွှဲတောင်းဆိုမှုကို Admin မှ ငြင်းပယ်လိုက်ပါသည်။")
            except TelegramError:
                pass
        return
        
    initialize_user_data(context, user.id, user.full_name)
    user_data = context.bot_data['users'][user.id]
    
    if data == "view_referrals":
        total_referrals = user_data.get('referrals', 0)
        text = f"သင်ဖိတ်ခေါ်ထားသော စုစုပေါင်းကစားသမား: *{total_referrals}* ယောက် ရှိပါသည်။" if total_referrals > 0 else "လက်ရှိမိတ်ဆွေဖိတ်ခေါ်ထားသော အဖွဲ့ဝင်များမရှိသေးပါ။ Invite Link ကိုအသုံးပြုပြီးကစားသမားများ ရှာဖွေပြီးကော်မရှင်နှင့် Bonus များ ရယူလိုက်ပါ! 💪🚀"
        await query.message.reply_text(text, parse_mode=ParseMode.MARKDOWN)
        
    elif data == "promo_info":
        promo_claimed_list = user_data.get('promo_bonus_claimed_from', [])
        promo_count = len(promo_claimed_list)
        promo_text = f"""💸 *မိတ်ဆက် Bonus အစီအစဉ်* 💸

သင်ဖိတ်ခေါ်ထားသော သူငယ်ချင်းတစ်ယောက်ချင်းစီက စုစုပေါင်းလောင်းကြေး `{get_setting(context, 'PROMO_BET_THRESHOLD')}` Ks ပြည့်တာနဲ့ သင်က Bonus *`{get_setting(context, 'PROMO_BONUS_AMOUNT')}`* Ks ကိုချက်ချင်းရရှိမှာဖြစ်ပါတယ်။

✅ *Bonus ရရှိပြီးသော အရေအတွက်:* {promo_count} ယောက် 

📌 *ဥပမာ:*
မိတ်ဆွေက ကစားသမား ၁၀ ယောက်ကို ဖိတ်ခေါ်ထားပြီး၊ ၁၀ ယောက်လုံးက စုစုပေါင်းလောင်းကြေး `{get_setting(context, 'PROMO_BET_THRESHOLD')}` Ks စီပြည့်သွားတာနဲ့ မိတ်ဆွေက စုစုပေါင်း Bonus *`{int(get_setting(context, 'PROMO_BONUS_AMOUNT')) * 10}`* Ks ကို ရရှိမှာဖြစ်ပါတယ်။

📍 *စည်းကမ်းချက်:*
✔️ သင်ဖိတ်ခေါ်ထားတဲ့ ကစားသမားတစ်ယောက်အတွက် Bonus ကို တစ်ကြိမ်သာ ရရှိမှာဖြစ်ပါတယ်။"""
        await query.message.reply_text(promo_text, parse_mode=ParseMode.MARKDOWN)

    # ❗️❗️❗️ မိတ်ဆက်ခလွှဲပြောင်းခြင်း Feature အသစ် Logic ❗️❗️❗️
    elif data == 'transfer_referral_balance':
        user_data = context.bot_data['users'][user.id]
        referral_balance = user_data.get('referral_balance', 0)

        if referral_balance >= get_setting(context, 'MINIMUM_TRANSFER_AMOUNT'):
            transfer_amount = int(referral_balance)
            
            # Transfer the balance
            user_data['balance'] += transfer_amount
            user_data['referral_balance'] = 0
            if _STORE is not None: _STORE.save_user(user.id, user_data)

            new_main_balance = user_data['balance']
            
            # 1. Send a new confirmation message
            success_text = (
                f"✅ *အောင်မြင်ပါသည်!*\n\n"
                f"မိတ်ဆက်ခ `{transfer_amount}` Ks ကို ပင်မလက်ကျန်ငွေသို့ ပြောင်းပြီးပါပြီ။\n\n"
                f"💰 သင်၏ ပင်မလက်ကျန်ငွေသစ်မှာ: *`{new_main_balance}`* Ks ဖြစ်ပါသည်။"
            )
            await query.message.reply_text(success_text, parse_mode=ParseMode.MARKDOWN)

            # 2. Update the original message to show new balances and remove the button
            updated_info_text = f"""👤 *ကိုယ်ပိုင်အချက်အလက်*
➖➖➖➖➖➖➖➖➖➖
▪️ *အကောင့် ID:* `{user.id}`
▪️ *အမည်:* {_escape_legacy_markdown(user.full_name)}
▪️ *ပင်မလက်ကျန်ငွေ:* `{new_main_balance}` Ks
▪️ *မိတ်ဆက်ခလက်ကျန်:* `0` Ks"""
            await query.edit_message_text(updated_info_text, parse_mode=ParseMode.MARKDOWN, reply_markup=None)
        else:
            await query.answer(f"❗️ပြောင်းရန်ငွေ {int(get_setting(context, 'MINIMUM_TRANSFER_AMOUNT')):,} Ks မပြည့်သေးပါ။", show_alert=True)
            # Remove the button if balance is no longer sufficient
            await query.edit_message_reply_markup(reply_markup=None)
            
    elif data == 'grp_balance':
        await query.answer(f"သင်၏ လက်ကျန်ငွေမှာ {user_data.get('balance', 0)} Ks ဖြစ်ပါသည်။", show_alert=True)
    elif data == 'grp_how_to_play':
        await query.answer("ကစားနည်းအသေးစိတ်ကို Bot နဲ့ Private Chat တွင် 'ကစားနည်း💡' ကိုနှိပ်၍ ကြည့်ရှုနိုင်ပါသည်။", show_alert=True)
    elif data == 'grp_deposit':
        bot_username = context.bot.username
        await query.answer(f"ငွေသွင်းရန် Bot (@{bot_username}) သို့ သွား၍ 'ငွေသွင်း/ငွေထုတ်🏦' ခလုတ်ကို နှိပ်ပေးပါ။", show_alert=True)
    elif data == 'grp_withdraw':
        bot_username = context.bot.username
        await query.answer(f"ငွေထုတ်ရန် Bot (@{bot_username}) သို့ သွား၍ 'ငွေသွင်း/ငွေထုတ်🏦' ခလုတ်ကို နှိပ်ပေးပါ။", show_alert=True)



# ====================================================================
# 📊 Financial analytics helpers (Myanmar local calendar)
# ====================================================================
ANALYTICS_TZ = timezone(timedelta(hours=6, minutes=30), name="Asia/Yangon")


def analytics_period_bounds(period: str) -> tuple[float, float, str]:
    now = datetime.now(ANALYTICS_TZ)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "day":
        start = today
        label = f"ယနေ့ ({today:%d-%m-%Y})"
    elif period == "week":
        start = today - timedelta(days=today.weekday())
        label = f"ဒီအပတ် ({start:%d-%m-%Y} မှ {now:%d-%m-%Y} အထိ)"
    else:
        start = today.replace(day=1)
        label = f"ဒီလ ({start:%d-%m-%Y} မှ {now:%d-%m-%Y} အထိ)"
    return start.timestamp(), now.timestamp() + 0.001, label


def _ks(value) -> str:
    return f"{int(round(float(value or 0))):,} Ks"


def build_financial_report(context: ContextTypes.DEFAULT_TYPE, period: str) -> str:
    if _STORE is None:
        return "📊 Financial Analytics DB မဖွင့်နိုင်သေးပါ။"
    start_ts, end_ts, label = analytics_period_bounds(period)
    report = _STORE.analytics_report(start_ts, end_ts)
    costs = report["costs"]
    welcome, welcome_count = costs.get("welcome_bonus", (0, 0))
    referral_bonus, referral_bonus_count = costs.get("referral_bonus", (0, 0))
    referral_commission, referral_commission_count = costs.get("referral_commission", (0, 0))
    other_cost = sum(v[0] for k, v in costs.items() if k not in {"welcome_bonus", "referral_bonus", "referral_commission"})
    reward_cost = welcome + referral_bonus + referral_commission + other_cost
    ggr = report["stake"] - report["payout"]
    net = ggr - reward_cost

    status = "အမြတ်" if net > 0 else ("အရှုံး" if net < 0 else "အရှုံး/အမြတ် မရှိ")
    lines = [
        f"📊 <b>{label} — BOT FINANCIAL REPORT</b>",
        "━━━━━━━━━━━━━━━━━━",
        f"🎲 ပြီးဆုံးပွဲစဉ်: {report['rounds']:,} ပွဲ | လောင်းကြေး: {report['settled_count']:,} ကြိမ်",
        f"✅ အနိုင်ရလောင်းကြေး: {report['wins']:,} | ❌ ရှုံးလောင်းကြေး: {report['losses']:,}",
        "",
        "💰 လောင်းကစားစာရင်း (ပြီးဆုံးပြီးသောပွဲများ)",
        f"• လောင်းကြေးစုစုပေါင်း: {_ks(report['stake'])}",
        f"• ကစားသမားထံ ပြန်ပေးငွေ: {_ks(report['payout'])}",
        f"• Bot Gross Result (လောင်းကြေး − ပေးချေငွေ): {_ks(ggr)}",
        f"• သင်္ချာမျှော်မှန်း Gross Result: {_ks(report['expected_gross'])}",
        "  (အံစာတုံး ၂ လုံး၏ 36 မျိုးသော ရလဒ်ဖြန့်ဝေမှုအပေါ်တွက်ထားခြင်း၊ အမှန်တကယ်ရလဒ်နှင့် ကွာနိုင်သည်)",
        "  Rule: အသေး 2–6 | ဘုံအများဆုံး (Common 7) သီးခြား | အကြီး 8–12 ဖြစ်သည်။ 7 ကို Big/Small ထဲ မထည့်ပါ။",
        "",
        "🎁 Bonus / Referral ကုန်ကျစရိတ်",
        f"• Welcome Bonus: {_ks(welcome)} ({welcome_count:,} ကြိမ်)",
        f"• Referral Bonus: {_ks(referral_bonus)} ({referral_bonus_count:,} ကြိမ်)",
        f"• Referral Commission: {_ks(referral_commission)} ({referral_commission_count:,} ကြိမ်)",
    ]
    if other_cost:
        lines.append(f"• အခြားမှတ်တမ်းတင်ထားသော ကုန်ကျစရိတ်: {_ks(other_cost)}")
        for kind, description, total, count in report.get("cost_details", []):
            if kind == "other_expense":
                lines.append(f"  - {html.escape(str(description or 'Other expense'))}: {_ks(total)} ({int(count):,} ကြိမ်)")
    lines.extend([
        f"• Tracked Bonus + Other Expenses: {_ks(reward_cost)}",
        f"\n📈 Bot Net Result: {status} {_ks(abs(net))}",
        f"(Gross Result {_ks(ggr)} − Tracked Costs {_ks(reward_cost)})",
        "",
        "🔢 ဂဏန်း/အမျိုးအစားအလိုက် (လောင်းကြေး | ပေးချေငွေ | Bot Result)",
    ])
    if report["by_selection"]:
        for row in report["by_selection"]:
            kind, selection, count, stake, payout, wins, losses = row
            if kind == "size":
                title = str(selection)
            elif str(selection) == "7":
                title = "ဘုံအများဆုံး (Common 7)"
            else:
                title = f"ဂဏန်း {selection}"
            contribution = int(stake or 0) - int(payout or 0)
            lines.append(
                f"• {title}: {_ks(stake)} | {_ks(payout)} | {_ks(contribution)} "
                f"(လောင်း {int(count):,} ကြိမ်၊ နိုင် {int(wins or 0):,}/ရှုံး {int(losses or 0):,})"
            )
        numeric_rows = [r for r in report["by_selection"] if str(r[0]) == "number"]
        if numeric_rows:
            top = max(numeric_rows, key=lambda r: int(r[3] or 0))
            lines.append(f"⭐ အများဆုံးလောင်းထားသော ဂဏန်း: {top[1]} ({_ks(top[3])})")
    else:
        lines.append("• ဒီကာလအတွင်း ပြီးဆုံးပြီး လောင်းကြေးမှတ်တမ်း မရှိသေးပါ။")

    if report.get("pending_by_selection"):
        lines.append("• Pending အလောင်းအလိုက် Exposure:")
        for kind, selection, count, stake, possible_payout in report["pending_by_selection"]:
            title = str(selection) if kind == "size" else ("ဘုံအများဆုံး (Common 7)" if str(selection) == "7" else f"ဂဏန်း {selection}")
            lines.append(f"  - {title}: လောင်း {_ks(stake)} → အနိုင်ဖြစ်လျှင် {_ks(possible_payout)} ({int(count):,} ကြိမ်)")

    users = context.bot_data.get("users", {}) if context is not None else {}
    total_main_balance = sum(float(item.get("balance", 0) or 0) for item in users.values() if isinstance(item, dict))
    total_referral_balance = sum(float(item.get("referral_balance", 0) or 0) for item in users.values() if isinstance(item, dict))
    deposit_sum, deposit_count = report["cashflows"].get("deposit_received", (0, 0))
    withdrawal_sum, withdrawal_count = report["cashflows"].get("withdrawal_paid", (0, 0))
    lines.extend([
        "",
        "⏳ မပြီးသေးသော လောင်းကြေး",
        f"• Pending: {report['pending_count']:,} ကြိမ် | လောင်းငွေ {_ks(report['pending_stake'])}",
        f"• Pending အားလုံး အနိုင်ဖြစ်ပါက အများဆုံးပြန်ပေးနိုင်သည့် စုစုပေါင်းအပေါ်ကန့်သတ်ချက်: {_ks(report['pending_possible_payout'])}",
        f"• ပယ်ဖျက်/ပြန်အမ်း: {report['refunded_count']:,} ကြိမ် | {_ks(report['refunded_stake'])}",
        "",
        "🏦 ငွေဝင်/ငွေထွက် (Profit ထဲ မထည့်ထားပါ)",
        f"• အတည်ပြု ငွေသွင်း: {_ks(deposit_sum)} ({deposit_count:,} ကြိမ်)",
        f"• ပြေစာပို့ပြီး ငွေထုတ်: {_ks(withdrawal_sum)} ({withdrawal_count:,} ကြိမ်)",
        f"• User Main Balance စုစုပေါင်း: {_ks(total_main_balance)}",
        f"• Referral Balance စုစုပေါင်း: {_ks(total_referral_balance)}",
        "",
        f"📚 Analytics စုစုပေါင်း Bet Records: {report['total_records']:,}",
        "မှတ်ချက်: ဒီ Feature တပ်ဆင်ပြီးနောက် မှတ်တမ်းအသစ်များကိုသာ တိကျစွာတွက်နိုင်ပါသည်။",
        "Deposit/Withdrawal သည် ကစားသမားငွေလက်ကျန်ရွေ့လျားမှုဖြစ်၍ Profit မဟုတ်ပါ။ Payment fee, hosting နှင့် ပြင်ပကုန်ကျစရိတ်များ မမှတ်တမ်းတင်ထားပါက Net Result ထဲ မပါဝင်ပါ။",
    ])
    return "\n".join(lines)


# ====================================================================
# 🛠 Admin Panel: live configuration, parallel broadcast and DB import
# ====================================================================
async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    chat = update.effective_chat
    if user is None or not is_bot_admin(context, user.id):
        if update.effective_message:
            await update.effective_message.reply_text("⛔ Admin only.")
        return
    if chat is None or chat.type != "private":
        await update.effective_message.reply_text("/admin ကို Bot Private Chat မှာ အသုံးပြုပါ။")
        return
    context.user_data.pop("admin_waiting_for", None)
    await update.effective_message.reply_text(
        _admin_home_text(context), reply_markup=_admin_home_markup(), parse_mode=ParseMode.MARKDOWN
    )


async def admin_panel_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    user = query.from_user
    if not is_bot_admin(context, user.id):
        await query.answer("Admin only.", show_alert=True)
        return
    if query.message is None or query.message.chat.type != "private":
        await query.answer("Admin panel ကို Private Chat မှာ သုံးပါ။", show_alert=True)
        return

    data = query.data or ""
    await query.answer()
    if data == "admin:backup_now":
        request_auto_backup(context.application, f"manual backup requested by admin {user.id}", force=True)
        await query.edit_message_text(
            "📦 *Backup ပို့ရန် စီစဉ်ပြီးပါပြီ။*\n"
            f"Backup ရောက်မည့် Private ID: `{BACKUP_CHAT_ID}`\n"
            "Telegram က ဒီအကောင့်ကို အရင် /start လုပ်ထားဖို့ လိုပါတယ်။",
            parse_mode=ParseMode.MARKDOWN,
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")]]),
        )
        return
    if data == "admin:close":
        context.user_data.pop("admin_waiting_for", None)
        await query.edit_message_text("Admin Panel ပိတ်လိုက်ပါပြီ။")
        return
    if data == "admin:home":
        context.user_data.pop("admin_waiting_for", None)
        await query.edit_message_text(_admin_home_text(context), reply_markup=_admin_home_markup(), parse_mode=ParseMode.MARKDOWN)
        return
    if data == "admin:admins":
        if not is_root_admin(user.id):
            await query.edit_message_text(
                "Admin အသစ်ထည့်/ဖယ်ရှားခွင့်သည် Owner Admin များအတွက်သာ ဖြစ်ပါသည်။",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")]]),
            )
            return
        context.user_data.pop("admin_waiting_for", None)
        admin_ids = get_admin_ids(context)
        owners = [str(admin_id) for admin_id in ROOT_ADMIN_IDS]
        added = [str(admin_id) for admin_id in admin_ids if admin_id not in ROOT_ADMIN_IDS]
        lines = ["👮 ADMIN MANAGEMENT", "━━━━━━━━━━━━━━━━━━"]
        lines.append("🛡 Owner Admin: " + (", ".join(owners) if owners else "မရှိပါ"))
        lines.append("👤 Added Admin: " + (", ".join(added) if added else "မရှိသေးပါ"))
        lines.append(f"စုစုပေါင်း Admin: {len(admin_ids)} ယောက်")
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("➕ Add Admin", callback_data="admin:add_admin")],
            [InlineKeyboardButton("➖ Remove Admin", callback_data="admin:remove_admin")],
            [InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")],
        ])
        await query.edit_message_text("\n".join(lines), reply_markup=markup)
        return
    if data == "admin:add_admin":
        if not is_root_admin(user.id):
            await query.edit_message_text(
                "Owner Admin များသာ Admin အသစ်ထည့်နိုင်ပါသည်။",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")]]),
            )
            return
        context.user_data["admin_waiting_for"] = "add_admin"
        await query.edit_message_text(
            "➕ Admin အသစ်၏ Telegram User ID ကို ပို့ပါ။\n\n"
            "ဥပမာ: 123456789\n"
            "Owner Admin နှစ်ဦးကို ဖယ်ရှား၍မရပါ။",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✖️ Cancel", callback_data="admin:cancel")]]),
        )
        return
    if data == "admin:remove_admin":
        if not is_root_admin(user.id):
            await query.edit_message_text(
                "Owner Admin များသာ Admin ဖယ်ရှားနိုင်ပါသည်။",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")]]),
            )
            return
        context.user_data["admin_waiting_for"] = "remove_admin"
        await query.edit_message_text(
            "➖ ဖယ်ရှားမည့် Added Admin ၏ Telegram User ID ကို ပို့ပါ။\n\n"
            "Owner Admin များကို ဖယ်ရှား၍မရပါ။",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✖️ Cancel", callback_data="admin:cancel")]]),
        )
        return
    if data == "admin:rounds:close":
        await query.edit_message_text(
            "🛑 Group အားလုံးမှာ လက်ရှိဖွင့်ထားတဲ့ Round တွေကို ပိတ်ပြီး ရလဒ်တွက်မလား?\n\n"
            "လောင်းကြေးလက်ခံမှုကို ရပ်ပြီး Round တစ်ခုချင်းစီကို တစ်ကြိမ်သာ settle လုပ်ပါမယ်။",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("✅ Confirm Close All", callback_data="admin:rounds:confirm")],
                [InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")],
            ]),
        )
        return
    if data == "admin:rounds:confirm":
        closed_count, bet_count = await close_all_open_rounds(context.application)
        await query.edit_message_text(
            "✅ Global Round Close ပြီးပါပြီ။\n"
            f"ပိတ်ခဲ့သော Round: {closed_count} ခု\n"
            f"လက်ခံထားသော လောင်းကြေး: {bet_count:,} ခု\n\n"
            "Round အသစ်များကို သတ်မှတ်ထားသော Delay အတိုင်း အလိုအလျောက် ပြန်ဖွင့်ပါမယ်။",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")]]),
        )
        return
    if data.startswith("admin:set:"):
        key = data.split(":", 2)[2]
        if key not in SETTING_META:
            await query.edit_message_text("Unknown setting.", reply_markup=_admin_home_markup())
            return
        context.user_data["admin_waiting_for"] = "setting:" + key
        label = SETTING_META[key][3]
        current = _setting_display(key, get_setting(context, key))
        await query.edit_message_text(
            f"✏️ {label}\nလက်ရှိတန်ဖိုး: {current}\n\nတန်ဖိုးအသစ်ကို message အနေနဲ့ ပို့ပါ။",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✖️ Cancel", callback_data="admin:cancel")]]),
        )
        return
    if data == "admin:cancel":
        context.user_data.pop("admin_waiting_for", None)
        await query.edit_message_text(_admin_home_text(context), reply_markup=_admin_home_markup(), parse_mode=ParseMode.MARKDOWN)
        return
    if data in {"admin:odds", "admin:money", "admin:payments", "admin:referrals", "admin:round", "admin:group"}:
        section = data.split(":", 1)[1]
        title = {
            "odds": "🎲 လောင်းကြေးအဆ Settings",
            "money": "💰 Bonus နှင့် Minimum Settings",
            "payments": "🏦 KPay / Wave Settings",
            "referrals": "🧑‍🤝‍🧑 Referral Settings",
            "round": "⏱ Round Settings",
            "group": "🔗 Group Link Settings",
        }[section]
        lines = [title, "━━━━━━━━━━━━━━━━━━"]
        for key in SETTING_SECTIONS[section]:
            lines.append(f"{SETTING_META[key][3]}: {_setting_display(key, get_setting(context, key))}")
        if section == "round":
            lines.extend([
                "",
                "ℹ️ လောင်းချိန်ပြောင်းလဲလျှင် ဖွင့်ထားသော Round များ၏ ဖွင့်ချိန်မှစ၍ deadline ကို ပြန်တွက်ပါမည်။",
                "ℹ️ ကြားချိန်ပြောင်းလဲလျှင် စောင့်နေသော Round များ၏ နောက်ပွဲစချိန်ကို ချက်ချင်းပြန်စီစဉ်ပါမည်။",
                "တန်ဖိုးအားလုံးကို စက္ကန့်ဖြင့် ထည့်ပါ။ ဥပမာ 60 = ၁ မိနစ်။",
            ])
        await query.edit_message_text("\n".join(lines), reply_markup=_admin_section_markup(section))
        return
    if data == "admin:expense":
        context.user_data["admin_waiting_for"] = "expense"
        await query.edit_message_text(
            "🧾 အခြားလုပ်ငန်းကုန်ကျစရိတ် မှတ်တမ်းတင်ရန် ပမာဏနှင့် အကြောင်းအရာကို ပို့ပါ။\n"
            "Format: AMOUNT အကြောင်းအရာ\n"
            "ဥပမာ: 3000 Payment fee\n"
            "မှတ်တမ်းတင်ပြီးနောက် တစ်ရက်/တစ်ပတ်/တစ်လ Net Result မှ နုတ်တွက်ပါမည်။",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✖️ Cancel", callback_data="admin:cancel")]]),
        )
        return
    if data == "admin:broadcast":
        context.user_data["admin_waiting_for"] = "broadcast"
        await query.edit_message_text(
            "📣 Broadcast Message ကို ပို့ပါ။ Text, Photo, Video, Document စတာတွေ ပို့နိုင်ပါတယ်။\n"
            "Bot ကို Private မှာ /start လုပ်ထားတဲ့ User တွေဆီပဲ Parallel ပို့ပါမယ်။",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✖️ Cancel", callback_data="admin:cancel")]]),
        )
        return
    if data == "admin:import":
        context.user_data["admin_waiting_for"] = "import_db_zip"
        await query.edit_message_text(
            "🗄️ .db.zip ဖိုင်ကို ဒီနေရာမှာ Upload လုပ်ပါ။\n"
            "ZIP ထဲမှာ SQLite .db / .sqlite ဖိုင်တစ်ခု ပါရပါမယ်။\n"
            "ရှိပြီးသား User ID နဲ့ Data ကို overwrite မလုပ်ဘဲ မရှိသေးတဲ့ User တွေကိုသာ Merge လုပ်ပါမယ်။",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✖️ Cancel", callback_data="admin:cancel")]]),
        )
        return
    if data == "admin:balance":
        context.user_data["admin_waiting_for"] = "balance"
        await query.edit_message_text(
            "👤 User Balance / Withdrawal Progress စီမံရန် format:\n"
            "add USER_ID AMOUNT\n"
            "remove USER_ID AMOUNT\n"
            "reset_first USER_ID  (ပထမဆုံးငွေသွင်း status ပြန်သတ်မှတ်ရန်)\n"
            "set_deposit_total USER_ID AMOUNT  (အတည်ပြုပြီးသွင်းငွေစုစုပေါင်း)\n"
            "set_withdrawals USER_ID COUNT  (အရင်ထုတ်ဖူးသည့် အကြိမ်ရေ)\n"
            "set_wager USER_ID AMOUNT  (နောက်ဆုံးထုတ်ပြီးနောက် ဆော့ထားငွေ)\n\n"
            "ဥပမာ: set_deposit_total 123456789 5000",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("✖️ Cancel", callback_data="admin:cancel")]]),
        )
        return
    if data == "admin:stats":
        users = context.bot_data.get("users", {})
        total_balance = sum(int(item.get("balance", 0) or 0) for item in users.values())
        started = sum(1 for item in users.values() if item.get("private_chat_started"))
        db_users, db_settings, archived = _STORE.counts() if _STORE else (0, 0, 0)
        text = (
            "<b>📊 BOT STATISTICS / FINANCIAL REPORT</b>\n━━━━━━━━━━━━━━━━━━\n"
            f"Bot User Records: {len(users):,}\n"
            f"Private /start Users: {started:,}\n"
            f"Combined Main Balance: {total_balance:,} Ks\n"
            f"SQLite User Records: {db_users:,}\n"
            f"Saved Settings: {db_settings:,}\n"
            f"Imported Archive Rows: {archived:,}\n\n"
            "အောက်ပါကာလအလိုက် အမြတ်/အရှုံး အသေးစိတ်ကို ကြည့်နိုင်ပါသည်။"
        )
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("📅 တစ်ရက်စာ", callback_data="admin:report:day")],
            [InlineKeyboardButton("🗓 တစ်ပတ်စာ", callback_data="admin:report:week")],
            [InlineKeyboardButton("📆 တစ်လစာ", callback_data="admin:report:month")],
            [InlineKeyboardButton("🔙 Admin Home", callback_data="admin:home")],
        ])
        await query.edit_message_text(text, reply_markup=markup, parse_mode=ParseMode.HTML)
        return
    if data in {"admin:report:day", "admin:report:week", "admin:report:month"}:
        period = data.rsplit(":", 1)[1]
        report_text = build_financial_report(context, period)
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("📅 တစ်ရက်စာ", callback_data="admin:report:day"), InlineKeyboardButton("🗓 တစ်ပတ်စာ", callback_data="admin:report:week")],
            [InlineKeyboardButton("📆 တစ်လစာ", callback_data="admin:report:month")],
            [InlineKeyboardButton("🔙 Statistics", callback_data="admin:stats"), InlineKeyboardButton("🏠 Admin Home", callback_data="admin:home")],
        ])
        # Telegram allows 4096 chars; current report is kept comfortably below that.
        await query.edit_message_text(report_text[:4000], reply_markup=markup, parse_mode=ParseMode.HTML)
        return


async def _broadcast_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> tuple[int, int, int]:
    """Copy one admin message to private users with a bounded parallel worker pool."""
    global _BROADCAST_LOCK
    async with _BROADCAST_LOCK:
        users = context.bot_data.get("users", {})
        recipients = [int(uid) for uid, data in users.items() if data.get("private_chat_started")]
        if not recipients:
            return 0, 0, 0

        queue: asyncio.Queue = asyncio.Queue()
        for target_id in recipients:
            queue.put_nowait(target_id)
        worker_count = min(20, len(recipients))
        success = 0
        failed = 0
        blocked = 0
        source_chat_id = update.effective_chat.id
        source_message_id = update.effective_message.message_id
        send_rate_lock = asyncio.Lock()
        next_send_at = 0.0

        async def pace_global_send():
            nonlocal next_send_at
            async with send_rate_lock:
                wait = max(0.0, next_send_at - time.monotonic())
                if wait:
                    await asyncio.sleep(wait)
                next_send_at = time.monotonic() + 0.04  # max ~25 starts/second

        async def worker():
            nonlocal success, failed, blocked
            while True:
                try:
                    target_id = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                try:
                    delivered = False
                    for attempt in range(4):
                        try:
                            await pace_global_send()
                            await context.bot.copy_message(
                                chat_id=target_id,
                                from_chat_id=source_chat_id,
                                message_id=source_message_id,
                            )
                            success += 1
                            delivered = True
                            break
                        except RetryAfter as exc:
                            if attempt == 3:
                                failed += 1
                                break
                            retry_after = exc.retry_after
                            delay = retry_after.total_seconds() if hasattr(retry_after, "total_seconds") else float(retry_after)
                            await asyncio.sleep(max(1.0, delay) + 0.2)
                        except Forbidden:
                            blocked += 1
                            data = users.get(target_id) or users.get(str(target_id))
                            if data is not None:
                                data["private_chat_started"] = False
                                if _STORE is not None:
                                    _STORE.save_user(target_id, data)
                            break
                        except BadRequest as exc:
                            logger.info("Broadcast skipped for %s: %s", target_id, exc)
                            failed += 1
                            break
                        except TelegramError as exc:
                            logger.warning("Broadcast error for %s: %s", target_id, exc)
                            if attempt == 3:
                                failed += 1
                                break
                            await asyncio.sleep(1.0 + attempt)
                        except Exception:
                            logger.exception("Unexpected broadcast error for %s", target_id)
                            failed += 1
                            break
                finally:
                    queue.task_done()

        workers = [asyncio.create_task(worker()) for _ in range(worker_count)]
        await queue.join()
        await asyncio.gather(*workers)
        return success, failed, blocked


async def admin_private_input_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    message = update.effective_message
    if user is None or not is_bot_admin(context, user.id) or message is None:
        return
    action = context.user_data.get("admin_waiting_for")
    if not action:
        return

    # Prevent the normal menu handler from interpreting an admin form submission.
    context.user_data["admin_skip_message_id"] = message.message_id

    if action in {"add_admin", "remove_admin"}:
        if not is_root_admin(user.id):
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text("❌ Owner Admin များသာ Admin စီမံနိုင်ပါသည်။")
            return
        raw_id = (message.text or "").strip()
        try:
            target_admin_id = int(raw_id)
            if target_admin_id <= 0:
                raise ValueError
        except (TypeError, ValueError):
            await message.reply_text("❗ မှန်ကန်သော Telegram User ID ဂဏန်းကို ပို့ပါ။")
            return

        admin_ids = get_admin_ids(context)
        if action == "add_admin":
            if target_admin_id in admin_ids:
                context.user_data.pop("admin_waiting_for", None)
                await message.reply_text(f"ℹ️ {target_admin_id} သည် Admin ဖြစ်ပြီးသားပါ။")
                return
            admin_ids.append(target_admin_id)
            update_admin_ids(context.application, admin_ids)
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text(
                f"✅ Admin အသစ် ထည့်ပြီးပါပြီ။\nID: {target_admin_id}\n"
                "ယခုမှစ၍ /admin နှင့် Admin လုပ်ဆောင်ချက်များ အသုံးပြုနိုင်ပါပြီ။"
            )
        else:
            if target_admin_id in ROOT_ADMIN_IDS:
                await message.reply_text("❌ Owner Admin ကို ဖယ်ရှား၍မရပါ။")
                return
            if target_admin_id not in admin_ids:
                context.user_data.pop("admin_waiting_for", None)
                await message.reply_text("ℹ️ ထို ID သည် Added Admin စာရင်းထဲ မရှိပါ။")
                return
            admin_ids = [admin_id for admin_id in admin_ids if admin_id != target_admin_id]
            update_admin_ids(context.application, admin_ids)
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text(f"✅ Admin ခွင့်ပြုချက် ဖယ်ရှားပြီးပါပြီ။\nID: {target_admin_id}")
        return

    if action == "expense":
        raw = (message.text or "").strip()
        parts = raw.split(maxsplit=1)
        try:
            if len(parts) != 2:
                raise ValueError("Format: AMOUNT အကြောင်းအရာ ဥပမာ: 3000 Payment fee")
            amount = int(parts[0].replace(",", ""))
            description = parts[1].strip()
            if amount <= 0 or not description:
                raise ValueError("ပမာဏနှင့် ကုန်ကျစရိတ်အကြောင်းအရာ မှန်ကန်စွာထည့်ပါ။")
            if _STORE is None:
                raise ValueError("Analytics DB မရရှိသေးပါ။")
            _STORE.record_analytics_cost(f"manual-expense:{uuid.uuid4().hex}", "other_expense", amount, user.id, description)
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text(
                f"✅ ကုန်ကျစရိတ် မှတ်တမ်းတင်ပြီးပါပြီ။\nပမာဏ: {_ks(amount)}\nအကြောင်းအရာ: {html.escape(description)}\n"
                "ဒီနေ့/ဒီအပတ်/ဒီလ Net Result မှ နုတ်တွက်ပါမည်။ /admin ဖြင့် ပြန်ဝင်ပါ။",
                parse_mode=ParseMode.HTML,
            )
        except (ValueError, TypeError) as exc:
            await message.reply_text(f"❗ {html.escape(str(exc))}", parse_mode=ParseMode.HTML)
        return

    if action == "broadcast":
        if not (message.text or message.caption or message.photo or message.video or message.document or message.animation or message.audio or message.voice or message.sticker):
            await message.reply_text("ပို့လို့ရတဲ့ Text သို့မဟုတ် Media ကို ပို့ပေးပါ။")
            return
        context.user_data.pop("admin_waiting_for", None)
        status = await message.reply_text("📣 Broadcast စတင်နေပါပြီ။ Parallel delivery လုပ်နေပါသည်...")
        success, failed, blocked = await _broadcast_message(update, context)
        await status.edit_text(
            "✅ Broadcast ပြီးပါပြီ။\n"
            f"အောင်မြင်: {success:,}\n"
            f"မအောင်မြင်: {failed:,}\n"
            f"Bot ကို Block လုပ်ထား: {blocked:,}"
        )
        return

    if action == "import_db_zip":
        document = message.document
        if document is None:
            await message.reply_text(".db.zip ဖိုင်ကို Document အနေနဲ့ Upload လုပ်ပေးပါ။")
            return
        filename = document.file_name or "database.zip"
        if not filename.lower().endswith(".zip"):
            await message.reply_text("ZIP ဖိုင် (.db.zip) ကိုသာ လက်ခံပါသည်။")
            return
        if document.file_size and document.file_size > MAX_IMPORT_ZIP_BYTES:
            await message.reply_text("ဖိုင်အရွယ်အစား 20 MB ထက်ကျော်နေပါသည်။")
            return
        try:
            tg_file = await context.bot.get_file(document.file_id)
            raw = bytes(await tg_file.download_as_bytearray())
            source_name, imported_rows, archive_rows, table_names = await asyncio.to_thread(parse_database_zip, raw)
            imported_ids = await asyncio.to_thread(_STORE.insert_users_if_missing, imported_rows) if _STORE else []
            imported_lookup = dict(imported_rows)
            for user_id in imported_ids:
                context.bot_data.setdefault("users", {}).setdefault(user_id, imported_lookup[user_id])
            archived_count = await asyncio.to_thread(_STORE.insert_archive_rows, filename, archive_rows) if _STORE else 0
            if _STORE is not None:
                _STORE.record_import(filename, len(imported_ids), archived_count)
                # Save all newly merged runtime records after importing.
                for user_id in imported_ids:
                    _STORE.save_user(user_id, context.bot_data["users"][user_id])
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text(
                "✅ Database Merge ပြီးပါပြီ။\n"
                f"DB file: {html.escape(source_name)}\n"
                f"တွေ့ရှိသော Table: {len(table_names)}\n"
                f"User အသစ်ထည့်ပြီး: {len(imported_ids):,}\n"
                f"အခြား Data Archive ထဲသိမ်းပြီး: {archived_count:,}\n\n"
                "ရှိပြီးသား User ID တွေရဲ့ balance/data ကို overwrite မလုပ်ထားပါ။",
                parse_mode=ParseMode.HTML,
            )
        except Exception as exc:
            logger.exception("Database ZIP import failed")
            await message.reply_text(f"❌ DB Import မအောင်မြင်ပါ။\n{str(exc)[:700]}")
        return

    if action == "balance":
        parts = (message.text or "").strip().split()
        try:
            if len(parts) == 3 and parts[0].lower() in {"set_deposit_total", "set_withdrawals", "set_wager"}:
                operation, target_text, value_text = parts
                target_id, value = int(target_text), int(value_text)
                if target_id <= 0 or value < 0:
                    raise ValueError("User ID သည် အပေါင်းကိန်း၊ ပမာဏသည် 0 သို့မဟုတ် အပေါင်းကိန်းဖြစ်ရပါမည်။")
                target = context.bot_data.get("users", {}).get(target_id)
                if target is None:
                    raise ValueError("User ကို Database ထဲတွင် မတွေ့ပါ။")
                ensure_withdrawal_tracking(target)
                field = {
                    "set_deposit_total": "total_successful_deposit",
                    "set_withdrawals": "withdrawal_count",
                    "set_wager": "wager_since_last_withdrawal",
                }[operation.lower()]
                target[field] = value
                if _STORE is not None:
                    _STORE.save_user(target_id, target)
                context.user_data.pop("admin_waiting_for", None)
                await message.reply_text(f"✅ User {target_id} အတွက် {field} ကို {value:,} သို့ ပြောင်းပြီးပါပြီ။")
                return

            if len(parts) == 2 and parts[0].lower() == "reset_first":
                target_id = int(parts[1])
                if target_id <= 0:
                    raise ValueError("မှန်ကန်သော User ID ပေးပါ။")
                target = context.bot_data.get("users", {}).get(target_id)
                if target is None:
                    raise ValueError("User ကို Database ထဲတွင် မတွေ့ပါ။")
                target["has_successful_deposit"] = False
                target.pop("first_deposit_legacy_migrated", None)
                target.pop("first_deposit_amount", None)
                target.pop("first_deposit_approved_at", None)
                if _STORE is not None:
                    _STORE.save_user(target_id, target)
                context.user_data.pop("admin_waiting_for", None)
                await message.reply_text(
                    f"✅ User {target_id} အတွက် ပထမဆုံးငွေသွင်းလိုအပ်ချက် ပြန်သတ်မှတ်ပြီးပါပြီ။\n"
                    f"နောက်တစ်ကြိမ် ငွေသွင်းရာတွင် အနည်းဆုံး {int(get_setting(context, 'MINIMUM_FIRST_DEPOSIT')):,} Ks လိုအပ်ပါမည်။"
                )
                return

            if len(parts) != 3 or parts[0].lower() not in {"add", "remove"}:
                raise ValueError("add USER_ID AMOUNT / remove USER_ID AMOUNT / reset_first USER_ID / set_deposit_total USER_ID AMOUNT / set_withdrawals USER_ID COUNT / set_wager USER_ID AMOUNT ပုံစံသုံးပါ။")
            operation, target_text, amount_text = parts
            target_id, amount = int(target_text), int(amount_text)
            if target_id <= 0 or amount <= 0:
                raise ValueError("User ID နှင့် Amount သည် အပေါင်းကိန်းဖြစ်ရပါမည်။")
            target = context.bot_data.get("users", {}).get(target_id)
            if target is None:
                raise ValueError("User ကို Database ထဲတွင် မတွေ့ပါ။")
            old_balance = int(target.get("balance", 0))
            if operation.lower() == "remove" and old_balance < amount:
                raise ValueError(f"လက်ကျန်ငွေ {old_balance:,} Ks သာရှိပါသည်။")
            target["balance"] = old_balance + amount if operation.lower() == "add" else old_balance - amount
            if _STORE is not None:
                _STORE.save_user(target_id, target)
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text(f"✅ {target_id} ၏ လက်ကျန်ငွေ ပြောင်းပြီးပါပြီ။\nအသစ်: {target['balance']:,} Ks")
            try:
                await context.bot.send_message(chat_id=target_id, text=f"Admin မှ သင့်လက်ကျန်ငွေကို ပြင်ဆင်လိုက်ပါသည်။ အသစ်: {target['balance']:,} Ks")
            except TelegramError:
                pass
        except (ValueError, TypeError) as exc:
            await message.reply_text(f"❗ {exc}\nFormat: add USER_ID AMOUNT / remove USER_ID AMOUNT / reset_first USER_ID / set_deposit_total USER_ID AMOUNT / set_withdrawals USER_ID COUNT / set_wager USER_ID AMOUNT")
        return

    if action.startswith("setting:"):
        key = action.split(":", 1)[1]
        if key not in SETTING_META:
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text("Unknown setting. /admin ဖြင့် ပြန်ဝင်ပါ။")
            return
        kind, minimum, maximum, label = SETTING_META[key]
        raw_value = (message.text or "").strip()
        try:
            if kind == "int":
                value = int(raw_value.replace(",", ""))
            elif kind == "float":
                value = float(raw_value)
            elif kind == "percent":
                value = float(raw_value) / 100.0
            elif kind == "url":
                parsed = urlparse(raw_value)
                if parsed.scheme not in ("https", "http") or not parsed.netloc or len(raw_value) > maximum:
                    raise ValueError(f"Valid http(s) URL ပေးပါ (အများဆုံး {maximum} characters)။")
                value = raw_value
            else:
                value = raw_value
                if not value or len(value) > maximum:
                    raise ValueError(f"တန်ဖိုးသည် 1 မှ {maximum} characters အတွင်း ဖြစ်ရပါမည်။")
            if kind in ("int", "float", "percent") and not (minimum <= value <= maximum):
                raise ValueError(f"{minimum} မှ {maximum} အတွင်း ထည့်ပါ။")
            save_runtime_setting(context.application, key, value)
            timing_note = ""
            if key in {"ROUND_DURATION_SECONDS", "NEXT_ROUND_DELAY_SECONDS"}:
                open_updated, waiting_updated = apply_round_timing_setting(context.application, key, int(value))
                if key == "ROUND_DURATION_SECONDS":
                    timing_note = f"\nဖွင့်ထားသော Round Timer ပြန်စီစဉ်ပြီး: {open_updated} ခု"
                else:
                    timing_note = f"\nနောက်ပွဲစချိန် ပြန်စီစဉ်ပြီး: {waiting_updated} ခု"
            context.user_data.pop("admin_waiting_for", None)
            await message.reply_text(
                f"✅ {label} ပြောင်းပြီးပါပြီ။\nတန်ဖိုးအသစ်: {_setting_display(key, value)}{timing_note}\n\n/admin ဖြင့် Admin Panel ပြန်ဖွင့်နိုင်ပါသည်။"
            )
        except (ValueError, OverflowError) as exc:
            await message.reply_text(f"❗ {exc}\nတန်ဖိုးအသစ်ကို ထပ်ပို့ပါ။")
        return


def request_auto_backup(application: Application, reason: str = "data updated", force: bool = False) -> None:
    """Queue a private snapshot; debounce bursts and cap document delivery to once per 5 minutes."""
    job_queue = getattr(application, "job_queue", None)
    if job_queue is None:
        return
    bot_data = application.bot_data
    reasons = bot_data.setdefault("auto_backup_reasons", [])
    if reason and reason not in reasons:
        reasons.append(str(reason)[:120])
        del reasons[:-12]
    if bot_data.get("auto_backup_in_progress"):
        bot_data["auto_backup_dirty"] = True
        return
    if bot_data.get("auto_backup_job_pending"):
        if force:
            _remove_jobs(job_queue, "automatic_private_backup")
            bot_data["auto_backup_job_pending"] = False
        else:
            return
    now = time.time()
    last = float(bot_data.get("last_auto_backup_at", 0) or 0)
    delay = float(BACKUP_DEBOUNCE_SECONDS) if force else max(
        float(BACKUP_DEBOUNCE_SECONDS), float(last + BACKUP_MIN_INTERVAL_SECONDS - now)
    )
    bot_data["auto_backup_job_pending"] = True
    try:
        job_queue.run_once(
            automatic_backup_job,
            delay,
            name="automatic_private_backup",
        )
    except Exception:
        bot_data["auto_backup_job_pending"] = False
        logger.exception("Could not schedule automatic backup")


def _create_backup_archive(reason: str) -> str:
    """Create a consistent SQLite snapshot plus PicklePersistence in a ZIP."""
    temp_dir = tempfile.mkdtemp(prefix="dice_bot_backup_")
    archive_path = os.path.join(temp_dir, f"dice_game_bot_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip")
    try:
        snapshot_db = os.path.join(temp_dir, "dice_game_bot.db")
        if _STORE is not None:
            with _STORE.lock:
                destination = sqlite3.connect(snapshot_db)
                try:
                    _STORE.conn.backup(destination)
                finally:
                    destination.close()
        elif DB_PATH.exists():
            shutil.copy2(DB_PATH, snapshot_db)

        files_to_zip = []
        if os.path.exists(snapshot_db):
            files_to_zip.append((snapshot_db, "dice_game_bot.db"))
        if PICKLE_PATH.exists():
            pickle_copy = os.path.join(temp_dir, "dice_game_bot.pickle")
            shutil.copy2(PICKLE_PATH, pickle_copy)
            files_to_zip.append((pickle_copy, "dice_game_bot.pickle"))

        manifest = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "backup_reason": str(reason)[:1000],
            "database_included": any(name == "dice_game_bot.db" for _, name in files_to_zip),
            "pickle_included": any(name == "dice_game_bot.pickle" for _, name in files_to_zip),
            "notes": "Contains user/account data. Keep this archive private. Bot token/source code is not included.",
        }
        manifest_path = os.path.join(temp_dir, "backup_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as handle:
            json.dump(manifest, handle, ensure_ascii=False, indent=2)
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for source, archive_name in files_to_zip:
                archive.write(source, archive_name)
            archive.write(manifest_path, "backup_manifest.json")
        return archive_path
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


async def automatic_backup_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send the newest database/persistence snapshot to the configured private ID."""
    application = context.application
    data = application.bot_data
    data["auto_backup_job_pending"] = False
    if data.get("auto_backup_in_progress"):
        data["auto_backup_dirty"] = True
        return
    data["auto_backup_in_progress"] = True
    reasons = data.pop("auto_backup_reasons", [])
    reason_text = "; ".join(str(item) for item in reasons[-8:]) or "scheduled snapshot"
    archive_path = None
    try:
        # Force PTB persistence to flush pending bot/user/chat state before copying it.
        update_persistence = getattr(application, "update_persistence", None)
        if callable(update_persistence):
            try:
                await update_persistence()
            except Exception:
                logger.exception("Could not flush PicklePersistence before backup")
        persistence = getattr(application, "persistence", None)
        flush = getattr(persistence, "flush", None) if persistence is not None else None
        if callable(flush):
            try:
                result = flush()
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                logger.exception("PicklePersistence flush failed; continuing with SQLite snapshot")

        archive_path = await asyncio.to_thread(_create_backup_archive, reason_text)
        filename = os.path.basename(archive_path)
        caption = (
            "🗄 Bot Auto Backup\n"
            f"🕒 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"📌 {reason_text[:700]}\n"
            "ဒီဖိုင်တွင် User/Balance data ပါဝင်နိုင်သောကြောင့် လုံခြုံစွာသိမ်းဆည်းပါ။"
        )
        with open(archive_path, "rb") as backup_file:
            await application.bot.send_document(
                chat_id=BACKUP_CHAT_ID,
                document=backup_file,
                filename=filename,
                caption=caption,
            )
        data["last_auto_backup_at"] = time.time()
        logger.info("Automatic backup sent to configured owner chat %s", BACKUP_CHAT_ID)
    except Forbidden as exc:
        logger.error(
            "Auto backup could not reach %s. That account must open the bot and send /start first: %s",
            BACKUP_CHAT_ID, exc,
        )
        data["last_auto_backup_at"] = time.time()
    except Exception:
        logger.exception("Automatic backup failed for recipient %s", BACKUP_CHAT_ID)
        data["last_auto_backup_at"] = time.time()
    finally:
        if archive_path:
            shutil.rmtree(os.path.dirname(archive_path), ignore_errors=True)
        data["auto_backup_in_progress"] = False
        if data.pop("auto_backup_dirty", False):
            request_auto_backup(application, "additional data changed during previous backup")


async def group_command_moderation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Remove commands from non-admins in the game group; admin commands remain usable."""
    message = update.effective_message
    user = update.effective_user
    chat = update.effective_chat
    if message is None or user is None or chat is None or chat.type not in ("group", "supergroup"):
        return
    if user.is_bot or await is_group_admin(context, chat.id, user.id):
        return
    await delete_user_message(message)


async def group_non_text_moderation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Delete non-text user posts (photos, files, stickers, videos, voice, etc.) in game groups."""
    message = update.effective_message
    user = update.effective_user
    chat = update.effective_chat
    if message is None or user is None or chat is None or chat.type not in ("group", "supergroup"):
        return
    if user.is_bot or await is_group_admin(context, chat.id, user.id):
        return
    await delete_user_message(message)


async def database_update_sync_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Persist the user affected by each Telegram update to SQLite."""
    if _STORE is None:
        return
    user = update.effective_user
    if user is None:
        return
    data = context.bot_data.get("users", {}).get(user.id)
    if data is not None:
        try:
            _STORE.save_user(user.id, data)
            request_auto_backup(context.application, f"user {user.id} data updated")
        except Exception:
            logger.exception("Failed to persist user %s after update", user.id)


async def periodic_database_sync(context: ContextTypes.DEFAULT_TYPE):
    if _STORE is not None:
        try:
            await asyncio.to_thread(_STORE.save_users, context.bot_data.get("users", {}))
        except Exception:
            logger.exception("Periodic SQLite sync failed")


async def startup_database(application: Application):
    global _STORE, _BACKUP_APP
    _BACKUP_APP = application
    # These are transient JobQueue flags; scheduled jobs are rebuilt after restart.
    application.bot_data["auto_backup_job_pending"] = False
    application.bot_data["auto_backup_in_progress"] = False
    application.bot_data["auto_backup_dirty"] = False
    _STORE = SQLiteStore(DB_PATH)
    await asyncio.to_thread(_STORE.ensure_settings, DEFAULT_SETTINGS)
    saved_settings = await asyncio.to_thread(_STORE.load_settings)
    application.bot_data["settings"] = {**DEFAULT_SETTINGS, **saved_settings}
    # v4 corrects the old mistaken first-deposit minimum: deposits use the
    # regular minimum, while the separate 5,000 Ks rule applies to first withdrawal.
    if not bool(saved_settings.get("WITHDRAWAL_RULES_V4_MIGRATED", False)):
        corrected_first_deposit_minimum = int(application.bot_data["settings"].get("MINIMUM_DEPOSIT", MINIMUM_DEPOSIT))
        application.bot_data["settings"]["MINIMUM_FIRST_DEPOSIT"] = corrected_first_deposit_minimum
        await asyncio.to_thread(_STORE.save_setting, "MINIMUM_FIRST_DEPOSIT", corrected_first_deposit_minimum)
        await asyncio.to_thread(_STORE.save_setting, "WITHDRAWAL_RULES_V4_MIGRATED", True)
        application.bot_data["settings"]["WITHDRAWAL_RULES_V4_MIGRATED"] = True
    application.bot_data["settings"]["ADMIN_IDS"] = get_admin_ids(application)
    await asyncio.to_thread(
        _STORE.save_setting,
        "ADMIN_IDS",
        application.bot_data["settings"]["ADMIN_IDS"],
    )

    runtime_users = application.bot_data.setdefault("users", {})
    database_users = await asyncio.to_thread(_STORE.load_users)
    # SQLite is the durable source when a record already exists there.
    for user_id, data in database_users.items():
        runtime_users[user_id] = data
    for data in runtime_users.values():
        if isinstance(data, dict):
            user_has_completed_first_deposit(
                data, int(application.bot_data["settings"].get("WELCOME_BONUS", WELCOME_BONUS))
            )
            ensure_withdrawal_tracking(data)
    await asyncio.to_thread(_STORE.save_users, runtime_users)

    if application.job_queue is not None:
        application.job_queue.run_repeating(
            periodic_database_sync,
            interval=300,
            first=300,
            name="sqlite_periodic_sync",
        )
    logger.info("SQLite database initialized: %s users", len(runtime_users))


async def shutdown_database(application: Application):
    global _STORE, _BACKUP_APP
    if _STORE is not None:
        try:
            await asyncio.to_thread(_STORE.save_users, application.bot_data.get("users", {}))
        except Exception:
            logger.exception("Final SQLite sync failed")
        finally:
            try:
                _STORE.close()
            except Exception:
                logger.exception("Could not close SQLite database")
            _STORE = None
            _BACKUP_APP = None


# ====================================================================
# ❗ Error Handler (No Changes in this section)
# ====================================================================
async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error("Exception while handling an update:", exc_info=context.error)
    tb_list = traceback.format_exception(None, context.error, context.error.__traceback__)
    tb_string = "".join(tb_list)
    update_str = update.to_dict() if isinstance(update, Update) else str(update)
    message = (
        f"An exception was raised while handling an update\n"
        f"<pre>update = {html.escape(json.dumps(update_str, indent=2, ensure_ascii=False))}</pre>\n\n"
        f"<pre>context.chat_data = {html.escape(str(context.chat_data))}</pre>\n\n"
        f"<pre>context.user_data = {html.escape(str(context.user_data))}</pre>\n\n"
        f"<pre>{html.escape(tb_string)}</pre>"
    )
    for admin_id in get_admin_ids(context):
        try:
            await context.bot.send_message(chat_id=admin_id, text=message, parse_mode=ParseMode.HTML)
        except Exception as e:
            logger.error(f"Failed to send error message to admin {admin_id}: {e}")

# ====================================================================
# 🚀 Main Application (No Changes in this section)
# ====================================================================
async def startup_info(application: Application) -> None:
    """Initialize SQLite, authenticate, print username, restore timers."""
    await startup_database(application)
    bot_info = await application.bot.get_me()
    username = f"@{bot_info.username}" if bot_info.username else f"ID {bot_info.id}"
    application.bot_data["bot_username"] = bot_info.username
    print(f"✅ Bot is running: {username}", flush=True)
    logger.info("Bot identity confirmed: %s", username)
    await recover_round_jobs(application)
    request_auto_backup(application, "startup snapshot")


def main():
    # Preserve the old relative PicklePersistence file if the previous version was
    # launched from a working directory different from this script's directory.
    legacy_pickle_path = Path.cwd() / "dice_game_bot.pickle"
    if not PICKLE_PATH.exists() and legacy_pickle_path.exists() and legacy_pickle_path.resolve() != PICKLE_PATH.resolve():
        try:
            shutil.copy2(legacy_pickle_path, PICKLE_PATH)
            logger.info("Migrated existing PicklePersistence file from %s", legacy_pickle_path)
        except Exception:
            logger.exception("Could not copy legacy PicklePersistence file; check it before starting")
    persistence = PicklePersistence(filepath=str(PICKLE_PATH))
    
    application = (
        ApplicationBuilder()
        .token(TOKEN)
        .persistence(persistence)
        .post_init(startup_info)
        .post_shutdown(shutdown_database)
        .job_queue(JobQueue())
        .connect_timeout(30)
        .read_timeout(30)
        .build()
    )
    
    payment_conv_handler = ConversationHandler(
        entry_points=[MessageHandler(filters.Regex('^ငွေသွင်း/ငွေထုတ်🏦$'), payment_start)],
        states={
            CHOOSE_ACTION: [
                CallbackQueryHandler(start_deposit, pattern='^start_deposit$'),
                CallbackQueryHandler(start_withdraw, pattern='^start_withdraw$'),
                CallbackQueryHandler(back_to_payment_start, pattern='^back_to_payment_start$')
            ],
            DEPOSIT_CHOOSE_METHOD: [CallbackQueryHandler(deposit_choose_method, pattern='^deposit_(kpay|wave)$'), CallbackQueryHandler(back_to_payment_start, pattern='^back_to_payment_start$')],
            DEPOSIT_ENTER_AMOUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, deposit_enter_amount)],
            DEPOSIT_UPLOAD_RECEIPT: [MessageHandler(filters.PHOTO, deposit_upload_receipt)],
            WITHDRAW_ENTER_AMOUNT: [MessageHandler(filters.TEXT & ~filters.COMMAND, withdraw_enter_amount)],
            WITHDRAW_CHOOSE_METHOD: [CallbackQueryHandler(withdraw_choose_method, pattern='^withdraw_(kpay|wave)$'), CallbackQueryHandler(back_to_payment_start, pattern='^back_to_payment_start$')],
            WITHDRAW_ENTER_PHONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, withdraw_enter_phone)],
            WITHDRAW_ENTER_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, withdraw_enter_name)],
        },
        fallbacks=[CallbackQueryHandler(cancel_payment, pattern='^cancel_payment$')]
    )
    
    admin_receipt_conv_handler = ConversationHandler(
        entry_points=[CallbackQueryHandler(button_callback, pattern='^approve_withdraw:.*')],
        states={ ADMIN_AWAIT_RECEIPT: [MessageHandler(filters.PHOTO, admin_await_receipt)], },
        fallbacks=[CommandHandler('cancel', cancel_admin_action)],
        name="admin_withdrawal_receipt",
        persistent=True,
    )
    
    application.add_error_handler(error_handler)
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("startround", start_round_command))
    application.add_handler(CommandHandler("closeround", closeround_command))
    application.add_handler(CommandHandler("addbalance", addbalance_command))
    application.add_handler(CommandHandler("removebalance", removebalance_command))
    application.add_handler(CommandHandler("menu", menu_command))
    application.add_handler(CommandHandler("admin", admin_command))
    application.add_handler(CommandHandler("addadmin", addadmin_command))
    application.add_handler(CommandHandler("removeadmin", removeadmin_command))
    
    application.add_handler(payment_conv_handler)
    application.add_handler(admin_receipt_conv_handler)
    
    # Higher priority group handles only an active Admin form; other messages fall through.
    application.add_handler(
        MessageHandler(filters.ChatType.PRIVATE & ~filters.COMMAND, admin_private_input_handler),
        group=-1,
    )
    application.add_handler(CallbackQueryHandler(admin_panel_callback, pattern=r"^admin:"), group=-1)

    private_buttons_filter = filters.ChatType.PRIVATE & filters.TEXT & ~filters.COMMAND & ~filters.Regex('^ငွေသွင်း/ငွေထုတ်🏦$')
    application.add_handler(MessageHandler(private_buttons_filter, private_text_handler))
    
    group_bets_filter = filters.ChatType.GROUPS & filters.TEXT & ~filters.COMMAND
    application.add_handler(MessageHandler(group_bets_filter, group_text_handler))
    # Moderation runs after normal commands/bet parsing. Group admins are exempt.
    application.add_handler(
        MessageHandler(filters.ChatType.GROUPS & filters.COMMAND, group_command_moderation, block=False),
        group=2,
    )
    application.add_handler(
        MessageHandler(filters.ChatType.GROUPS & ~filters.TEXT, group_non_text_moderation, block=False),
        group=2,
    )

    application.add_handler(CallbackQueryHandler(button_callback))
    application.add_handler(TypeHandler(Update, database_update_sync_handler), group=1000)

    logger.info("Full Auto Dice Game Bot is starting...")
    print("🔄 Connecting to Telegram...", flush=True)
    application.run_polling()

if __name__ == '__main__':
    main()