const express = require('express');

function createPlanningRouter({ db, now, validateArea, validateGoal, validateProject, ownedArea, ownedGoal, ownedProject }) {
  const router = express.Router();

  router.get('/areas', (req, res) => {
    res.json(db.prepare(`SELECT a.id,a.name,a.color,a.position,
      (SELECT COUNT(*) FROM goals g WHERE g.area_id=a.id AND g.status<>'completed') AS active_goals,
      (SELECT COUNT(*) FROM projects p WHERE p.area_id=a.id AND p.status<>'completed') AS active_projects
      FROM life_areas a WHERE a.user_id=? ORDER BY a.position,a.name`).all(req.user.id));
  });

  router.post('/areas', (req, res) => {
    const { area, error } = validateArea(req.body);
    if (error) return res.status(400).json({ error });
    try {
      const timestamp = now();
      const position = db.prepare('SELECT COUNT(*) AS count FROM life_areas WHERE user_id=?').get(req.user.id).count;
      const result = db.prepare('INSERT INTO life_areas(user_id,name,color,position,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(req.user.id, area.name, area.color, position, timestamp, timestamp);
      res.status(201).json(db.prepare('SELECT * FROM life_areas WHERE id=?').get(result.lastInsertRowid));
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'يوجد مجال بهذا الاسم بالفعل.' });
      throw error;
    }
  });

  router.put('/areas/:id', (req, res) => {
    if (!ownedArea.get(req.params.id, req.user.id)) return res.status(404).json({ error: 'المجال غير موجود.' });
    const { area, error } = validateArea(req.body);
    if (error) return res.status(400).json({ error });
    try {
      db.prepare('UPDATE life_areas SET name=?,color=?,updated_at=? WHERE id=? AND user_id=?')
        .run(area.name, area.color, now(), req.params.id, req.user.id);
      res.json(db.prepare('SELECT * FROM life_areas WHERE id=?').get(req.params.id));
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'يوجد مجال بهذا الاسم بالفعل.' });
      throw error;
    }
  });

  router.delete('/areas/:id', (req, res) => {
    const result = db.prepare('DELETE FROM life_areas WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'المجال غير موجود.' });
  });

  router.get('/goals', (req, res) => {
    res.json(db.prepare(`SELECT g.*,a.name AS area_name,
      (SELECT COUNT(*) FROM projects p WHERE p.goal_id=g.id) AS total_projects,
      (SELECT COUNT(*) FROM projects p WHERE p.goal_id=g.id AND p.status='completed') AS completed_projects,
      (SELECT COUNT(*) FROM projects p WHERE p.goal_id=g.id AND p.status<>'completed') AS active_projects
      FROM goals g LEFT JOIN life_areas a ON a.id=g.area_id
      WHERE g.user_id=? ORDER BY CASE g.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,g.target_date,g.title`)
      .all(req.user.id));
  });

  router.post('/goals', (req, res) => {
    const { goal, error } = validateGoal(req.body, req.user.id);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO goals(user_id,area_id,title,description,status,target_date,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(req.user.id, goal.area_id, goal.title, goal.description, goal.status, goal.target_date, timestamp, timestamp);
    res.status(201).json(db.prepare('SELECT * FROM goals WHERE id=?').get(result.lastInsertRowid));
  });

  router.put('/goals/:id', (req, res) => {
    if (!ownedGoal.get(req.params.id, req.user.id)) return res.status(404).json({ error: 'الهدف غير موجود.' });
    const { goal, error } = validateGoal(req.body, req.user.id);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE goals SET area_id=?,title=?,description=?,status=?,target_date=?,updated_at=? WHERE id=? AND user_id=?`)
      .run(goal.area_id, goal.title, goal.description, goal.status, goal.target_date, now(), req.params.id, req.user.id);
    res.json(db.prepare('SELECT * FROM goals WHERE id=?').get(req.params.id));
  });

  router.delete('/goals/:id', (req, res) => {
    const result = db.prepare('DELETE FROM goals WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'الهدف غير موجود.' });
  });

  router.get('/projects', (req, res) => {
    res.json(db.prepare(`SELECT p.*,a.name AS area_name,g.title AS goal_title,
      (SELECT COUNT(*) FROM todos t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.deleted_at IS NULL) AS total_tasks,
      (SELECT COUNT(*) FROM todos t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.deleted_at IS NULL AND t.completed=1) AS completed_tasks,
      (SELECT COUNT(*) FROM todos t WHERE t.project_id=p.id AND t.user_id=p.user_id AND t.deleted_at IS NULL AND t.completed=0) AS open_tasks
      FROM projects p LEFT JOIN life_areas a ON a.id=p.area_id LEFT JOIN goals g ON g.id=p.goal_id
      WHERE p.user_id=? ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END,p.due_date,p.title`)
      .all(req.user.id));
  });

  router.post('/projects', (req, res) => {
    const { project, error } = validateProject(req.body, req.user.id);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO projects(user_id,area_id,goal_id,title,description,next_action,status,due_date,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, project.area_id, project.goal_id, project.title, project.description,
      project.next_action, project.status, project.due_date, timestamp, timestamp);
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE id=?').get(result.lastInsertRowid));
  });

  router.put('/projects/:id', (req, res) => {
    if (!ownedProject.get(req.params.id, req.user.id)) return res.status(404).json({ error: 'المشروع غير موجود.' });
    const { project, error } = validateProject(req.body, req.user.id);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE projects SET area_id=?,goal_id=?,title=?,description=?,next_action=?,status=?,due_date=?,updated_at=?
      WHERE id=? AND user_id=?`).run(project.area_id, project.goal_id, project.title, project.description, project.next_action,
      project.status, project.due_date, now(), req.params.id, req.user.id);
    res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id));
  });

  router.delete('/projects/:id', (req, res) => {
    const result = db.prepare('DELETE FROM projects WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'المشروع غير موجود.' });
  });

  return router;
}

module.exports = createPlanningRouter;
