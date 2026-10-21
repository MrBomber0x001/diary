const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function createMediaRouter({ db, authenticate, requireOwnedItem, now, mirrorFileToS3, getS3Settings, deleteS3Object,
  S3StorageError, saveImageBuffer, uploadDir, audioDir }) {
  const router = express.Router();
    const uploadsRouter = express.Router();
  router.post('/images', express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    limit: '5mb',
  }), async (req, res, next) => {
    const mime = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    try {
      const url = await saveImageBuffer(req.user.id, mime, req.body);
      res.status(201).json({ url });
    } catch (error) {
      if (error.message.startsWith('اختر صورة')) return res.status(400).json({ error: error.message });
      if (error instanceof S3StorageError) {
        return res.status(502).json({ error: 'تعذّر رفع الصورة إلى S3؛ لم تتم إضافتها. تحقق من إعداد التخزين وصلاحيات AWS.' });
      }
      return next(error);
    }
  });

  const audioTypes = new Map([
    ['audio/mpeg', 'mp3'],
    ['audio/mp4', 'm4a'],
    ['audio/x-m4a', 'm4a'],
    ['audio/wav', 'wav'],
    ['audio/x-wav', 'wav'],
    ['audio/wave', 'wav'],
    ['audio/ogg', 'ogg'],
    ['audio/webm', 'webm'],
    ['audio/flac', 'flac'],
    ['audio/aac', 'aac'],
  ]);
  const uploadAudio = multer({
    storage: multer.diskStorage({
      destination(req, file, callback) {
        const directory = path.join(audioDir, String(req.user.id));
        fs.mkdirSync(directory, { recursive: true });
        callback(null, directory);
      },
      filename(req, file, callback) {
        callback(null, `${crypto.randomUUID()}.${audioTypes.get(file.mimetype) || 'audio'}`);
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024, files: 10 },
    fileFilter(req, file, callback) {
      callback(audioTypes.has(file.mimetype) ? null : new Error('صيغة الصوت غير مدعومة. استخدم MP3 أو M4A أو WAV أو OGG أو WebM أو FLAC أو AAC.'), audioTypes.has(file.mimetype));
    },
  });

  function validAudioFile(file) {
    const descriptor = fs.openSync(file.path, 'r');
    try {
      const header = Buffer.alloc(16);
      const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
      const data = header.subarray(0, bytesRead);
      if (file.mimetype === 'audio/mpeg') return data.toString('ascii', 0, 3) === 'ID3' || (data.length > 1 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
      if (file.mimetype === 'audio/mp4' || file.mimetype === 'audio/x-m4a') return data.length >= 8 && data.toString('ascii', 4, 8) === 'ftyp';
      if (['audio/wav', 'audio/x-wav', 'audio/wave'].includes(file.mimetype)) return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE';
      if (file.mimetype === 'audio/ogg') return data.toString('ascii', 0, 4) === 'OggS';
      if (file.mimetype === 'audio/webm') return data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
      if (file.mimetype === 'audio/flac') return data.toString('ascii', 0, 4) === 'fLaC';
      if (file.mimetype === 'audio/aac') return data.length > 1 && data[0] === 0xff && (data[1] & 0xf6) === 0xf0;
      return false;
    } finally {
      fs.closeSync(descriptor);
    }
  }

  const audioUploadResponse = (req, res, next) => uploadAudio.array('audioFiles', 10)(req, res, error => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : error.code === 'LIMIT_FILE_COUNT' ? 400 : 400;
    res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'حجم الملف يتجاوز الحد المسموح (١٠٠ ميغابايت).' : error.message });
  });

  uploadsRouter.get('/uploads/:filename', authenticate, (req, res, next) => {
    if (!/^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(req.params.filename)) {
      return res.status(404).json({ error: 'الصورة غير موجودة.' });
    }
    const image = db.prepare('SELECT filename FROM image_attachments WHERE filename=? AND user_id=?')
      .get(req.params.filename, req.user.id);
    if (!image) return res.status(404).json({ error: 'الصورة غير موجودة.' });
    res.sendFile(path.join(uploadDir, image.filename), { headers: { 'X-Content-Type-Options': 'nosniff' } }, next);
  });

  router.post('/items/:id/audio', requireOwnedItem, audioUploadResponse, async (req, res, next) => {
    const files = req.files || [];
    let validFiles;
    try {
      validFiles = files.every(validAudioFile);
    } catch (error) {
      files.forEach(file => fs.rmSync(file.path, { force: true }));
      return res.status(500).json({ error: 'تعذّر التحقق من الملفات الصوتية.' });
    }
    if (!validFiles) {
      files.forEach(file => fs.rmSync(file.path, { force: true }));
      return res.status(400).json({ error: 'تعذّر التحقق من صيغة أحد الملفات الصوتية.' });
    }
    try {
      await Promise.all(files.map(file => mirrorFileToS3(
        'media', file.path, file.filename, file.mimetype, String(req.user.id), 'audio',
      )));
      const insert = db.transaction(() => files.map(file => {
        const displayName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200) || `audio.${audioTypes.get(file.mimetype)}`;
        const result = db.prepare(`INSERT INTO audio_attachments
          (item_id,user_id,filename,display_name,content_type,size,created_at) VALUES (?,?,?,?,?,?,?)`)
          .run(req.item.id, req.user.id, file.filename, displayName, file.mimetype, file.size, now());
        return {
          id: result.lastInsertRowid,
          display_name: displayName,
          content_type: file.mimetype,
          size: file.size,
          url: `/api/audio/${result.lastInsertRowid}`,
        };
      }));
      res.status(201).json(insert());
    } catch (error) {
      files.forEach(file => fs.rmSync(file.path, { force: true }));
      if (getS3Settings().enabled) {
        const cleanup = await Promise.allSettled(files.map(file => deleteS3Object(
          'media', `${req.user.id}/audio/${file.filename}`,
        )));
        cleanup.filter(result => result.status === 'rejected')
          .forEach(result => console.error('Personal Memo S3 audio cleanup failed:', result.reason?.name || 'unknown error'));
      }
      if (error instanceof S3StorageError) {
        return res.status(502).json({ error: 'تعذّر رفع الملفات الصوتية إلى S3؛ لم تتم إضافتها. تحقق من إعداد التخزين وصلاحيات AWS.' });
      }
      return next(error);
    }
  });

  router.get('/items/:id/audio', requireOwnedItem, (req, res) => {
    const files = db.prepare(`SELECT id,display_name,content_type,size,created_at FROM audio_attachments
      WHERE item_id=? AND user_id=? ORDER BY created_at,id`).all(req.item.id, req.user.id);
    res.json(files.map(file => ({ ...file, url: `/api/audio/${file.id}` })));
  });

  router.get('/audio/:id', (req, res) => {
    const audio = db.prepare('SELECT * FROM audio_attachments WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!audio) return res.status(404).json({ error: 'الملف الصوتي غير موجود.' });
    res.sendFile(path.join(audioDir, String(req.user.id), audio.filename), {
      headers: {
        'Content-Type': audio.content_type,
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
      },
    }, error => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).json({ error: 'تعذّر فتح الملف الصوتي.' });
    });
  });

  router.delete('/items/:id/audio/:audioId', requireOwnedItem, async (req, res) => {
    const audio = db.prepare('SELECT * FROM audio_attachments WHERE id=? AND item_id=? AND user_id=?')
      .get(req.params.audioId, req.item.id, req.user.id);
    if (!audio) return res.status(404).json({ error: 'الملف الصوتي غير موجود.' });
    try {
      await deleteS3Object('media', `${req.user.id}/audio/${audio.filename}`);
    } catch {
      return res.status(502).json({ error: 'تعذّر حذف نسخة الملف من S3؛ لم يُحذف الملف من المكتبة.' });
    }
    db.prepare('DELETE FROM audio_attachments WHERE id=?').run(audio.id);
    fs.rmSync(path.join(audioDir, String(req.user.id), audio.filename), { force: true });
    res.json({ ok: true });
  });

  return { apiRouter: router, uploadsRouter };
}

module.exports = createMediaRouter;
