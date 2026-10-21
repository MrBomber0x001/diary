const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');

function createAuthRouter({
  db,
  text,
  now,
  hashPassword,
  hashToken,
  parseCookies,
  sessionCookie,
  createSession,
  authenticate,
  clearSessionCookie,
  scheduleDailyBackup,
  uploadDir,
}) {
  const router = express.Router();

  router.get('/auth/status', (req, res) => {
    res.json({ hasUsers: db.prepare('SELECT EXISTS(SELECT 1 FROM users) AS value').get().value === 1 });
  });

  router.get('/auth/me', authenticate, (req, res) => {
    const user = db.prepare('SELECT id,username,is_owner FROM users WHERE id=?').get(req.user.id);
    res.json({ user: { id: user.id, username: user.username, isOwner: Boolean(user.is_owner) } });
  });

  router.post('/auth/register', (req, res) => {
    const username = text(req.body?.username).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون ٣ إلى ٣٢ حرفاً إنجليزياً أو رقماً أو _.' });
    }
    if (password.length < 12 || password.length > 256) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تحتوي على ١٢ حرفاً على الأقل.' });
    }
    try {
      const { salt, hash } = hashPassword(password);
      const create = db.transaction(() => {
        const isFirstUser = db.prepare('SELECT count(*) AS count FROM users').get().count === 0;
        const result = db.prepare('INSERT INTO users(username,password_salt,password_hash,created_at,is_owner) VALUES (?,?,?,?,?)')
          .run(username, salt, hash, now(), isFirstUser ? 1 : 0);
        if (isFirstUser) {
          db.prepare('UPDATE items SET user_id=? WHERE user_id IS NULL').run(result.lastInsertRowid);
          const legacyImages = fs.existsSync(uploadDir)
            ? fs.readdirSync(uploadDir, { withFileTypes: true })
              .filter(entry => entry.isFile() && /^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(entry.name))
              .map(entry => entry.name)
            : [];
          const attachImage = db.prepare('INSERT OR IGNORE INTO image_attachments(filename,user_id,created_at) VALUES (?,?,?)');
          legacyImages.forEach(filename => attachImage.run(filename, result.lastInsertRowid, now()));
        }
        return result.lastInsertRowid;
      });
      const userId = create();
      createSession(userId, req, res);
      const user = db.prepare('SELECT id,username,is_owner FROM users WHERE id=?').get(userId);
      if (user.is_owner) scheduleDailyBackup(1000);
      res.status(201).json({ user: { id: user.id, username: user.username, isOwner: Boolean(user.is_owner) } });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'اسم المستخدم مستخدم بالفعل.' });
      throw error;
    }
  });

  router.post('/auth/login', (req, res) => {
    const username = text(req.body?.username).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length > 256) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
    const user = db.prepare('SELECT id,username,password_salt,password_hash FROM users WHERE username=?').get(username);
    const supplied = hashPassword(password, user?.password_salt || 'invalid-user-salt');
    const expected = user ? Buffer.from(user.password_hash, 'hex') : Buffer.alloc(64);
    const actual = Buffer.from(supplied.hash, 'hex');
    if (!user || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
    }
    createSession(user.id, req, res);
    const account = db.prepare('SELECT is_owner FROM users WHERE id=?').get(user.id);
    if (account.is_owner) scheduleDailyBackup(1000);
    res.json({ user: { id: user.id, username: user.username, isOwner: Boolean(account.is_owner) } });
  });

  router.post('/auth/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[sessionCookie];
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  return router;
}

module.exports = createAuthRouter;
