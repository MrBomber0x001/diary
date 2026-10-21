const express = require('express');

function createNotesRouter({
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
  uploadDir,
  S3StorageError,
  getS3Settings,
}) {
  const router = express.Router();

  router.get('/articles', (req, res) => {
    res.json(db.prepare(`SELECT id,title,url,description,excerpt,review,status,created_at,updated_at FROM saved_articles
      WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC`).all(req.user.id));
  });

  router.post('/articles', (req, res) => {
    const { article, error } = validateArticle(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO saved_articles(user_id,title,url,description,excerpt,review,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.user.id, article.title, article.url, article.description, article.excerpt,
      article.review, article.status, timestamp, timestamp);
    res.status(201).json(db.prepare(`SELECT id,title,url,description,excerpt,review,status,created_at,updated_at
      FROM saved_articles WHERE id=?`).get(result.lastInsertRowid));
  });

  router.put('/articles/:id', (req, res) => {
    const existing = db.prepare('SELECT id FROM saved_articles WHERE id=? AND user_id=? AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'المقال غير موجود.' });
    const { article, error } = validateArticle(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE saved_articles SET title=?,url=?,description=?,excerpt=?,review=?,status=?,updated_at=?
      WHERE id=? AND user_id=?`).run(article.title, article.url, article.description, article.excerpt,
      article.review, article.status, now(), existing.id, req.user.id);
    res.json(db.prepare(`SELECT id,title,url,description,excerpt,review,status,created_at,updated_at
      FROM saved_articles WHERE id=?`).get(existing.id));
  });

  router.delete('/articles/:id', (req, res) => {
    createUndoableDelete('article', 'saved_articles', req.params.id, req.user.id, res);
  });

  router.get('/bookmarks', (req, res) => {
    res.json(db.prepare(`SELECT id,title,url,note,image_url,created_at,updated_at FROM bookmarks
      WHERE user_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC`).all(req.user.id));
  });

  router.post('/bookmarks', (req, res) => {
    const { bookmark, error } = validateBookmark(req.body);
    if (error) return res.status(400).json({ error });
    if (bookmark.image_url && !db.prepare('SELECT 1 FROM image_attachments WHERE filename=? AND user_id=?').get(
      path.basename(bookmark.image_url), req.user.id,
    )) return res.status(400).json({ error: 'صورة المعاينة غير موجودة في حسابك.' });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO bookmarks(user_id,title,url,note,image_url,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(req.user.id, bookmark.title, bookmark.url, bookmark.note, bookmark.image_url, timestamp, timestamp);
    res.status(201).json(db.prepare(`SELECT id,title,url,note,image_url,created_at,updated_at FROM bookmarks WHERE id=?`)
      .get(result.lastInsertRowid));
  });

  router.put('/bookmarks/:id', (req, res) => {
    const existing = db.prepare('SELECT id FROM bookmarks WHERE id=? AND user_id=? AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'الرابط المحفوظ غير موجود.' });
    const { bookmark, error } = validateBookmark(req.body);
    if (error) return res.status(400).json({ error });
    if (bookmark.image_url && !db.prepare('SELECT 1 FROM image_attachments WHERE filename=? AND user_id=?').get(
      path.basename(bookmark.image_url), req.user.id,
    )) return res.status(400).json({ error: 'صورة المعاينة غير موجودة في حسابك.' });
    db.prepare('UPDATE bookmarks SET title=?,url=?,note=?,image_url=?,updated_at=? WHERE id=? AND user_id=?')
      .run(bookmark.title, bookmark.url, bookmark.note, bookmark.image_url, now(), existing.id, req.user.id);
    res.json(db.prepare(`SELECT id,title,url,note,image_url,created_at,updated_at FROM bookmarks WHERE id=?`).get(existing.id));
  });

  router.delete('/bookmarks/:id', (req, res) => {
    createUndoableDelete('bookmark', 'bookmarks', req.params.id, req.user.id, res);
  });

  router.get('/daily-notes', (req, res) => {
    const date = text(req.query.date || localToday());
    if (!validDate(date)) return res.status(400).json({ error: 'اختر تاريخاً صحيحاً للمذكرة.' });
    const note = db.prepare(`SELECT id,note_date,title,body,created_at,updated_at FROM daily_notes
      WHERE user_id=? AND note_date=?`).get(req.user.id, date);
    res.json(note || { id: null, note_date: date, title: '', body: '', created_at: null, updated_at: null });
  });

  router.put('/daily-notes/:date', (req, res) => {
    const date = text(req.params.date);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body : '';
    if (!validDate(date) || title.length > 200 || body.length > 50000) {
      return res.status(400).json({ error: 'تحقق من التاريخ والعنوان (حتى ٢٠٠ حرف) ومحتوى المذكرة (حتى ٥٠٠٠٠ حرف).' });
    }
    const timestamp = now();
    db.prepare(`INSERT INTO daily_notes(user_id,note_date,title,body,created_at,updated_at)
      VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,note_date) DO UPDATE SET
      title=excluded.title,body=excluded.body,updated_at=excluded.updated_at`)
      .run(req.user.id, date, title, body, timestamp, timestamp);
    res.json(db.prepare(`SELECT id,note_date,title,body,created_at,updated_at FROM daily_notes
      WHERE user_id=? AND note_date=?`).get(req.user.id, date));
  });

  router.get('/note-index', (req, res) => {
    const notes = db.prepare(`SELECT id,'item' AS type,title,NULL AS note_date
      FROM items WHERE user_id=? AND deleted_at IS NULL
      UNION ALL
      SELECT id,'daily-note' AS type,COALESCE(NULLIF(title,''),note_date) AS title,note_date
      FROM daily_notes WHERE user_id=?
      ORDER BY title COLLATE NOCASE LIMIT 1000`).all(req.user.id, req.user.id);
    res.json(notes);
  });

  router.get('/backlinks/:type/:id', (req, res) => {
    const { type } = req.params;
    const id = text(req.params.id);
    let marker;
    let target;
    if (type === 'item' && /^\d+$/.test(id)) {
      target = db.prepare(`SELECT id,title FROM items WHERE id=? AND user_id=? AND deleted_at IS NULL`).get(id, req.user.id);
      marker = `[[item:${id}|`;
    } else if (type === 'daily-note' && validDate(id)) {
      target = db.prepare(`SELECT id,COALESCE(NULLIF(title,''),note_date) AS title,note_date
        FROM daily_notes WHERE user_id=? AND note_date=?`).get(req.user.id, id);
      marker = `[[daily:${id}|`;
    } else {
      return res.status(400).json({ error: 'نوع أو معرّف الرابط الداخلي غير صالح.' });
    }
    if (!target) return res.status(404).json({ error: 'الملاحظة المرتبطة غير موجودة.' });
    const itemsBacklinks = db.prepare(`SELECT DISTINCT i.id,'item' AS type,i.title,NULL AS note_date
      FROM items i WHERE i.user_id=? AND i.deleted_at IS NULL AND (?<0 OR i.id<>?)
        AND (instr(i.notes,?)>0 OR instr(i.review,?)>0)
      ORDER BY i.updated_at DESC LIMIT 100`).all(
      req.user.id, type === 'item' ? target.id : -1, type === 'item' ? target.id : -1, marker, marker,
    );
    const dailyBacklinks = db.prepare(`SELECT DISTINCT d.id,'daily-note' AS type,
        COALESCE(NULLIF(d.title,''),d.note_date) AS title,d.note_date
      FROM daily_notes d WHERE d.user_id=? AND d.note_date<>? AND instr(d.body,?)>0
      ORDER BY d.note_date DESC LIMIT 100`).all(req.user.id, type === 'daily-note' ? id : '', marker);
    const articleBacklinks = db.prepare(`SELECT DISTINCT a.id,'article' AS type,a.title,NULL AS note_date,a.url
      FROM saved_articles a WHERE a.user_id=? AND a.deleted_at IS NULL
        AND (instr(a.review,?)>0 OR instr(a.excerpt,?)>0 OR instr(a.description,?)>0)
      ORDER BY a.updated_at DESC LIMIT 100`).all(req.user.id, marker, marker, marker);
    const bookmarkBacklinks = db.prepare(`SELECT DISTINCT b.id,'bookmark' AS type,b.title,NULL AS note_date,b.url
      FROM bookmarks b WHERE b.user_id=? AND b.deleted_at IS NULL AND instr(b.note,?)>0
      ORDER BY b.updated_at DESC LIMIT 100`).all(req.user.id, marker);
    res.json([...itemsBacklinks, ...dailyBacklinks, ...articleBacklinks, ...bookmarkBacklinks]);
  });

  const pinnedEntityTables = new Map([
    ['item', { table: 'items', active: 'deleted_at IS NULL' }],
    ['article', { table: 'saved_articles', active: 'deleted_at IS NULL' }],
    ['bookmark', { table: 'bookmarks', active: 'deleted_at IS NULL' }],
    ['daily-note', { table: 'daily_notes', active: '1=1' }],
  ]);

  router.get('/pins', (req, res) => {
    const rows = db.prepare(`SELECT p.entity_type,p.entity_id,p.created_at,
        CASE p.entity_type
          WHEN 'item' THEN (SELECT title FROM items WHERE id=p.entity_id)
          WHEN 'article' THEN (SELECT title FROM saved_articles WHERE id=p.entity_id)
          WHEN 'bookmark' THEN (SELECT title FROM bookmarks WHERE id=p.entity_id)
          WHEN 'daily-note' THEN (SELECT COALESCE(NULLIF(title,''),note_date) FROM daily_notes WHERE id=p.entity_id)
        END AS title,
        CASE p.entity_type
          WHEN 'article' THEN (SELECT url FROM saved_articles WHERE id=p.entity_id)
          WHEN 'bookmark' THEN (SELECT url FROM bookmarks WHERE id=p.entity_id)
          WHEN 'daily-note' THEN (SELECT note_date FROM daily_notes WHERE id=p.entity_id)
        END AS target
      FROM pinned_entries p
      WHERE p.user_id=? AND (
        p.entity_type='item' AND EXISTS(SELECT 1 FROM items WHERE id=p.entity_id AND user_id=p.user_id AND deleted_at IS NULL)
        OR p.entity_type='article' AND EXISTS(SELECT 1 FROM saved_articles WHERE id=p.entity_id AND user_id=p.user_id AND deleted_at IS NULL)
        OR p.entity_type='bookmark' AND EXISTS(SELECT 1 FROM bookmarks WHERE id=p.entity_id AND user_id=p.user_id AND deleted_at IS NULL)
        OR p.entity_type='daily-note' AND EXISTS(SELECT 1 FROM daily_notes WHERE id=p.entity_id AND user_id=p.user_id)
      ) ORDER BY p.created_at DESC,p.id DESC`).all(req.user.id);
    res.json(rows);
  });

  router.put('/pins/:type/:id', (req, res) => {
    const entityType = text(req.params.type);
    const entity = pinnedEntityTables.get(entityType);
    const entityId = Number(req.params.id);
    const pinned = req.body?.pinned;
    if (!entity || !Number.isSafeInteger(entityId) || entityId < 1 || typeof pinned !== 'boolean') {
      return res.status(400).json({ error: 'تحقق من نوع العنصر وحالته.' });
    }
    const exists = db.prepare(`SELECT id FROM ${entity.table} WHERE id=? AND user_id=? AND ${entity.active}`)
      .get(entityId, req.user.id);
    if (!exists) return res.status(404).json({ error: 'العنصر غير موجود في حسابك.' });
    if (pinned) {
      db.prepare('INSERT OR IGNORE INTO pinned_entries(user_id,entity_type,entity_id,created_at) VALUES (?,?,?,?)')
        .run(req.user.id, entityType, entityId, now());
    } else {
      db.prepare('DELETE FROM pinned_entries WHERE user_id=? AND entity_type=? AND entity_id=?')
        .run(req.user.id, entityType, entityId);
    }
    res.json({ ok: true, pinned });
  });

  router.get('/gallery', (req, res) => {
    res.json(db.prepare(`SELECT id,filename,category,caption,created_at FROM gallery_images
      WHERE user_id=? ORDER BY created_at DESC,id DESC`).all(req.user.id)
      .map(image => ({ ...image, url: `/uploads/${image.filename}` })));
  });

  router.post('/gallery', express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    limit: '5mb',
  }), async (req, res, next) => {
    let category;
    let caption;
    try {
      category = decodeURIComponent(String(req.headers['x-image-category'] || encodeURIComponent('شخصي'))).trim();
      caption = decodeURIComponent(String(req.headers['x-image-caption'] || '')).trim();
    } catch {
      return res.status(400).json({ error: 'ترميز التصنيف أو وصف الصورة غير صالح.' });
    }
    if (!category || category.length > 40 || caption.length > 200) {
      return res.status(400).json({ error: 'أدخل تصنيفاً (حتى ٤٠ حرفاً) ووصفاً (حتى ٢٠٠ حرف) صالحين.' });
    }
    const mime = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    let url;
    try {
      url = await saveImageBuffer(req.user.id, mime, req.body);
      const filename = path.basename(url);
      const createdAt = now();
      const result = db.prepare(`INSERT INTO gallery_images(user_id,filename,category,caption,created_at)
        VALUES (?,?,?,?,?)`).run(req.user.id, filename, category, caption, createdAt);
      res.status(201).json({
        id: result.lastInsertRowid,
        filename,
        category,
        caption,
        url,
        created_at: createdAt,
      });
    } catch (error) {
      if (url) {
        const filename = path.basename(url);
        try {
          if (getS3Settings().enabled) {
            await deleteS3Object('media', `${req.user.id}/images/${filename}`);
          }
        } catch (cleanupError) {
          console.error('Personal Memo gallery upload cleanup failed:', cleanupError.name);
        }
        db.prepare('DELETE FROM image_attachments WHERE filename=? AND user_id=?').run(filename, req.user.id);
        fs.rmSync(path.join(uploadDir, filename), { force: true });
      }
      if (error.message.startsWith('اختر صورة')) return res.status(400).json({ error: error.message });
      if (error instanceof S3StorageError) {
        return res.status(502).json({ error: 'تعذّر رفع الصورة إلى التخزين؛ لم تتم إضافتها.' });
      }
      return next(error);
    }
  });

  router.delete('/gallery/:id', (req, res) => {
    const image = db.prepare('SELECT id FROM gallery_images WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!image) return res.status(404).json({ error: 'الصورة غير موجودة في المعرض.' });
    db.prepare('DELETE FROM gallery_images WHERE id=?').run(image.id);
    res.json({ ok: true });
  });

  return router;
}

module.exports = createNotesRouter;
