const express = require('express');

function createWellnessRouter({ db, text, now, localToday }) {
  const router = express.Router();
  const dashboardWidgets = ['summary', 'focus', 'progress', 'tasks', 'events', 'habits', 'wellness'];
  const dateAfter = (value, days) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function nonNegativeNumber(value, max, integer = false) {
    if (value === undefined || value === null || value === '') return 0;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > max || (integer && !Number.isInteger(parsed))) return null;
    return parsed;
  }

  function mealForUser(id, userId) {
    return db.prepare(`SELECT id,entry_date,meal_type,name,calories,protein_g,carbs_g,fat_g,notes,created_at,updated_at
      FROM wellness_meals WHERE id=? AND user_id=?`).get(id, userId);
  }

  function workoutForUser(id, userId) {
    return db.prepare(`SELECT id,entry_date,exercise,sets,reps,weight_kg,duration_minutes,notes,created_at,updated_at
      FROM wellness_workouts WHERE id=? AND user_id=?`).get(id, userId);
  }

  function validMeal(body) {
    const meal = {
      entry_date: text(body?.entry_date || localToday()),
      meal_type: text(body?.meal_type || 'snack'),
      name: text(body?.name),
      calories: nonNegativeNumber(body?.calories, 20000, true),
      protein_g: nonNegativeNumber(body?.protein_g, 1000),
      carbs_g: nonNegativeNumber(body?.carbs_g, 2000),
      fat_g: nonNegativeNumber(body?.fat_g, 1000),
      notes: text(body?.notes),
    };
    if (!validDate(meal.entry_date) || !['breakfast', 'lunch', 'dinner', 'snack'].includes(meal.meal_type)
      || !meal.name || meal.name.length > 160 || meal.calories === null || meal.protein_g === null
      || meal.carbs_g === null || meal.fat_g === null || meal.notes.length > 2000) {
      return { error: 'Check the meal, date, calories, and nutrition values.' };
    }
    return { meal };
  }

  function validWorkout(body) {
    const workout = {
      entry_date: text(body?.entry_date || localToday()),
      exercise: text(body?.exercise),
      sets: nonNegativeNumber(body?.sets, 100, true),
      reps: nonNegativeNumber(body?.reps, 1000, true),
      weight_kg: nonNegativeNumber(body?.weight_kg, 1000),
      duration_minutes: nonNegativeNumber(body?.duration_minutes, 1440, true),
      notes: text(body?.notes),
    };
    if (!validDate(workout.entry_date) || !workout.exercise || workout.exercise.length > 160
      || workout.sets === null || workout.reps === null || workout.weight_kg === null
      || workout.duration_minutes === null || workout.notes.length > 2000) {
      return { error: 'Check the exercise, date, sets, reps, weight, and duration.' };
    }
    return { workout };
  }

  router.get('/dashboard/preferences', (req, res) => {
    const userId = req.user.id;
    const row = db.prepare('SELECT widgets_json FROM dashboard_preferences WHERE user_id=?').get(userId);
    const widgets = row ? JSON.parse(row.widgets_json) : dashboardWidgets;
    res.json({ widgets: dashboardWidgets.filter(widget => widgets.includes(widget)) });
  });

  router.put('/dashboard/preferences', (req, res) => {
    const widgets = req.body?.widgets;
    if (!Array.isArray(widgets) || widgets.length > dashboardWidgets.length
      || widgets.some(widget => !dashboardWidgets.includes(widget)) || new Set(widgets).size !== widgets.length) {
      return res.status(400).json({ error: 'Choose valid dashboard cards.' });
    }
    db.prepare(`INSERT INTO dashboard_preferences(user_id,widgets_json,updated_at) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET widgets_json=excluded.widgets_json,updated_at=excluded.updated_at`)
      .run(req.user.id, JSON.stringify(widgets), now());
    res.json({ widgets: dashboardWidgets.filter(widget => widgets.includes(widget)) });
  });

  router.get('/wellness', (req, res) => {
    const date = text(req.query.date) || localToday();
    if (!validDate(date)) return res.status(400).json({ error: 'Choose a valid date.' });
    const weekStart = new Date(`${date}T00:00:00.000Z`);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const from = weekStart.toISOString().slice(0, 10);
    const userId = req.user.id;
    const meals = db.prepare(`SELECT id,entry_date,meal_type,name,calories,protein_g,carbs_g,fat_g,notes,created_at,updated_at
      FROM wellness_meals WHERE user_id=? AND entry_date=? ORDER BY id DESC`).all(userId, date);
    const workouts = db.prepare(`SELECT id,entry_date,exercise,sets,reps,weight_kg,duration_minutes,notes,created_at,updated_at
      FROM wellness_workouts WHERE user_id=? AND entry_date=? ORDER BY id DESC`).all(userId, date);
    const mealTotals = db.prepare(`SELECT COALESCE(SUM(calories),0) AS calories,COALESCE(SUM(protein_g),0) AS protein_g,
      COALESCE(SUM(carbs_g),0) AS carbs_g,COALESCE(SUM(fat_g),0) AS fat_g
      FROM wellness_meals WHERE user_id=? AND entry_date=?`).get(userId, date);
    const workoutTotals = db.prepare(`SELECT COUNT(*) AS sessions,COALESCE(SUM(duration_minutes),0) AS duration_minutes,
      COALESCE(SUM(sets*reps*weight_kg),0) AS volume_kg
      FROM wellness_workouts WHERE user_id=? AND entry_date=?`).get(userId, date);
    const week = db.prepare(`SELECT
      (SELECT COALESCE(SUM(calories),0) FROM wellness_meals WHERE user_id=? AND entry_date BETWEEN ? AND ?) AS calories,
      (SELECT COALESCE(SUM(protein_g),0) FROM wellness_meals WHERE user_id=? AND entry_date BETWEEN ? AND ?) AS protein_g,
      (SELECT COUNT(*) FROM wellness_workouts WHERE user_id=? AND entry_date BETWEEN ? AND ?) AS sessions,
      (SELECT COALESCE(SUM(duration_minutes),0) FROM wellness_workouts WHERE user_id=? AND entry_date BETWEEN ? AND ?) AS duration_minutes,
      (SELECT COALESCE(SUM(sets*reps*weight_kg),0) FROM wellness_workouts WHERE user_id=? AND entry_date BETWEEN ? AND ?) AS volume_kg`)
      .get(userId, from, date, userId, from, date, userId, from, date, userId, from, date, userId, from, date);
    const profile = db.prepare('SELECT calorie_goal,protein_goal_g,water_goal_ml FROM wellness_profiles WHERE user_id=?').get(userId)
      || { calorie_goal: null, protein_goal_g: null, water_goal_ml: null };
    const water = db.prepare(`SELECT id,amount_ml,created_at FROM wellness_water_logs
      WHERE user_id=? AND entry_date=? ORDER BY id DESC`).all(userId, date);
    const weight = db.prepare(`SELECT id,entry_date,weight_kg FROM wellness_weight_logs
      WHERE user_id=? AND entry_date=?`).get(userId, date) || null;
    const recentWeight = db.prepare(`SELECT entry_date,weight_kg FROM wellness_weight_logs
      WHERE user_id=? ORDER BY entry_date DESC LIMIT 12`).all(userId).reverse();
    const templates = db.prepare(`SELECT id,name,exercise,sets,reps,weight_kg,duration_minutes,notes
      FROM wellness_workout_templates WHERE user_id=? ORDER BY name COLLATE NOCASE,id`).all(userId);
    const trends = db.prepare(`WITH RECURSIVE days(day,n) AS (
        SELECT ?,1 UNION ALL SELECT date(day,'+1 day'),n+1 FROM days WHERE n<7
      )
      SELECT days.day AS date,
        (SELECT COALESCE(SUM(calories),0) FROM wellness_meals WHERE user_id=? AND entry_date=days.day) AS calories,
        (SELECT COALESCE(SUM(protein_g),0) FROM wellness_meals WHERE user_id=? AND entry_date=days.day) AS protein_g,
        (SELECT COUNT(*) FROM wellness_workouts WHERE user_id=? AND entry_date=days.day) AS workouts,
        (SELECT COALESCE(SUM(duration_minutes),0) FROM wellness_workouts WHERE user_id=? AND entry_date=days.day) AS duration_minutes
      FROM days ORDER BY days.day`).all(dateAfter(date, -6), userId, userId, userId, userId);
    res.json({
      date, meals, workouts, summary: { ...mealTotals, ...workoutTotals }, week: { ...week, from, through: date },
      profile, water, water_total_ml: water.reduce((total, entry) => total + entry.amount_ml, 0),
      weight, recent_weight: recentWeight, templates, trends,
    });
  });

  router.put('/wellness/goals', (req, res) => {
    const optionalGoal = (value, max, integer = false) => {
      if (value === '' || value === undefined || value === null) return null;
      const parsed = nonNegativeNumber(value, max, integer);
      return parsed !== null && parsed > 0 ? parsed : undefined;
    };
    const goal = {
      calorie_goal: optionalGoal(req.body?.calorie_goal, 20000, true),
      protein_goal_g: optionalGoal(req.body?.protein_goal_g, 1000),
      water_goal_ml: optionalGoal(req.body?.water_goal_ml, 20000, true),
    };
    if (Object.values(goal).some(value => value === undefined)) {
      return res.status(400).json({ error: 'Goals must be positive values or left blank.' });
    }
    db.prepare(`INSERT INTO wellness_profiles(user_id,calorie_goal,protein_goal_g,water_goal_ml,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET calorie_goal=excluded.calorie_goal,
      protein_goal_g=excluded.protein_goal_g,water_goal_ml=excluded.water_goal_ml,updated_at=excluded.updated_at`)
      .run(req.user.id, goal.calorie_goal, goal.protein_goal_g, goal.water_goal_ml, now());
    res.json(goal);
  });

  router.post('/wellness/water', (req, res) => {
    const entryDate = text(req.body?.entry_date || localToday());
    const amount = nonNegativeNumber(req.body?.amount_ml, 20000, true);
    if (!validDate(entryDate) || !amount || amount === null) return res.status(400).json({ error: 'Enter a valid date and water amount.' });
    const result = db.prepare('INSERT INTO wellness_water_logs(user_id,entry_date,amount_ml,created_at) VALUES (?,?,?,?)')
      .run(req.user.id, entryDate, amount, now());
    res.status(201).json(db.prepare('SELECT id,amount_ml,created_at FROM wellness_water_logs WHERE id=? AND user_id=?').get(result.lastInsertRowid, req.user.id));
  });

  router.delete('/wellness/water/:id', (req, res) => {
    const result = db.prepare('DELETE FROM wellness_water_logs WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Water entry not found.' });
  });

  router.put('/wellness/weight', (req, res) => {
    const entryDate = text(req.body?.entry_date || localToday());
    const weight = nonNegativeNumber(req.body?.weight_kg, 1000);
    if (!validDate(entryDate) || !weight || weight === null) return res.status(400).json({ error: 'Enter a valid date and weight.' });
    const timestamp = now();
    db.prepare(`INSERT INTO wellness_weight_logs(user_id,entry_date,weight_kg,created_at,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(user_id,entry_date) DO UPDATE SET weight_kg=excluded.weight_kg,updated_at=excluded.updated_at`)
      .run(req.user.id, entryDate, weight, timestamp, timestamp);
    res.json(db.prepare('SELECT id,entry_date,weight_kg FROM wellness_weight_logs WHERE user_id=? AND entry_date=?').get(req.user.id, entryDate));
  });

  router.delete('/wellness/weight/:id', (req, res) => {
    const result = db.prepare('DELETE FROM wellness_weight_logs WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Weight entry not found.' });
  });

  router.post('/wellness/templates', (req, res) => {
    const name = text(req.body?.name);
    const { workout, error } = validWorkout(req.body);
    if (error || !name || name.length > 120) return res.status(400).json({ error: error || 'Template name is required.' });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO wellness_workout_templates(user_id,name,exercise,sets,reps,weight_kg,duration_minutes,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, name, workout.exercise, workout.sets, workout.reps,
      workout.weight_kg, workout.duration_minutes, workout.notes, timestamp, timestamp);
    res.status(201).json(db.prepare(`SELECT id,name,exercise,sets,reps,weight_kg,duration_minutes,notes
      FROM wellness_workout_templates WHERE id=? AND user_id=?`).get(result.lastInsertRowid, req.user.id));
  });

  router.delete('/wellness/templates/:id', (req, res) => {
    const result = db.prepare('DELETE FROM wellness_workout_templates WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Workout template not found.' });
  });

  router.post('/wellness/meals', (req, res) => {
    const { meal, error } = validMeal(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO wellness_meals(user_id,entry_date,meal_type,name,calories,protein_g,carbs_g,fat_g,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, meal.entry_date, meal.meal_type, meal.name, meal.calories,
      meal.protein_g, meal.carbs_g, meal.fat_g, meal.notes, timestamp, timestamp);
    res.status(201).json(mealForUser(result.lastInsertRowid, req.user.id));
  });

  router.put('/wellness/meals/:id', (req, res) => {
    if (!mealForUser(req.params.id, req.user.id)) return res.status(404).json({ error: 'Meal not found.' });
    const { meal, error } = validMeal(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE wellness_meals SET entry_date=?,meal_type=?,name=?,calories=?,protein_g=?,carbs_g=?,fat_g=?,notes=?,updated_at=?
      WHERE id=? AND user_id=?`).run(meal.entry_date, meal.meal_type, meal.name, meal.calories, meal.protein_g,
      meal.carbs_g, meal.fat_g, meal.notes, now(), req.params.id, req.user.id);
    res.json(mealForUser(req.params.id, req.user.id));
  });

  router.delete('/wellness/meals/:id', (req, res) => {
    const result = db.prepare('DELETE FROM wellness_meals WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Meal not found.' });
  });

  router.post('/wellness/workouts', (req, res) => {
    const { workout, error } = validWorkout(req.body);
    if (error) return res.status(400).json({ error });
    const timestamp = now();
    const result = db.prepare(`INSERT INTO wellness_workouts(user_id,entry_date,exercise,sets,reps,weight_kg,duration_minutes,notes,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(req.user.id, workout.entry_date, workout.exercise, workout.sets, workout.reps,
      workout.weight_kg, workout.duration_minutes, workout.notes, timestamp, timestamp);
    res.status(201).json(workoutForUser(result.lastInsertRowid, req.user.id));
  });

  router.put('/wellness/workouts/:id', (req, res) => {
    if (!workoutForUser(req.params.id, req.user.id)) return res.status(404).json({ error: 'Workout not found.' });
    const { workout, error } = validWorkout(req.body);
    if (error) return res.status(400).json({ error });
    db.prepare(`UPDATE wellness_workouts SET entry_date=?,exercise=?,sets=?,reps=?,weight_kg=?,duration_minutes=?,notes=?,updated_at=?
      WHERE id=? AND user_id=?`).run(workout.entry_date, workout.exercise, workout.sets, workout.reps, workout.weight_kg,
      workout.duration_minutes, workout.notes, now(), req.params.id, req.user.id);
    res.json(workoutForUser(req.params.id, req.user.id));
  });

  router.delete('/wellness/workouts/:id', (req, res) => {
    const result = db.prepare('DELETE FROM wellness_workouts WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    result.changes ? res.json({ ok: true }) : res.status(404).json({ error: 'Workout not found.' });
  });

  return router;
}

module.exports = createWellnessRouter;
