import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { seed } from './domain.mjs';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS businesses(id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS professionals(id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','professional','client')),
      professional_id TEXT UNIQUE REFERENCES professionals(id), client_id TEXT UNIQUE REFERENCES clients(id),
      must_change INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      CHECK((role='admin' AND professional_id IS NULL AND client_id IS NULL) OR
        (role='professional' AND professional_id IS NOT NULL AND client_id IS NULL) OR
        (role='client' AND client_id IS NOT NULL AND professional_id IS NULL)));
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_attempts(bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, until_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS appointments(
      id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
      clientId TEXT NOT NULL REFERENCES clients(id), professionalId TEXT NOT NULL REFERENCES professionals(id),
      serviceId TEXT NOT NULL REFERENCES services(id), date TEXT NOT NULL, start TEXT NOT NULL,
      start_min INTEGER NOT NULL, end_min INTEGER NOT NULL,
      duration INTEGER NOT NULL CHECK(duration>0), gap INTEGER NOT NULL CHECK(gap>=0), price REAL NOT NULL CHECK(price>=0),
      status TEXT NOT NULL CHECK(status IN ('pending','confirmed','cancelled')), late INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS appointment_schedule ON appointments(business_id,professionalId,date,status);
    CREATE TABLE IF NOT EXISTS waitlist(id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, business_id TEXT NOT NULL, user_id TEXT NOT NULL, action TEXT NOT NULL, target TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TRIGGER IF NOT EXISTS prevent_overlap_insert BEFORE INSERT ON appointments WHEN NEW.status!='cancelled'
    BEGIN SELECT RAISE(ABORT,'appointment_overlap') WHERE EXISTS(SELECT 1 FROM appointments a WHERE a.id!=NEW.id AND a.business_id=NEW.business_id AND a.professionalId=NEW.professionalId AND a.date=NEW.date AND a.status!='cancelled' AND a.start_min<NEW.end_min AND NEW.start_min<a.end_min); END;
    CREATE TRIGGER IF NOT EXISTS prevent_overlap_update BEFORE UPDATE ON appointments WHEN NEW.status!='cancelled'
    BEGIN SELECT RAISE(ABORT,'appointment_overlap') WHERE EXISTS(SELECT 1 FROM appointments a WHERE a.id!=NEW.id AND a.business_id=NEW.business_id AND a.professionalId=NEW.professionalId AND a.date=NEW.date AND a.status!='cancelled' AND a.start_min<NEW.end_min AND NEW.start_min<a.end_min); END;
    CREATE TABLE IF NOT EXISTS whatsapp_settings(business_id TEXT PRIMARY KEY REFERENCES businesses(id),data TEXT NOT NULL,verified_fingerprint TEXT,verified_at TEXT);
    CREATE TABLE IF NOT EXISTS whatsapp_outbox(
      id TEXT PRIMARY KEY,business_id TEXT NOT NULL REFERENCES businesses(id),client_id TEXT NOT NULL REFERENCES clients(id),
      appointment_id TEXT REFERENCES appointments(id),kind TEXT NOT NULL CHECK(kind IN ('booking','reminder','birthday')),
      dedupe_key TEXT NOT NULL UNIQUE,snapshot TEXT NOT NULL,recipient TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',provider_id TEXT UNIQUE,attempts INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,error TEXT,action_requested TEXT);
    CREATE INDEX IF NOT EXISTS whatsapp_due ON whatsapp_outbox(state,next_at);
    CREATE TABLE IF NOT EXISTS whatsapp_inbound(id TEXT PRIMARY KEY,received_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS whatsapp_receipts(provider_id TEXT NOT NULL,status TEXT NOT NULL,recipient TEXT NOT NULL,at INTEGER NOT NULL,error_code TEXT,PRIMARY KEY(provider_id,status));
    PRAGMA user_version=2;`);
  if (!db.prepare('SELECT id FROM businesses WHERE id=?').get('main')) {
    db.prepare('INSERT INTO businesses(id,data) VALUES(?,?)').run('main', JSON.stringify({ ...seed().business, timezone: 'America/Fortaleza' }));
  }
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function readState(db, businessId) {
  const business = db.prepare('SELECT data,revision FROM businesses WHERE id=?').get(businessId);
  const state = { business: JSON.parse(business.data), revision: business.revision };
  for (const table of ['clients', 'professionals', 'services', 'waitlist']) {
    state[table] = db.prepare(`SELECT data FROM ${table} WHERE business_id=? ORDER BY rowid`).all(businessId).map(row => JSON.parse(row.data));
  }
  state.appointments = db.prepare('SELECT id,clientId,professionalId,serviceId,date,start,duration,gap,price,status,late FROM appointments WHERE business_id=? ORDER BY date,start').all(businessId).map(a => ({ ...a, late: Boolean(a.late) }));
  return state;
}

export function writeAppointment(db, businessId, a) {
  const [h, m] = a.start.split(':').map(Number), start = h * 60 + m;
  db.prepare(`INSERT INTO appointments(id,business_id,clientId,professionalId,serviceId,date,start,start_min,end_min,duration,gap,price,status,late)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET clientId=excluded.clientId, professionalId=excluded.professionalId,
    serviceId=excluded.serviceId,date=excluded.date,start=excluded.start,start_min=excluded.start_min,end_min=excluded.end_min,
    duration=excluded.duration,gap=excluded.gap,price=excluded.price,status=excluded.status,late=excluded.late`)
    .run(a.id,businessId,a.clientId,a.professionalId,a.serviceId,a.date,a.start,start,start+a.duration+a.gap,a.duration,a.gap,a.price,a.status,a.late?1:0);
}

export function audit(db, user, action, target = '') {
  db.prepare('UPDATE businesses SET revision=revision+1 WHERE id=?').run(user.business_id);
  db.prepare('INSERT INTO audit(business_id,user_id,action,target) VALUES(?,?,?,?)').run(user.business_id,user.id,action,target);
}
