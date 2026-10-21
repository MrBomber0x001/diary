const express = require('express');

function createLibraryRouter({ db, KINDS, ITEM_COLUMNS, getOwnedItem, validateItem, text, now, createUndoableDelete }) {
  const router = express.Router();
  router.get('/items', (req, res) => {
    const kind = String(req.query.kind || '');
    if (kind && kind !== 'all' && !KINDS.has(kind)) return res.status(400).json({ error: 'نوع العنصر غير صحيح.' });
    const rows = kind && kind !== 'all'
      ? db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE kind=? AND user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC`).all(kind, req.user.id)
      : db.prepare(`SELECT ${ITEM_COLUMNS} FROM items WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC`).all(req.user.id);
    res.json(rows);
  });

  router.get('/items/:id', (req, res) => {
    const item = getOwnedItem.get(req.params.id, req.user.id);
    item ? res.json(item) : res.status(404).json({ error: 'العنصر غير موجود.' });
  });

  router.post('/items', (req, res) => {
    const { item, error } = validateItem(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const create = db.transaction(() => {
      const result = db.prepare(`INSERT INTO items
        (kind,title,creator,status,progress,rating,review,notes,tags,cover_image,started_on,finished_on,near_completion,created_at,updated_at,user_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        item.kind, item.title, item.creator, item.status, item.progress, item.rating,
        item.review, item.notes, item.tags, item.cover_image, item.started_on || null, item.finished_on || null,
        Number(item.near_completion), timestamp, timestamp, req.user.id,
      );
      if (item.progress) {
        db.prepare('INSERT INTO progress_events(item_id,progress,note,logged_at) VALUES (?,?,?,?)')
          .run(result.lastInsertRowid, item.progress, 'بداية التتبع', timestamp);
      }
      return result.lastInsertRowid;
    });
    res.status(201).json(getOwnedItem.get(create(), req.user.id));
  });

  router.put('/items/:id', (req, res) => {
    const existing = getOwnedItem.get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'العنصر غير موجود.' });
    const { item, error } = validateItem(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const update = db.transaction(() => {
      db.prepare(`UPDATE items SET kind=?,title=?,creator=?,status=?,progress=?,rating=?,review=?,notes=?,tags=?,cover_image=?,
        started_on=?,finished_on=?,near_completion=?,updated_at=? WHERE id=? AND user_id=?`).run(
        item.kind, item.title, item.creator, item.status, item.progress, item.rating, item.review,
        item.notes, item.tags, item.cover_image, item.started_on || null, item.finished_on || null,
        Number(item.near_completion), timestamp, existing.id, req.user.id,
      );
      if (item.progress !== existing.progress && item.progress) {
        db.prepare('INSERT INTO progress_events(item_id,progress,note,logged_at) VALUES (?,?,?,?)')
          .run(existing.id, item.progress, 'تحديث التقدم', timestamp);
      }
    });
    update();
    res.json(getOwnedItem.get(existing.id, req.user.id));
  });

  router.get('/items/:id/progress', (req, res) => {
    if (!getOwnedItem.get(req.params.id, req.user.id)) return res.status(404).json({ error: 'العنصر غير موجود.' });
    res.json(db.prepare('SELECT * FROM progress_events WHERE item_id=? ORDER BY logged_at DESC,id DESC').all(req.params.id));
  });

  router.get('/items/:id/chapters', (req, res) => {
    const item = getOwnedItem.get(req.params.id, req.user.id);
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود.' });
    if (item.kind !== 'book') return res.status(400).json({ error: 'الفصول متاحة للكتب فقط.' });
    res.json(db.prepare('SELECT * FROM chapters WHERE item_id=? ORDER BY position,id').all(item.id));
  });

  router.post('/items/:id/chapters', (req, res) => {
    const item = getOwnedItem.get(req.params.id, req.user.id);
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود.' });
    if (item.kind !== 'book') return res.status(400).json({ error: 'الفصول متاحة للكتب فقط.' });
    const title = text(req.body.title);
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
    if (!title || title.length > 200 || notes.length > 10000) {
      return res.status(400).json({ error: 'عنوان الفصل مطلوب (حتى ٢٠٠ حرف)، والملاحظات حتى ١٠٠٠٠ حرف.' });
    }
    const timestamp = now();
    const position = db.prepare('SELECT COALESCE(MAX(position),0)+1 AS next FROM chapters WHERE item_id=?').get(item.id).next;
    const result = db.prepare(`INSERT INTO chapters(item_id,title,notes,position,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`).run(item.id, title, notes, position, timestamp, timestamp);
    db.prepare('UPDATE items SET updated_at=? WHERE id=?').run(timestamp, item.id);
    res.status(201).json(db.prepare('SELECT * FROM chapters WHERE id=?').get(result.lastInsertRowid));
  });

  router.put('/items/:id/chapters/:chapterId', (req, res) => {
    const item = getOwnedItem.get(req.params.id, req.user.id);
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود.' });
    if (item.kind !== 'book') return res.status(400).json({ error: 'الفصول متاحة للكتب فقط.' });
    const chapter = db.prepare('SELECT * FROM chapters WHERE id=? AND item_id=?').get(req.params.chapterId, item.id);
    if (!chapter) return res.status(404).json({ error: 'الفصل غير موجود.' });
    const title = text(req.body.title);
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
    if (!title || title.length > 200 || notes.length > 10000) {
      return res.status(400).json({ error: 'عنوان الفصل مطلوب (حتى ٢٠٠ حرف)، والملاحظات حتى ١٠٠٠٠ حرف.' });
    }
    const timestamp = now();
    db.prepare('UPDATE chapters SET title=?,notes=?,updated_at=? WHERE id=?').run(title, notes, timestamp, chapter.id);
    db.prepare('UPDATE items SET updated_at=? WHERE id=?').run(timestamp, item.id);
    res.json(db.prepare('SELECT * FROM chapters WHERE id=?').get(chapter.id));
  });

  router.delete('/items/:id/chapters/:chapterId', (req, res) => {
    const item = getOwnedItem.get(req.params.id, req.user.id);
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود.' });
    const result = db.prepare('DELETE FROM chapters WHERE id=? AND item_id=?').run(req.params.chapterId, item.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'الفصل غير موجود.' });
  });

  router.post('/items/:id/progress', (req, res) => {
    const item = getOwnedItem.get(req.params.id, req.user.id);
    if (!item) return res.status(404).json({ error: 'العنصر غير موجود.' });
    const progress = text(req.body.progress), note = text(req.body.note);
    if (!progress || progress.length > 200 || note.length > 1000) {
      return res.status(400).json({ error: 'أدخل تحديث تقدم (حتى ٢٠٠ حرف) وملاحظة لا تتجاوز ١٠٠٠ حرف.' });
    }
    const timestamp = now();
    const addProgress = db.transaction(() => {
      db.prepare('INSERT INTO progress_events(item_id,progress,note,logged_at) VALUES (?,?,?,?)')
        .run(item.id, progress, note, timestamp);
      db.prepare(`UPDATE items SET progress=?,status=CASE WHEN status='planned' THEN 'in_progress' ELSE status END,
        updated_at=? WHERE id=?`).run(progress, timestamp, item.id);
    });
    addProgress();
    res.status(201).json({ ok: true });
  });

  router.delete('/items/:id', (req, res) => {
    createUndoableDelete('item', 'items', req.params.id, req.user.id, res);
  });

  return router;
}

module.exports = createLibraryRouter;
