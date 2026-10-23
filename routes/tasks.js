const express = require('express');

function createTasksRouter({ db, now, validateTodo, nextDueDate, createUndoableDelete }) {
  const router = express.Router();

  function getTodo(id, userId) {
    return db.prepare(`SELECT t.id,t.title,t.notes,t.due_date,t.due_time,t.recurrence,t.priority,t.completed,t.project_id,
      t.parent_todo_id,p.title AS project_title,t.created_at,t.updated_at,
      (SELECT COUNT(*) FROM todos child WHERE child.user_id=t.user_id AND child.parent_todo_id=t.id AND child.deleted_at IS NULL) AS subtask_count,
      (SELECT COUNT(*) FROM todos child WHERE child.user_id=t.user_id AND child.parent_todo_id=t.id AND child.deleted_at IS NULL AND child.completed=1) AS subtask_completed
      FROM todos t LEFT JOIN projects p ON p.id=t.project_id
      WHERE t.id=? AND t.user_id=? AND t.deleted_at IS NULL`).get(id, userId);
  }

  router.get('/todos', (req, res) => {
    res.json(db.prepare(`SELECT t.id,t.title,t.notes,t.due_date,t.due_time,t.recurrence,t.priority,t.completed,t.project_id,
      t.parent_todo_id,p.title AS project_title,t.created_at,t.updated_at,
      (SELECT COUNT(*) FROM todos child WHERE child.user_id=t.user_id AND child.parent_todo_id=t.id AND child.deleted_at IS NULL) AS subtask_count,
      (SELECT COUNT(*) FROM todos child WHERE child.user_id=t.user_id AND child.parent_todo_id=t.id AND child.deleted_at IS NULL AND child.completed=1) AS subtask_completed
      FROM todos t LEFT JOIN projects p ON p.id=t.project_id
      WHERE t.user_id=? AND t.parent_todo_id IS NULL AND t.deleted_at IS NULL ORDER BY t.completed,t.due_date IS NULL,t.due_date,t.due_time,t.priority,t.id`)
      .all(req.user.id));
  });

  router.post('/todos', (req, res) => {
    const { todo, error } = validateTodo(req.body, req.user.id);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO todos(user_id,title,notes,due_date,due_time,recurrence,priority,completed,project_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, todo.title, todo.notes, todo.due_date, todo.due_time,
      todo.recurrence, todo.priority, Number(todo.completed), todo.project_id, timestamp, timestamp);
    res.status(201).json(getTodo(result.lastInsertRowid, req.user.id));
  });

  router.get('/todos/:id/subtasks', (req, res) => {
    const parent = db.prepare('SELECT id FROM todos WHERE id=? AND user_id=? AND parent_todo_id IS NULL AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!parent) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    res.json(db.prepare(`SELECT id,title,completed,created_at,updated_at FROM todos
      WHERE user_id=? AND parent_todo_id=? AND deleted_at IS NULL ORDER BY completed,id`)
      .all(req.user.id, parent.id));
  });

  router.post('/todos/:id/subtasks', (req, res) => {
    const parent = db.prepare('SELECT id,project_id,priority FROM todos WHERE id=? AND user_id=? AND parent_todo_id IS NULL AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!parent) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 200) return res.status(400).json({ error: 'عنوان الخطوة مطلوب (حتى ٢٠٠ حرف).' });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO todos(user_id,title,notes,recurrence,priority,completed,project_id,parent_todo_id,created_at,updated_at)
      VALUES (?,?,'','none',?,0,?,?,?,?)`)
      .run(req.user.id, title, parent.priority, parent.project_id, parent.id, timestamp, timestamp);
    res.status(201).json(db.prepare('SELECT id,title,completed,created_at,updated_at FROM todos WHERE id=?')
      .get(result.lastInsertRowid));
  });

  router.put('/todos/:id/subtasks/:subtaskId', (req, res) => {
    const subtask = db.prepare(`SELECT child.id FROM todos child JOIN todos parent ON parent.id=child.parent_todo_id
      WHERE child.id=? AND child.user_id=? AND child.parent_todo_id=? AND child.deleted_at IS NULL
      AND parent.user_id=? AND parent.parent_todo_id IS NULL AND parent.deleted_at IS NULL`)
      .get(req.params.subtaskId, req.user.id, req.params.id, req.user.id);
    if (!subtask) return res.status(404).json({ error: 'الخطوة غير موجودة.' });
    const completed = req.body?.completed === true || req.body?.completed === 1;
    db.prepare('UPDATE todos SET completed=?,updated_at=? WHERE id=? AND user_id=?')
      .run(Number(completed), now(), subtask.id, req.user.id);
    res.json(db.prepare('SELECT id,title,completed,created_at,updated_at FROM todos WHERE id=?').get(subtask.id));
  });

  router.delete('/todos/:id/subtasks/:subtaskId', (req, res) => {
    const subtask = db.prepare(`SELECT child.id FROM todos child JOIN todos parent ON parent.id=child.parent_todo_id
      WHERE child.id=? AND child.user_id=? AND child.parent_todo_id=? AND child.deleted_at IS NULL
      AND parent.user_id=? AND parent.parent_todo_id IS NULL AND parent.deleted_at IS NULL`)
      .get(req.params.subtaskId, req.user.id, req.params.id, req.user.id);
    if (!subtask) return res.status(404).json({ error: 'الخطوة غير موجودة.' });
    createUndoableDelete('todo', 'todos', subtask.id, req.user.id, res);
  });

  router.put('/todos/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM todos WHERE id=? AND user_id=? AND parent_todo_id IS NULL AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    const { todo, error } = validateTodo(req.body, req.user.id);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const update = db.transaction(() => {
      db.prepare(`UPDATE todos SET title=?,notes=?,due_date=?,due_time=?,recurrence=?,priority=?,completed=?,project_id=?,updated_at=?
        WHERE id=? AND user_id=?`).run(todo.title, todo.notes, todo.due_date, todo.due_time, todo.recurrence,
        todo.priority, Number(todo.completed), todo.project_id, timestamp, existing.id, req.user.id);
      if (!existing.completed && todo.completed && todo.recurrence !== 'none') {
        db.prepare(`INSERT OR IGNORE INTO todos(user_id,title,notes,due_date,due_time,recurrence,priority,completed,project_id,created_at,updated_at,source_todo_id)
          VALUES (?,?,?,?,?,?,?,0,?,?,?,?)`).run(req.user.id, todo.title, todo.notes, nextDueDate(todo.due_date, todo.recurrence),
          todo.due_time, todo.recurrence, todo.priority, todo.project_id, timestamp, timestamp, existing.id);
      }
    });
    update();
    res.json(getTodo(existing.id, req.user.id));
  });

  router.delete('/todos/:id', (req, res) => {
    const existing = db.prepare('SELECT id FROM todos WHERE id=? AND user_id=? AND parent_todo_id IS NULL AND deleted_at IS NULL')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'المهمة غير موجودة.' });
    createUndoableDelete('todo', 'todos', req.params.id, req.user.id, res);
  });

  return router;
}

module.exports = createTasksRouter;
