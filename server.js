const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const archiver = require('archiver');
const yauzl = require('yauzl');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const registerApiRoutes = require('./routes');
const createAuthRouter = require('./routes/auth');

const app = express();
const PORT = Number(process.env.PORT || 4178);
const HOST = process.env.HOST || '127.0.0.1';
const localHostBindings = new Set(['127.0.0.1', '::1', 'localhost']);
const localOnly = localHostBindings.has(HOST.toLowerCase());
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.resolve(process.env.PERSONAL_MEMO_UPLOAD_DIR || path.join(DATA_DIR, 'uploads'));
const AUDIO_DIR = path.resolve(process.env.PERSONAL_MEMO_AUDIO_DIR || path.join(DATA_DIR, 'audio'));
const CLUB_UPLOAD_DIR = path.resolve(process.env.PERSONAL_MEMO_CLUB_UPLOAD_DIR || path.join(DATA_DIR, 'club-uploads'));
const BACKUP_DIR = path.resolve(process.env.PERSONAL_MEMO_BACKUP_DIR || path.join(DATA_DIR, 'backups'));
const DB_PATH = path.resolve(process.env.PERSONAL_MEMO_DB || path.join(DATA_DIR, 'memo.sqlite'));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('memo','book','game','movie')),
    title TEXT NOT NULL,
    creator TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planned'
      CHECK (status IN ('planned','in_progress','completed','paused','dropped')),
    progress TEXT NOT NULL DEFAULT '',
    rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    review TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    started_on TEXT,
    finished_on TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_kind_updated ON items(kind,updated_at DESC,id DESC);
  CREATE TABLE IF NOT EXISTS progress_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    progress TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    logged_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_progress_item ON progress_events(item_id,logged_at DESC,id DESC);
  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chapters_item ON chapters(item_id,position,id);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);
if (!db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'cover_image')) {
  db.exec("ALTER TABLE items ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''");
}
if (!db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'user_id')) {
  db.exec('ALTER TABLE items ADD COLUMN user_id INTEGER REFERENCES users(id)');
}
if (!db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'near_completion')) {
  db.exec('ALTER TABLE items ADD COLUMN near_completion INTEGER NOT NULL DEFAULT 0 CHECK (near_completion IN (0,1))');
}
if (!db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'deleted_at')) {
  db.exec('ALTER TABLE items ADD COLUMN deleted_at TEXT');
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_items_user_kind_updated ON items(user_id,kind,updated_at DESC,id DESC);
  CREATE TABLE IF NOT EXISTS audio_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audio_item ON audio_attachments(item_id,created_at,id);
  CREATE TABLE IF NOT EXISTS image_attachments (
    filename TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS application_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    edit_mode TEXT NOT NULL DEFAULT 'inline' CHECK (edit_mode IN ('inline','popup')),
    notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK (notification_enabled IN (0,1)),
    theme_mode TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light','dark','system')),
    reminder_minutes INTEGER NOT NULL DEFAULT 15 CHECK (reminder_minutes IN (5,10,15,30,60)),
    notification_sound_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notification_sound_enabled IN (0,1)),
    markdown_rendering_enabled INTEGER NOT NULL DEFAULT 1 CHECK (markdown_rendering_enabled IN (0,1)),
    markdown_toolbar_enabled INTEGER NOT NULL DEFAULT 1 CHECK (markdown_toolbar_enabled IN (0,1)),
    markdown_image_paste_enabled INTEGER NOT NULL DEFAULT 1 CHECK (markdown_image_paste_enabled IN (0,1)),
    font_size_offset INTEGER NOT NULL DEFAULT 0 CHECK (font_size_offset IN (-1,0,1,2)),
    line_spacing TEXT NOT NULL DEFAULT 'comfortable' CHECK (line_spacing IN ('compact','comfortable','relaxed')),
    font_family TEXT NOT NULL DEFAULT 'plex' CHECK (font_family IN ('plex','system','serif'))
  );
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    due_time TEXT,
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly')),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
    deleted_at TEXT,
    source_todo_id INTEGER REFERENCES todos(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_todos_user_due ON todos(user_id,completed,due_date,id);
  CREATE TABLE IF NOT EXISTS saved_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    excerpt TEXT NOT NULL DEFAULT '',
    review TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','reading','read')),
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_saved_articles_user_status ON saved_articles(user_id,status,updated_at DESC,id DESC);
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user_updated ON bookmarks(user_id,deleted_at,updated_at DESC,id DESC);
  CREATE TABLE IF NOT EXISTS daily_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_date TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id,note_date)
  );
  CREATE INDEX IF NOT EXISTS idx_daily_notes_user_date ON daily_notes(user_id,note_date DESC);
  CREATE TABLE IF NOT EXISTS pinned_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('item','article','bookmark','daily-note')),
    entity_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id,entity_type,entity_id)
  );
  CREATE INDEX IF NOT EXISTS idx_pinned_entries_user ON pinned_entries(user_id,created_at DESC);
  CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL UNIQUE REFERENCES image_attachments(filename) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'شخصي',
    caption TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_gallery_images_user_category ON gallery_images(user_id,category,created_at DESC);
  CREATE TABLE IF NOT EXISTS book_clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS book_club_members (
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
    can_add_books INTEGER NOT NULL DEFAULT 0 CHECK (can_add_books IN (0,1)),
    joined_at TEXT NOT NULL,
    PRIMARY KEY (club_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_book_club_members_user ON book_club_members(user_id,joined_at DESC);
  CREATE TABLE IF NOT EXISTS book_club_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS book_club_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    added_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    creator TEXT NOT NULL DEFAULT '',
    source_item_id INTEGER,
    created_at TEXT NOT NULL,
    UNIQUE(club_id,title,creator)
  );
  CREATE TABLE IF NOT EXISTS book_club_progress (
    club_book_id INTEGER NOT NULL REFERENCES book_club_books(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading','completed')),
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (club_book_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS book_club_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat','insight')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_book_club_messages ON book_club_messages(club_id,id DESC);
  CREATE TABLE IF NOT EXISTS book_club_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    meeting_url TEXT NOT NULL DEFAULT '',
    discussion_points TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_book_club_meetings ON book_club_meetings(club_id,starts_at);
  CREATE TABLE IF NOT EXISTS book_club_message_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES book_club_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_book_club_attachments ON book_club_message_attachments(club_id,message_id);
  CREATE TABLE IF NOT EXISTS book_club_message_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES book_club_messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_book_club_links ON book_club_message_links(club_id,message_id);
  CREATE TABLE IF NOT EXISTS book_club_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES book_club_messages(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    read_at TEXT,
    UNIQUE(user_id,message_id)
  );
  CREATE INDEX IF NOT EXISTS idx_book_club_notifications ON book_club_notifications(user_id,read_at,created_at DESC);
`);
for (const [table, column, definition] of [
  ['user_preferences', 'notification_enabled', 'INTEGER NOT NULL DEFAULT 0 CHECK (notification_enabled IN (0,1))'],
  ['user_preferences', 'theme_mode', "TEXT NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light','dark','system'))"],
  ['user_preferences', 'reminder_minutes', 'INTEGER NOT NULL DEFAULT 15 CHECK (reminder_minutes IN (5,10,15,30,60))'],
  ['user_preferences', 'notification_sound_enabled', 'INTEGER NOT NULL DEFAULT 1 CHECK (notification_sound_enabled IN (0,1))'],
  ['user_preferences', 'markdown_rendering_enabled', 'INTEGER NOT NULL DEFAULT 1 CHECK (markdown_rendering_enabled IN (0,1))'],
  ['user_preferences', 'markdown_toolbar_enabled', 'INTEGER NOT NULL DEFAULT 1 CHECK (markdown_toolbar_enabled IN (0,1))'],
  ['user_preferences', 'markdown_image_paste_enabled', 'INTEGER NOT NULL DEFAULT 1 CHECK (markdown_image_paste_enabled IN (0,1))'],
  ['user_preferences', 'font_size_offset', 'INTEGER NOT NULL DEFAULT 0 CHECK (font_size_offset IN (-1,0,1,2))'],
  ['user_preferences', 'line_spacing', "TEXT NOT NULL DEFAULT 'comfortable' CHECK (line_spacing IN ('compact','comfortable','relaxed'))"],
  ['user_preferences', 'font_family', "TEXT NOT NULL DEFAULT 'plex' CHECK (font_family IN ('plex','system','serif'))"],
  ['todos', 'due_time', 'TEXT'],
  ['todos', 'recurrence', "TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly'))"],
  ['todos', 'deleted_at', 'TEXT'],
  ['todos', 'source_todo_id', 'INTEGER REFERENCES todos(id)'],
  ['saved_articles', 'deleted_at', 'TEXT'],
  ['bookmarks', 'image_url', "TEXT NOT NULL DEFAULT ''"],
  ['book_club_members', 'can_add_books', 'INTEGER NOT NULL DEFAULT 0 CHECK (can_add_books IN (0,1))'],
  ['book_club_books', 'total_pages', 'INTEGER NOT NULL DEFAULT 0 CHECK (total_pages >= 0)'],
  ['book_club_progress', 'pages_read', 'INTEGER NOT NULL DEFAULT 0 CHECK (pages_read >= 0)'],
]) {
  if (!db.prepare(`PRAGMA table_info("${table}")`).all().some(existingColumn => existingColumn.name === column)) {
    db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
  }
}
db.prepare("UPDATE book_club_members SET can_add_books=1 WHERE role='owner'").run();
db.exec('CREATE TABLE IF NOT EXISTS undo_trash(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, record_type TEXT NOT NULL, record_id INTEGER NOT NULL, record_json TEXT NOT NULL, expires_at TEXT NOT NULL)');
db.exec('CREATE INDEX IF NOT EXISTS idx_undo_trash_user_expiry ON undo_trash(user_id,expires_at)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_source_once ON todos(source_todo_id) WHERE source_todo_id IS NOT NULL');
db.exec(`
  CREATE TABLE IF NOT EXISTS life_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#397e75',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id,name)
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    area_id INTEGER REFERENCES life_areas(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','planned','completed')),
    target_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    area_id INTEGER REFERENCES life_areas(id) ON DELETE SET NULL,
    goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    next_action TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed')),
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    starts_at TEXT NOT NULL,
    ends_at TEXT,
    all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),
    recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','daily','weekly','monthly')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly')),
    target_per_week INTEGER NOT NULL DEFAULT 7 CHECK (target_per_week BETWEEN 1 AND 7),
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS habit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    habit_date TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    UNIQUE(habit_id,habit_date)
  );
  CREATE TABLE IF NOT EXISTS routines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    steps TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS routine_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routine_date TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    UNIQUE(routine_id,routine_date)
  );
`);
if (!db.prepare('PRAGMA table_info(todos)').all().some(column => column.name === 'project_id')) {
  db.exec('ALTER TABLE todos ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL');
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id,status,target_date);
  CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id,status,due_date);
  CREATE INDEX IF NOT EXISTS idx_calendar_user_start ON calendar_events(user_id,starts_at);
  CREATE INDEX IF NOT EXISTS idx_habits_user_active ON habits(user_id,archived,title);
  CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date ON habit_logs(user_id,habit_date);
  CREATE INDEX IF NOT EXISTS idx_routines_user_active ON routines(user_id,archived,position);
`);
db.prepare("INSERT OR IGNORE INTO application_settings(key,value) VALUES ('daily_backup_enabled','1')").run();
for (const [key, value] of [
  ['s3_enabled', '0'],
  ['s3_bucket', ''],
  ['s3_region', 'us-east-1'],
  ['s3_prefix', 'personal-memo'],
]) {
  db.prepare('INSERT OR IGNORE INTO application_settings(key,value) VALUES (?,?)').run(key, value);
}
if (!db.prepare('PRAGMA table_info(users)').all().some(column => column.name === 'is_owner')) {
  db.exec('ALTER TABLE users ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0,1))');
}
const existingOwner = db.prepare('SELECT id FROM users WHERE is_owner=1 ORDER BY id LIMIT 1').get();
const initialOwner = existingOwner || db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
if (initialOwner) {
  db.prepare('UPDATE users SET is_owner=0 WHERE id<>? AND is_owner<>0').run(initialOwner.id);
  db.prepare('UPDATE users SET is_owner=1 WHERE id=?').run(initialOwner.id);
  db.prepare('UPDATE items SET user_id=? WHERE user_id IS NULL').run(initialOwner.id);
  if (fs.existsSync(UPLOAD_DIR)) {
    const attachLegacyImage = db.prepare('INSERT OR IGNORE INTO image_attachments(filename,user_id,created_at) VALUES (?,?,?)');
    fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(entry.name))
      .forEach(entry => attachLegacyImage.run(entry.name, initialOwner.id, new Date().toISOString()));
  }
}

const KINDS = new Set(['memo', 'book', 'game', 'movie']);
const STATUSES = new Set(['planned', 'in_progress', 'completed', 'paused', 'dropped']);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const now = () => new Date().toISOString();
const localToday = () => {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const localTime = () => new Date().toTimeString().slice(0, 5);
const validDate = value => {
  if (!value) return true;
  if (!datePattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const text = value => typeof value === 'string' ? value.trim() : '';

function validateItem(body) {
  const item = {
    kind: text(body.kind),
    title: text(body.title),
    creator: text(body.creator),
    status: text(body.status || 'planned'),
    progress: text(body.progress),
    rating: body.rating === '' || body.rating == null ? null : Number(body.rating),
    review: text(body.review),
    notes: text(body.notes),
    tags: text(body.tags),
    cover_image: text(body.cover_image),
    started_on: text(body.started_on),
    finished_on: text(body.finished_on),
    near_completion: body.near_completion === true || body.near_completion === 'on' || body.near_completion === 1,
  };
  if (!KINDS.has(item.kind)) return { error: 'اختر نوعاً صحيحاً.' };
  if (!item.title || item.title.length > 200) return { error: 'العنوان مطلوب ولا يتجاوز ٢٠٠ حرف.' };
  if (!STATUSES.has(item.status)) return { error: 'اختر حالة صحيحة.' };
  if (item.creator.length > 200 || item.progress.length > 200 || item.tags.length > 300) {
    return { error: 'تحقق من طول اسم المؤلف أو التقدم أو الوسوم.' };
  }
  if (item.rating !== null && (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5)) {
    return { error: 'التقييم يجب أن يكون من ١ إلى ٥.' };
  }
  if (item.review.length > 5000 || item.notes.length > 10000) {
    return { error: 'المراجعة أو الملاحظات أطول من المسموح.' };
  }
  if (item.cover_image && !(
    /^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(item.cover_image)
    ||     /^https:\/\/(?:m\.media-amazon\.com\/images\/|covers\.openlibrary\.org\/|upload\.wikimedia\.org\/)/.test(item.cover_image)
  )) return { error: 'صورة الغلاف غير صالحة.' };
  if (!validDate(item.started_on) || !validDate(item.finished_on)) return { error: 'أدخل تاريخاً صحيحاً.' };
  if (item.started_on && item.finished_on && item.finished_on < item.started_on) {
    return { error: 'تاريخ الإنهاء لا يمكن أن يسبق تاريخ البداية.' };
  }
  return { item };
}

app.use((req, res, next) => {
  if (localOnly) {
    const host = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
    if (!localHostBindings.has(host)) return res.status(403).json({ error: 'التطبيق متاح على هذا الجهاز فقط.' });
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== String(req.headers.host || '').toLowerCase()) {
        return res.status(403).json({ error: 'مصدر الطلب غير مسموح.' });
      }
    } catch {
      return res.status(403).json({ error: 'مصدر الطلب غير صالح.' });
    }
  }
  next();
});
app.use(express.json({ limit: '32kb' }));

const ITEM_COLUMNS = 'id,kind,title,creator,status,progress,rating,review,notes,tags,cover_image,started_on,finished_on,near_completion,created_at,updated_at';
const getOwnedItem = db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE id=? AND user_id=? AND deleted_at IS NULL`);
const sessionDays = 30;
const backupRetention = 7;
const sessionCookie = 'personal_memo_session';
const sessionExpiry = () => new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString();
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const parseCookies = value => Object.fromEntries(String(value || '').split(';').map(part => {
  const separator = part.indexOf('=');
  return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
}).filter(([name]) => name));
const setSessionCookie = (res, token) => res.setHeader('Set-Cookie',
  `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionDays * 24 * 60 * 60}${process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
const clearSessionCookie = res => res.setHeader('Set-Cookie',
  `${sessionCookie}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

function createSession(userId, req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const existingToken = parseCookies(req.headers.cookie)[sessionCookie];
  if (existingToken && /^[a-f0-9]{64}$/.test(existingToken)) {
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(existingToken));
  }
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)')
    .run(hashToken(token), userId, sessionExpiry());
  setSessionCookie(res, token);
}

function authenticate(req, res, next) {
  const token = parseCookies(req.headers.cookie)[sessionCookie];
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const session = db.prepare(`SELECT users.id,users.username,sessions.expires_at
      FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=?`).get(hashToken(token));
    if (session && session.expires_at > now()) {
      req.user = { id: session.id, username: session.username };
      return next();
    }
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
  }
  res.status(401).json({ error: 'سجّل الدخول للمتابعة.' });
}

function requireOwnedItem(req, res, next) {
  const item = getOwnedItem.get(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'العنصر غير موجود.' });
  req.item = item;
  next();
}

function requireOwner(req, res, next) {
  const owner = db.prepare('SELECT is_owner FROM users WHERE id=?').get(req.user.id);
  if (!owner?.is_owner) return res.status(403).json({ error: 'إدارة النسخ الاحتياطية والتخزين السحابي متاحة لمالك التطبيق فقط.' });
  next();
}

class S3StorageError extends Error {
  constructor(cause) {
    super('تعذّر الاتصال بتخزين S3 أو رفع الملف.');
    this.name = 'S3StorageError';
    this.cause = cause;
  }
}

function getS3Settings() {
  const values = Object.fromEntries(db.prepare("SELECT key,value FROM application_settings WHERE key LIKE 's3_%'").all()
    .map(setting => [setting.key, setting.value]));
  return {
    enabled: values.s3_enabled === '1',
    bucket: values.s3_bucket || '',
    region: values.s3_region || 'us-east-1',
    prefix: values.s3_prefix || 'personal-memo',
  };
}

function validateS3Settings(value, allowEmptyBucket = false) {
  const bucket = text(value.bucket).trim();
  const region = text(value.region).trim();
  const prefix = text(value.prefix).trim().replace(/^\/+|\/+$/g, '');
  if ((!allowEmptyBucket || bucket) && (!/^(?=.{3,63}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/.test(bucket)
    || bucket.includes('..') || /\.-|-\.|\.\./.test(bucket))) {
    return { error: 'أدخل اسم حاوية S3 صالحاً (أحرف إنجليزية صغيرة وأرقام ونقاط وشرطات فقط).' };
  }
  if (!/^[a-z0-9-]{3,64}$/.test(region)) return { error: 'أدخل رمز منطقة AWS صالحاً مثل us-east-1.' };
  if (prefix.length > 200 || (prefix && !/^[A-Za-z0-9/_-]+$/.test(prefix)) || prefix.split('/').includes('..')) {
    return { error: 'بادئة المسار غير صالحة. استخدم أحرفاً وأرقاماً وشرطات وشرطة مائلة فقط.' };
  }
  return { bucket, region, prefix };
}

function s3Key(category, ...parts) {
  const { prefix } = getS3Settings();
  return [prefix, category, ...parts].filter(Boolean).join('/');
}

function createS3Client(region) {
  return new S3Client({ region, maxAttempts: 2 });
}

async function mirrorFileToS3(category, filePath, filename, contentType, ...keyParts) {
  const settings = getS3Settings();
  if (!settings.enabled) return;
  if (!settings.bucket || !settings.region) throw new S3StorageError(new Error('S3 settings are incomplete.'));
  try {
    const client = createS3Client(settings.region);
    await client.send(new PutObjectCommand({
      Bucket: settings.bucket,
      Key: s3Key(category, ...keyParts, filename),
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    }));
  } catch (error) {
    throw new S3StorageError(error);
  }
}

async function deleteS3Object(category, filename) {
  const settings = getS3Settings();
  if (!settings.bucket) return;
  try {
    const client = createS3Client(settings.region);
    await client.send(new DeleteObjectCommand({
      Bucket: settings.bucket,
      Key: s3Key(category, filename),
    }));
  } catch (error) {
    throw new S3StorageError(error);
  }
}

async function testS3Connection(settings) {
  const client = createS3Client(settings.region);
  const probeKey = [settings.prefix, '.connection-tests', crypto.randomUUID()].filter(Boolean).join('/');
  let probeUploaded = false;
  try {
    await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
    await client.send(new PutObjectCommand({
      Bucket: settings.bucket,
      Key: probeKey,
      Body: 'Personal Memo S3 connection test',
      ContentType: 'text/plain',
    }));
    probeUploaded = true;
    await client.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: probeKey }));
    probeUploaded = false;
  } catch (error) {
    if (probeUploaded) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: probeKey }));
      } catch (cleanupError) {
        console.error('Personal Memo S3 connection-test cleanup failed:', cleanupError.name);
      }
    }
    if (error.$metadata?.httpStatusCode === 404) {
      throw new Error('لم يتم العثور على الحاوية. تحقق من الاسم والمنطقة.');
    }
    throw new Error('فشل الاتصال. تحقق من الحاوية والمنطقة وبيانات اعتماد AWS وصلاحيات قراءة الحاوية ورفع الملفات وحذفها.');
  }
}

function backupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^personal-memo-\d{8}-\d{6}-\d{3}\.(?:sqlite|zip)$/.test(entry.name))
    .map(entry => {
      const stats = fs.statSync(path.join(BACKUP_DIR, entry.name));
      return { filename: entry.name, size: stats.size, createdAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function appendMediaDirectory(archive, directory, archivePrefix) {
  if (!fs.existsSync(directory)) return;
  const visit = (currentDirectory, relativeDirectory = '') => {
    for (const entry of fs.readdirSync(currentDirectory, { withFileTypes: true })) {
      const fullPath = path.join(currentDirectory, entry.name);
      const relativePath = path.posix.join(relativeDirectory.split(path.sep).join('/'), entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Media backup does not support symbolic links: ${fullPath}`);
      if (entry.isDirectory()) visit(fullPath, relativePath);
      else if (entry.isFile()) archive.file(fullPath, { name: path.posix.join(archivePrefix, relativePath) });
    }
  };
  visit(directory);
}

async function createCompleteBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '');
  const name = `personal-memo-${timestamp.slice(0, 8)}-${timestamp.slice(8, 14)}-${timestamp.slice(14, 17)}`;
  const databasePath = path.join(BACKUP_DIR, `${crypto.randomUUID()}.snapshot.sqlite`);
  const archivePath = path.join(BACKUP_DIR, `${name}.zip`);
  await db.backup(databasePath);
  try {
    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(archivePath, { flags: 'wx' });
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.once('close', resolve);
      output.once('error', reject);
      archive.once('error', reject);
      archive.once('warning', reject);
      archive.pipe(output);
      archive.file(databasePath, { name: 'memo.sqlite' });
      archive.append(JSON.stringify({ format: 'personal-memo-archive', version: 1 }), { name: 'manifest.json' });
      appendMediaDirectory(archive, UPLOAD_DIR, 'uploads');
      appendMediaDirectory(archive, AUDIO_DIR, 'audio');
      appendMediaDirectory(archive, CLUB_UPLOAD_DIR, 'club-uploads');
      archive.finalize().catch(reject);
    });
  } catch (error) {
    fs.rmSync(archivePath, { force: true });
    throw error;
  } finally {
    fs.rmSync(databasePath, { force: true });
    fs.rmSync(`${databasePath}-wal`, { force: true });
    fs.rmSync(`${databasePath}-shm`, { force: true });
  }
  const stats = fs.statSync(archivePath);
  await mirrorFileToS3('backups', archivePath, path.basename(archivePath), 'application/zip');
  const backups = backupFiles();
  const expiredBackups = backups.slice(backupRetention);
  await Promise.all(expiredBackups.map(backup => deleteS3Object('backups', backup.filename)));
  expiredBackups.forEach(backup => fs.rmSync(path.join(BACKUP_DIR, backup.filename), { force: true }));
  return { filename: path.basename(archivePath), size: stats.size, createdAt: stats.mtime.toISOString() };
}

function extractCompleteBackup(filePath, destination) {
  fs.mkdirSync(destination, { recursive: true });
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, decodeStrings: true, strictFileNames: true, validateEntrySizes: true }, (openError, zipFile) => {
      if (openError) return reject(new BackupValidationError('تعذّر قراءة ملف الأرشيف. اختر نسخة ZIP صالحة من مذكرتي.'));
      const paths = new Set();
      let fileCount = 0;
      let totalBytes = 0;
      let manifest;
      const fail = error => {
        zipFile.close();
        reject(error);
      };
      zipFile.once('end', () => {
        if (!paths.has('memo.sqlite') || manifest?.format !== 'personal-memo-archive' || manifest.version !== 1) {
          return reject(new BackupValidationError('الأرشيف غير مكتمل أو غير متوافق مع مذكرتي.'));
        }
        resolve(path.join(destination, 'memo.sqlite'));
      });
      zipFile.on('entry', entry => {
        (async () => {
          const entryName = entry.fileName;
          if (!entryName || entryName.includes('\\') || entryName.startsWith('/') || /^[A-Za-z]:/.test(entryName)
            || entryName.split('/').some(part => part === '..' || part === '.')) {
            throw new BackupValidationError('يحتوي الأرشيف على مسار ملف غير آمن.');
          }
          const isDirectory = entryName.endsWith('/');
          const normalized = isDirectory ? entryName.slice(0, -1) : entryName;
          if (paths.has(normalized)) throw new BackupValidationError('يحتوي الأرشيف على مسارات مكررة.');
          paths.add(normalized);
          const unixMode = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (unixMode === 0xa000) throw new BackupValidationError('لا يمكن استعادة روابط رمزية من الأرشيف.');
          const allowed = normalized === 'memo.sqlite' || normalized === 'manifest.json'
            || /^uploads\/[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(normalized)
            || /^audio\/\d+\/[a-f0-9-]+\.(?:mp3|m4a|wav|ogg|webm|flac|aac|audio)$/.test(normalized)
            || /^club-uploads\/\d+\/[a-f0-9-]+\.(?:jpg|png|webp|gif|pdf|txt|md|csv|json|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/.test(normalized);
          if (isDirectory) {
            if (!['uploads', 'audio', 'club-uploads'].includes(normalized)
              && !/^audio\/\d+$/.test(normalized) && !/^club-uploads\/\d+$/.test(normalized)) {
              throw new BackupValidationError('يحتوي الأرشيف على مسارات غير مدعومة.');
            }
          } else {
            fileCount += 1;
            totalBytes += entry.uncompressedSize;
            if (!allowed || fileCount > 10000 || totalBytes > 2 * 1024 * 1024 * 1024) {
              throw new BackupValidationError('الأرشيف يتجاوز حدود الملفات أو يحتوي على ملفات غير مدعومة.');
            }
            if ((normalized === 'memo.sqlite' && entry.uncompressedSize > 512 * 1024 * 1024)
                || (normalized === 'manifest.json' && entry.uncompressedSize > 4096)
                || (normalized.startsWith('uploads/') && entry.uncompressedSize > 5 * 1024 * 1024)
                || (normalized.startsWith('audio/') && entry.uncompressedSize > 100 * 1024 * 1024)
                || (normalized.startsWith('club-uploads/') && entry.uncompressedSize > 20 * 1024 * 1024)) {
              throw new BackupValidationError('حجم أحد ملفات الأرشيف يتجاوز الحد المسموح.');
            }
            const targetPath = path.resolve(destination, ...normalized.split('/'));
            if (!targetPath.startsWith(`${path.resolve(destination)}${path.sep}`)) {
              throw new BackupValidationError('يحتوي الأرشيف على مسار ملف غير آمن.');
            }
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            const input = await new Promise((resolveStream, rejectStream) => {
              zipFile.openReadStream(entry, (error, stream) => error ? rejectStream(error) : resolveStream(stream));
            });
            await require('node:stream/promises').pipeline(input, fs.createWriteStream(targetPath, { flags: 'wx' }));
            if (normalized === 'manifest.json') {
              try {
                manifest = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
              } catch {
                throw new BackupValidationError('ملف تعريف الأرشيف غير صالح.');
              }
            }
          }
          zipFile.readEntry();
        })().catch(fail);
      });
      zipFile.once('error', fail);
      zipFile.readEntry();
    });
  });
}

async function createDatabaseBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '');
  const filename = `personal-memo-${timestamp.slice(0, 8)}-${timestamp.slice(8, 14)}-${timestamp.slice(14, 17)}.sqlite`;
  const target = path.join(BACKUP_DIR, filename);
  await db.backup(target);
  await mirrorFileToS3('backups', target, filename, 'application/vnd.sqlite3');
  const backups = backupFiles();
  const expiredBackups = backups.slice(backupRetention);
  await Promise.all(expiredBackups.map(backup => deleteS3Object('backups', backup.filename)));
  expiredBackups.forEach(backup => fs.rmSync(path.join(BACKUP_DIR, backup.filename), { force: true }));
  const stats = fs.statSync(target);
  return { filename, size: stats.size, createdAt: stats.mtime.toISOString() };
}

let backupInProgress = null;
let backupTimer;
function createBackupOnce() {
  if (!backupInProgress) {
    backupInProgress = createCompleteBackup().finally(() => { backupInProgress = null; });
  }
  return backupInProgress;
}

const restoreTables = [
  'users',
  'application_settings',
  'life_areas',
  'goals',
  'projects',
  'items',
  'progress_events',
  'chapters',
  'image_attachments',
  'audio_attachments',
  'user_preferences',
  'todos',
  'saved_articles',
  'calendar_events',
  'habits',
  'habit_logs',
  'routines',
  'routine_logs',
  'book_clubs',
  'book_club_members',
  'book_club_invites',
  'book_club_books',
  'book_club_progress',
  'book_club_messages',
  'book_club_meetings',
  'book_club_message_attachments',
  'book_club_message_links',
  'book_club_notifications',
];

class BackupValidationError extends Error {}

function validateBackupDatabase(filePath) {
  let source;
  try {
    source = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrity = source.pragma('integrity_check');
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new BackupValidationError('الملف لا يجتاز فحص سلامة SQLite.');
    }
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (!tables.has('users') || !tables.has('items')) {
      throw new BackupValidationError('الملف ليس نسخة احتياطية متوافقة مع مذكرتي.');
    }
    const usersColumns = new Set(source.prepare('PRAGMA table_info(users)').all().map(column => column.name));
    const itemColumns = new Set(source.prepare('PRAGMA table_info(items)').all().map(column => column.name));
    if (!['id', 'username', 'password_salt', 'password_hash', 'created_at', 'is_owner'].every(name => usersColumns.has(name))
      || !['id', 'user_id', 'kind', 'title', 'status', 'created_at', 'updated_at'].every(name => itemColumns.has(name))) {
      throw new BackupValidationError('نسخة قاعدة البيانات أقدم من أن تُستعاد مباشرة.');
    }
    if (!source.prepare('SELECT id FROM users WHERE is_owner=1 LIMIT 1').get()) {
      throw new BackupValidationError('النسخة لا تحتوي على مالك للتطبيق.');
    }
    if (source.pragma('foreign_key_check').length) {
      throw new BackupValidationError('النسخة تحتوي على روابط بيانات غير صالحة.');
    }
    return { source, tables };
  } catch (error) {
    if (source) source.close();
    if (error instanceof BackupValidationError) throw error;
    throw new BackupValidationError('تعذّر قراءة نسخة SQLite. تأكد من اختيار ملف قاعدة بيانات صالح.');
  }
}

function restoreDatabaseFrom(filePath, sourceTables) {
  db.prepare('ATTACH DATABASE ? AS uploaded_backup').run(filePath);
  try {
    const restore = db.transaction(() => {
      const currentTables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
      const deleteOrder = ['sessions', 'progress_events', 'chapters', 'audio_attachments', 'image_attachments',
        'habit_logs', 'routine_logs', 'todos', 'calendar_events', 'saved_articles', 'routines', 'habits',
        'book_club_message_attachments', 'book_club_message_links', 'book_club_notifications',
        'book_club_meetings', 'book_club_messages', 'book_club_progress', 'book_club_books',
        'book_club_invites', 'book_club_members', 'book_clubs', 'items', 'projects', 'goals', 'life_areas',
        'undo_trash', 'user_preferences', 'users', 'application_settings'];
      deleteOrder.filter(name => currentTables.has(name)).forEach(name => db.exec(`DELETE FROM main."${name}"`));

      restoreTables.forEach(name => {
        if (!sourceTables.has(name) || !currentTables.has(name)) return;
        const targetColumns = new Set(db.prepare(`PRAGMA main.table_info("${name}")`).all().map(column => column.name));
        const sourceColumns = new Set(db.prepare(`PRAGMA uploaded_backup.table_info("${name}")`).all().map(column => column.name));
        const columns = [...targetColumns].filter(column => sourceColumns.has(column));
        if (!columns.length) return;
        const columnList = columns.map(column => `"${column}"`).join(',');
        db.exec(`INSERT INTO main."${name}" (${columnList}) SELECT ${columnList} FROM uploaded_backup."${name}"`);
      });

      db.prepare("INSERT OR IGNORE INTO application_settings(key,value) VALUES ('daily_backup_enabled','1')").run();
      if (!db.prepare('SELECT id FROM users WHERE is_owner=1 LIMIT 1').get()) {
        throw new BackupValidationError('النسخة لا تحتوي على مالك للتطبيق.');
      }

      if (db.pragma('foreign_key_check').length) throw new Error('تعذّرت استعادة العلاقات بين بيانات النسخة.');
    });
    restore();
  } finally {
    db.prepare('DETACH DATABASE uploaded_backup').run();
  }
}

function swapRestoredMedia(stagedDirectory, destinationDirectory) {
  const parent = path.dirname(destinationDirectory);
  fs.mkdirSync(parent, { recursive: true });
  const suffix = crypto.randomUUID();
  const nextDirectory = path.join(parent, `.${path.basename(destinationDirectory)}-restore-${suffix}`);
  const previousDirectory = path.join(parent, `.${path.basename(destinationDirectory)}-previous-${suffix}`);
  fs.cpSync(stagedDirectory, nextDirectory, { recursive: true, errorOnExist: true });
  let movedPrevious = false;
  try {
    if (fs.existsSync(destinationDirectory)) {
      fs.renameSync(destinationDirectory, previousDirectory);
      movedPrevious = true;
    }
    fs.renameSync(nextDirectory, destinationDirectory);
    return {
      commit() {
        if (movedPrevious) {
          try {
            fs.rmSync(previousDirectory, { recursive: true, force: true });
          } catch (error) {
            console.error('Personal Memo could not remove replaced media directory:', error);
          }
        }
      },
      rollback() {
        fs.rmSync(destinationDirectory, { recursive: true, force: true });
        if (movedPrevious && fs.existsSync(previousDirectory)) fs.renameSync(previousDirectory, destinationDirectory);
        fs.rmSync(nextDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    fs.rmSync(nextDirectory, { recursive: true, force: true });
    if (movedPrevious && !fs.existsSync(destinationDirectory)) fs.renameSync(previousDirectory, destinationDirectory);
    throw error;
  }
}

function scheduleDailyBackup(delay = 60 * 60 * 1000) {
  clearTimeout(backupTimer);
  const enabled = db.prepare("SELECT value FROM application_settings WHERE key='daily_backup_enabled'").get()?.value === '1';
  if (!enabled) return;
  backupTimer = setTimeout(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const hasBackupToday = backupFiles().some(backup =>
        backup.filename.startsWith(`personal-memo-${today}-`) && backup.filename.endsWith('.zip'));
      if (!hasBackupToday) await createBackupOnce();
    } catch (error) {
      console.error('Personal Memo daily database backup failed:', error);
    } finally {
      scheduleDailyBackup();
    }
  }, delay);
  backupTimer.unref();
}

app.use('/api', createAuthRouter({
  db, text, now, hashPassword, hashToken, parseCookies, sessionCookie, createSession, authenticate,
  clearSessionCookie, scheduleDailyBackup, uploadDir: UPLOAD_DIR,
}));
app.use('/api', authenticate);

const ownedArea = db.prepare('SELECT id FROM life_areas WHERE id=? AND user_id=?');
const ownedGoal = db.prepare('SELECT id,area_id FROM goals WHERE id=? AND user_id=?');
const ownedProject = db.prepare('SELECT id,area_id,goal_id,status FROM projects WHERE id=? AND user_id=?');

function validateArea(body) {
  const name = text(body?.name);
  const color = text(body?.color || '#397e75');
  if (!name || name.length > 80) return { error: 'اسم مجال الحياة مطلوب (حتى ٨٠ حرفاً).' };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'اختر لوناً صالحاً للمجال.' };
  return { area: { name, color } };
}

function validateGoal(body, userId) {
  const title = text(body?.title);
  const description = text(body?.description);
  const status = text(body?.status || 'active');
  const targetDate = text(body?.target_date);
  const areaId = body?.area_id === '' || body?.area_id == null ? null : Number(body.area_id);
  if (!title || title.length > 200 || description.length > 2000) return { error: 'عنوان الهدف مطلوب (حتى ٢٠٠ حرف) ووصفه حتى ٢٠٠٠ حرف.' };
  if (!['active', 'planned', 'completed'].includes(status) || !validDate(targetDate)) return { error: 'تحقق من حالة الهدف وتاريخه.' };
  if (areaId !== null && (!Number.isSafeInteger(areaId) || !ownedArea.get(areaId, userId))) return { error: 'اختر مجالاً من حسابك.' };
  return { goal: { title, description, status, target_date: targetDate || null, area_id: areaId } };
}

function validateProject(body, userId) {
  const title = text(body?.title);
  const description = text(body?.description);
  const nextAction = text(body?.next_action);
  const status = text(body?.status || 'active');
  const dueDate = text(body?.due_date);
  const areaId = body?.area_id === '' || body?.area_id == null ? null : Number(body.area_id);
  const goalId = body?.goal_id === '' || body?.goal_id == null ? null : Number(body.goal_id);
  if (!title || title.length > 200 || description.length > 2000 || nextAction.length > 300) {
    return { error: 'عنوان المشروع مطلوب (حتى ٢٠٠ حرف)، والوصف حتى ٢٠٠٠، والخطوة التالية حتى ٣٠٠ حرف.' };
  }
  if (!['active', 'on_hold', 'completed'].includes(status) || !validDate(dueDate)) return { error: 'تحقق من حالة المشروع وتاريخه.' };
  const area = areaId === null ? null : Number.isSafeInteger(areaId) && ownedArea.get(areaId, userId);
  const goal = goalId === null ? null : Number.isSafeInteger(goalId) && ownedGoal.get(goalId, userId);
  if (areaId !== null && !area || goalId !== null && !goal) return { error: 'اختر مجالاً أو هدفاً من حسابك.' };
  if (goal && areaId !== null && goal.area_id !== null && goal.area_id !== areaId) {
    return { error: 'يجب أن يتبع الهدف والمشروع مجال الحياة نفسه.' };
  }
  return { project: { title, description, next_action: nextAction, status, due_date: dueDate || null, area_id: areaId, goal_id: goalId } };
}

function validateTodo(body, userId) {
  const title = text(body?.title);
  const notes = text(body?.notes);
  const dueDate = text(body?.due_date);
  const dueTime = text(body?.due_time);
  const recurrence = text(body?.recurrence || 'none');
  const completed = body?.completed === true || body?.completed === 'on' || body?.completed === 1;
  const projectId = body?.project_id === '' || body?.project_id == null ? null : Number(body.project_id);
  if (!title || title.length > 200 || notes.length > 2000) {
    return { error: 'عنوان المهمة مطلوب (حتى ٢٠٠ حرف)، والملاحظات حتى ٢٠٠٠ حرف.' };
  }
  if (!validDate(dueDate)) return { error: 'أدخل تاريخ استحقاق صحيحاً.' };
  if (dueTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return { error: 'أدخل وقتاً صحيحاً بصيغة ٢٤ ساعة.' };
  if (!['none', 'daily', 'weekly', 'monthly'].includes(recurrence)) return { error: 'اختر تكراراً صحيحاً للمهمة.' };
  if ((dueTime || recurrence !== 'none') && !dueDate) return { error: 'أدخل تاريخ الاستحقاق لاستخدام الوقت أو التكرار.' };
  if (projectId !== null && (!Number.isSafeInteger(projectId)
    || !db.prepare("SELECT id FROM projects WHERE id=? AND user_id=? AND status<>'completed'").get(projectId, userId))) {
    return { error: 'اختر مشروعاً نشطاً من مشاريع حسابك.' };
  }
  return {
    todo: {
      title,
      notes,
      due_date: dueDate || null,
      due_time: dueTime || null,
      recurrence,
      completed,
      project_id: projectId,
    },
  };
}

function nextDueDate(dueDate, recurrence) {
  const [year, month, day] = dueDate.split('-').map(Number);
  if (recurrence === 'daily') return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  if (recurrence === 'weekly') return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
  if (recurrence === 'monthly') {
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), Math.min(day, lastDay)))
      .toISOString().slice(0, 10);
  }
  throw new Error(`Unsupported recurrence: ${recurrence}`);
}

function validateArticle(body) {
  const article = {
    title: text(body?.title),
    url: text(body?.url),
    description: text(body?.description),
    excerpt: text(body?.excerpt),
    review: text(body?.review),
    status: text(body?.status || 'unread'),
  };
  if (!article.title || article.title.length > 300) return { error: 'عنوان الرابط مطلوب ولا يتجاوز ٣٠٠ حرف.' };
  if (article.url.length > 2048) return { error: 'الرابط أطول من المسموح.' };
  try {
    const parsed = new URL(article.url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid URL');
  } catch {
    return { error: 'أدخل رابط صفحة صحيحاً يبدأ بـ http أو https.' };
  }
  if (article.description.length > 2000 || article.excerpt.length > 5000 || article.review.length > 10000) {
    return { error: 'الوصف حتى ٢٠٠٠ حرف، والمقتطف ٥٠٠٠، والمراجعة ١٠٠٠٠ حرف.' };
  }
  if (!['unread', 'reading', 'read'].includes(article.status)) return { error: 'اختر حالة قراءة صحيحة.' };
  return { article };
}

function validateBookmark(body) {
  const bookmark = {
    title: text(body?.title),
    url: text(body?.url),
    note: text(body?.note),
    image_url: text(body?.image_url),
  };
  if (!bookmark.title || bookmark.title.length > 300) return { error: 'عنوان الرابط مطلوب ولا يتجاوز ٣٠٠ حرف.' };
  if (bookmark.url.length > 2048) return { error: 'الرابط أطول من المسموح.' };
  try {
    const parsed = new URL(bookmark.url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('invalid URL');
  } catch {
    return { error: 'أدخل رابطاً صحيحاً يبدأ بـ http أو https.' };
  }
  if (bookmark.note.length > 2000) return { error: 'الملاحظة لا تتجاوز ٢٠٠٠ حرف.' };
  if (bookmark.image_url && !/^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(bookmark.image_url)) {
    return { error: 'اختر صورة معاينة صالحة.' };
  }
  return { bookmark };
}

function createUndoableDelete(recordType, table, id, userId, res) {
  const record = db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=? AND deleted_at IS NULL`).get(id, userId);
  if (!record) return res.status(404).json({ error: 'العنصر غير موجود.' });
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM undo_trash WHERE expires_at<=?').run(now());
    db.prepare(`INSERT INTO undo_trash(token,user_id,record_type,record_id,record_json,expires_at)
      VALUES (?,?,?,?,?,?)`).run(token, userId, recordType, record.id, JSON.stringify(record), expiresAt);
    db.prepare(`UPDATE ${table} SET deleted_at=? WHERE id=? AND user_id=?`).run(now(), record.id, userId);
  })();
  res.json({ ok: true, undoToken: token, expiresAt });
}


const supportedImages = {
  'image/jpeg': { extension: 'jpg', matches: data => data.length > 2 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff },
  'image/png': { extension: 'png', matches: data => data.length > 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extension: 'webp', matches: data => data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' },
  'image/gif': { extension: 'gif', matches: data => data.length > 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)) },
};

async function saveImageBuffer(userId, mime, buffer) {
  const signature = supportedImages[mime];
  if (!signature || !Buffer.isBuffer(buffer) || buffer.length > 5 * 1024 * 1024 || !signature.matches(buffer)) {
    throw new Error('اختر صورة JPG أو PNG أو WebP أو GIF صالحة لا تتجاوز ٥ ميغابايت.');
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `${crypto.randomUUID()}.${signature.extension}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, buffer, { flag: 'wx' });
  try {
    await mirrorFileToS3('media', filePath, filename, mime, String(userId), 'images');
    db.prepare('INSERT INTO image_attachments(filename,user_id,created_at) VALUES (?,?,?)')
      .run(filename, userId, now());
  } catch (error) {
    fs.rmSync(filePath, { force: true });
    if (getS3Settings().enabled) {
      try {
        await deleteS3Object('media', `${userId}/images/${filename}`);
      } catch (cleanupError) {
        console.error('Personal Memo S3 image cleanup failed:', cleanupError.name);
      }
    }
    throw error;
  }
  return `/uploads/${filename}`;
}

function isPublicAddress(address) {
  if (net.isIPv4(address)) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    const third = octets[2];
    return !(first === 0 || first === 10 || first === 127 || first >= 224
      || first === 100 && second >= 64 && second <= 127
      || first === 169 && second === 254
      || first === 172 && second >= 16 && second <= 31
      || first === 192 && (second === 168 || second === 0 || second === 2 || second === 88 && third === 99)
      || first === 198 && (second === 18 || second === 19 || second === 51)
      || first === 203 && second === 0 && octets[2] === 113);
  }
  if (net.isIPv6(address)) {
    let normalized = address.toLowerCase();
    const ipv4Tail = normalized.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (ipv4Tail) {
      const octets = ipv4Tail[1].split('.').map(Number);
      if (octets.some(octet => octet > 255)) return false;
      const high = ((octets[0] << 8) | octets[1]).toString(16);
      const low = ((octets[2] << 8) | octets[3]).toString(16);
      normalized = `${normalized.slice(0, -ipv4Tail[1].length)}${high}:${low}`;
    }
    const halves = normalized.split('::');
    if (halves.length > 2) return false;
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (halves.length === 1 && missing !== 0)) return false;
    const groups = [...left, ...Array(missing).fill('0'), ...right];
    if (groups.some(group => !/^[a-f0-9]{1,4}$/.test(group))) return false;
    const value = BigInt(`0x${groups.join('').padStart(32, '0')}`);
    if (value >> 32n === 0xffffn) {
      const ipv4 = Number(value & 0xffffffffn);
      return isPublicAddress(`${ipv4 >>> 24}.${(ipv4 >>> 16) & 255}.${(ipv4 >>> 8) & 255}.${ipv4 & 255}`);
    }
    const globalUnicast = value >> 125n === 1n;
    const special2001 = value >> 105n === BigInt('0x2001') * 128n;
    const documentation = value >> 96n === 0x20010db8n;
    const sixToFour = value >> 112n === 0x2002n;
    const documentationV6 = value >> 108n === 0x3fff0n;
    const nat64WellKnown = value >> 32n === 0x64ff9b00000000n;
    const nat64Local = value >> 80n === 0x64ff9b000001n;
    return globalUnicast && !special2001 && !documentation && !sixToFour
      && !documentationV6 && !nat64WellKnown && !nat64Local;
  }
  return false;
}

async function fetchPublicResource(input, maxBytes, redirects = 3) {
  const url = new URL(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('لا يمكن جلب بيانات هذا العنوان بأمان.');
  }
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await dns.promises.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
    throw new Error('عنوان الموقع يشير إلى شبكة خاصة ولا يمكن جلبه.');
  }
  const pinnedAddress = addresses[0];
  const transport = url.protocol === 'https:' ? https : http;
  const response = await new Promise((resolve, reject) => {
    const request = transport.get(url, {
      headers: { 'User-Agent': 'PersonalMemo/1.0 (+link preview)', Accept: 'text/html,image/*;q=0.9,*/*;q=0.5' },
      lookup(hostname, options, callback) {
        if (hostname.replace(/^\[|\]$/g, '') !== url.hostname.replace(/^\[|\]$/g, '')) {
          return callback(new Error('Unexpected hostname during link preview.'));
        }
        callback(null, pinnedAddress.address, pinnedAddress.family);
      },
    }, result => {
      const status = result.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && result.headers.location) {
        result.resume();
        return resolve({ redirect: new URL(result.headers.location, url).href });
      }
      if (status < 200 || status >= 300) {
        result.resume();
        return reject(new Error(`تعذّر قراءة الصفحة (HTTP ${status}).`));
      }
      const chunks = [];
      let size = 0;
      result.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          request.destroy(new Error('حجم محتوى المعاينة أكبر من الحد المسموح.'));
          return;
        }
        chunks.push(chunk);
      });
      result.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        contentType: String(result.headers['content-type'] || '').split(';')[0].toLowerCase(),
        url: url.href,
      }));
      result.on('error', reject);
    });
    const deadline = setTimeout(() => request.destroy(new Error('انتهت مهلة تحميل معاينة الرابط.')), 12000);
    deadline.unref();
    request.once('close', () => clearTimeout(deadline));
    request.setTimeout(6000, () => request.destroy(new Error('انتهت مهلة تحميل معاينة الرابط.')));
    request.on('error', reject);
  });
  if (response.redirect) {
    if (redirects <= 0) throw new Error('تجاوز الرابط عدد التحويلات المسموح.');
    return fetchPublicResource(response.redirect, maxBytes, redirects - 1);
  }
  return response;
}

function htmlAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function decodeHtmlText(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity) => {
    const normalized = entity.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'nbsp') return ' ';
    const codepoint = normalized.startsWith('#x') ? Number.parseInt(normalized.slice(2), 16) : Number(normalized.slice(1));
    return Number.isFinite(codepoint) && codepoint <= 0x10ffff ? String.fromCodePoint(codepoint) : match;
  });
}

registerApiRoutes(app, {
  planning: { db, now, validateArea, validateGoal, validateProject, ownedArea, ownedGoal, ownedProject },
  activity: { db, now, text, localToday, localTime, validDate },
  tasks: { db, now, validateTodo, nextDueDate, createUndoableDelete },
  notes: {
    db,
    validateArticle,
    validateBookmark,
    createUndoableDelete,
    text,
    now,
    localToday,
    validDate,
    path,
    saveImageBuffer,
    deleteS3Object,
    fs,
    uploadDir: UPLOAD_DIR,
    S3StorageError,
    getS3Settings,
  },
  bookClubs: {
    db,
    text,
    now,
    hashToken,
    localToday,
    localTime,
    validDate,
    mirrorFileToS3,
    deleteS3Object,
    clubUploadDir: CLUB_UPLOAD_DIR,
  },
  management: {
    db,
    text,
    now,
    requireOwner,
    getS3Settings,
    backupFiles,
    backupRetention,
    validateS3Settings,
    testS3Connection,
    scheduleDailyBackup,
    clearBackupTimer: () => clearTimeout(backupTimer),
    createBackupOnce,
    S3StorageError,
    backupDir: BACKUP_DIR,
    uploadDir: UPLOAD_DIR,
    audioDir: AUDIO_DIR,
    clubUploadDir: CLUB_UPLOAD_DIR,
    isBackupInProgress: () => Boolean(backupInProgress),
    extractCompleteBackup,
    validateBackupDatabase,
    BackupValidationError,
    restoreDatabaseFrom,
    swapRestoredMedia,
    clearSessionCookie,
  },
  discovery: { text, fetchPublicResource, htmlAttribute, decodeHtmlText, supportedImages, saveImageBuffer },
  media: {
    db,
    authenticate,
    requireOwnedItem,
    now,
    mirrorFileToS3,
    getS3Settings,
    deleteS3Object,
    S3StorageError,
    saveImageBuffer,
    uploadDir: UPLOAD_DIR,
    audioDir: AUDIO_DIR,
  },
  library: { db, KINDS, ITEM_COLUMNS, getOwnedItem, validateItem, text, now, createUndoableDelete },
  itemPage: { authenticate, getOwnedItem, publicDirectory: path.join(__dirname, 'public') },
});

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));
app.use((error, req, res, next) => {
  console.error('Personal Memo request failed:', error);
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large' || error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'حجم الطلب أو الملف يتجاوز الحد المسموح.' });
  }
  res.status(500).json({ error: 'حدث خطأ غير متوقع. راجع نافذة تشغيل التطبيق.' });
});

let server;
if (require.main === module) {
  server = app.listen(PORT, HOST, () => {
    console.log(`Personal Memo is running at http://${HOST}:${PORT}`);
    console.log(`Your data is stored in ${DB_PATH}`);
    if (db.prepare('SELECT EXISTS(SELECT 1 FROM users WHERE is_owner=1) AS value').get().value) {
      scheduleDailyBackup(1000);
    }
  });
  server.on('error', error => {
    console.error(`Unable to start Personal Memo on ${HOST}:${PORT}:`, error.message);
    process.exitCode = 1;
  });
}

function close() {
  if (!server) return;
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
if (require.main === module) {
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

module.exports = { app, db };
