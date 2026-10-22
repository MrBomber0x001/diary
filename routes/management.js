const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

function createManagementRouter({
  db, text, now, requireOwner, getS3Settings, backupFiles, backupRetention, validateS3Settings, testS3Connection,
  scheduleDailyBackup, clearBackupTimer, createBackupOnce, S3StorageError, backupDir, uploadDir, audioDir,
  clubUploadDir, learningUploadDir, isBackupInProgress, extractCompleteBackup, validateBackupDatabase, BackupValidationError,
  restoreDatabaseFrom, swapRestoredMedia, clearSessionCookie,
}) {
  const router = express.Router();
  const supportedCurrencies = new Set(['AED', 'EGP', 'EUR', 'GBP', 'KWD', 'QAR', 'SAR', 'USD']);
  router.post('/trash/:token/restore', (req, res) => {
    if (!/^[a-f0-9]{48}$/.test(req.params.token)) return res.status(404).json({ error: 'تعذّر استعادة العنصر.' });
    const entry = db.prepare('SELECT * FROM undo_trash WHERE token=? AND user_id=? AND expires_at>?')
      .get(req.params.token, req.user.id, now());
    if (!entry) return res.status(404).json({ error: 'انتهت مهلة التراجع أو أن العنصر غير موجود.' });
    const tableByType = { item: 'items', todo: 'todos', article: 'saved_articles', bookmark: 'bookmarks' };
    const table = tableByType[entry.record_type];
    if (!table) return res.status(400).json({ error: 'نوع العنصر غير صالح للاستعادة.' });
    const restore = db.transaction(() => {
      db.prepare(`UPDATE "${table}" SET deleted_at=NULL WHERE id=? AND user_id=?`)
        .run(entry.record_id, req.user.id);
      db.prepare('DELETE FROM undo_trash WHERE token=?').run(entry.token);
    });
    restore();
    res.json({ ok: true, type: entry.record_type });
  });

  router.get('/search', (req, res) => {
    const query = text(req.query.q);
    if (!query || query.length > 200) return res.status(400).json({ error: 'أدخل عبارة بحث لا تتجاوز ٢٠٠ حرف.' });
    const pattern = `%${query}%`;
    const userId = req.user.id;
    res.json({
      items: db.prepare(`SELECT id,kind,title,creator,status FROM items WHERE user_id=? AND deleted_at IS NULL
        AND (title LIKE ? OR creator LIKE ? OR review LIKE ? OR notes LIKE ? OR tags LIKE ?)
        ORDER BY updated_at DESC LIMIT 8`).all(userId, pattern, pattern, pattern, pattern, pattern),
      todos: db.prepare(`SELECT id,title,completed,due_date FROM todos WHERE user_id=? AND deleted_at IS NULL
        AND (title LIKE ? OR notes LIKE ?) ORDER BY completed,due_date LIMIT 8`).all(userId, pattern, pattern),
      articles: db.prepare(`SELECT id,title,url,status FROM saved_articles WHERE user_id=? AND deleted_at IS NULL
        AND (title LIKE ? OR url LIKE ? OR description LIKE ? OR excerpt LIKE ? OR review LIKE ?)
        ORDER BY updated_at DESC LIMIT 8`).all(userId, pattern, pattern, pattern, pattern, pattern),
      bookmarks: db.prepare(`SELECT id,title,url FROM bookmarks WHERE user_id=? AND deleted_at IS NULL
        AND (title LIKE ? OR url LIKE ? OR note LIKE ?) ORDER BY updated_at DESC LIMIT 8`)
        .all(userId, pattern, pattern, pattern),
    });
  });

  router.get('/settings', (req, res) => {
    const preference = db.prepare(`SELECT edit_mode,notification_enabled,theme_mode,reminder_minutes,
      notification_sound_enabled,markdown_rendering_enabled,markdown_toolbar_enabled,markdown_image_paste_enabled,
      font_size_offset,line_spacing,font_family,language,prayer_latitude,prayer_longitude,prayer_location,prayer_method,
      finance_currency,focus_duration_minutes,focus_break_minutes,shortcut_todo,shortcut_daily_note,shortcut_read_later,shortcut_quick_create
      FROM user_preferences WHERE user_id=?`).get(req.user.id);
    const isOwner = Boolean(db.prepare('SELECT is_owner FROM users WHERE id=?').get(req.user.id)?.is_owner);
    const cloud = getS3Settings();
    res.json({
      editMode: preference?.edit_mode || 'inline',
      notificationsEnabled: Boolean(preference?.notification_enabled),
      themeMode: preference?.theme_mode || 'system',
      reminderMinutes: preference?.reminder_minutes || 15,
      notificationSoundEnabled: preference?.notification_sound_enabled !== 0,
      markdownRenderingEnabled: preference?.markdown_rendering_enabled !== 0,
      markdownToolbarEnabled: preference?.markdown_toolbar_enabled !== 0,
      markdownImagePasteEnabled: preference?.markdown_image_paste_enabled !== 0,
      fontSizeOffset: preference?.font_size_offset ?? 0,
      lineSpacing: preference?.line_spacing || 'comfortable',
      fontFamily: preference?.font_family || 'plex',
      language: preference?.language || 'ar',
      prayerLatitude: preference?.prayer_latitude ?? null,
      prayerLongitude: preference?.prayer_longitude ?? null,
      prayerLocation: preference?.prayer_location || '',
      prayerMethod: preference?.prayer_method || 5,
      financeCurrency: preference?.finance_currency || 'EGP',
      focusDurationMinutes: preference?.focus_duration_minutes || 25,
      focusBreakMinutes: preference?.focus_break_minutes || 5,
      shortcuts: {
        todo: preference?.shortcut_todo || 'Ctrl+Alt+Shift+KeyT',
        dailyNote: preference?.shortcut_daily_note || 'Ctrl+Alt+Shift+KeyD',
        readLater: preference?.shortcut_read_later || 'Ctrl+Alt+Shift+KeyR',
        quickCreate: preference?.shortcut_quick_create || 'Ctrl+Alt+Shift+KeyQ',
      },
      isOwner,
      dailyBackupEnabled: isOwner
        ? db.prepare("SELECT value FROM application_settings WHERE key='daily_backup_enabled'").get().value === '1'
        : null,
      backups: isOwner ? backupFiles() : [],
      backupRetention: isOwner ? backupRetention : null,
      s3: isOwner ? cloud : null,
    });
  });

  router.post('/settings/s3/test', requireOwner, async (req, res) => {
    const result = validateS3Settings(req.body || {});
    if (result.error) return res.status(400).json({ error: result.error });
    try {
      await testS3Connection(result);
      res.json({ ok: true, message: 'تم الاتصال بالحاوية والتحقق من صلاحيات الرفع والحذف.' });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/settings', async (req, res, next) => {
    const existingPreference = db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(req.user.id);
    const editMode = Object.prototype.hasOwnProperty.call(req.body || {}, 'editMode')
      ? text(req.body.editMode)
      : existingPreference?.edit_mode || 'inline';
    const themeMode = Object.prototype.hasOwnProperty.call(req.body || {}, 'themeMode')
      ? text(req.body.themeMode)
      : existingPreference?.theme_mode || 'system';
    const reminderMinutes = Object.prototype.hasOwnProperty.call(req.body || {}, 'reminderMinutes')
      ? Number(req.body.reminderMinutes)
      : existingPreference?.reminder_minutes || 15;
    const notificationsEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'notificationsEnabled')
      ? req.body.notificationsEnabled
      : Boolean(existingPreference?.notification_enabled);
    const preferenceBooleans = {
      notificationSoundEnabled: existingPreference?.notification_sound_enabled !== 0,
      markdownRenderingEnabled: existingPreference?.markdown_rendering_enabled !== 0,
      markdownToolbarEnabled: existingPreference?.markdown_toolbar_enabled !== 0,
      markdownImagePasteEnabled: existingPreference?.markdown_image_paste_enabled !== 0,
    };
    Object.keys(preferenceBooleans).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) preferenceBooleans[key] = req.body[key];
    });
    const fontSizeOffset = Object.prototype.hasOwnProperty.call(req.body || {}, 'fontSizeOffset')
      ? Number(req.body.fontSizeOffset)
      : existingPreference?.font_size_offset ?? 0;
    const lineSpacing = Object.prototype.hasOwnProperty.call(req.body || {}, 'lineSpacing')
      ? text(req.body.lineSpacing)
      : existingPreference?.line_spacing || 'comfortable';
    const fontFamily = Object.prototype.hasOwnProperty.call(req.body || {}, 'fontFamily')
      ? text(req.body.fontFamily)
      : existingPreference?.font_family || 'plex';
    const language = Object.prototype.hasOwnProperty.call(req.body || {}, 'language')
      ? text(req.body.language)
      : existingPreference?.language || 'ar';
    const prayerLatitude = Object.prototype.hasOwnProperty.call(req.body || {}, 'prayerLatitude')
      ? req.body.prayerLatitude === '' || req.body.prayerLatitude === null ? null : Number(req.body.prayerLatitude)
      : existingPreference?.prayer_latitude ?? null;
    const prayerLongitude = Object.prototype.hasOwnProperty.call(req.body || {}, 'prayerLongitude')
      ? req.body.prayerLongitude === '' || req.body.prayerLongitude === null ? null : Number(req.body.prayerLongitude)
      : existingPreference?.prayer_longitude ?? null;
    const prayerLocation = Object.prototype.hasOwnProperty.call(req.body || {}, 'prayerLocation')
      ? text(req.body.prayerLocation)
      : existingPreference?.prayer_location || '';
    const prayerMethod = Object.prototype.hasOwnProperty.call(req.body || {}, 'prayerMethod')
      ? Number(req.body.prayerMethod)
      : existingPreference?.prayer_method || 5;
    const financeCurrency = Object.prototype.hasOwnProperty.call(req.body || {}, 'financeCurrency')
      ? text(req.body.financeCurrency)
      : existingPreference?.finance_currency || 'EGP';
    const focusDurationMinutes = Object.prototype.hasOwnProperty.call(req.body || {}, 'focusDurationMinutes')
      ? Number(req.body.focusDurationMinutes)
      : existingPreference?.focus_duration_minutes || 25;
    const focusBreakMinutes = Object.prototype.hasOwnProperty.call(req.body || {}, 'focusBreakMinutes')
      ? Number(req.body.focusBreakMinutes)
      : existingPreference?.focus_break_minutes || 5;
    const shortcutKeys = ['todo', 'dailyNote', 'readLater', 'quickCreate'];
    const shortcutDefaults = {
      todo: 'Ctrl+Alt+Shift+KeyT',
      dailyNote: 'Ctrl+Alt+Shift+KeyD',
      readLater: 'Ctrl+Alt+Shift+KeyR',
      quickCreate: 'Ctrl+Alt+Shift+KeyQ',
    };
    const shortcuts = Object.fromEntries(shortcutKeys.map(key => {
      const column = `shortcut_${key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`;
      return [key, req.body?.shortcuts?.[key] ?? existingPreference?.[column] ?? shortcutDefaults[key]];
    }));
    const validShortcutPattern = /^(?:Ctrl\+|Alt\+|Shift\+|Meta\+)*(?:Key[A-Z0-9]|[A-Z0-9])$/;
    if (!['inline', 'popup'].includes(editMode)) {
      return res.status(400).json({ error: 'اختر طريقة تعديل صحيحة.' });
    }
    if (!['light', 'dark', 'system'].includes(themeMode) || typeof notificationsEnabled !== 'boolean'
      || ![5, 10, 15, 30, 60].includes(reminderMinutes)
      || ![-1, 0, 1, 2].includes(fontSizeOffset)
      || !['compact', 'comfortable', 'relaxed'].includes(lineSpacing)
      || !['plex', 'system', 'serif'].includes(fontFamily)
      || !['ar', 'en'].includes(language)
      || (prayerLatitude !== null && (!Number.isFinite(prayerLatitude) || prayerLatitude < -90 || prayerLatitude > 90))
      || (prayerLongitude !== null && (!Number.isFinite(prayerLongitude) || prayerLongitude < -180 || prayerLongitude > 180))
      || ((prayerLatitude === null) !== (prayerLongitude === null))
      || prayerLocation.length > 120
      || ![3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].includes(prayerMethod)
      || !supportedCurrencies.has(financeCurrency)
      || !Number.isInteger(focusDurationMinutes) || focusDurationMinutes < 1 || focusDurationMinutes > 180
      || !Number.isInteger(focusBreakMinutes) || focusBreakMinutes < 1 || focusBreakMinutes > 60
      || Object.values(shortcuts).some(value => typeof value !== 'string' || (value && !validShortcutPattern.test(value)))
      || new Set(Object.values(shortcuts).filter(Boolean)).size !== Object.values(shortcuts).filter(Boolean).length
      || Object.values(preferenceBooleans).some(value => typeof value !== 'boolean')) {
      return res.status(400).json({ error: 'تحقق من إعدادات المظهر والتنبيهات والموقع وطريقة الحساب.' });
    }
    const hasBackupSetting = Object.prototype.hasOwnProperty.call(req.body || {}, 'dailyBackupEnabled');
    let enabled;
    if (hasBackupSetting) {
      const isOwner = Boolean(db.prepare('SELECT is_owner FROM users WHERE id=?').get(req.user.id)?.is_owner);
      if (!isOwner) return res.status(403).json({ error: 'إدارة النسخ الاحتياطية متاحة لمالك التطبيق فقط.' });
      if (typeof req.body.dailyBackupEnabled !== 'boolean') {
        return res.status(400).json({ error: 'اختر قيمة صحيحة للنسخ اليومية.' });
      }
      enabled = req.body.dailyBackupEnabled;
    }
    const s3Fields = ['s3Enabled', 's3Bucket', 's3Region', 's3Prefix'];
    const hasS3Settings = s3Fields.some(field => Object.prototype.hasOwnProperty.call(req.body || {}, field));
    let s3;
    if (hasS3Settings) {
      const isOwner = Boolean(db.prepare('SELECT is_owner FROM users WHERE id=?').get(req.user.id)?.is_owner);
      if (!isOwner) return res.status(403).json({ error: 'إدارة النسخ الاحتياطية والتخزين السحابي متاحة لمالك التطبيق فقط.' });
      if (typeof req.body.s3Enabled !== 'boolean') {
        return res.status(400).json({ error: 'اختر حالة صحيحة للتخزين السحابي.' });
      }
      const currentS3 = getS3Settings();
      const validation = validateS3Settings({
        bucket: req.body.s3Bucket ?? currentS3.bucket,
        region: req.body.s3Region ?? currentS3.region,
        prefix: req.body.s3Prefix ?? currentS3.prefix,
      }, !req.body.s3Enabled);
      if (validation.error) return res.status(400).json({ error: validation.error });
      s3 = { ...validation, enabled: req.body.s3Enabled };
      if (s3.enabled) {
        try {
          await testS3Connection(s3);
        } catch (error) {
          return res.status(400).json({ error: error.message });
        }
      }
    }
    db.prepare(`INSERT INTO user_preferences(user_id,edit_mode,notification_enabled,theme_mode,reminder_minutes,
      notification_sound_enabled,markdown_rendering_enabled,markdown_toolbar_enabled,markdown_image_paste_enabled,
      font_size_offset,line_spacing,font_family,shortcut_todo,shortcut_daily_note,shortcut_read_later,shortcut_quick_create,language,
      prayer_latitude,prayer_longitude,prayer_location,prayer_method,finance_currency,focus_duration_minutes,focus_break_minutes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET edit_mode=excluded.edit_mode,
        notification_enabled=excluded.notification_enabled,theme_mode=excluded.theme_mode,
        reminder_minutes=excluded.reminder_minutes,notification_sound_enabled=excluded.notification_sound_enabled,
        markdown_rendering_enabled=excluded.markdown_rendering_enabled,markdown_toolbar_enabled=excluded.markdown_toolbar_enabled,
        markdown_image_paste_enabled=excluded.markdown_image_paste_enabled,font_size_offset=excluded.font_size_offset,
        line_spacing=excluded.line_spacing,font_family=excluded.font_family,shortcut_todo=excluded.shortcut_todo,
        shortcut_daily_note=excluded.shortcut_daily_note,shortcut_read_later=excluded.shortcut_read_later,
        shortcut_quick_create=excluded.shortcut_quick_create,language=excluded.language,
        prayer_latitude=excluded.prayer_latitude,prayer_longitude=excluded.prayer_longitude,
        prayer_location=excluded.prayer_location,prayer_method=excluded.prayer_method,finance_currency=excluded.finance_currency,
        focus_duration_minutes=excluded.focus_duration_minutes,focus_break_minutes=excluded.focus_break_minutes`)
      .run(req.user.id, editMode, Number(notificationsEnabled), themeMode, reminderMinutes,
        Number(preferenceBooleans.notificationSoundEnabled), Number(preferenceBooleans.markdownRenderingEnabled),
        Number(preferenceBooleans.markdownToolbarEnabled), Number(preferenceBooleans.markdownImagePasteEnabled),
        fontSizeOffset, lineSpacing, fontFamily, shortcuts.todo, shortcuts.dailyNote,
        shortcuts.readLater, shortcuts.quickCreate, language, prayerLatitude, prayerLongitude, prayerLocation, prayerMethod, financeCurrency,
        focusDurationMinutes, focusBreakMinutes);
    if (hasBackupSetting) {
      db.prepare("UPDATE application_settings SET value=? WHERE key='daily_backup_enabled'").run(enabled ? '1' : '0');
      if (enabled) scheduleDailyBackup();
      else clearBackupTimer();
    }
    if (s3) {
      const saveS3Setting = db.prepare('UPDATE application_settings SET value=? WHERE key=?');
      saveS3Setting.run(s3.enabled ? '1' : '0', 's3_enabled');
      saveS3Setting.run(s3.bucket, 's3_bucket');
      saveS3Setting.run(s3.region, 's3_region');
      saveS3Setting.run(s3.prefix, 's3_prefix');
    }
    res.json({ ok: true });
  });

  router.get('/backups', requireOwner, (req, res) => res.json(backupFiles()));

  router.post('/backups', requireOwner, async (req, res, next) => {
    try {
      res.status(201).json(await createBackupOnce());
    } catch (error) {
      if (error instanceof S3StorageError) {
        return res.status(502).json({ error: 'تعذّر رفع النسخة إلى S3. احتُفظ بالنسخة المحلية في data/backups.' });
      }
      next(error);
    }
  });

  const backupUploadDirectory = path.join(backupDir, 'incoming');
  const uploadBackup = multer({
    storage: multer.diskStorage({
      destination(req, file, callback) {
        fs.mkdirSync(backupUploadDirectory, { recursive: true });
        callback(null, backupUploadDirectory);
      },
      filename(req, file, callback) {
        callback(null, `${crypto.randomUUID()}.sqlite`);
      },
    }),
    limits: { fileSize: 512 * 1024 * 1024, files: 1 },
  });
  const uploadArchiveBackup = multer({
    storage: multer.diskStorage({
      destination(req, file, callback) {
        fs.mkdirSync(backupUploadDirectory, { recursive: true });
        callback(null, backupUploadDirectory);
      },
      filename(req, file, callback) {
        callback(null, `${crypto.randomUUID()}.zip`);
      },
    }),
    limits: { fileSize: 1024 * 1024 * 1024, files: 1 },
  });

  router.post('/backups/restore', requireOwner, (req, res, next) => {
    uploadBackup.single('backup')(req, res, async error => {
      if (error) {
        const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({
          error: error.code === 'LIMIT_FILE_SIZE'
            ? 'حجم ملف النسخة الاحتياطية يتجاوز ٥١٢ ميغابايت.'
            : 'تعذّر استقبال ملف النسخة الاحتياطية.',
        });
      }
      if (!req.file) return res.status(400).json({ error: 'اختر ملف SQLite لاستعادته.' });

      try {
        if (isBackupInProgress()) {
          return res.status(409).json({ error: 'انتظر انتهاء النسخة الاحتياطية الحالية ثم أعد المحاولة.' });
        }
        const { source, tables } = validateBackupDatabase(req.file.path);
        source.close();

        const safetyBackup = await createBackupOnce();
        clearBackupTimer();
        restoreDatabaseFrom(req.file.path, tables);
        clearSessionCookie(res);
        res.json({
          ok: true,
          safetyBackup: safetyBackup.filename,
          message: 'تمت الاستعادة. سجّل الدخول مجدداً باستخدام حساب موجود في النسخة.',
        });
        scheduleDailyBackup(1000);
      } catch (restoreError) {
        if (restoreError instanceof BackupValidationError) {
          return res.status(400).json({ error: restoreError.message });
        }
        next(restoreError);
      } finally {
        fs.rmSync(req.file.path, { force: true });
      }
    });
  });

  router.post('/backups/restore-archive', requireOwner, (req, res, next) => {
    uploadArchiveBackup.single('backup')(req, res, async error => {
      if (error) {
        const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({
          error: error.code === 'LIMIT_FILE_SIZE'
            ? 'حجم الأرشيف يتجاوز ١ غيغابايت.'
            : 'تعذّر استقبال الأرشيف الاحتياطي.',
        });
      }
      if (!req.file) return res.status(400).json({ error: 'اختر أرشيف ZIP لاستعادته.' });
      const stagingDirectory = path.join(backupUploadDirectory, crypto.randomUUID());
      let uploadSwap;
      let audioSwap;
      let clubUploadSwap;
      let learningUploadSwap;
      try {
        if (isBackupInProgress()) {
          return res.status(409).json({ error: 'انتظر انتهاء النسخة الاحتياطية الحالية ثم أعد المحاولة.' });
        }
        const databasePath = await extractCompleteBackup(req.file.path, stagingDirectory);
        const { source, tables } = validateBackupDatabase(databasePath);
        source.close();
        fs.mkdirSync(path.join(stagingDirectory, 'uploads'), { recursive: true });
        fs.mkdirSync(path.join(stagingDirectory, 'audio'), { recursive: true });
        fs.mkdirSync(path.join(stagingDirectory, 'club-uploads'), { recursive: true });
        fs.mkdirSync(path.join(stagingDirectory, 'learning-uploads'), { recursive: true });
        const safetyBackup = await createBackupOnce();
        clearBackupTimer();
        uploadSwap = swapRestoredMedia(path.join(stagingDirectory, 'uploads'), uploadDir);
        audioSwap = swapRestoredMedia(path.join(stagingDirectory, 'audio'), audioDir);
        clubUploadSwap = swapRestoredMedia(path.join(stagingDirectory, 'club-uploads'), clubUploadDir);
        learningUploadSwap = swapRestoredMedia(path.join(stagingDirectory, 'learning-uploads'), learningUploadDir);
        restoreDatabaseFrom(databasePath, tables);
        uploadSwap.commit();
        audioSwap.commit();
        clubUploadSwap.commit();
        learningUploadSwap.commit();
        clearSessionCookie(res);
        res.json({
          ok: true,
          safetyBackup: safetyBackup.filename,
          message: 'تمت استعادة قاعدة البيانات والصور والملفات الصوتية. سجّل الدخول مجدداً باستخدام حساب موجود في النسخة.',
        });
        scheduleDailyBackup(1000);
      } catch (restoreError) {
        const rollbackErrors = [];
        for (const mediaSwap of [learningUploadSwap, clubUploadSwap, audioSwap, uploadSwap]) {
          if (!mediaSwap) continue;
          try {
            mediaSwap.rollback();
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length) {
          console.error('Personal Memo archive restore rollback failed:', rollbackErrors);
          return next(new AggregateError([restoreError, ...rollbackErrors], 'Archive restore rollback failed.'));
        }
        if (restoreError instanceof BackupValidationError) {
          return res.status(400).json({ error: restoreError.message });
        }
        next(restoreError);
      } finally {
        fs.rmSync(req.file.path, { force: true });
        fs.rmSync(stagingDirectory, { recursive: true, force: true });
      }
    });
  });

  router.get('/backups/:filename', requireOwner, (req, res, next) => {
    if (!/^personal-memo-\d{8}-\d{6}-\d{3}\.(?:sqlite|zip)$/.test(req.params.filename)) {
      return res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة.' });
    }
    const backupPath = path.join(backupDir, req.params.filename);
    if (!fs.existsSync(backupPath)) return res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة.' });
    res.download(backupPath, req.params.filename, error => {
      if (error && !res.headersSent) next(error);
    });
  });

  return router;
}

module.exports = createManagementRouter;
