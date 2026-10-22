const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const fileTypes = new Map([
  ['.pdf', ['application/pdf', 'pdf']],
  ['.txt', ['text/plain', 'txt']],
  ['.md', ['text/markdown', 'md']],
  ['.csv', ['text/csv', 'csv']],
  ['.json', ['application/json', 'json']],
  ['.png', ['image/png', 'png']],
  ['.jpg', ['image/jpeg', 'jpg']],
  ['.jpeg', ['image/jpeg', 'jpg']],
  ['.webp', ['image/webp', 'webp']],
  ['.gif', ['image/gif', 'gif']],
  ['.doc', ['application/msword', 'doc']],
  ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx']],
  ['.xls', ['application/vnd.ms-excel', 'xls']],
  ['.xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx']],
  ['.ppt', ['application/vnd.ms-powerpoint', 'ppt']],
  ['.pptx', ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx']],
  ['.odt', ['application/vnd.oasis.opendocument.text', 'odt']],
  ['.ods', ['application/vnd.oasis.opendocument.spreadsheet', 'ods']],
  ['.odp', ['application/vnd.oasis.opendocument.presentation', 'odp']],
]);

function createLearningRouter({ db, text, now, fs, path, crypto, multer, learningUploadDir }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination(req, file, callback) {
        const directory = path.join(learningUploadDir, String(req.user.id));
        fs.mkdirSync(directory, { recursive: true });
        callback(null, directory);
      },
      filename(req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, `${crypto.randomUUID()}.${fileTypes.get(extension)[1]}`);
      },
    }),
    limits: { fileSize: 20 * 1024 * 1024, files: 8 },
    fileFilter(req, file, callback) {
      const type = fileTypes.get(path.extname(file.originalname).toLowerCase());
      callback(type ? null : new Error('نوع الملف غير مدعوم. استخدم PDF أو مستنداً أو صورة أو ملفاً نصياً.'), Boolean(type));
    },
  });

  function getTopic(id, userId) {
    return db.prepare('SELECT id,user_id,title,description,status,created_at,updated_at FROM learning_topics WHERE id=? AND user_id=?')
      .get(id, userId);
  }

  function getNote(id, userId) {
    return db.prepare(`SELECT n.id,n.topic_id,n.user_id,n.title,n.body,n.created_at,n.updated_at
      FROM learning_notes n JOIN learning_topics t ON t.id=n.topic_id
      WHERE n.id=? AND n.user_id=? AND t.user_id=?`).get(id, userId, userId);
  }

  function validTopic(body) {
    const topic = {
      title: text(body?.title),
      description: text(body?.description),
      status: text(body?.status || 'exploring'),
    };
    if (!topic.title || topic.title.length > 160 || topic.description.length > 2000
      || !['exploring', 'learning', 'reviewed'].includes(topic.status)) {
      return { error: 'أدخل عنواناً للموضوع (حتى ١٦٠ حرفاً)، ووصفاً حتى ٢٠٠٠ حرف، وحالة صحيحة.' };
    }
    return { topic };
  }

  function validNote(body) {
    const note = { title: text(body?.title), body: typeof body?.body === 'string' ? body.body : '' };
    if (!note.title || note.title.length > 200 || note.body.length > 50000) {
      return { error: 'عنوان الملاحظة مطلوب (حتى ٢٠٠ حرف)، والمحتوى حتى ٥٠٠٠٠ حرف.' };
    }
    return { note };
  }

  router.get('/learning/topics', (req, res) => {
    res.json(db.prepare(`SELECT t.id,t.title,t.description,t.status,t.created_at,t.updated_at,
        (SELECT COUNT(*) FROM learning_notes n WHERE n.topic_id=t.id) AS note_count,
        (SELECT COUNT(*) FROM learning_files f JOIN learning_notes n ON n.id=f.note_id WHERE n.topic_id=t.id) AS file_count
      FROM learning_topics t WHERE t.user_id=? ORDER BY t.updated_at DESC,t.id DESC`).all(req.user.id));
  });

  router.post('/learning/topics', (req, res) => {
    const { topic, error } = validTopic(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO learning_topics(user_id,title,description,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`).run(req.user.id, topic.title, topic.description, topic.status, timestamp, timestamp);
    res.status(201).json(getTopic(result.lastInsertRowid, req.user.id));
  });

  router.get('/learning/topics/:id', (req, res) => {
    const topic = getTopic(req.params.id, req.user.id);
    if (!topic) return res.status(404).json({ error: 'الموضوع غير موجود.' });
    const notes = db.prepare(`SELECT id,topic_id,title,body,created_at,updated_at FROM learning_notes
      WHERE topic_id=? AND user_id=? ORDER BY updated_at DESC,id DESC`).all(topic.id, req.user.id);
    const files = db.prepare(`SELECT f.id,f.note_id,f.display_name,f.content_type,f.size,f.created_at
      FROM learning_files f JOIN learning_notes n ON n.id=f.note_id
      WHERE n.topic_id=? AND f.user_id=? ORDER BY f.created_at,f.id`).all(topic.id, req.user.id);
    notes.forEach(note => {
      note.files = files.filter(file => file.note_id === note.id)
        .map(file => ({ ...file, url: `/api/learning/files/${file.id}` }));
    });
    res.json({ ...topic, notes });
  });

  router.put('/learning/topics/:id', (req, res) => {
    const existing = getTopic(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'الموضوع غير موجود.' });
    const { topic, error } = validTopic(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE learning_topics SET title=?,description=?,status=?,updated_at=? WHERE id=? AND user_id=?')
      .run(topic.title, topic.description, topic.status, now(), existing.id, req.user.id);
    res.json(getTopic(existing.id, req.user.id));
  });

  router.delete('/learning/topics/:id', (req, res) => {
    const topic = getTopic(req.params.id, req.user.id);
    if (!topic) return res.status(404).json({ error: 'الموضوع غير موجود.' });
    const files = db.prepare(`SELECT filename FROM learning_files WHERE user_id=? AND note_id IN
      (SELECT id FROM learning_notes WHERE topic_id=?)`).all(req.user.id, topic.id);
    db.prepare('DELETE FROM learning_topics WHERE id=? AND user_id=?').run(topic.id, req.user.id);
    files.forEach(file => fs.rmSync(path.join(learningUploadDir, String(req.user.id), file.filename), { force: true }));
    res.json({ ok: true });
  });

  router.post('/learning/topics/:id/notes', (req, res) => {
    const topic = getTopic(req.params.id, req.user.id);
    if (!topic) return res.status(404).json({ error: 'الموضوع غير موجود.' });
    const { note, error } = validNote(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO learning_notes(topic_id,user_id,title,body,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`).run(topic.id, req.user.id, note.title, note.body, timestamp, timestamp);
    db.prepare('UPDATE learning_topics SET updated_at=? WHERE id=?').run(timestamp, topic.id);
    res.status(201).json({ id: result.lastInsertRowid, topic_id: topic.id, ...note, created_at: timestamp, updated_at: timestamp, files: [] });
  });

  router.put('/learning/notes/:id', (req, res) => {
    const existing = getNote(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'الملاحظة غير موجودة.' });
    const { note, error } = validNote(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    db.prepare('UPDATE learning_notes SET title=?,body=?,updated_at=? WHERE id=? AND user_id=?')
      .run(note.title, note.body, timestamp, existing.id, req.user.id);
    db.prepare('UPDATE learning_topics SET updated_at=? WHERE id=?').run(timestamp, existing.topic_id);
    res.json({ ...existing, ...note, updated_at: timestamp });
  });

  router.delete('/learning/notes/:id', (req, res) => {
    const note = getNote(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'الملاحظة غير موجودة.' });
    const files = db.prepare('SELECT filename FROM learning_files WHERE note_id=? AND user_id=?').all(note.id, req.user.id);
    db.prepare('DELETE FROM learning_notes WHERE id=? AND user_id=?').run(note.id, req.user.id);
    files.forEach(file => fs.rmSync(path.join(learningUploadDir, String(req.user.id), file.filename), { force: true }));
    db.prepare('UPDATE learning_topics SET updated_at=? WHERE id=?').run(now(), note.topic_id);
    res.json({ ok: true });
  });

  router.post('/learning/notes/:id/files', (req, res, next) => {
    upload.array('files', 8)(req, res, error => {
      if (error) {
        const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({
          error: error.code === 'LIMIT_FILE_SIZE' ? 'حجم الملف يتجاوز الحد المسموح (٢٠ ميغابايت).' : error.message,
        });
      }
      next();
    });
  }, (req, res) => {
    const note = getNote(req.params.id, req.user.id);
    const uploaded = req.files || [];
    if (!note) {
      uploaded.forEach(file => fs.rmSync(file.path, { force: true }));
      return res.status(404).json({ error: 'الملاحظة غير موجودة.' });
    }
    if (!uploaded.length) return res.status(400).json({ error: 'اختر ملفاً واحداً على الأقل.' });
    const timestamp = now();
    const insert = db.transaction(() => uploaded.map(file => {
      const extension = path.extname(file.originalname).toLowerCase();
      const [contentType] = fileTypes.get(extension);
      const displayName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200)
        || `attachment.${path.extname(file.filename)}`;
      const result = db.prepare(`INSERT INTO learning_files(note_id,user_id,filename,display_name,content_type,size,created_at)
        VALUES (?,?,?,?,?,?,?)`).run(note.id, req.user.id, file.filename, displayName, contentType, file.size, timestamp);
      return { id: result.lastInsertRowid, note_id: note.id, display_name: displayName, content_type: contentType,
        size: file.size, created_at: timestamp, url: `/api/learning/files/${result.lastInsertRowid}` };
    }));
    try {
      const records = insert();
      db.prepare('UPDATE learning_topics SET updated_at=? WHERE id=?').run(timestamp, note.topic_id);
      res.status(201).json(records);
    } catch (error) {
      uploaded.forEach(file => fs.rmSync(file.path, { force: true }));
      return next(error);
    }
  });

  router.get('/learning/files/:id', (req, res, next) => {
    const file = db.prepare('SELECT * FROM learning_files WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!file) return res.status(404).json({ error: 'الملف غير موجود.' });
    const filePath = path.join(learningUploadDir, String(req.user.id), file.filename);
    res.download(filePath, file.display_name, { headers: { 'X-Content-Type-Options': 'nosniff' } }, error => {
      if (error && !res.headersSent) next(error);
    });
  });

  router.delete('/learning/files/:id', (req, res) => {
    const file = db.prepare('SELECT * FROM learning_files WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!file) return res.status(404).json({ error: 'الملف غير موجود.' });
    db.prepare('DELETE FROM learning_files WHERE id=? AND user_id=?').run(file.id, req.user.id);
    fs.rmSync(path.join(learningUploadDir, String(req.user.id), file.filename), { force: true });
    res.json({ ok: true });
  });

  return router;
}

module.exports = createLearningRouter;
