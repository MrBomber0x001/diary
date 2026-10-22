const express = require('express');

const applicationStatuses = new Set(['applied', 'screening', 'interviewing', 'offer', 'rejected', 'withdrawn']);

function createInterviewsRouter({ db, now, text, validDate }) {
  const router = express.Router();

  function validateApplication(body) {
    const application = {
      company: text(body?.company),
      role: text(body?.role),
      status: text(body?.status || 'applied'),
      job_url: text(body?.job_url),
      applied_on: text(body?.applied_on) || null,
      notes: text(body?.notes),
    };
    let parsedUrl;
    try {
      if (application.job_url) parsedUrl = new URL(application.job_url);
    } catch {
      return { error: 'أدخل رابطاً صالحاً للوظيفة.' };
    }
    if (!application.company || application.company.length > 160
      || !application.role || application.role.length > 160
      || !applicationStatuses.has(application.status)
      || application.job_url.length > 2048 || (parsedUrl && !['http:', 'https:'].includes(parsedUrl.protocol))
      || (application.applied_on && !validDate(application.applied_on))
      || application.notes.length > 6000) {
      return { error: 'تحقق من الشركة والمسمى والحالة والتاريخ وملاحظات الطلب.' };
    }
    return { application };
  }

  function validateRound(body) {
    const scheduledStart = text(body?.scheduled_start) || null;
    const scheduledEnd = text(body?.scheduled_end) || null;
    const validDateTime = value => {
      if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
      const date = value.slice(0, 10);
      const parsedDate = new Date(`${date}T00:00:00Z`);
      return Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
    };
    const round = {
      round_name: text(body?.round_name) || 'مقابلة',
      occurred_on: text(body?.occurred_on) || null,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      questions_answers: text(body?.questions_answers),
      questions_for_them: text(body?.questions_for_them),
      experience: text(body?.experience),
      follow_up: text(body?.follow_up),
    };
    if (round.round_name.length > 120
      || (round.occurred_on && !validDate(round.occurred_on))
      || (round.scheduled_start && !validDateTime(round.scheduled_start))
      || (round.scheduled_end && !validDateTime(round.scheduled_end))
      || (round.scheduled_end && !round.scheduled_start)
      || (round.scheduled_start && round.scheduled_end && round.scheduled_end <= round.scheduled_start)
      || round.questions_answers.length > 16000
      || round.questions_for_them.length > 8000
      || round.experience.length > 8000
      || round.follow_up.length > 4000) {
      return { error: 'تحقق من بيانات المقابلة وألا تتجاوز الملاحظات الحد المسموح.' };
    }
    return { round };
  }

  function getApplicationDetails(id, userId) {
    return db.prepare('SELECT company,role FROM interview_applications WHERE id=? AND user_id=?').get(id, userId);
  }

  function calendarEventDetails(application, round) {
    return {
      title: `مقابلة: ${round.round_name} · ${application.company} — ${application.role}`.slice(0, 200),
      description: `مقابلة مرتبطة بطلب التوظيف لدى ${application.company} — ${application.role}`.slice(0, 2000),
      starts_at: round.scheduled_start,
      ends_at: round.scheduled_end,
      all_day: 0,
      recurrence: 'none',
    };
  }

  function saveCalendarEvent(userId, application, round, existingEventId, timestamp) {
    if (!round.scheduled_start) {
      if (existingEventId) {
        db.prepare('DELETE FROM calendar_events WHERE id=? AND user_id=?').run(existingEventId, userId);
      }
      return null;
    }
    const event = calendarEventDetails(application, round);
    if (existingEventId && db.prepare('SELECT id FROM calendar_events WHERE id=? AND user_id=?').get(existingEventId, userId)) {
      db.prepare(`UPDATE calendar_events SET title=?,description=?,starts_at=?,ends_at=?,all_day=0,recurrence='none',updated_at=?
        WHERE id=? AND user_id=?`).run(event.title, event.description, event.starts_at, event.ends_at, timestamp, existingEventId, userId);
      return existingEventId;
    }
    const result = db.prepare(`INSERT INTO calendar_events(user_id,title,description,starts_at,ends_at,all_day,recurrence,created_at,updated_at)
      VALUES (?,?,?,?,?,0,'none',?,?)`).run(userId, event.title, event.description, event.starts_at, event.ends_at, timestamp, timestamp);
    return Number(result.lastInsertRowid);
  }

  function getApplication(id, userId) {
    const application = db.prepare(`SELECT id,company,role,status,job_url,applied_on,notes,created_at,updated_at
      FROM interview_applications WHERE id=? AND user_id=?`).get(id, userId);
    if (!application) return null;
    application.rounds = db.prepare(`SELECT id,round_name,occurred_on,scheduled_start,scheduled_end,calendar_event_id,
      questions_answers,questions_for_them,experience,follow_up,created_at,updated_at
      FROM interview_rounds WHERE application_id=? AND user_id=? ORDER BY COALESCE(scheduled_start,occurred_on) DESC,id DESC`)
      .all(id, userId);
    return application;
  }

  router.get('/interviews', (req, res) => {
    const applications = db.prepare(`SELECT id,company,role,status,job_url,applied_on,notes,created_at,updated_at
      FROM interview_applications WHERE user_id=? ORDER BY updated_at DESC,id DESC`).all(req.user.id);
    const rounds = db.prepare(`SELECT id,application_id,round_name,occurred_on,scheduled_start,scheduled_end,calendar_event_id,
      questions_answers,questions_for_them,experience,follow_up,created_at,updated_at
      FROM interview_rounds WHERE user_id=? ORDER BY COALESCE(scheduled_start,occurred_on) DESC,id DESC`).all(req.user.id);
    const roundsByApplication = new Map();
    rounds.forEach(round => {
      const applicationRounds = roundsByApplication.get(round.application_id) || [];
      applicationRounds.push(round);
      roundsByApplication.set(round.application_id, applicationRounds);
    });
    res.json(applications.map(application => ({
      ...application,
      rounds: roundsByApplication.get(application.id) || [],
    })));
  });

  router.post('/interviews', (req, res) => {
    const { application, error } = validateApplication(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO interview_applications(user_id,company,role,status,job_url,applied_on,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.user.id, application.company, application.role, application.status,
      application.job_url, application.applied_on, application.notes, timestamp, timestamp);
    res.status(201).json(getApplication(result.lastInsertRowid, req.user.id));
  });

  router.put('/interviews/:id', (req, res) => {
    if (!db.prepare('SELECT id FROM interview_applications WHERE id=? AND user_id=?').get(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'طلب التوظيف غير موجود.' });
    }
    const { application, error } = validateApplication(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const updateApplication = db.transaction(() => {
      db.prepare(`UPDATE interview_applications SET company=?,role=?,status=?,job_url=?,applied_on=?,notes=?,updated_at=?
        WHERE id=? AND user_id=?`).run(application.company, application.role, application.status, application.job_url,
        application.applied_on, application.notes, timestamp, req.params.id, req.user.id);
      const scheduledRounds = db.prepare(`SELECT id,round_name,scheduled_start,scheduled_end,calendar_event_id
        FROM interview_rounds WHERE application_id=? AND user_id=? AND calendar_event_id IS NOT NULL`)
        .all(req.params.id, req.user.id);
      scheduledRounds.forEach(round => {
        const event = calendarEventDetails(application, round);
        db.prepare(`UPDATE calendar_events SET title=?,description=?,updated_at=? WHERE id=? AND user_id=?`)
          .run(event.title, event.description, timestamp, round.calendar_event_id, req.user.id);
      });
      return getApplication(req.params.id, req.user.id);
    });
    res.json(updateApplication());
  });

  router.delete('/interviews/:id', (req, res) => {
    const removeApplication = db.transaction(() => {
      const eventIds = db.prepare(`SELECT calendar_event_id FROM interview_rounds
        WHERE application_id=? AND user_id=? AND calendar_event_id IS NOT NULL`).all(req.params.id, req.user.id);
      eventIds.forEach(({ calendar_event_id }) => {
        db.prepare('DELETE FROM calendar_events WHERE id=? AND user_id=?').run(calendar_event_id, req.user.id);
      });
      return db.prepare('DELETE FROM interview_applications WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    });
    const result = removeApplication();
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'طلب التوظيف غير موجود.' });
  });

  router.post('/interviews/:id/rounds', (req, res) => {
    const application = getApplicationDetails(req.params.id, req.user.id);
    if (!application) {
      return res.status(404).json({ error: 'طلب التوظيف غير موجود.' });
    }
    const { round, error } = validateRound(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const createRound = db.transaction(() => {
      const calendarEventId = saveCalendarEvent(req.user.id, application, round, null, timestamp);
      const occurredOn = round.occurred_on;
      const result = db.prepare(`INSERT INTO interview_rounds(application_id,user_id,round_name,occurred_on,
        scheduled_start,scheduled_end,calendar_event_id,questions_answers,questions_for_them,experience,follow_up,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(req.params.id, req.user.id, round.round_name, occurredOn,
        round.scheduled_start, round.scheduled_end, calendarEventId, round.questions_answers, round.questions_for_them,
        round.experience, round.follow_up, timestamp, timestamp);
      return db.prepare(`SELECT id,round_name,occurred_on,scheduled_start,scheduled_end,calendar_event_id,
        questions_answers,questions_for_them,experience,follow_up,created_at,updated_at
        FROM interview_rounds WHERE id=? AND application_id=? AND user_id=?`).get(result.lastInsertRowid, req.params.id, req.user.id);
    });
    res.status(201).json(createRound());
  });

  router.put('/interviews/:id/rounds/:roundId', (req, res) => {
    const existing = db.prepare(`SELECT id,calendar_event_id FROM interview_rounds WHERE id=? AND application_id=? AND user_id=?`)
      .get(req.params.roundId, req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'سجل المقابلة غير موجود.' });
    const application = getApplicationDetails(req.params.id, req.user.id);
    const { round, error } = validateRound(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const updateRound = db.transaction(() => {
      const calendarEventId = saveCalendarEvent(req.user.id, application, round, existing.calendar_event_id, timestamp);
      const occurredOn = round.occurred_on;
      db.prepare(`UPDATE interview_rounds SET round_name=?,occurred_on=?,scheduled_start=?,scheduled_end=?,calendar_event_id=?,
        questions_answers=?,questions_for_them=?,experience=?,follow_up=?,updated_at=? WHERE id=? AND application_id=? AND user_id=?`)
        .run(round.round_name, occurredOn, round.scheduled_start, round.scheduled_end, calendarEventId,
          round.questions_answers, round.questions_for_them, round.experience, round.follow_up, timestamp,
          req.params.roundId, req.params.id, req.user.id);
      return db.prepare(`SELECT id,round_name,occurred_on,scheduled_start,scheduled_end,calendar_event_id,
        questions_answers,questions_for_them,experience,follow_up,created_at,updated_at
        FROM interview_rounds WHERE id=? AND application_id=? AND user_id=?`).get(req.params.roundId, req.params.id, req.user.id);
    });
    res.json(updateRound());
  });

  router.delete('/interviews/:id/rounds/:roundId', (req, res) => {
    const removeRound = db.transaction(() => {
      const round = db.prepare(`SELECT calendar_event_id FROM interview_rounds
        WHERE id=? AND application_id=? AND user_id=?`).get(req.params.roundId, req.params.id, req.user.id);
      if (!round) return { changes: 0 };
      if (round.calendar_event_id) {
        db.prepare('DELETE FROM calendar_events WHERE id=? AND user_id=?').run(round.calendar_event_id, req.user.id);
      }
      return db.prepare('DELETE FROM interview_rounds WHERE id=? AND application_id=? AND user_id=?')
        .run(req.params.roundId, req.params.id, req.user.id);
    });
    const result = removeRound();
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'سجل المقابلة غير موجود.' });
  });

  function validateTopic(body) {
    const title = text(body?.title);
    if (!title || title.length > 120) return { error: 'أدخل اسماً للموضوع لا يتجاوز 120 حرفاً.' };
    return { title };
  }

  function validateCard(body) {
    const question = text(body?.question);
    const answer = text(body?.answer);
    const answerNotes = text(body?.answer_notes);
    const difficulty = text(body?.difficulty || 'intermediate');
    const tags = [...new Set((Array.isArray(body?.tags) ? body.tags : text(body?.tags).split(','))
      .map(tag => text(tag).replace(/,/g, '').slice(0, 40))
      .filter(Boolean))].slice(0, 12);
    if (!question || question.length > 5000 || !answer || answer.length > 10000
      || answerNotes.length > 4000 || !['beginner', 'intermediate', 'advanced'].includes(difficulty)
      || tags.some(tag => tag.length > 40)) {
      return { error: 'أدخل سؤالاً وإجابة ضمن الحد المسموح.' };
    }
    return { question, answer, answer_notes: answerNotes, tags: tags.join(','), difficulty };
  }

  function getTopic(id, userId) {
    const topic = db.prepare(`SELECT t.id,t.title,t.created_at,t.updated_at,
      (SELECT COUNT(*) FROM interview_cards c WHERE c.topic_id=t.id AND c.user_id=t.user_id) AS card_count
      FROM interview_topics t WHERE t.id=? AND t.user_id=?`).get(id, userId);
    if (!topic) return null;
    return topic;
  }

  router.get('/interviews/mock', (req, res) => {
    const topics = db.prepare(`SELECT t.id,t.title,t.created_at,t.updated_at,
      (SELECT COUNT(*) FROM interview_cards c WHERE c.topic_id=t.id AND c.user_id=t.user_id) AS card_count,
      (SELECT COUNT(*) FROM interview_practice_sessions s WHERE s.topic_id=t.id AND s.user_id=t.user_id AND s.completed_at IS NOT NULL) AS practice_count,
      (SELECT MAX(s.completed_at) FROM interview_practice_sessions s WHERE s.topic_id=t.id AND s.user_id=t.user_id) AS last_practiced
      FROM interview_topics t WHERE t.user_id=? ORDER BY t.title COLLATE NOCASE,t.id`).all(req.user.id);
    res.json(topics);
  });

  router.post('/interviews/topics', (req, res) => {
    const { title, error } = validateTopic(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO interview_topics(user_id,title,created_at,updated_at)
      VALUES (?,?,?,?)`).run(req.user.id, title, timestamp, timestamp);
    res.status(201).json(getTopic(result.lastInsertRowid, req.user.id));
  });

  router.put('/interviews/topics/:topicId', (req, res) => {
    if (!db.prepare('SELECT id FROM interview_topics WHERE id=? AND user_id=?').get(req.params.topicId, req.user.id)) {
      return res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
    }
    const { title, error } = validateTopic(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE interview_topics SET title=?,updated_at=? WHERE id=? AND user_id=?')
      .run(title, now(), req.params.topicId, req.user.id);
    res.json(getTopic(req.params.topicId, req.user.id));
  });

  router.delete('/interviews/topics/:topicId', (req, res) => {
    const result = db.prepare('DELETE FROM interview_topics WHERE id=? AND user_id=?')
      .run(req.params.topicId, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
  });

  router.get('/interviews/topics/:topicId/cards', (req, res) => {
    const topic = db.prepare('SELECT id FROM interview_topics WHERE id=? AND user_id=?')
      .get(req.params.topicId, req.user.id);
    if (!topic) return res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
    const query = text(req.query.q).slice(0, 200);
    const difficulty = text(req.query.difficulty);
    const tag = text(req.query.tag).slice(0, 40);
    const mode = text(req.query.mode);
    const requestedPage = Number.parseInt(req.query.page, 10);
    const requestedPageSize = Number.parseInt(req.query.pageSize, 10);
    const pageSize = Number.isInteger(requestedPageSize) ? Math.min(50, Math.max(1, requestedPageSize)) : 20;
    const requestedPageNumber = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
    if (difficulty && !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      return res.status(400).json({ error: 'اختر مستوى صعوبة صحيحاً.' });
    }
    if (mode && !['unpracticed', 'needs_work'].includes(mode)) return res.status(400).json({ error: 'اختر نمط تدريب صحيحاً.' });
    const clauses = ['c.topic_id=?', 'c.user_id=?'];
    const params = [req.params.topicId, req.user.id];
    if (query) {
      clauses.push('(instr(lower(c.question),lower(?))>0 OR instr(lower(c.answer),lower(?))>0 OR instr(lower(c.answer_notes),lower(?))>0 OR instr(lower(c.tags),lower(?))>0)');
      params.push(query, query, query, query);
    }
    if (difficulty) { clauses.push('c.difficulty=?'); params.push(difficulty); }
    if (tag) { clauses.push('instr(\',\' || lower(c.tags) || \',\', \',\' || lower(?) || \',\')>0'); params.push(tag); }
    if (mode === 'unpracticed') {
      clauses.push('NOT EXISTS (SELECT 1 FROM interview_practice_responses r WHERE r.card_id=c.id AND r.user_id=c.user_id)');
    } else if (mode === 'needs_work') {
      clauses.push(`(SELECT r.rating FROM interview_practice_responses r
        WHERE r.card_id=c.id AND r.user_id=c.user_id ORDER BY r.created_at DESC,r.id DESC LIMIT 1)='needs_work'`);
    }
    const where = clauses.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS count FROM interview_cards c WHERE ${where}`).get(...params).count;
    const pageCount = Math.ceil(total / pageSize);
    const page = Math.min(requestedPageNumber, Math.max(1, pageCount));
    const cards = db.prepare(`SELECT c.id,c.topic_id,c.question,c.answer,c.answer_notes,c.tags,c.difficulty,c.created_at,c.updated_at,
      (SELECT r.rating FROM interview_practice_responses r WHERE r.card_id=c.id AND r.user_id=c.user_id
        ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS last_rating
      FROM interview_cards c WHERE ${where} ORDER BY c.id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize);
    res.json({ cards: cards.map(card => ({ ...card, tags: card.tags ? card.tags.split(',') : [] })), total, page, pageSize, pageCount });
  });

  router.get('/interviews/topics/:topicId/quiz', (req, res) => {
    const topic = db.prepare('SELECT id FROM interview_topics WHERE id=? AND user_id=?')
      .get(req.params.topicId, req.user.id);
    if (!topic) return res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
    const query = text(req.query.q).slice(0, 200);
    const requestedCount = text(req.query.count) || '10';
    const limits = { '10': 10, '25': 25, '50': 50, all: null };
    if (!Object.prototype.hasOwnProperty.call(limits, requestedCount)) {
      return res.status(400).json({ error: 'اختر 10 أو 25 أو 50 أو كل البطاقات.' });
    }
    const mode = text(req.query.mode || 'random');
    const difficulty = text(req.query.difficulty);
    const tag = text(req.query.tag).slice(0, 40);
    if (!['random', 'unpracticed', 'needs_work'].includes(mode)) {
      return res.status(400).json({ error: 'اختر نمط تدريب صحيحاً.' });
    }
    if (difficulty && !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      return res.status(400).json({ error: 'اختر مستوى صعوبة صحيحاً.' });
    }
    const clauses = ['c.topic_id=?', 'c.user_id=?'];
    const params = [req.params.topicId, req.user.id];
    if (query) {
      clauses.push('(instr(lower(c.question),lower(?))>0 OR instr(lower(c.answer),lower(?))>0 OR instr(lower(c.answer_notes),lower(?))>0 OR instr(lower(c.tags),lower(?))>0)');
      params.push(query, query, query, query);
    }
    if (difficulty) { clauses.push('c.difficulty=?'); params.push(difficulty); }
    if (tag) { clauses.push('instr(\',\' || lower(c.tags) || \',\', \',\' || lower(?) || \',\')>0'); params.push(tag); }
    if (mode === 'unpracticed') {
      clauses.push('NOT EXISTS (SELECT 1 FROM interview_practice_responses r WHERE r.card_id=c.id AND r.user_id=c.user_id)');
    } else if (mode === 'needs_work') {
      clauses.push(`(SELECT r.rating FROM interview_practice_responses r
        WHERE r.card_id=c.id AND r.user_id=c.user_id ORDER BY r.created_at DESC,r.id DESC LIMIT 1)='needs_work'`);
    }
    const where = clauses.join(' AND ');
    const limit = limits[requestedCount];
    const sql = `SELECT c.id,c.topic_id,c.question,c.answer,c.answer_notes,c.tags,c.difficulty FROM interview_cards c
      WHERE ${where} ORDER BY ${mode === 'random' ? 'RANDOM()' : 'c.id DESC'}${limit ? ' LIMIT ?' : ''}`;
    const cards = db.prepare(sql).all(...(limit ? [...params, limit] : params));
    res.json({ cards: cards.map(card => ({ ...card, tags: card.tags ? card.tags.split(',') : [] })), total: cards.length });
  });

  router.post('/interviews/topics/:topicId/practice-sessions', (req, res) => {
    const topic = db.prepare('SELECT id FROM interview_topics WHERE id=? AND user_id=?').get(req.params.topicId, req.user.id);
    if (!topic) return res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
    const mode = text(req.body?.mode || 'random');
    const requestedCount = text(req.body?.count || '10');
    const timeLimitSeconds = Number(req.body?.time_limit_seconds || 0);
    const limits = { '5': 5, '10': 10, '20': 20, all: null };
    const difficulty = text(req.body?.difficulty);
    const tag = text(req.body?.tag).slice(0, 40);
    if (!['random', 'unpracticed', 'needs_work'].includes(mode)
      || !Object.prototype.hasOwnProperty.call(limits, requestedCount)
      || ![0, 30, 60, 90, 120, 180].includes(timeLimitSeconds)
      || difficulty && !['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      return res.status(400).json({ error: 'تحقق من نمط التدريب والعدد والوقت ومستوى الصعوبة.' });
    }
    const clauses = ['c.topic_id=?', 'c.user_id=?'];
    const params = [topic.id, req.user.id];
    if (difficulty) { clauses.push('c.difficulty=?'); params.push(difficulty); }
    if (tag) { clauses.push('instr(\',\' || lower(c.tags) || \',\', \',\' || lower(?) || \',\')>0'); params.push(tag); }
    if (mode === 'unpracticed') {
      clauses.push('NOT EXISTS (SELECT 1 FROM interview_practice_responses r WHERE r.card_id=c.id AND r.user_id=c.user_id)');
    } else if (mode === 'needs_work') {
      clauses.push(`(SELECT r.rating FROM interview_practice_responses r
        WHERE r.card_id=c.id AND r.user_id=c.user_id ORDER BY r.created_at DESC,r.id DESC LIMIT 1)='needs_work'`);
    }
    const limit = limits[requestedCount];
    const cards = db.prepare(`SELECT c.id,c.topic_id,c.question,c.answer,c.answer_notes,c.tags,c.difficulty
      FROM interview_cards c WHERE ${clauses.join(' AND ')} ORDER BY RANDOM()${limit ? ' LIMIT ?' : ''}`)
      .all(...(limit ? [...params, limit] : params));
    if (!cards.length) return res.status(400).json({ error: 'لا توجد أسئلة تطابق هذا النمط. جرّب تغيير التصفية أو أضف أسئلة.' });
    const startedAt = now();
    const created = db.prepare(`INSERT INTO interview_practice_sessions
      (topic_id,user_id,mode,question_count,time_limit_seconds,started_at) VALUES (?,?,?,?,?,?)`)
      .run(topic.id, req.user.id, mode, cards.length, timeLimitSeconds, startedAt);
    res.status(201).json({
      id: Number(created.lastInsertRowid),
      mode,
      question_count: cards.length,
      time_limit_seconds: timeLimitSeconds,
      started_at: startedAt,
      cards: cards.map(card => ({ ...card, tags: card.tags ? card.tags.split(',') : [] })),
    });
  });

  router.put('/interviews/practice-sessions/:sessionId/responses/:cardId', (req, res) => {
    const session = db.prepare(`SELECT s.id FROM interview_practice_sessions s
      WHERE s.id=? AND s.user_id=? AND s.completed_at IS NULL`).get(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'جلسة التدريب غير موجودة أو منتهية.' });
    const card = db.prepare(`SELECT id FROM interview_cards WHERE id=? AND topic_id=(
      SELECT topic_id FROM interview_practice_sessions WHERE id=? AND user_id=?) AND user_id=?`)
      .get(req.params.cardId, req.params.sessionId, req.user.id, req.user.id);
    if (!card) return res.status(404).json({ error: 'السؤال غير موجود في جلسة التدريب.' });
    const rating = text(req.body?.rating);
    const response = typeof req.body?.response === 'string' ? req.body.response : '';
    const elapsed = Number(req.body?.elapsed_seconds);
    if (!['strong', 'needs_work', 'skip'].includes(rating) || response.length > 12000
      || !Number.isInteger(elapsed) || elapsed < 0 || elapsed > 86400) {
      return res.status(400).json({ error: 'تحقق من تقييم الإجابة ووقت التدريب.' });
    }
    const timestamp = now();
    db.prepare(`INSERT INTO interview_practice_responses(session_id,card_id,user_id,rating,response,elapsed_seconds,created_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(session_id,card_id) DO UPDATE SET
      rating=excluded.rating,response=excluded.response,elapsed_seconds=excluded.elapsed_seconds,created_at=excluded.created_at`)
      .run(req.params.sessionId, card.id, req.user.id, rating, response, elapsed, timestamp);
    res.json({ saved: true, rating, elapsed_seconds: elapsed });
  });

  router.post('/interviews/practice-sessions/:sessionId/complete', (req, res) => {
    const session = db.prepare(`SELECT id,started_at,completed_at,question_count FROM interview_practice_sessions
      WHERE id=? AND user_id=?`).get(req.params.sessionId, req.user.id);
    if (!session) return res.status(404).json({ error: 'جلسة التدريب غير موجودة.' });
    if (session.completed_at) return res.json({ completed: true, completed_at: session.completed_at });
    const suppliedElapsed = Number(req.body?.elapsed_seconds);
    if (!Number.isInteger(suppliedElapsed) || suppliedElapsed < 0 || suppliedElapsed > 86400) {
      return res.status(400).json({ error: 'وقت الجلسة غير صالح.' });
    }
    const completedAt = now();
    db.prepare('UPDATE interview_practice_sessions SET completed_at=?,elapsed_seconds=? WHERE id=? AND user_id=?')
      .run(completedAt, suppliedElapsed, session.id, req.user.id);
    const summary = db.prepare(`SELECT COUNT(*) AS answered,
      SUM(CASE WHEN rating='strong' THEN 1 ELSE 0 END) AS strong,
      SUM(CASE WHEN rating='needs_work' THEN 1 ELSE 0 END) AS needs_work,
      SUM(CASE WHEN rating='skip' THEN 1 ELSE 0 END) AS skipped
      FROM interview_practice_responses WHERE session_id=? AND user_id=?`).get(session.id, req.user.id);
    res.json({ completed: true, completed_at: completedAt, question_count: session.question_count, elapsed_seconds: suppliedElapsed,
      answered: summary.answered, strong: summary.strong || 0, needs_work: summary.needs_work || 0, skipped: summary.skipped || 0 });
  });

  router.get('/interviews/topics/:topicId/practice-sessions', (req, res) => {
    const topic = db.prepare('SELECT id FROM interview_topics WHERE id=? AND user_id=?').get(req.params.topicId, req.user.id);
    if (!topic) return res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
    const sessions = db.prepare(`SELECT s.id,s.mode,s.question_count,s.time_limit_seconds,s.started_at,s.completed_at,s.elapsed_seconds,
      COUNT(r.id) AS answered,
      SUM(CASE WHEN r.rating='strong' THEN 1 ELSE 0 END) AS strong,
      SUM(CASE WHEN r.rating='needs_work' THEN 1 ELSE 0 END) AS needs_work,
      SUM(CASE WHEN r.rating='skip' THEN 1 ELSE 0 END) AS skipped
      FROM interview_practice_sessions s LEFT JOIN interview_practice_responses r ON r.session_id=s.id AND r.user_id=s.user_id
      WHERE s.topic_id=? AND s.user_id=? AND s.completed_at IS NOT NULL
      GROUP BY s.id ORDER BY s.started_at DESC,s.id DESC LIMIT 20`)
      .all(topic.id, req.user.id);
    res.json(sessions.map(session => ({ ...session, strong: session.strong || 0, needs_work: session.needs_work || 0, skipped: session.skipped || 0 })));
  });

  router.post('/interviews/topics/:topicId/cards', (req, res) => {
    if (!db.prepare('SELECT id FROM interview_topics WHERE id=? AND user_id=?').get(req.params.topicId, req.user.id)) {
      return res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
    }
    const { question, answer, answer_notes, tags, difficulty, error } = validateCard(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result =     db.prepare(`INSERT INTO interview_cards(topic_id,user_id,question,answer,answer_notes,tags,difficulty,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.params.topicId, req.user.id, question, answer, answer_notes, tags, difficulty, timestamp, timestamp);
    res.status(201).json({
      id: result.lastInsertRowid,
      topic_id: Number(req.params.topicId),
      question,
      answer,
      answer_notes,
      tags: tags ? tags.split(',') : [],
      difficulty,
      created_at: timestamp,
      updated_at: timestamp,
    });
  });

  router.post('/interviews/topics/:topicId/cards/import', (req, res) => {
    const topic = db.prepare('SELECT id FROM interview_topics WHERE id=? AND user_id=?')
      .get(req.params.topicId, req.user.id);
    if (!topic) return res.status(404).json({ error: 'موضوع التدريب غير موجود.' });
    const cards = req.body?.cards;
    if (!Array.isArray(cards) || cards.length < 1 || cards.length > 500) {
      return res.status(400).json({ error: 'استورد من سؤال واحد إلى 500 سؤال في كل مرة.' });
    }
    const validated = [];
    for (const [index, card] of cards.entries()) {
      const result = validateCard(card);
      if (result.error) {
        return res.status(400).json({ error: `السؤال رقم ${index + 1}: ${result.error}` });
      }
      validated.push(result);
    }
    const normalizeQuestion = question => question.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const importCards = db.transaction(() => {
      const existing = db.prepare('SELECT question FROM interview_cards WHERE topic_id=? AND user_id=?')
        .all(topic.id, req.user.id);
      const seen = new Set(existing.map(card => normalizeQuestion(card.question)));
      const insert = db.prepare(`INSERT INTO interview_cards(topic_id,user_id,question,answer,answer_notes,tags,difficulty,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      let imported = 0;
      let duplicates = 0;
      const timestamp = now();
      for (const { question, answer, answer_notes, tags, difficulty } of validated) {
        const normalized = normalizeQuestion(question);
        if (seen.has(normalized)) {
          duplicates += 1;
          continue;
        }
        insert.run(topic.id, req.user.id, question, answer, answer_notes, tags, difficulty, timestamp, timestamp);
        seen.add(normalized);
        imported += 1;
      }
      return { imported, duplicates };
    });
    res.status(201).json(importCards());
  });

  router.put('/interviews/topics/:topicId/cards/:cardId', (req, res) => {
    if (!db.prepare(`SELECT id FROM interview_cards WHERE id=? AND topic_id=? AND user_id=?`)
      .get(req.params.cardId, req.params.topicId, req.user.id)) {
      return res.status(404).json({ error: 'بطاقة التدريب غير موجودة.' });
    }
    const { question, answer, answer_notes, tags, difficulty, error } = validateCard(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    db.prepare(`UPDATE interview_cards SET question=?,answer=?,answer_notes=?,tags=?,difficulty=?,updated_at=?
      WHERE id=? AND topic_id=? AND user_id=?`)
      .run(question, answer, answer_notes, tags, difficulty, timestamp, req.params.cardId, req.params.topicId, req.user.id);
    res.json({
      id: Number(req.params.cardId),
      topic_id: Number(req.params.topicId),
      question,
      answer,
      answer_notes,
      tags: tags ? tags.split(',') : [],
      difficulty,
      updated_at: timestamp,
    });
  });

  router.delete('/interviews/topics/:topicId/cards/:cardId', (req, res) => {
    const result = db.prepare(`DELETE FROM interview_cards WHERE id=? AND topic_id=? AND user_id=?`)
      .run(req.params.cardId, req.params.topicId, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'بطاقة التدريب غير موجودة.' });
  });

  return router;
}

module.exports = createInterviewsRouter;
