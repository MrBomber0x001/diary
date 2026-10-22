const express = require('express');

const dateAfter = (date, days) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

function validateEvent(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const startsAt = typeof body?.starts_at === 'string' ? body.starts_at.trim() : '';
  const endsAt = typeof body?.ends_at === 'string' ? body.ends_at.trim() : '';
  const recurrence = typeof body?.recurrence === 'string' ? body.recurrence : 'none';
  const allDay = body?.all_day === true || body?.all_day === 1 || body?.all_day === 'on';
  const validDateTime = value => {
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return false;
    const [date] = value.split('T');
    const parsedDate = new Date(`${date}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsedDate.getTime())
      && parsedDate.toISOString().slice(0, 10) === date;
  };
  if (!title || title.length > 200 || description.length > 2000) {
    return { error: 'عنوان الموعد مطلوب (حتى ٢٠٠ حرف)، والوصف حتى ٢٠٠٠ حرف.' };
  }
  if (!validDateTime(startsAt) || endsAt && !validDateTime(endsAt) || endsAt && endsAt < startsAt) {
    return { error: 'أدخل وقت بداية ونهاية صحيحين للموعد.' };
  }
  if (!['none', 'daily', 'weekly', 'monthly'].includes(recurrence)) {
    return { error: 'اختر تكراراً صحيحاً للموعد.' };
  }
  return { event: { title, description, starts_at: startsAt, ends_at: endsAt || null, all_day: allDay, recurrence } };
}

function validateHabit(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  const frequency = typeof body?.frequency === 'string' ? body.frequency : 'daily';
  const targetPerWeek = Number(body?.target_per_week ?? (frequency === 'daily' ? 7 : 3));
  if (!title || title.length > 120 || notes.length > 1000) {
    return { error: 'عنوان العادة مطلوب (حتى ١٢٠ حرفاً)، والملاحظات حتى ١٠٠٠ حرف.' };
  }
  if (!['daily', 'weekly'].includes(frequency) || !Number.isInteger(targetPerWeek) || targetPerWeek < 1 || targetPerWeek > 7) {
    return { error: 'اختر تكراراً وهدفاً أسبوعياً صحيحين.' };
  }
  return { habit: { title, notes, frequency, target_per_week: targetPerWeek } };
}

function validateRoutine(body) {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const steps = Array.isArray(body?.steps) ? body.steps.map(step => (typeof step === 'string' ? step.trim() : '')) : [];
  if (!title || title.length > 120 || description.length > 1000) {
    return { error: 'عنوان الروتين مطلوب (حتى ١٢٠ حرفاً)، والوصف حتى ١٠٠٠ حرف.' };
  }
  if (steps.length > 30 || steps.some(step => !step || step.length > 160)) {
    return { error: 'أضف حتى ٣٠ خطوة، على ألا يتجاوز طول كل خطوة ١٦٠ حرفاً.' };
  }
  return { routine: { title, description, steps } };
}

function recurringEventDates(event, startDate, endDate) {
  const firstDate = event.starts_at.slice(0, 10);
  const from = firstDate > startDate ? firstDate : startDate;
  const [firstYear, firstMonth, firstDay] = firstDate.split('-').map(Number);
  const dates = [];
  for (let date = from; date <= endDate; date = dateAfter(date, 1)) {
    if (event.recurrence === 'none' && date !== firstDate) continue;
    if (event.recurrence === 'weekly' && (new Date(`${date}T00:00:00Z`) - new Date(`${firstDate}T00:00:00Z`)) % (7 * 86400000) !== 0) continue;
    if (event.recurrence === 'monthly') {
      const [year, month, day] = date.split('-').map(Number);
      const monthOffset = (year - firstYear) * 12 + month - firstMonth;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (monthOffset < 0 || day !== Math.min(firstDay, lastDay)) continue;
    }
    dates.push(date);
  }
  return dates;
}

function createActivityRouter({ db, now, text, localToday, localTime, validDate }) {
  const router = express.Router();
  router.get('/events', (req, res) => {
    const startDate = validDate(text(req.query.start)) ? text(req.query.start) : localToday();
    const requestedEnd = validDate(text(req.query.end)) ? text(req.query.end) : dateAfter(startDate, 13);
    const endDate = requestedEnd < startDate ? startDate : requestedEnd;
    if ((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / 86400000 > 90) {
      return res.status(400).json({ error: 'اعرض تقويماً لمدة لا تتجاوز ٩٠ يوماً.' });
    }
    const rows = db.prepare(`SELECT e.*,r.application_id AS interview_application_id,
      a.company AS interview_company,a.role AS interview_role
      FROM calendar_events e
      LEFT JOIN interview_rounds r ON r.calendar_event_id=e.id AND r.user_id=e.user_id
      LEFT JOIN interview_applications a ON a.id=r.application_id AND a.user_id=r.user_id
      WHERE e.user_id=? AND e.starts_at<=? AND (e.recurrence<>'none' OR e.starts_at>=?) ORDER BY e.starts_at,e.title`)
      .all(req.user.id, `${endDate}T23:59`, `${startDate}T00:00`);
    const occurrences = rows.flatMap(event => recurringEventDates(event, startDate, endDate).map(date => ({
      ...event,
      occurrence_date: date,
      occurrence_start: `${date}${event.starts_at.slice(10)}`,
      occurrence_end: event.ends_at ? `${date}${event.ends_at.slice(10)}` : null,
    })));
    occurrences.sort((first, second) => first.occurrence_start.localeCompare(second.occurrence_start) || first.title.localeCompare(second.title));
    res.json(occurrences);
  });

  router.post('/events', (req, res) => {
    const { event, error } = validateEvent(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO calendar_events(user_id,title,description,starts_at,ends_at,all_day,recurrence,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(req.user.id, event.title, event.description, event.starts_at, event.ends_at,
      Number(event.all_day), event.recurrence, timestamp, timestamp);
    res.status(201).json(db.prepare('SELECT * FROM calendar_events WHERE id=?').get(result.lastInsertRowid));
  });

  router.put('/events/:id', (req, res) => {
    if (!db.prepare('SELECT id FROM calendar_events WHERE id=? AND user_id=?').get(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'الحدث غير موجود.' });
    }
    const { event, error } = validateEvent(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE calendar_events SET title=?,description=?,starts_at=?,ends_at=?,all_day=?,recurrence=?,updated_at=?
      WHERE id=? AND user_id=?`).run(event.title, event.description, event.starts_at, event.ends_at,
      Number(event.all_day), event.recurrence, now(), req.params.id, req.user.id);
    res.json(db.prepare('SELECT * FROM calendar_events WHERE id=?').get(req.params.id));
  });

  router.delete('/events/:id', (req, res) => {
    const result = db.prepare('DELETE FROM calendar_events WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'الحدث غير موجود.' });
  });

  router.get('/habits', (req, res) => {
    const today = localToday();
    const weekStart = dateAfter(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const rows = db.prepare(`SELECT h.*,
      EXISTS(SELECT 1 FROM habit_logs l WHERE l.habit_id=h.id AND l.user_id=h.user_id AND l.habit_date=?) AS completed_today,
      (SELECT COUNT(*) FROM habit_logs l WHERE l.habit_id=h.id AND l.user_id=h.user_id AND l.habit_date>=? AND l.habit_date<=?) AS completed_this_week,
      (SELECT COUNT(*) FROM habit_logs l WHERE l.habit_id=h.id AND l.user_id=h.user_id) AS total_completions,
      (SELECT GROUP_CONCAT(l.habit_date, ',') FROM habit_logs l WHERE l.habit_id=h.id AND l.user_id=h.user_id AND l.habit_date<=?) AS log_dates
      FROM habits h WHERE h.user_id=? AND h.archived=0 ORDER BY h.title`).all(today, weekStart, today, today, req.user.id);
    res.json(rows.map(row => {
      const completedDates = new Set((row.log_dates || '').split(',').filter(Boolean));
      const week = Array.from({ length: 7 }, (_, index) => {
        const date = dateAfter(weekStart, index);
        return { date, completed: completedDates.has(date) };
      });
      let streak = 0;
      let date = today;
      if (!completedDates.has(date)) date = dateAfter(date, -1);
      while (completedDates.has(date) && streak < 3660) {
        streak += 1;
        date = dateAfter(date, -1);
      }
      const { log_dates, ...habit } = row;
      return { ...habit, completed_today: Boolean(row.completed_today), streak, week };
    }));
  });

  router.post('/habits', (req, res) => {
    const { habit, error } = validateHabit(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO habits(user_id,title,notes,frequency,target_per_week,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(req.user.id, habit.title, habit.notes, habit.frequency, habit.target_per_week, timestamp, timestamp);
    res.status(201).json(db.prepare('SELECT * FROM habits WHERE id=?').get(result.lastInsertRowid));
  });

  router.put('/habits/:id', (req, res) => {
    if (!db.prepare('SELECT id FROM habits WHERE id=? AND user_id=? AND archived=0').get(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'العادة غير موجودة.' });
    }
    const { habit, error } = validateHabit(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE habits SET title=?,notes=?,frequency=?,target_per_week=?,updated_at=? WHERE id=? AND user_id=?`)
      .run(habit.title, habit.notes, habit.frequency, habit.target_per_week, now(), req.params.id, req.user.id);
    res.json(db.prepare('SELECT * FROM habits WHERE id=?').get(req.params.id));
  });

  router.delete('/habits/:id', (req, res) => {
    const result = db.prepare('UPDATE habits SET archived=1,updated_at=? WHERE id=? AND user_id=? AND archived=0')
      .run(now(), req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'العادة غير موجودة.' });
  });

  router.put('/habits/:id/log', (req, res) => {
    const habit = db.prepare('SELECT id FROM habits WHERE id=? AND user_id=? AND archived=0').get(req.params.id, req.user.id);
    if (!habit) return res.status(404).json({ error: 'العادة غير موجودة.' });
    const habitDate = text(req.body?.date || localToday());
    const completed = req.body?.completed;
    if (!validDate(habitDate) || habitDate > localToday() || typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'تحقق من تاريخ العادة وحالة الإنجاز.' });
    }
    if (completed) {
      db.prepare('INSERT OR IGNORE INTO habit_logs(habit_id,user_id,habit_date,completed_at) VALUES (?,?,?,?)')
        .run(habit.id, req.user.id, habitDate, now());
    } else {
      db.prepare('DELETE FROM habit_logs WHERE habit_id=? AND user_id=? AND habit_date=?').run(habit.id, req.user.id, habitDate);
    }
    res.json({ ok: true, completed });
  });

  router.get('/routines', (req, res) => {
    const today = localToday();
    const weekStart = dateAfter(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    res.json(db.prepare(`SELECT r.*,
      EXISTS(SELECT 1 FROM routine_logs l WHERE l.routine_id=r.id AND l.user_id=r.user_id AND l.routine_date=?) AS completed_today,
      (SELECT COUNT(*) FROM routine_logs l WHERE l.routine_id=r.id AND l.user_id=r.user_id AND l.routine_date BETWEEN ? AND ?) AS completed_this_week,
      (SELECT COUNT(*) FROM routine_logs l WHERE l.routine_id=r.id AND l.user_id=r.user_id) AS total_completions
      FROM routines r WHERE r.user_id=? AND r.archived=0 ORDER BY r.position,r.title`).all(today, weekStart, today, req.user.id)
      .map(routine => ({ ...routine, steps: JSON.parse(routine.steps), completed_today: Boolean(routine.completed_today) })));
  });

  router.post('/routines', (req, res) => {
    const { routine, error } = validateRoutine(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const position = db.prepare('SELECT COUNT(*) AS count FROM routines WHERE user_id=? AND archived=0').get(req.user.id).count;
    const result = db.prepare(`INSERT INTO routines(user_id,title,description,steps,position,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(req.user.id, routine.title, routine.description, JSON.stringify(routine.steps), position, timestamp, timestamp);
    res.status(201).json({ id: result.lastInsertRowid, ...routine });
  });

  router.put('/routines/:id', (req, res) => {
    if (!db.prepare('SELECT id FROM routines WHERE id=? AND user_id=? AND archived=0').get(req.params.id, req.user.id)) {
      return res.status(404).json({ error: 'الروتين غير موجود.' });
    }
    const { routine, error } = validateRoutine(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare('UPDATE routines SET title=?,description=?,steps=?,updated_at=? WHERE id=? AND user_id=?')
      .run(routine.title, routine.description, JSON.stringify(routine.steps), now(), req.params.id, req.user.id);
    res.json({ id: Number(req.params.id), ...routine });
  });

  router.delete('/routines/:id', (req, res) => {
    const result = db.prepare('UPDATE routines SET archived=1,updated_at=? WHERE id=? AND user_id=? AND archived=0')
      .run(now(), req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'الروتين غير موجود.' });
  });

  router.put('/routines/:id/log', (req, res) => {
    const routine = db.prepare('SELECT id FROM routines WHERE id=? AND user_id=? AND archived=0').get(req.params.id, req.user.id);
    if (!routine) return res.status(404).json({ error: 'الروتين غير موجود.' });
    const routineDate = text(req.body?.date || localToday());
    const completed = req.body?.completed;
    if (!validDate(routineDate) || routineDate > localToday() || typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'تحقق من تاريخ الروتين وحالة الإنجاز.' });
    }
    if (completed) {
      db.prepare('INSERT OR IGNORE INTO routine_logs(routine_id,user_id,routine_date,completed_at) VALUES (?,?,?,?)')
        .run(routine.id, req.user.id, routineDate, now());
    } else {
      db.prepare('DELETE FROM routine_logs WHERE routine_id=? AND user_id=? AND routine_date=?').run(routine.id, req.user.id, routineDate);
    }
    res.json({ ok: true, completed });
  });

  const focusStats = userId => {
    const today = localToday();
    const weekStart = dateAfter(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const totals = db.prepare(`SELECT COUNT(completed_at) AS completed_sessions,
      COALESCE(SUM(CASE WHEN completed_at IS NOT NULL THEN focus_minutes ELSE 0 END),0) AS focus_minutes,
      COALESCE(SUM(xp_earned),0) AS total_xp,
      COALESCE(SUM(CASE WHEN substr(completed_at,1,10)>=? THEN xp_earned ELSE 0 END),0) AS week_xp
      FROM focus_sessions WHERE user_id=?`).get(weekStart, userId);
    const sessions = db.prepare(`SELECT f.id,f.focus_minutes,f.xp_earned,f.todo_id,f.context_label,f.started_at,f.completed_at,
      t.title AS todo_title FROM focus_sessions f LEFT JOIN todos t ON t.id=f.todo_id
      WHERE f.user_id=? AND f.completed_at IS NOT NULL ORDER BY f.completed_at DESC LIMIT 20`).all(userId);
    return { ...totals, sessions };
  };

  router.get('/focus', (req, res) => res.json(focusStats(req.user.id)));

  router.post('/focus/start', (req, res) => {
    const sessionKey = typeof req.body?.session_key === 'string' ? req.body.session_key.trim() : '';
    const focusMinutes = Number(req.body?.focus_minutes);
    const todoId = req.body?.todo_id === null || req.body?.todo_id === '' || req.body?.todo_id === undefined
      ? null : Number(req.body.todo_id);
    const contextLabel = typeof req.body?.context_label === 'string' ? req.body.context_label.trim() : '';
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionKey)
      || !Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 180
      || (todoId !== null && (!Number.isInteger(todoId) || todoId < 1))
      || contextLabel.length > 160) {
      return res.status(400).json({ error: 'تحقق من معرّف جلسة التركيز ومدتها وسياقها.' });
    }
    const existing = db.prepare('SELECT id,focus_minutes,todo_id,context_label,started_at,completed_at,paused FROM focus_sessions WHERE user_id=? AND session_key=?')
      .get(req.user.id, sessionKey);
    if (existing) {
      if (existing.focus_minutes !== focusMinutes || (existing.todo_id !== todoId && existing.todo_id !== null)
        || existing.context_label !== contextLabel || existing.completed_at) {
        return res.status(409).json({ error: 'معرّف الجلسة مستخدم بالفعل.' });
      }
      if (existing.paused) {
        const resumedAt = now();
        db.prepare('UPDATE focus_sessions SET started_at=?,paused=0 WHERE id=? AND user_id=? AND completed_at IS NULL')
          .run(resumedAt, existing.id, req.user.id);
        return res.json({ ...existing, started_at: resumedAt, paused: 0 });
      }
      return res.json(existing);
    }
    if (todoId !== null && !db.prepare('SELECT id FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL').get(todoId, req.user.id)) {
      return res.status(400).json({ error: 'المهمة المختارة غير موجودة.' });
    }
    const startedAt = now();
    db.prepare(`INSERT INTO focus_sessions(user_id,session_key,focus_minutes,todo_id,context_label,started_at,created_at)
      VALUES (?,?,?,?,?,?,?)`).run(req.user.id, sessionKey, focusMinutes, todoId, contextLabel, startedAt, startedAt);
    const session = db.prepare(`SELECT f.id,f.focus_minutes,f.todo_id,f.context_label,f.started_at,f.completed_at,t.title AS todo_title
      FROM focus_sessions f LEFT JOIN todos t ON t.id=f.todo_id WHERE f.user_id=? AND f.session_key=?`)
      .get(req.user.id, sessionKey);
    res.status(201).json(session);
  });

  router.post('/focus/complete', (req, res) => {
    const sessionKey = typeof req.body?.session_key === 'string' ? req.body.session_key.trim() : '';
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionKey)) {
      return res.status(400).json({ error: 'معرّف جلسة التركيز غير صالح.' });
    }
    const session = db.prepare('SELECT id,focus_minutes,xp_earned,started_at,elapsed_seconds,paused,completed_at FROM focus_sessions WHERE user_id=? AND session_key=?')
      .get(req.user.id, sessionKey);
    if (!session) return res.status(404).json({ error: 'جلسة التركيز غير موجودة.' });
    const activeSeconds = session.paused ? 0 : Math.max(0, Math.floor((Date.parse(now()) - Date.parse(session.started_at)) / 1000));
    if (!session.completed_at && session.elapsed_seconds + activeSeconds < session.focus_minutes * 60) {
      return res.status(409).json({ error: 'لم تكتمل مدة جلسة التركيز بعد.' });
    }
    if (!session.completed_at) {
      const completedAt = now();
      db.prepare('UPDATE focus_sessions SET xp_earned=focus_minutes,completed_at=? WHERE id=? AND user_id=? AND completed_at IS NULL')
        .run(completedAt, session.id, req.user.id);
    }
    const completed = db.prepare(`SELECT f.id,f.focus_minutes,f.xp_earned,f.todo_id,f.context_label,t.title AS todo_title,f.completed_at
      FROM focus_sessions f LEFT JOIN todos t ON t.id=f.todo_id WHERE f.id=? AND f.user_id=?`)
      .get(session.id, req.user.id);
    res.json({ ...completed, ...focusStats(req.user.id) });
  });

  router.post('/focus/pause', (req, res) => {
    const sessionKey = typeof req.body?.session_key === 'string' ? req.body.session_key.trim() : '';
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionKey)) {
      return res.status(400).json({ error: 'معرّف جلسة التركيز غير صالح.' });
    }
    const session = db.prepare(`SELECT id,started_at,elapsed_seconds,paused,completed_at
      FROM focus_sessions WHERE user_id=? AND session_key=?`).get(req.user.id, sessionKey);
    if (!session) return res.status(404).json({ error: 'جلسة التركيز غير موجودة.' });
    if (session.completed_at) return res.status(409).json({ error: 'جلسة التركيز مكتملة بالفعل.' });
    if (session.paused) return res.json({ ok: true, elapsed_seconds: session.elapsed_seconds, paused: true });
    const elapsedSeconds = session.elapsed_seconds
      + Math.max(0, Math.floor((Date.parse(now()) - Date.parse(session.started_at)) / 1000));
    db.prepare('UPDATE focus_sessions SET elapsed_seconds=?,paused=1 WHERE id=? AND user_id=? AND completed_at IS NULL')
      .run(elapsedSeconds, session.id, req.user.id);
    res.json({ ok: true, elapsed_seconds: elapsedSeconds, paused: true });
  });

  router.delete('/focus/:sessionKey', (req, res) => {
    const result = db.prepare('DELETE FROM focus_sessions WHERE user_id=? AND session_key=? AND completed_at IS NULL')
      .run(req.user.id, req.params.sessionKey);
    res.json({ ok: true, cancelled: result.changes > 0 });
  });

  router.get('/today', (req, res) => {
    const today = localToday();
    const dayStart = `${today}T00:00`;
    const dayEnd = `${today}T23:59`;
    const rows = db.prepare(`SELECT e.id,e.title,e.description,e.starts_at,e.ends_at,e.all_day,e.recurrence,
      r.application_id AS interview_application_id,a.company AS interview_company,a.role AS interview_role
      FROM calendar_events e
      LEFT JOIN interview_rounds r ON r.calendar_event_id=e.id AND r.user_id=e.user_id
      LEFT JOIN interview_applications a ON a.id=r.application_id AND a.user_id=r.user_id
      WHERE e.user_id=? AND e.starts_at<=? AND (e.recurrence<>'none' OR e.starts_at>=?) ORDER BY e.starts_at`)
      .all(req.user.id, dayEnd, dayStart);
    const events = rows.flatMap(event => recurringEventDates(event, today, today).map(date => ({
      ...event,
      occurrence_start: `${date}${event.starts_at.slice(10)}`,
      occurrence_end: event.ends_at ? `${date}${event.ends_at.slice(10)}` : null,
    })));
    const tasks = db.prepare(`SELECT id,title,due_date,due_time,project_id FROM todos
      WHERE user_id=? AND deleted_at IS NULL AND completed=0 AND due_date=?
      ORDER BY due_time IS NULL,due_time,id`).all(req.user.id, today);
    const habits = db.prepare(`SELECT COUNT(*) AS total,
      (SELECT COUNT(*) FROM habits h JOIN habit_logs l ON l.habit_id=h.id AND l.habit_date=?
        WHERE h.user_id=? AND h.archived=0) AS completed FROM habits WHERE user_id=? AND archived=0`)
      .get(today, req.user.id, req.user.id);
    const routines = db.prepare(`SELECT COUNT(*) AS total,
      (SELECT COUNT(*) FROM routines r JOIN routine_logs l ON l.routine_id=r.id AND l.routine_date=?
        WHERE r.user_id=? AND r.archived=0) AS completed FROM routines WHERE user_id=? AND archived=0`)
      .get(today, req.user.id, req.user.id);
    res.json({ date: today, events, tasks, habits, routines });
  });

  router.get('/timeline', (req, res) => {
    const end = text(req.query.end || localToday());
    if (!validDate(end)) return res.status(400).json({ error: 'اختر تاريخ نهاية صحيحاً.' });
    const defaultStart = dateAfter(end, -29);
    const start = text(req.query.start || defaultStart);
    if (!validDate(start) || !validDate(end) || start > end || start < dateAfter(end, -1825)) {
      return res.status(400).json({ error: 'اختر فترة صحيحة لا تتجاوز خمس سنوات.' });
    }
    const userId = req.user.id;
    const calendarEntries = db.prepare(`SELECT id,title,description,starts_at,ends_at,recurrence
      FROM calendar_events WHERE user_id=? AND starts_at<=? AND (recurrence<>'none' OR starts_at>=?)`)
      .all(userId, `${end}T23:59`, `${start}T00:00`)
      .flatMap(event => recurringEventDates(event, start, end).map(date => ({
        id: event.id,
        type: 'event',
        title: event.title,
        date,
        detail: event.description,
      })));
    const entries = [
      ...db.prepare(`SELECT id,
          CASE WHEN lower(tags) LIKE '%idea%' OR lower(tags) LIKE '%thought%' OR tags LIKE '%فكر%' THEN 'thought' ELSE 'writing' END AS type,
        title,substr(created_at,1,10) AS date,notes AS detail,'/item/' || id AS href
        FROM items WHERE user_id=? AND deleted_at IS NULL AND kind='memo' AND substr(created_at,1,10) BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT id,'writing' AS type,COALESCE(NULLIF(title,''),'مذكرة اليوم') AS title,
        note_date AS date,substr(body,1,1000) AS detail,'/?view=daily-note&date=' || note_date AS href
        FROM daily_notes WHERE user_id=? AND note_date BETWEEN ? AND ? AND body<>''`)
        .all(userId, start, end),
      ...calendarEntries.map(entry => ({ ...entry, href: `/?view=calendar&date=${entry.date}` })),
      ...db.prepare(`SELECT id,'reading' AS type,title,substr(updated_at,1,10) AS date,
        CASE WHEN creator<>'' THEN creator ELSE progress END AS detail,'/item/' || id AS href
        FROM items WHERE user_id=? AND deleted_at IS NULL AND kind='book' AND status='completed'
        AND substr(updated_at,1,10) BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT p.id,'reading' AS type,i.title,substr(p.logged_at,1,10) AS date,
        trim(p.progress || CASE WHEN p.note<>'' THEN ' · ' || p.note ELSE '' END) AS detail,'/item/' || i.id AS href
        FROM progress_events p JOIN items i ON i.id=p.item_id
        WHERE i.user_id=? AND i.deleted_at IS NULL AND substr(p.logged_at,1,10) BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT id,'viewing' AS type,title,substr(updated_at,1,10) AS date,
        CASE WHEN creator<>'' THEN creator ELSE progress END AS detail,'/item/' || id AS href
        FROM items WHERE user_id=? AND deleted_at IS NULL AND kind IN ('movie','game') AND status='completed'
        AND substr(updated_at,1,10) BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT id,'task' AS type,title,substr(updated_at,1,10) AS date,notes AS detail,'/?view=tasks' AS href
        FROM todos WHERE user_id=? AND deleted_at IS NULL AND completed=1 AND substr(updated_at,1,10) BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT l.id,'habit' AS type,h.title,l.habit_date AS date,h.notes AS detail,'/?view=habits' AS href
        FROM habit_logs l JOIN habits h ON h.id=l.habit_id
        WHERE l.user_id=? AND h.archived=0 AND l.habit_date BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT l.id,'routine' AS type,r.title,l.routine_date AS date,r.description AS detail,'/?view=habits' AS href
        FROM routine_logs l JOIN routines r ON r.id=l.routine_id
        WHERE l.user_id=? AND r.archived=0 AND l.routine_date BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT id,'reading' AS type,title,substr(updated_at,1,10) AS date,description AS detail,'/?view=notes' AS href
        FROM saved_articles WHERE user_id=? AND deleted_at IS NULL AND status='read'
        AND substr(updated_at,1,10) BETWEEN ? AND ?`)
        .all(userId, start, end),
      ...db.prepare(`SELECT c.id,'reading' AS type,c.title,substr(c.updated_at,1,10) AS date,i.title AS detail,'/item/' || i.id AS href
        FROM chapters c JOIN items i ON i.id=c.item_id
        WHERE i.user_id=? AND i.deleted_at IS NULL AND c.notes<>''
          AND substr(c.updated_at,1,10) BETWEEN ? AND ?`)
        .all(userId, start, end),
    ].map(entry => ({ ...entry, detail: entry.detail || '' }));
    entries.sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
    res.json({ start, end, entries });
  });

  router.get('/weekly-review', (req, res) => {
    const today = localToday();
    const weekStart = dateAfter(today, -6);
    const tasks = db.prepare(`SELECT
      SUM(CASE WHEN completed=1 AND updated_at>=? THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN completed=0 AND due_date<? THEN 1 ELSE 0 END) AS overdue,
      SUM(CASE WHEN completed=0 AND due_date BETWEEN ? AND ? THEN 1 ELSE 0 END) AS upcoming
      FROM todos WHERE user_id=? AND deleted_at IS NULL`)
      .get(`${weekStart}T00:00:00.000Z`, today, today, dateAfter(today, 7), req.user.id);
    const items = db.prepare(`SELECT COUNT(*) AS added,
      SUM(CASE WHEN status='completed' AND updated_at>=? THEN 1 ELSE 0 END) AS completed
      FROM items WHERE user_id=? AND deleted_at IS NULL AND created_at>=?`)
      .get(`${weekStart}T00:00:00.000Z`, req.user.id, `${weekStart}T00:00:00.000Z`);
    const habits = db.prepare(`SELECT COUNT(*) AS total,
      (SELECT COUNT(*) FROM habit_logs l WHERE l.user_id=? AND l.habit_date BETWEEN ? AND ?) AS completed
      FROM habits WHERE user_id=? AND archived=0`).get(req.user.id, weekStart, today, req.user.id);
    const projects = db.prepare(`SELECT p.id,p.title,p.next_action,p.due_date,p.updated_at,
      (SELECT COUNT(*) FROM todos t WHERE t.project_id=p.id AND t.completed=0 AND t.deleted_at IS NULL) AS open_tasks
      FROM projects p WHERE p.user_id=? AND p.status='active' AND p.updated_at<? ORDER BY p.updated_at LIMIT 5`)
      .all(req.user.id, `${weekStart}T00:00:00.000Z`);
    res.json({
      period: { start: weekStart, end: today },
      tasks: { completed: tasks.completed || 0, overdue: tasks.overdue || 0, upcoming: tasks.upcoming || 0 },
      library: { added: items.added || 0, completed: items.completed || 0 },
      habits: { total: habits.total || 0, completed: habits.completed || 0 },
      projectsNeedingAttention: projects,
    });
  });

  router.get('/metrics', (req, res) => {
    const userId = req.user.id;
    const itemsByStatus = db.prepare(`SELECT status,COUNT(*) AS count FROM items
      WHERE user_id=? AND deleted_at IS NULL AND kind<>'memo' GROUP BY status`).all(userId);
    const itemTotals = Object.fromEntries(itemsByStatus.map(row => [row.status, row.count]));
    const nearlyComplete = db.prepare(`SELECT COUNT(*) AS count FROM items
      WHERE user_id=? AND deleted_at IS NULL AND kind<>'memo' AND near_completion=1 AND status<>'completed'`).get(userId).count;
    const taskTotals = db.prepare(`SELECT
      SUM(CASE WHEN completed=0 THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN completed=0 AND due_date IS NOT NULL AND
        (due_date<? OR (due_date=? AND due_time IS NOT NULL AND due_time<?)) THEN 1 ELSE 0 END) AS overdue
      FROM todos WHERE user_id=? AND deleted_at IS NULL`).get(localToday(), localToday(), localTime(), userId);
    const articles = db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='unread' THEN 1 ELSE 0 END) AS unread
      FROM saved_articles WHERE user_id=? AND deleted_at IS NULL`).get(userId);
    const recent = {
      added: db.prepare(`SELECT COUNT(*) AS count FROM items WHERE user_id=? AND deleted_at IS NULL AND created_at>=?`)
        .get(userId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).count,
      completed: db.prepare(`SELECT COUNT(*) AS count FROM items WHERE user_id=? AND deleted_at IS NULL AND status='completed' AND updated_at>=?`)
        .get(userId, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).count,
    };
    res.json({
      items: {
        total: db.prepare("SELECT COUNT(*) AS count FROM items WHERE user_id=? AND deleted_at IS NULL AND kind<>'memo'").get(userId).count,
        completed: itemTotals.completed || 0,
        inProgress: itemTotals.in_progress || 0,
        planned: itemTotals.planned || 0,
        paused: itemTotals.paused || 0,
        dropped: itemTotals.dropped || 0,
        nearlyComplete,
      },
      todos: { open: taskTotals.open || 0, completed: taskTotals.completed || 0, overdue: taskTotals.overdue || 0 },
      articles: { total: articles.total || 0, unread: articles.unread || 0 },
      activity: { addedLast7Days: recent.added, completedLast30Days: recent.completed },
    });
  });

  return router;
}

module.exports = createActivityRouter;
