const express = require('express');

function createTasksRouter({ db, now, validateTodo, nextDueDate, createUndoableDelete }) {
  const router = express.Router();

  router.get('/todos', (req, res) => {
    res.json(db.prepare(`SELECT t.id,t.title,t.notes,t.due_date,t.due_time,t.recurrence,t.priority,t.completed,t.project_id,
      p.title AS project_title,t.created_at,t.updated_at FROM todos t LEFT JOIN projects p ON p.id=t.project_id
      WHERE t.user_id=? AND t.deleted_at IS NULL ORDER BY t.completed,t.due_date IS NULL,t.due_date,t.due_time,t.priority,t.id`)
      .all(req.user.id));
  });

  router.post('/todos', (req, res) => {
    const { todo, error } = validateTodo(req.body, req.user.id);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO todos(user_id,title,notes,due_date,due_time,recurrence,priority,completed,project_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, todo.title, todo.notes, todo.due_date, todo.due_time,
      todo.recurrence, todo.priority, Number(todo.completed), todo.project_id, timestamp, timestamp);
    res.status(201).json(db.prepare(`SELECT id,title,notes,due_date,due_time,recurrence,priority,completed,project_id,created_at,updated_at
      FROM todos WHERE id=?`).get(result.lastInsertRowid));
  });

  router.put('/todos/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL')
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
    res.json(db.prepare(`SELECT id,title,notes,due_date,due_time,recurrence,priority,completed,project_id,created_at,updated_at
      FROM todos WHERE id=?`).get(existing.id));
  });

  router.delete('/todos/:id', (req, res) => {
    createUndoableDelete('todo', 'todos', req.params.id, req.user.id, res);
  });

  return router;
}

module.exports = createTasksRouter;
