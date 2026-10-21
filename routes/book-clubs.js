const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function createBookClubRouter({
  db,
  text,
  now,
  hashToken,
  localToday,
  localTime,
  validDate,
  mirrorFileToS3,
  deleteS3Object,
  clubUploadDir,
}) {
  const router = express.Router();
  function clubMembership(clubId, userId) {
    return db.prepare(`SELECT m.club_id,m.role,m.can_add_books,c.owner_id FROM book_club_members m
      JOIN book_clubs c ON c.id=m.club_id WHERE m.club_id=? AND m.user_id=?`).get(clubId, userId);
  }

  router.get('/book-clubs', (req, res) => {
    res.json(db.prepare(`SELECT c.id,c.name,c.description,c.owner_id,c.created_at,
        m.role,(SELECT COUNT(*) FROM book_club_members cm WHERE cm.club_id=c.id) AS member_count,
        (SELECT COUNT(*) FROM book_club_books cb WHERE cb.club_id=c.id) AS book_count
      FROM book_clubs c JOIN book_club_members m ON m.club_id=c.id
      WHERE m.user_id=? ORDER BY c.updated_at DESC,c.id DESC`).all(req.user.id));
  });

  router.post('/book-clubs', (req, res) => {
    const name = text(req.body?.name);
    const description = text(req.body?.description);
    if (!name || name.length > 100 || description.length > 1000) {
      return res.status(400).json({ error: 'اسم النادي مطلوب (حتى ١٠٠ حرف)، والوصف حتى ١٠٠٠ حرف.' });
    }
    const timestamp = now();
    const create = db.transaction(() => {
      const result = db.prepare('INSERT INTO book_clubs(owner_id,name,description,created_at,updated_at) VALUES (?,?,?,?,?)')
        .run(req.user.id, name, description, timestamp, timestamp);
      db.prepare('INSERT INTO book_club_members(club_id,user_id,role,can_add_books,joined_at) VALUES (?,?,?,?,?)')
        .run(result.lastInsertRowid, req.user.id, 'owner', 1, timestamp);
      return result.lastInsertRowid;
    });
    const id = create();
    res.status(201).json({ id, name, description, role: 'owner', member_count: 1, book_count: 0 });
  });

  router.get('/book-clubs/:id', (req, res) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const club = db.prepare('SELECT id,name,description,owner_id,created_at FROM book_clubs WHERE id=?').get(membership.club_id);
    const members = db.prepare(`SELECT u.id,u.username,m.role,m.can_add_books,m.joined_at FROM book_club_members m
      JOIN users u ON u.id=m.user_id WHERE m.club_id=? ORDER BY m.role DESC,m.joined_at,u.username`).all(membership.club_id);
    const books = db.prepare(`SELECT b.id,b.title,b.creator,b.total_pages,b.created_at,p.status AS my_status,p.note AS my_note,
        p.pages_read AS my_pages_read,
        (SELECT COUNT(*) FROM book_club_progress cp WHERE cp.club_book_id=b.id AND cp.status='completed') AS completed_count
      FROM book_club_books b LEFT JOIN book_club_progress p ON p.club_book_id=b.id AND p.user_id=?
      WHERE b.club_id=? ORDER BY b.created_at DESC,b.id DESC`).all(req.user.id, membership.club_id);
    const messages = db.prepare(`SELECT m.id,m.user_id,u.username,m.message_type,m.content,m.created_at
      FROM book_club_messages m JOIN users u ON u.id=m.user_id WHERE m.club_id=?
      ORDER BY m.id DESC LIMIT 100`).all(membership.club_id).reverse();
    const messageIds = messages.map(message => message.id);
    const attachments = messageIds.length ? db.prepare(`SELECT id,message_id,display_name,content_type,size
      FROM book_club_message_attachments WHERE club_id=? AND message_id IN (${messageIds.map(() => '?').join(',')})
      ORDER BY id`).all(membership.club_id, ...messageIds) : [];
    const links = messageIds.length ? db.prepare(`SELECT id,message_id,url,title
      FROM book_club_message_links WHERE club_id=? AND message_id IN (${messageIds.map(() => '?').join(',')})
      ORDER BY id`).all(membership.club_id, ...messageIds) : [];
    messages.forEach(message => {
      message.attachments = attachments.filter(attachment => attachment.message_id === message.id)
        .map(attachment => ({ ...attachment, url: `/api/book-club-attachments/${attachment.id}` }));
      message.links = links.filter(link => link.message_id === message.id);
    });
    const leaderboard = db.prepare(`SELECT u.id,u.username,
        SUM(CASE WHEN p.status='completed' THEN 1 ELSE 0 END) AS completed_books,
        (SELECT COUNT(*) FROM book_club_messages im WHERE im.club_id=? AND im.user_id=u.id AND im.message_type='insight') AS insights
      FROM book_club_members m JOIN users u ON u.id=m.user_id
      LEFT JOIN book_club_progress p ON p.user_id=u.id AND p.club_book_id IN (SELECT id FROM book_club_books WHERE club_id=?)
      WHERE m.club_id=? GROUP BY u.id
      ORDER BY completed_books DESC,insights DESC,u.username COLLATE NOCASE`).all(membership.club_id, membership.club_id, membership.club_id)
      .map((member, index) => ({ ...member, points: member.completed_books * 10 + member.insights * 3, rank: index + 1 }));
    const invites = membership.role === 'owner'
      ? db.prepare('SELECT id,expires_at,created_at FROM book_club_invites WHERE club_id=? AND expires_at>? ORDER BY id DESC')
        .all(membership.club_id, now())
      : [];
    const meetings = db.prepare(`SELECT m.id,m.created_by,u.username AS created_by_username,m.title,m.starts_at,m.meeting_url,
        m.discussion_points,m.created_at,m.updated_at
      FROM book_club_meetings m JOIN users u ON u.id=m.created_by
      WHERE m.club_id=?
      ORDER BY CASE WHEN m.starts_at>=? THEN 0 ELSE 1 END,
        CASE WHEN m.starts_at>=? THEN m.starts_at END ASC,m.starts_at DESC,m.id DESC LIMIT 100`)
      .all(membership.club_id, `${localToday()}T${localTime()}`, `${localToday()}T${localTime()}`);
    const metrics = db.prepare(`SELECT
        (SELECT COUNT(*) FROM book_club_members WHERE club_id=?) AS member_count,
        (SELECT COUNT(*) FROM book_club_books WHERE club_id=?) AS book_count,
        (SELECT COUNT(*) FROM book_club_progress p JOIN book_club_books b ON b.id=p.club_book_id
          WHERE b.club_id=? AND p.status='completed') AS completed_readings,
        (SELECT COALESCE(SUM(p.pages_read),0) FROM book_club_progress p JOIN book_club_books b ON b.id=p.club_book_id
          WHERE b.club_id=?) AS pages_read,
        (SELECT COUNT(*) FROM book_club_meetings WHERE club_id=?) AS meeting_count,
        (SELECT COUNT(*) FROM book_club_messages WHERE club_id=?) AS message_count,
        (SELECT COUNT(*) FROM book_club_messages WHERE club_id=? AND message_type='insight') AS insight_count,
        (SELECT COUNT(*) FROM book_club_message_attachments WHERE club_id=?) AS attachment_count,
        (SELECT COUNT(*) FROM book_club_message_links WHERE club_id=?) AS shared_link_count`)
      .get(...Array(9).fill(membership.club_id));
    const pageTotals = db.prepare(`SELECT COALESCE(SUM(total_pages),0) AS pages FROM book_club_books WHERE club_id=?`)
      .get(membership.club_id).pages;
    metrics.page_goal = pageTotals * metrics.member_count;
    metrics.page_completion_percent = metrics.page_goal
      ? Math.min(100, Math.round(metrics.pages_read / metrics.page_goal * 100))
      : 0;
    res.json({
      ...club,
      role: membership.role,
      can_add_books: Boolean(membership.can_add_books),
      members,
      books,
      messages,
      leaderboard,
      invites,
      meetings,
      metrics,
    });
  });

  router.post('/book-clubs/:id/invites', (req, res) => {
    if (!clubMembership(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const timestamp = now();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = db.prepare(`INSERT INTO book_club_invites(club_id,created_by,token_hash,expires_at,created_at)
      VALUES (?,?,?,?,?)`).run(req.params.id, req.user.id, hashToken(token), expiresAt, timestamp);
    res.status(201).json({ id: result.lastInsertRowid, invitePath: `/?clubInvite=${token}`, expiresAt });
  });

  router.delete('/book-clubs/:clubId/invites/:inviteId', (req, res) => {
    const membership = clubMembership(req.params.clubId, req.user.id);
    if (!membership || membership.role !== 'owner') return res.status(403).json({ error: 'إلغاء الدعوات متاح لمالك النادي فقط.' });
    const result = db.prepare('DELETE FROM book_club_invites WHERE id=? AND club_id=?').run(req.params.inviteId, membership.club_id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'الدعوة غير موجودة.' });
  });

  router.put('/book-clubs/:clubId/members/:userId/permissions', (req, res) => {
    const membership = clubMembership(req.params.clubId, req.user.id);
    if (!membership || membership.role !== 'owner') {
      return res.status(403).json({ error: 'تغيير صلاحيات الأعضاء متاح لمالك النادي فقط.' });
    }
    const userId = Number(req.params.userId);
    const canAddBooks = req.body?.canAddBooks;
    if (!Number.isSafeInteger(userId) || typeof canAddBooks !== 'boolean') {
      return res.status(400).json({ error: 'اختر عضواً وقيمة صلاحية صحيحة.' });
    }
    const target = clubMembership(membership.club_id, userId);
    if (!target) return res.status(404).json({ error: 'العضو غير موجود في هذا النادي.' });
    if (target.role === 'owner') return res.status(400).json({ error: 'مالك النادي لديه صلاحية إضافة الكتب دائماً.' });
    db.prepare('UPDATE book_club_members SET can_add_books=? WHERE club_id=? AND user_id=?')
      .run(Number(canAddBooks), membership.club_id, userId);
    res.json({ ok: true, userId, can_add_books: canAddBooks });
  });

  router.post('/book-club-invites/:token/accept', (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).json({ error: 'رابط الدعوة غير صالح.' });
    const invite = db.prepare(`SELECT i.id,i.club_id,i.expires_at,c.name FROM book_club_invites i
      JOIN book_clubs c ON c.id=i.club_id WHERE i.token_hash=? AND i.expires_at>?`).get(hashToken(req.params.token), now());
    if (!invite) return res.status(404).json({ error: 'انتهت صلاحية الدعوة أو أُلغيت.' });
    db.prepare('INSERT OR IGNORE INTO book_club_members(club_id,user_id,role,joined_at) VALUES (?,?,?,?)')
      .run(invite.club_id, req.user.id, 'member', now());
    res.json({ ok: true, clubId: invite.club_id, name: invite.name });
  });

  router.delete('/book-clubs/:id/membership', (req, res) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'عضويتك في النادي غير موجودة.' });
    if (membership.role === 'owner') return res.status(400).json({ error: 'مالك النادي لا يمكنه المغادرة قبل حذف النادي أو نقل الملكية.' });
    db.prepare('DELETE FROM book_club_members WHERE club_id=? AND user_id=?').run(membership.club_id, req.user.id);
    res.json({ ok: true });
  });

  router.delete('/book-clubs/:id', (req, res) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership || membership.role !== 'owner') return res.status(403).json({ error: 'حذف النادي متاح لمالكه فقط.' });
    db.prepare('DELETE FROM book_clubs WHERE id=?').run(membership.club_id);
    res.json({ ok: true });
  });

  router.post('/book-clubs/:id/books', (req, res) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    if (membership.role !== 'owner' && !membership.can_add_books) {
      return res.status(403).json({ error: 'يحتاج مالك النادي إلى منحك صلاحية إضافة الكتب أولاً.' });
    }
    const itemId = Number(req.body?.itemId);
    const totalPages = req.body?.totalPages === '' || req.body?.totalPages == null ? 0 : Number(req.body.totalPages);
    if (!Number.isSafeInteger(totalPages) || totalPages < 0 || totalPages > 1000000) {
      return res.status(400).json({ error: 'أدخل عدداً صحيحاً للصفحات بين ٠ و١٬٠٠٠٬٠٠٠.' });
    }
    const book = db.prepare(`SELECT id,title,creator FROM items
      WHERE id=? AND user_id=? AND kind='book' AND deleted_at IS NULL`).get(itemId, req.user.id);
    if (!book) return res.status(404).json({ error: 'اختر كتاباً من مكتبتك.' });
    try {
      const result = db.prepare(`INSERT INTO book_club_books(club_id,added_by,title,creator,source_item_id,total_pages,created_at)
        VALUES (?,?,?,?,?,?,?)`).run(membership.club_id, req.user.id, book.title, book.creator, book.id, totalPages, now());
      res.status(201).json({ id: result.lastInsertRowid, title: book.title, creator: book.creator, total_pages: totalPages, my_status: 'reading' });
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'هذا الكتاب مضاف بالفعل إلى النادي.' });
      throw error;
    }
  });

  router.put('/book-clubs/:id/books/:bookId/progress', (req, res) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const status = text(req.body?.status);
    const note = text(req.body?.note);
    const pagesReadInput = req.body?.pagesRead;
    if (!['reading', 'completed'].includes(status) || note.length > 1000
      || pagesReadInput != null && (!Number.isSafeInteger(Number(pagesReadInput)) || Number(pagesReadInput) < 0)) {
      return res.status(400).json({ error: 'تحقق من حالة القراءة والملاحظة (حتى ١٠٠٠ حرف).' });
    }
    const book = db.prepare('SELECT id,total_pages FROM book_club_books WHERE id=? AND club_id=?').get(req.params.bookId, membership.club_id);
    if (!book) return res.status(404).json({ error: 'الكتاب غير موجود في هذا النادي.' });
    const existingProgress = db.prepare('SELECT pages_read FROM book_club_progress WHERE club_book_id=? AND user_id=?')
      .get(book.id, req.user.id);
    let pagesRead = pagesReadInput == null
      ? existingProgress?.pages_read || 0
      : Number(pagesReadInput);
    if (status === 'completed' && pagesReadInput == null && book.total_pages) pagesRead = book.total_pages;
    if (book.total_pages && pagesRead > book.total_pages) {
      return res.status(400).json({ error: 'عدد الصفحات المقروءة لا يمكن أن يتجاوز إجمالي صفحات الكتاب.' });
    }
    db.prepare(`INSERT INTO book_club_progress(club_book_id,user_id,status,note,pages_read,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(club_book_id,user_id) DO UPDATE SET status=excluded.status,note=excluded.note,
        pages_read=excluded.pages_read,updated_at=excluded.updated_at`)
      .run(book.id, req.user.id, status, note, pagesRead, now());
    res.json({ ok: true, pages_read: pagesRead });
  });

  const clubAttachmentTypes = new Map([
    ['.jpg', { contentType: 'image/jpeg', matches: data => data.length > 2 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff }],
    ['.jpeg', { contentType: 'image/jpeg', matches: data => data.length > 2 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff }],
    ['.png', { contentType: 'image/png', matches: data => data.length > 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
    ['.gif', { contentType: 'image/gif', matches: data => data.length > 6 && ['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)) }],
    ['.webp', { contentType: 'image/webp', matches: data => data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' }],
    ['.pdf', { contentType: 'application/pdf', matches: data => data.subarray(0, 5).toString('ascii') === '%PDF-' }],
    ['.txt', { contentType: 'text/plain', matches: isSafeTextFile }],
    ['.md', { contentType: 'text/markdown', matches: isSafeTextFile }],
    ['.csv', { contentType: 'text/csv', matches: isSafeTextFile }],
    ['.json', { contentType: 'application/json', matches: data => isSafeTextFile(data) }],
    ['.doc', { contentType: 'application/msword', matches: data => data.length > 8 && data.readUInt32LE(0) === 0xe011cfd0 }],
    ['.docx', { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', matches: data => data.length > 4 && data.subarray(0, 2).toString('ascii') === 'PK' }],
    ['.xls', { contentType: 'application/vnd.ms-excel', matches: data => data.length > 8 && data.readUInt32LE(0) === 0xe011cfd0 }],
    ['.xlsx', { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', matches: data => data.length > 4 && data.subarray(0, 2).toString('ascii') === 'PK' }],
    ['.ppt', { contentType: 'application/vnd.ms-powerpoint', matches: data => data.length > 8 && data.readUInt32LE(0) === 0xe011cfd0 }],
    ['.pptx', { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', matches: data => data.length > 4 && data.subarray(0, 2).toString('ascii') === 'PK' }],
    ['.odt', { contentType: 'application/vnd.oasis.opendocument.text', matches: data => data.length > 4 && data.subarray(0, 2).toString('ascii') === 'PK' }],
    ['.ods', { contentType: 'application/vnd.oasis.opendocument.spreadsheet', matches: data => data.length > 4 && data.subarray(0, 2).toString('ascii') === 'PK' }],
    ['.odp', { contentType: 'application/vnd.oasis.opendocument.presentation', matches: data => data.length > 4 && data.subarray(0, 2).toString('ascii') === 'PK' }],
  ]);
  function isSafeTextFile(data) {
    if (!Buffer.isBuffer(data)) return false;
    for (let index = 0; index < data.length; index += 1) {
      const value = data[index];
      if (value === 0 || value < 9 || value > 13 && value < 32) return false;
    }
    return true;
  }
  const uploadClubAttachments = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 5, fields: 8, fieldSize: 16 * 1024 },
  });

  router.post('/book-clubs/:id/messages', (req, res, next) => {
    uploadClubAttachments.array('attachments', 5)(req, res, error => {
      if (!error) return next();
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({
        error: error.code === 'LIMIT_FILE_SIZE' ? 'حجم كل مرفق لا يتجاوز ٢٠ ميغابايت.' : error.message,
      });
    });
  }, async (req, res, next) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const messageType = text(req.body?.type || 'chat');
    const content = text(req.body?.content);
    const files = req.files || [];
    const link = text(req.body?.link);
    if (!['chat', 'insight'].includes(messageType) || content.length > 4000 || (!content && !files.length && !link)) {
      return res.status(400).json({ error: 'اكتب رسالة أو أرفق ملفاً أو رابطاً، وبحد أقصى ٤٠٠٠ حرف.' });
    }
    let parsedLink = null;
    if (link) {
      try {
        parsedLink = new URL(link);
        if (!['http:', 'https:'].includes(parsedLink.protocol) || parsedLink.username || parsedLink.password || link.length > 2048) {
          throw new Error('invalid URL');
        }
      } catch {
        return res.status(400).json({ error: 'أدخل رابطاً صحيحاً يبدأ بـ http أو https.' });
      }
    }
    const preparedFiles = [];
    for (const file of files) {
      const extension = path.extname(file.originalname).toLowerCase();
      const definition = clubAttachmentTypes.get(extension);
      if (!definition || file.mimetype !== definition.contentType || !definition.matches(file.buffer)) {
        return res.status(400).json({ error: 'أحد المرفقات غير صالح. ارفع صورة أو PDF أو ملف مستند/نص شائعاً.' });
      }
      preparedFiles.push({
        filename: `${crypto.randomUUID()}${extension}`,
        displayName: path.win32.basename(path.basename(file.originalname)).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200)
          || `attachment${extension}`,
        contentType: definition.contentType,
        buffer: file.buffer,
      });
    }
    const mentionedUsernames = new Set([...content.matchAll(/(?:^|[^\w@])@([a-z0-9_]{3,32})\b/gi)].map(match => match[1].toLowerCase()));
    const recipients = mentionedUsernames.size
      ? db.prepare(`SELECT u.id,u.username FROM book_club_members cm JOIN users u ON u.id=cm.user_id
          WHERE cm.club_id=? AND cm.user_id<>? AND lower(u.username) IN (${[...mentionedUsernames].map(() => '?').join(',')})`)
        .all(membership.club_id, req.user.id, ...mentionedUsernames)
      : [];
    const writeFiles = [];
    try {
      for (const file of preparedFiles) {
        const directory = path.join(clubUploadDir, String(membership.club_id));
        fs.mkdirSync(directory, { recursive: true });
        const filePath = path.join(directory, file.filename);
        fs.writeFileSync(filePath, file.buffer, { flag: 'wx' });
        writeFiles.push({ ...file, filePath });
        await mirrorFileToS3('media', filePath, file.filename, file.contentType, String(req.user.id), 'club-uploads');
      }
      const timestamp = now();
      const create = db.transaction(() => {
        const result = db.prepare(`INSERT INTO book_club_messages(club_id,user_id,message_type,content,created_at)
          VALUES (?,?,?,?,?)`).run(membership.club_id, req.user.id, messageType, content, timestamp);
        const messageId = result.lastInsertRowid;
        const insertAttachment = db.prepare(`INSERT INTO book_club_message_attachments
          (club_id,message_id,user_id,filename,display_name,content_type,size,created_at) VALUES (?,?,?,?,?,?,?,?)`);
        writeFiles.forEach(file => insertAttachment.run(
          membership.club_id, messageId, req.user.id, file.filename, file.displayName, file.contentType, file.buffer.length, timestamp,
        ));
        if (parsedLink) {
          db.prepare(`INSERT INTO book_club_message_links(club_id,message_id,user_id,url,title,created_at)
            VALUES (?,?,?,?,?,?)`).run(membership.club_id, messageId, req.user.id, parsedLink.href, parsedLink.hostname, timestamp);
        }
        const insertNotification = db.prepare(`INSERT OR IGNORE INTO book_club_notifications(user_id,club_id,message_id,created_at)
          VALUES (?,?,?,?)`);
        recipients.forEach(recipient => insertNotification.run(recipient.id, membership.club_id, messageId, timestamp));
        return messageId;
      });
      const messageId = create();
      res.status(201).json(db.prepare(`SELECT m.id,m.user_id,u.username,m.message_type,m.content,m.created_at
        FROM book_club_messages m JOIN users u ON u.id=m.user_id WHERE m.id=?`).get(messageId));
    } catch (error) {
      writeFiles.forEach(file => fs.rmSync(file.filePath, { force: true }));
      for (const file of writeFiles) {
        try {
          await deleteS3Object('media', `${req.user.id}/club-uploads/${file.filename}`);
        } catch (cleanupError) {
          console.error('Personal Memo club attachment cleanup failed:', cleanupError.name);
        }
      }
      next(error);
    }
  });

  router.get('/book-club-attachments/:id', (req, res, next) => {
    const attachment = db.prepare(`SELECT a.id,a.club_id,a.filename,a.display_name,a.content_type
      FROM book_club_message_attachments a WHERE a.id=?`).get(req.params.id);
    if (!attachment || !clubMembership(attachment.club_id, req.user.id)) {
      return res.status(404).json({ error: 'المرفق غير موجود أو ليس لديك إذن الوصول إليه.' });
    }
    const inline = attachment.content_type.startsWith('image/');
    const safeName = encodeURIComponent(attachment.display_name).replace(/['()]/g, escape => `%${escape.charCodeAt(0).toString(16)}`);
    res.set({
      'Content-Type': attachment.content_type,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${safeName}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.sendFile(path.join(clubUploadDir, String(attachment.club_id), attachment.filename), error => {
      if (error && !res.headersSent) next(error);
    });
  });

  router.get('/book-club-notifications', (req, res) => {
    const notifications = db.prepare(`SELECT n.id,n.club_id,n.message_id,n.created_at,c.name AS club_name,
        sender.username AS sender_username,m.content
      FROM book_club_notifications n
      JOIN book_club_members cm ON cm.club_id=n.club_id AND cm.user_id=n.user_id
      JOIN book_clubs c ON c.id=n.club_id
      JOIN book_club_messages m ON m.id=n.message_id
      JOIN users sender ON sender.id=m.user_id
      WHERE n.user_id=? AND n.read_at IS NULL ORDER BY n.created_at DESC,n.id DESC LIMIT 30`).all(req.user.id);
    res.json(notifications);
  });

  router.post('/book-club-notifications/:id/read', (req, res) => {
    const result = db.prepare(`UPDATE book_club_notifications SET read_at=?
      WHERE id=? AND user_id=? AND read_at IS NULL`).run(now(), req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'الإشعار غير موجود أو سبق وضع علامة مقروء.' });
  });

  router.post('/book-club-notifications/read-all', (req, res) => {
    const result = db.prepare('UPDATE book_club_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL')
      .run(now(), req.user.id);
    res.json({ ok: true, updated: result.changes });
  });

  function validateClubMeeting(body) {
    const title = text(body?.title);
    const startsAt = text(body?.startsAt);
    const meetingUrl = text(body?.meetingUrl);
    const discussionPoints = text(body?.discussionPoints);
    const dateTimePattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!title || title.length > 160 || !dateTimePattern.test(startsAt) || !validDate(startsAt.slice(0, 10))
      || discussionPoints.length > 10000) {
      return { error: 'أدخل عنواناً وموعداً صحيحين، واجعل نقاط النقاش أقل من ١٠٬٠٠٠ حرف.' };
    }
    if (meetingUrl) {
      try {
        const parsed = new URL(meetingUrl);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || meetingUrl.length > 2048) {
          throw new Error('invalid URL');
        }
      } catch {
        return { error: 'رابط الاجتماع يجب أن يبدأ بـ http أو https.' };
      }
    }
    return { meeting: { title, starts_at: startsAt, meeting_url: meetingUrl, discussion_points: discussionPoints } };
  }

  router.post('/book-clubs/:id/meetings', (req, res) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const { meeting, error } = validateClubMeeting(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO book_club_meetings
      (club_id,created_by,title,starts_at,meeting_url,discussion_points,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(membership.club_id, req.user.id, meeting.title, meeting.starts_at, meeting.meeting_url,
        meeting.discussion_points, timestamp, timestamp);
    res.status(201).json({ id: result.lastInsertRowid, ...meeting, created_by: req.user.id, created_at: timestamp, updated_at: timestamp });
  });

  router.put('/book-clubs/:clubId/meetings/:meetingId', (req, res) => {
    const membership = clubMembership(req.params.clubId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const existing = db.prepare('SELECT id,created_by FROM book_club_meetings WHERE id=? AND club_id=?')
      .get(req.params.meetingId, membership.club_id);
    if (!existing) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
    if (membership.role !== 'owner' && existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'يمكنك تعديل اجتماعاتك فقط.' });
    }
    const { meeting, error } = validateClubMeeting(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE book_club_meetings SET title=?,starts_at=?,meeting_url=?,discussion_points=?,updated_at=?
      WHERE id=? AND club_id=?`).run(meeting.title, meeting.starts_at, meeting.meeting_url,
      meeting.discussion_points, now(), existing.id, membership.club_id);
    res.json({ ok: true });
  });

  router.delete('/book-clubs/:clubId/meetings/:meetingId', (req, res) => {
    const membership = clubMembership(req.params.clubId, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const meeting = db.prepare('SELECT id,created_by FROM book_club_meetings WHERE id=? AND club_id=?')
      .get(req.params.meetingId, membership.club_id);
    if (!meeting) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
    if (membership.role !== 'owner' && meeting.created_by !== req.user.id) {
      return res.status(403).json({ error: 'يمكنك حذف اجتماعاتك فقط.' });
    }
    db.prepare('DELETE FROM book_club_meetings WHERE id=? AND club_id=?').run(meeting.id, membership.club_id);
    res.json({ ok: true });
  });

  router.get('/book-clubs/:id/metrics', (req, res) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const members = db.prepare('SELECT COUNT(*) AS count FROM book_club_members WHERE club_id=?').get(membership.club_id).count;
    const pages = db.prepare(`SELECT COALESCE(SUM(p.pages_read),0) AS read_pages
      FROM book_club_progress p JOIN book_club_books b ON b.id=p.club_book_id WHERE b.club_id=?`)
      .get(membership.club_id);
    const availablePages = db.prepare('SELECT COALESCE(SUM(total_pages),0) AS pages FROM book_club_books WHERE club_id=?')
      .get(membership.club_id).pages;
    const metrics = db.prepare(`SELECT
        (SELECT COUNT(*) FROM book_club_books WHERE club_id=?) AS books,
        (SELECT COUNT(*) FROM book_club_progress p JOIN book_club_books b ON b.id=p.club_book_id
          WHERE b.club_id=? AND p.status='completed') AS completed_readings,
        (SELECT COUNT(*) FROM book_club_meetings WHERE club_id=?) AS meetings,
        (SELECT COUNT(*) FROM book_club_messages WHERE club_id=?) AS messages,
        (SELECT COUNT(*) FROM book_club_messages WHERE club_id=? AND message_type='insight') AS insights,
        (SELECT COUNT(*) FROM book_club_message_attachments WHERE club_id=?) AS attachments,
        (SELECT COUNT(*) FROM book_club_message_links WHERE club_id=?) AS shared_links`)
      .get(...Array(7).fill(membership.club_id));
    const pageGoal = availablePages * members;
    res.json({
      members,
      ...metrics,
      pages_read: pages.read_pages,
      page_goal: pageGoal,
      page_completion_percent: pageGoal ? Math.min(100, Math.round(pages.read_pages / pageGoal * 100)) : 0,
    });
  });

  router.get('/book-clubs/:id/export', (req, res, next) => {
    const membership = clubMembership(req.params.id, req.user.id);
    if (!membership) return res.status(404).json({ error: 'النادي غير موجود أو ليس لديك إذن الوصول إليه.' });
    const clubId = membership.club_id;
    try {
      const club = db.prepare('SELECT id,name,description,owner_id,created_at,updated_at FROM book_clubs WHERE id=?').get(clubId);
      const data = {
        exported_at: now(),
        club,
        members: db.prepare(`SELECT u.id,u.username,m.role,m.can_add_books,m.joined_at FROM book_club_members m
          JOIN users u ON u.id=m.user_id WHERE m.club_id=? ORDER BY m.joined_at,u.username`).all(clubId),
        books: db.prepare(`SELECT * FROM book_club_books WHERE club_id=? ORDER BY id`).all(clubId)
          .map(book => ({
            ...book,
            progress: db.prepare(`SELECT u.username,p.status,p.pages_read,
                CASE WHEN p.user_id=? THEN p.note ELSE '' END AS note,p.updated_at
              FROM book_club_progress p JOIN users u ON u.id=p.user_id
              WHERE p.club_book_id=? ORDER BY u.username`).all(req.user.id, book.id),
          })),
        messages: db.prepare(`SELECT m.id,u.username AS sender,m.message_type,m.content,m.created_at
          FROM book_club_messages m JOIN users u ON u.id=m.user_id WHERE m.club_id=? ORDER BY m.id`).all(clubId),
        meetings: db.prepare(`SELECT m.id,u.username AS created_by,m.title,m.starts_at,m.meeting_url,
          m.discussion_points,m.created_at,m.updated_at FROM book_club_meetings m
          JOIN users u ON u.id=m.created_by WHERE m.club_id=? ORDER BY m.starts_at,m.id`).all(clubId),
        invites: db.prepare('SELECT id,created_by,expires_at,created_at FROM book_club_invites WHERE club_id=? ORDER BY id').all(clubId),
        notifications: db.prepare(`SELECT u.username,n.message_id,n.created_at,n.read_at
          FROM book_club_notifications n JOIN users u ON u.id=n.user_id WHERE n.club_id=? ORDER BY n.id`).all(clubId),
      };
      data.messages.forEach(message => {
        message.attachments = db.prepare(`SELECT id,display_name,content_type,size,filename FROM book_club_message_attachments
          WHERE club_id=? AND message_id=? ORDER BY id`).all(clubId, message.id).map(attachment => ({
          ...attachment,
          archive_path: `attachments/${attachment.filename}`,
        }));
        message.links = db.prepare('SELECT url,title,created_at FROM book_club_message_links WHERE club_id=? AND message_id=? ORDER BY id')
          .all(clubId, message.id);
      });
      data.metrics = db.prepare(`SELECT
          (SELECT COUNT(*) FROM book_club_members WHERE club_id=?) AS members,
          (SELECT COUNT(*) FROM book_club_books WHERE club_id=?) AS books,
          (SELECT COALESCE(SUM(p.pages_read),0) FROM book_club_progress p JOIN book_club_books b ON b.id=p.club_book_id WHERE b.club_id=?) AS pages_read,
          (SELECT COUNT(*) FROM book_club_meetings WHERE club_id=?) AS meetings,
          (SELECT COUNT(*) FROM book_club_messages WHERE club_id=?) AS messages`)
        .get(...Array(5).fill(clubId));
      const archiveName = `book-club-${clubId}-export.zip`;
      const attachmentRows = db.prepare('SELECT filename FROM book_club_message_attachments WHERE club_id=?').all(clubId);
      const attachmentFiles = attachmentRows.map(attachment => ({
        ...attachment,
        source: path.join(clubUploadDir, String(clubId), attachment.filename),
      }));
      if (attachmentFiles.some(attachment => !fs.existsSync(attachment.source))) {
        throw new Error('A club attachment is missing from storage.');
      }
      res.status(200).set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archiveName}"`,
        'Cache-Control': 'private, no-store',
      });
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', error => {
        if (!res.headersSent) next(error);
        else res.destroy(error);
      });
      res.on('close', () => archive.destroy());
      archive.pipe(res);
      archive.append(JSON.stringify(data, null, 2), { name: 'club.json' });
      attachmentFiles.forEach(attachment => archive.file(attachment.source, { name: `attachments/${attachment.filename}` }));
      archive.finalize().catch(error => {
        if (!res.headersSent) next(error);
        else res.destroy(error);
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createBookClubRouter;
