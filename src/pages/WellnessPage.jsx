import { useCallback, useEffect, useState } from 'react';
import { api, todayDate } from '../api.js';
import { messages } from '../i18n.js';

const emptyMeal = date => ({ entry_date: date, meal_type: 'breakfast', name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', notes: '' });
const emptyWorkout = date => ({ entry_date: date, exercise: '', sets: '', reps: '', weight_kg: '', duration_minutes: '', notes: '' });

export default function WellnessPage({ language, onUnauthorized }) {
  const [date, setDate] = useState(todayDate());
  const [section, setSection] = useState('diet');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [wellnessSaving, setWellnessSaving] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [goals, setGoals] = useState(null);
  const isArabic = language === 'ar';
  const t = messages[language];

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api(`/wellness?date=${date}`);
      setData(result);
      setGoals({
        calorie_goal: result.profile.calorie_goal ?? '',
        protein_goal_g: result.profile.protein_goal_g ?? '',
        water_goal_ml: result.profile.water_goal_ml ?? '',
      });
      setWeightInput(result.weight?.weight_kg ?? '');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }, [date, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  function editMeal(meal) {
    setForm({ kind: 'meal', value: { ...meal } });
    setError('');
    setSaved('');
  }

  function editWorkout(workout) {
    setForm({ kind: 'workout', value: { ...workout } });
    setError('');
    setSaved('');
  }

  async function saveEntry(event) {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError('');
    setSaved('');
    const collection = form.kind === 'meal' ? 'meals' : 'workouts';
    const id = form.value.id;
    try {
      await api(`/wellness/${collection}${id ? `/${id}` : ''}`, {
        method: id ? 'PUT' : 'POST',
        body: Object.fromEntries(Object.entries(form.value).filter(([key]) => key !== 'id' && key !== 'created_at' && key !== 'updated_at')),
      });
      setForm(null);
      setSaved(isArabic ? 'تم حفظ السجل.' : 'Entry saved.');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(kind, id) {
    if (!window.confirm(isArabic ? 'هل تريد حذف هذا السجل؟' : 'Delete this entry?')) return;
    setError('');
    try {
      await api(`/wellness/${kind}/${id}`, { method: 'DELETE' });
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function saveGoals(event) {
    event.preventDefault();
    setWellnessSaving(true);
    setError('');
    try {
      await api('/wellness/goals', { method: 'PUT', body: goals });
      setSaved(isArabic ? 'تم حفظ الأهداف.' : 'Goals saved.');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setWellnessSaving(false);
    }
  }

  async function addWater(amount) {
    setError('');
    try {
      await api('/wellness/water', { method: 'POST', body: { entry_date: date, amount_ml: amount } });
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function saveWeight(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/wellness/weight', { method: 'PUT', body: { entry_date: date, weight_kg: weightInput } });
      setSaved(isArabic ? 'تم حفظ الوزن.' : 'Weight saved.');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function saveTemplate(workout) {
    const name = window.prompt(isArabic ? 'اسم قالب التمرين' : 'Workout template name', workout.exercise);
    if (!name?.trim()) return;
    setError('');
    try {
      await api('/wellness/templates', { method: 'POST', body: { ...workout, name: name.trim() } });
      setSaved(isArabic ? 'تم حفظ قالب التمرين.' : 'Workout template saved.');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  function updateField(key, value) {
    setForm(current => ({ ...current, value: { ...current.value, [key]: value } }));
  }

  const number = value => new Intl.NumberFormat(isArabic ? 'ar' : 'en', { maximumFractionDigits: 1 }).format(Number(value || 0));
  const mealTypeName = type => ({
    breakfast: isArabic ? 'الإفطار' : 'Breakfast',
    lunch: isArabic ? 'الغداء' : 'Lunch',
    dinner: isArabic ? 'العشاء' : 'Dinner',
    snack: isArabic ? 'وجبة خفيفة' : 'Snack',
  }[type] || type);
  const changeGoal = (key, value) => setGoals(current => ({ ...current, [key]: value }));

  if (!data) return <section className="page-card">{error || t.loading}</section>;
  const records = section === 'diet' ? data.meals : data.workouts;
  const isMealForm = form?.kind === 'meal';
  const fields = isMealForm
    ? [
      ['meal_type', isArabic ? 'نوع الوجبة' : 'Meal', 'select', [['breakfast', mealTypeName('breakfast')], ['lunch', mealTypeName('lunch')], ['dinner', mealTypeName('dinner')], ['snack', mealTypeName('snack')]]],
      ['name', isArabic ? 'الطعام / الوجبة' : 'Food / meal', 'text'],
      ['calories', isArabic ? 'السعرات الحرارية' : 'Calories', 'number'],
      ['protein_g', isArabic ? 'البروتين (غ)' : 'Protein (g)', 'number'],
      ['carbs_g', isArabic ? 'الكربوهيدرات (غ)' : 'Carbs (g)', 'number'],
      ['fat_g', isArabic ? 'الدهون (غ)' : 'Fat (g)', 'number'],
      ['notes', isArabic ? 'ملاحظات' : 'Notes', 'textarea'],
    ]
    : [
      ['exercise', isArabic ? 'التمرين' : 'Exercise', 'text'],
      ['sets', isArabic ? 'المجموعات' : 'Sets', 'number'],
      ['reps', isArabic ? 'التكرارات' : 'Reps', 'number'],
      ['weight_kg', isArabic ? 'الوزن (كغ)' : 'Weight (kg)', 'number'],
      ['duration_minutes', isArabic ? 'المدة (دقيقة)' : 'Duration (minutes)', 'number'],
      ['notes', isArabic ? 'ملاحظات' : 'Notes', 'textarea'],
    ];

  return <section className="page-card wellness-page">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{isArabic ? 'العناية بنفسك، يوماً بعد يوم' : 'Small steps, tracked day by day'}</p>
        <h1>{isArabic ? 'الغذاء واللياقة' : 'Diet & gym'}</h1>
        <p>{isArabic ? 'سجّل وجباتك وتمارينك، وتابع تقدمك اليومي والأسبوعي.' : 'Log meals and workouts, then follow your daily and weekly progress.'}</p>
      </div>
      <label>{isArabic ? 'التاريخ' : 'Date'}<input type="date" value={date} onChange={event => { setDate(event.target.value); setForm(null); setSaved(''); }} /></label>
    </header>
    <div className="wellness-tabs" role="tablist" aria-label={isArabic ? 'قسم اللياقة' : 'Wellness section'}>
      <button className={`wellness-tab ${section === 'diet' ? 'active' : ''}`} type="button" role="tab" aria-selected={section === 'diet'} onClick={() => { setSection('diet'); setForm(null); }}>
        <span aria-hidden="true">◉</span>{isArabic ? 'الغذاء' : 'Diet'}
      </button>
      <button className={`wellness-tab ${section === 'gym' ? 'active' : ''}`} type="button" role="tab" aria-selected={section === 'gym'} onClick={() => { setSection('gym'); setForm(null); }}>
        <span aria-hidden="true">↗</span>{isArabic ? 'النادي الرياضي' : 'Gym'}
      </button>
    </div>

    {error && <p className="notice error" role="alert">{error}</p>}
    {saved && <p className="notice" role="status">{saved}</p>}

    {section === 'diet' ? <>
      <div className="metric-grid wellness-metrics">
        <Metric label={isArabic ? 'السعرات اليوم' : 'Calories today'} value={number(data.summary.calories)} suffix={isArabic ? 'سعرة' : 'kcal'} />
        <Metric label={isArabic ? 'البروتين' : 'Protein'} value={number(data.summary.protein_g)} suffix="g" />
        <Metric label={isArabic ? 'الكربوهيدرات' : 'Carbs'} value={number(data.summary.carbs_g)} suffix="g" />
        <Metric label={isArabic ? 'الدهون' : 'Fat'} value={number(data.summary.fat_g)} suffix="g" />
      </div>
      <div className="wellness-week"><strong>{isArabic ? 'آخر ٧ أيام' : 'Last 7 days'}</strong><span>{number(data.week.calories)} {isArabic ? 'سعرة' : 'kcal'}</span><span>{number(data.week.protein_g)} g {isArabic ? 'بروتين إجمالاً' : 'protein total'}</span></div>
      <section className="wellness-tools">
        <div className="wellness-tool-heading"><div><h2>{isArabic ? 'أهداف غذائية اختيارية' : 'Optional nutrition goals'}</h2><p>{isArabic ? 'اترك أي هدف فارغاً إذا لم ترغب في تتبعه.' : 'Leave a goal blank if you do not want to track it.'}</p></div></div>
        {goals && <form className="wellness-goal-form" onSubmit={saveGoals}>
          <label>{isArabic ? 'السعرات (سعرة/يوم)' : 'Calories (kcal/day)'}<input type="number" min="1" max="20000" value={goals.calorie_goal} onChange={event => changeGoal('calorie_goal', event.target.value)} /></label>
          <label>{isArabic ? 'البروتين (غ/يوم)' : 'Protein (g/day)'}<input type="number" min="1" max="1000" step="0.1" value={goals.protein_goal_g} onChange={event => changeGoal('protein_goal_g', event.target.value)} /></label>
          <label>{isArabic ? 'الماء (مل/يوم)' : 'Water (ml/day)'}<input type="number" min="1" max="20000" value={goals.water_goal_ml} onChange={event => changeGoal('water_goal_ml', event.target.value)} /></label>
          <button className="button button-primary" type="submit" disabled={wellnessSaving}>{isArabic ? 'حفظ الأهداف' : 'Save goals'}</button>
        </form>}
        <div className="wellness-goal-progress">
          {data.profile.calorie_goal && <GoalProgress label={isArabic ? 'السعرات' : 'Calories'} value={data.summary.calories} goal={data.profile.calorie_goal} unit="kcal" />}
          {data.profile.protein_goal_g && <GoalProgress label={isArabic ? 'البروتين' : 'Protein'} value={data.summary.protein_g} goal={data.profile.protein_goal_g} unit="g" />}
        </div>
      </section>
    </> : <>
      <div className="metric-grid wellness-metrics">
        <Metric label={isArabic ? 'تمارين اليوم' : 'Exercises today'} value={number(data.summary.sessions)} />
        <Metric label={isArabic ? 'مدة التمرين' : 'Training time'} value={number(data.summary.duration_minutes)} suffix={isArabic ? 'دقيقة' : 'min'} />
        <Metric label={isArabic ? 'حجم الأوزان' : 'Volume lifted'} value={number(data.summary.volume_kg)} suffix="kg" />
        <Metric label={isArabic ? 'تمارين هذا الأسبوع' : 'Exercises this week'} value={number(data.week.sessions)} />
      </div>
      <div className="wellness-week"><strong>{isArabic ? 'آخر ٧ أيام' : 'Last 7 days'}</strong><span>{number(data.week.duration_minutes)} {isArabic ? 'دقيقة تدريب' : 'training minutes'}</span><span>{number(data.week.volume_kg)} kg {isArabic ? 'حجم الأوزان' : 'volume lifted'}</span></div>
      {data.templates.length > 0 && <section className="wellness-tools">
        <div className="wellness-tool-heading"><div><h2>{isArabic ? 'قوالب التمرين' : 'Workout templates'}</h2><p>{isArabic ? 'ابدأ سجلاً جديداً من قالب محفوظ.' : 'Start a new log from a saved template.'}</p></div></div>
        <div className="wellness-template-list">{data.templates.map(template => <div className="wellness-template" key={template.id}>
          <button className="button button-quiet" type="button" onClick={() => { setForm({ kind: 'workout', value: { ...template, entry_date: date } }); setError(''); }}>
            {template.name} · {template.exercise}
          </button>
          <button className="icon-button" type="button" aria-label={isArabic ? `حذف قالب ${template.name}` : `Delete ${template.name} template`} onClick={() => removeEntry('templates', template.id)}>×</button>
        </div>)}</div>
      </section>}
    </>}

    <div className="wellness-tracking-grid">
      <section className="wellness-tools wellness-water-tool">
        <div className="wellness-tool-heading"><div><h2>{isArabic ? 'شرب الماء' : 'Water tracker'}</h2><p>{number(data.water_total_ml)} / {data.profile.water_goal_ml ? `${number(data.profile.water_goal_ml)} ml` : (isArabic ? 'مل اليوم' : 'ml today')}</p></div>
          <div className="wellness-water-actions"><button className="button button-quiet" type="button" onClick={() => addWater(250)}>+250 ml</button><button className="button button-quiet" type="button" onClick={() => addWater(500)}>+500 ml</button></div>
        </div>
        {data.profile.water_goal_ml && <GoalProgress label={isArabic ? 'هدف الماء' : 'Water goal'} value={data.water_total_ml} goal={data.profile.water_goal_ml} unit="ml" />}
        {data.water.length > 0
          ? <div className="wellness-water-list">{data.water.map(entry => <span key={entry.id}>{number(entry.amount_ml)} ml
            <button type="button" aria-label={isArabic ? 'حذف إدخال الماء' : 'Remove water entry'} onClick={() => removeEntry('water', entry.id)}>×</button>
          </span>)}</div>
          : <p className="wellness-tracking-empty">{isArabic ? 'لم تسجل ماءً اليوم بعد.' : 'No water logged yet today.'}</p>}
      </section>
      <section className="wellness-tools wellness-weight-tool">
        <div className="wellness-tool-heading"><div><h2>{isArabic ? 'وزن الجسم' : 'Body weight'}</h2><p>{isArabic ? 'سجل اختياري لمتابعة التغيّر بمرور الوقت.' : 'An optional log to follow changes over time.'}</p></div></div>
        <form className="wellness-weight-form" onSubmit={saveWeight}>
          <label>{isArabic ? 'الوزن (كغ)' : 'Weight (kg)'}<input type="number" min="1" max="1000" step="0.1" value={weightInput} onChange={event => setWeightInput(event.target.value)} required /></label>
          <button className="button button-primary" type="submit">{isArabic ? 'حفظ وزن اليوم' : 'Save today’s weight'}</button>
        </form>
        {data.recent_weight.length > 0 ? <>
          <div className="wellness-weight-list">{data.recent_weight.map(entry => <span key={entry.entry_date}>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString(isArabic ? 'ar' : 'en', { month: 'short', day: 'numeric' })}: <strong>{number(entry.weight_kg)} kg</strong></span>)}</div>
          <div className="wellness-weight-chart" role="img" aria-label={isArabic ? 'مخطط الوزن المسجل' : 'Logged body weight trend'}>
            {data.recent_weight.map(entry => {
              const weights = data.recent_weight.map(item => Number(item.weight_kg));
              const min = Math.min(...weights);
              const max = Math.max(...weights);
              const height = max === min ? 70 : 28 + (Number(entry.weight_kg) - min) / (max - min) * 72;
              return <div className="wellness-weight-point" key={entry.entry_date}>
                <strong>{number(entry.weight_kg)}</strong><span style={{ height: `${height}%` }} />
                <small>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString(isArabic ? 'ar' : 'en', { month: 'short', day: 'numeric' })}</small>
              </div>;
            })}
          </div>
        </> : <p className="wellness-tracking-empty">{isArabic ? 'لم تسجل وزناً بعد.' : 'No weight entries yet.'}</p>}
      </section>
    </div>
    <section className="wellness-tools">
      <div className="wellness-tool-heading"><div><h2>{isArabic ? 'التقدم خلال ٧ أيام' : '7-day trends'}</h2><p>{isArabic ? 'السعرات اليومية وسجل التمارين.' : 'Daily calories and logged exercises.'}</p></div></div>
      <div className="wellness-chart" role="img" aria-label={isArabic ? 'مخطط السعرات والتمارين خلال آخر سبعة أيام' : 'Calories and workouts for the last seven days'}>
        {data.trends.map(day => {
          const caloriePercent = Math.min(100, Math.round(Number(day.calories) / (data.profile.calorie_goal || Math.max(1, ...data.trends.map(item => item.calories))) * 100));
          const workoutPercent = Math.min(100, Number(day.workouts) * 28);
          return <div className="wellness-chart-day" key={day.date}>
            <div className="wellness-chart-bars"><span className="calorie-bar" style={{ height: `${Math.max(day.calories ? 5 : 0, caloriePercent)}%` }} title={`${day.calories} kcal`} /><span className="workout-bar" style={{ height: `${Math.max(day.workouts ? 5 : 0, workoutPercent)}%` }} title={`${day.workouts} exercises`} /></div>
            <strong>{number(day.calories)}</strong>
            <small>{new Date(`${day.date}T12:00:00`).toLocaleDateString(isArabic ? 'ar' : 'en', { weekday: 'short' })}</small>
          </div>;
        })}
      </div>
      <div className="wellness-chart-legend"><span className="calorie-legend">{isArabic ? 'سعرات' : 'Calories'}</span><span className="workout-legend">{isArabic ? 'تمارين' : 'Exercises'}</span></div>
    </section>

    <div className="wellness-list-heading">
      <div><h2>{section === 'diet' ? (isArabic ? 'سجل الوجبات' : 'Meal log') : (isArabic ? 'سجل التمارين' : 'Workout log')}</h2><p>{new Date(`${date}T12:00:00`).toLocaleDateString(isArabic ? 'ar' : 'en', { dateStyle: 'full' })}</p></div>
      <button className="button button-primary" type="button" onClick={() => { setForm({ kind: section === 'diet' ? 'meal' : 'workout', value: section === 'diet' ? emptyMeal(date) : emptyWorkout(date) }); setError(''); setSaved(''); }}>
        + {section === 'diet' ? (isArabic ? 'إضافة وجبة' : 'Add meal') : (isArabic ? 'إضافة تمرين' : 'Add exercise')}
      </button>
    </div>

    {form && <form className="wellness-form" onSubmit={saveEntry}>
      <h3>{isMealForm ? (isArabic ? 'تفاصيل الوجبة' : 'Meal details') : (isArabic ? 'تفاصيل التمرين' : 'Exercise details')}</h3>
      <label>{isArabic ? 'التاريخ' : 'Date'}<input type="date" required value={form.value.entry_date || date} onChange={event => updateField('entry_date', event.target.value)} /></label>
      <div className="wellness-fields">
        {fields.map(([key, label, type, options]) => <label className={type === 'textarea' ? 'wide' : ''} key={key}>{label}
          {type === 'select'
            ? <select value={form.value[key]} onChange={event => updateField(key, event.target.value)}>{options.map(([value, optionLabel]) => <option value={value} key={value}>{optionLabel}</option>)}</select>
            : type === 'textarea'
              ? <textarea rows="3" maxLength="2000" value={form.value[key] || ''} onChange={event => updateField(key, event.target.value)} />
              : <input type={type} min={key === 'weight_kg' || key.endsWith('_g') ? '0' : '0'} step={key === 'weight_kg' || key.endsWith('_g') ? '0.1' : '1'} max={key === 'calories' ? 20000 : undefined} required={key === 'name' || key === 'exercise' || key === 'calories'} value={form.value[key]} onChange={event => updateField(key, event.target.value)} />}
        </label>)}
      </div>
      <div className="editor-actions">
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ السجل' : 'Save entry')}</button>
        {!isMealForm && form.value.exercise && <button className="button button-quiet" type="button" onClick={() => saveTemplate(form.value)}>{isArabic ? 'حفظ كقالب' : 'Save as template'}</button>}
        <button className="button button-quiet" type="button" onClick={() => setForm(null)}>{t.cancel}</button>
      </div>
    </form>}

    {records.length === 0
      ? <div className="wellness-empty"><span aria-hidden="true">{section === 'diet' ? '◉' : '↗'}</span><h3>{isArabic ? 'لا توجد سجلات لهذا اليوم' : 'Nothing logged for this day yet'}</h3><p>{section === 'diet' ? (isArabic ? 'أضف وجبتك الأولى لتبدأ متابعة غذائك.' : 'Add your first meal to start tracking your nutrition.') : (isArabic ? 'أضف تمرينك الأول لمتابعة تقدمك.' : 'Log your first exercise to follow your progress.')}</p></div>
      : <div className="wellness-records">{records.map(record => <article className="wellness-record" key={record.id}>
        <div className="wellness-record-copy">
          <span className="wellness-record-tag">{section === 'diet' ? mealTypeName(record.meal_type) : `${record.sets} × ${record.reps}`}</span>
          <h3>{section === 'diet' ? record.name : record.exercise}</h3>
          {section === 'diet'
            ? <p>{number(record.calories)} kcal · P {number(record.protein_g)}g · C {number(record.carbs_g)}g · F {number(record.fat_g)}g</p>
            : <p>{record.sets} {isArabic ? 'مجموعات' : 'sets'} × {record.reps} {isArabic ? 'تكرار' : 'reps'} · {number(record.weight_kg)} kg · {record.duration_minutes} min</p>}
          {record.notes && <p>{record.notes}</p>}
        </div>
        <div className="record-actions">
          <button className="button button-quiet" type="button" onClick={() => section === 'diet' ? editMeal(record) : editWorkout(record)}>{t.edit}</button>
          <button className="button button-quiet" type="button" onClick={() => removeEntry(section === 'diet' ? 'meals' : 'workouts', record.id)}>{t.delete}</button>
        </div>
      </article>)}</div>}
  </section>;
}

function Metric({ label, value, suffix = '' }) {
  return <div className="metric-card wellness-metric"><span>{label}</span><strong>{value}<small>{suffix ? ` ${suffix}` : ''}</small></strong></div>;
}

function GoalProgress({ label, value, goal, unit }) {
  const percent = Math.min(100, Math.round(Number(value || 0) / goal * 100));
  return <div className="wellness-goal-progress-row">
    <div><span>{label}</span><strong>{value} / {goal} {unit}</strong></div>
    <div className="dashboard-goal-track"><span style={{ width: `${percent}%` }} /></div>
  </div>;
}
