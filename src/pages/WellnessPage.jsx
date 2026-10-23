import { useCallback, useEffect, useRef, useState } from 'react';
import { api, todayDate } from '../api.js';
import { messages } from '../i18n.js';
import { useAppDialog } from '../components/AppDialogProvider.jsx';

const emptyMeal = date => ({ entry_date: date, meal_type: 'breakfast', name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', notes: '' });
const emptyWorkout = date => ({ entry_date: date, exercise: '', sets: '', reps: '', weight_kg: '', duration_minutes: '', notes: '' });

export default function WellnessPage({ language, onUnauthorized }) {
  const { confirm, prompt } = useAppDialog();
  const [date, setDate] = useState(todayDate());
  const [section, setSection] = useState('diet');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const formRef = useRef(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const [wellnessSaving, setWellnessSaving] = useState(false);
  const [waterSaving, setWaterSaving] = useState(false);
  const [showAllWater, setShowAllWater] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [goals, setGoals] = useState(null);
  const [quickMeal, setQuickMeal] = useState({ meal_type: 'breakfast', name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', notes: '' });
  const [showMealDetails, setShowMealDetails] = useState(false);
  const [quickMealSaving, setQuickMealSaving] = useState(false);
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [foodServings, setFoodServings] = useState(1);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [catalog, setCatalog] = useState({ foods: [], exercises: [] });
  const [catalogType, setCatalogType] = useState('food');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogEditor, setCatalogEditor] = useState(null);
  const isArabic = language === 'ar';
  const t = messages[language];
  const formOpen = Boolean(form);
  const formKind = form?.kind;
  const formId = form?.id;

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await api(`/wellness?date=${date}`);
      const catalogResult = await api('/wellness/catalog');
      setData(result);
      setCatalog(catalogResult);
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
  useEffect(() => {
    if (formOpen) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [formOpen, formKind, formId]);

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

  async function saveQuickMeal(event) {
    event.preventDefault();
    if (!quickMeal.name.trim() || quickMealSaving) return;
    setQuickMealSaving(true);
    setError('');
    setSaved('');
    try {
      await api('/wellness/meals', {
        method: 'POST',
        body: {
          ...quickMeal,
          name: quickMeal.name.trim(),
          entry_date: date,
          calories: quickMeal.calories || 0,
          protein_g: quickMeal.protein_g || 0,
          carbs_g: quickMeal.carbs_g || 0,
          fat_g: quickMeal.fat_g || 0,
        },
      });
      setQuickMeal(current => ({ ...current, name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', notes: '' }));
      setSelectedFood(null);
      setFoodServings(1);
      setSaved(isArabic ? 'تم تسجيل الوجبة.' : 'Meal logged.');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setQuickMealSaving(false);
    }
  }

  async function logRecentMeal(meal) {
    if (quickMealSaving) return;
    setQuickMealSaving(true);
    setError('');
    setSaved('');
    try {
      await api('/wellness/meals', {
        method: 'POST',
        body: { ...meal, entry_date: date },
      });
      setSaved(isArabic ? 'تم تسجيل الوجبة السابقة.' : 'Previous meal logged.');
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setQuickMealSaving(false);
    }
  }

  async function removeEntry(kind, id) {
    if (!await confirm({
      title: isArabic ? 'حذف السجل؟' : 'Delete entry?',
      message: isArabic ? 'سيتم حذف هذا السجل نهائياً.' : 'This entry will be permanently deleted.',
      confirmLabel: isArabic ? 'حذف السجل' : 'Delete entry',
      danger: true,
    })) return;
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
    if (waterSaving) return;
    setWaterSaving(true);
    setError('');
    try {
      await api('/wellness/water', { method: 'POST', body: { entry_date: date, amount_ml: amount } });
      await load();
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    } finally {
      setWaterSaving(false);
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
    const name = await prompt({
      title: isArabic ? 'حفظ قالب تمرين' : 'Save workout template',
      message: isArabic ? 'اختر اسماً يسهل تذكره لهذا القالب.' : 'Choose a memorable name for this template.',
      inputLabel: isArabic ? 'اسم القالب' : 'Template name',
      initialValue: workout.exercise,
      confirmLabel: isArabic ? 'حفظ القالب' : 'Save template',
    });
    if (name === null || !name.trim()) return;
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

  function updateCatalogField(key, value) {
    setCatalogEditor(current => ({ ...current, value: { ...current.value, [key]: value } }));
  }

  async function saveCatalogItem(event) {
    event.preventDefault();
    if (!catalogEditor) return;
    setError('');
    setSaved('');
    const isEditing = Boolean(catalogEditor.value.id);
    const { id, ...value } = catalogEditor.value;
    try {
      await api(`/wellness/catalog${isEditing ? `/${id}` : ''}`, {
        method: isEditing ? 'PUT' : 'POST',
        body: { ...value, kind: catalogEditor.kind },
      });
      const updatedCatalog = await api('/wellness/catalog');
      setCatalog(updatedCatalog);
      setCatalogEditor(null);
      setSaved(isArabic ? 'تم حفظ عنصر المكتبة.' : 'Library item saved.');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  async function deleteCatalogItem(item) {
    if (!await confirm({
      title: isArabic ? 'حذف العنصر؟' : 'Delete library item?',
      message: isArabic ? `سيتم حذف «${item.nameAr || item.name}» من مكتبتك.` : `Remove “${item.name}” from your library?`,
      confirmLabel: isArabic ? 'حذف' : 'Delete',
      danger: true,
    })) return;
    setError('');
    try {
      await api(`/wellness/catalog/${item.id}`, { method: 'DELETE' });
      const updatedCatalog = await api('/wellness/catalog');
      setCatalog(updatedCatalog);
      if (selectedFood?.id === item.id) setSelectedFood(null);
      if (catalogEditor?.value.id === item.id) setCatalogEditor(null);
      setSaved(isArabic ? 'تم حذف العنصر من المكتبة.' : 'Library item deleted.');
    } catch (failure) {
      if (failure.status === 401) onUnauthorized();
      else setError(failure.message);
    }
  }

  const number = value => new Intl.NumberFormat(isArabic ? 'ar' : 'en', { maximumFractionDigits: 1 }).format(Number(value || 0));
  const mealTypeName = type => ({
    breakfast: isArabic ? 'الإفطار' : 'Breakfast',
    lunch: isArabic ? 'الغداء' : 'Lunch',
    dinner: isArabic ? 'العشاء' : 'Dinner',
    snack: isArabic ? 'وجبة خفيفة' : 'Snack',
  }[type] || type);
  const exerciseCategoryName = category => ({
    Strength: isArabic ? 'قوة' : 'Strength',
    Bodyweight: isArabic ? 'وزن الجسم' : 'Bodyweight',
    Cardio: isArabic ? 'كارديو' : 'Cardio',
  }[category] || category);
  const visibleFoods = foodSearch.trim()
    ? catalog.foods.filter(food => `${food.name} ${food.nameAr} ${food.category}`.toLocaleLowerCase().includes(foodSearch.trim().toLocaleLowerCase())).slice(0, 8)
    : [
      ...catalog.foods.filter(food => food.category === 'Grains').slice(0, 2),
      ...catalog.foods.filter(food => food.category === 'Fruit').slice(0, 2),
      ...catalog.foods.filter(food => food.category === 'Protein').slice(0, 3),
      ...catalog.foods.filter(food => food.category === 'Dairy').slice(0, 1),
    ];
  const visibleExercises = exerciseSearch.trim()
    ? catalog.exercises.filter(exercise => `${exercise.name} ${exercise.nameAr} ${exercise.category}`.toLocaleLowerCase().includes(exerciseSearch.trim().toLocaleLowerCase())).slice(0, 10)
    : [
      ...catalog.exercises.filter(exercise => exercise.category === 'Strength').slice(0, 5),
      ...catalog.exercises.filter(exercise => exercise.category === 'Bodyweight').slice(0, 2),
      ...catalog.exercises.filter(exercise => exercise.category === 'Cardio').slice(0, 3),
    ];
  const fillFood = (food, servings = 1) => {
    const amount = Number(servings);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 20) return;
    const scaled = value => String(Math.round(value * amount * 10) / 10);
    setSelectedFood(food);
    setFoodServings(amount);
    setQuickMeal(current => ({
      ...current,
      name: isArabic ? food.nameAr || food.name : food.name,
      calories: String(Math.round(food.calories * amount)),
      protein_g: scaled(food.protein),
      carbs_g: scaled(food.carbs),
      fat_g: scaled(food.fat),
    }));
    setShowMealDetails(true);
  };
  const chooseExercise = exercise => {
    setForm({
      kind: 'workout',
      value: {
        ...emptyWorkout(date),
        exercise: isArabic ? exercise.nameAr : exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        duration_minutes: exercise.duration_minutes || '',
      },
    });
    setError('');
    setSaved('');
  };
  const currentCatalogItems = catalogType === 'food' ? catalog.foods : catalog.exercises;
  const filteredCatalogItems = currentCatalogItems.filter(item =>
    `${item.name} ${item.nameAr} ${item.category}`.toLocaleLowerCase().includes(catalogSearch.trim().toLocaleLowerCase()));
  const emptyCatalogItem = kind => ({
    name: '',
    nameAr: '',
    category: kind === 'food' ? 'Other' : 'Strength',
    ...(kind === 'food'
      ? { serving: '', servingAr: '', calories: '', protein: '', carbs: '', fat: '' }
      : { sets: 3, reps: 10, duration_minutes: '' }),
  });
  const changeGoal = (key, value) => setGoals(current => ({ ...current, [key]: value }));

  if (!data) return <section className="page-card">{error || t.loading}</section>;
  const records = section === 'diet' ? data.meals : data.workouts;
  const waterGoal = Number(data.profile.water_goal_ml) || 2000;
  const waterProgress = Math.min(100, Math.round(Number(data.water_total_ml) / waterGoal * 100));
  const visibleWaterEntries = showAllWater ? data.water : data.water.slice(0, 4);
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
      <label>{isArabic ? 'التاريخ' : 'Date'}<input type="date" value={date} onChange={event => { setDate(event.target.value); setForm(null); setSaved(''); setShowAllWater(false); }} /></label>
    </header>
    <div className="wellness-tabs" role="tablist" aria-label={isArabic ? 'قسم اللياقة' : 'Wellness section'}>
      <button className={`wellness-tab ${section === 'diet' ? 'active' : ''}`} type="button" role="tab" aria-selected={section === 'diet'} onClick={() => { setSection('diet'); setForm(null); }}>
        <span aria-hidden="true">◉</span>{isArabic ? 'الغذاء' : 'Diet'}
      </button>
      <button className={`wellness-tab ${section === 'gym' ? 'active' : ''}`} type="button" role="tab" aria-selected={section === 'gym'} onClick={() => { setSection('gym'); setForm(null); }}>
        <span aria-hidden="true">↗</span>{isArabic ? 'النادي الرياضي' : 'Gym'}
      </button>
      <button className={`wellness-tab ${section === 'library' ? 'active' : ''}`} type="button" role="tab" aria-selected={section === 'library'} onClick={() => { setSection('library'); setForm(null); setCatalogEditor(null); }}>
        <span aria-hidden="true">▦</span>{isArabic ? 'مكتبتي' : 'My library'}
      </button>
    </div>

    {error && <p className="notice error" role="alert">{error}</p>}
    {saved && <p className="notice" role="status">{saved}</p>}

    {section === 'library' && <section className="wellness-library">
      <header className="wellness-library-header">
        <div><p className="eyebrow">{isArabic ? 'محتوى قابل للتخصيص' : 'YOUR PERSONAL DATABASE'}</p>
          <h2>{isArabic ? 'مكتبة الغذاء والتمارين' : 'Food & exercise library'}</h2>
          <p>{isArabic ? 'عدّل العناصر الجاهزة أو أضف عناصر خاصة بك. مكتبتك محفوظة لحسابك.' : 'Edit starter items or add your own. Your library is saved to your account.'}</p>
        </div>
        <button className="button button-primary" type="button" onClick={() => setCatalogEditor({ kind: catalogType, value: emptyCatalogItem(catalogType) })}>
          + {isArabic ? 'إضافة عنصر' : 'Add item'}
        </button>
      </header>
      <div className="wellness-library-summary">
        <button className={`wellness-library-kind ${catalogType === 'food' ? 'active' : ''}`} type="button" onClick={() => { setCatalogType('food'); setCatalogEditor(null); }}>
          <span aria-hidden="true">◉</span><span><strong>{isArabic ? 'الأطعمة' : 'Foods'}</strong><small>{number(catalog.foods.length)} {isArabic ? 'عنصر' : 'items'}</small></span>
        </button>
        <button className={`wellness-library-kind ${catalogType === 'exercise' ? 'active' : ''}`} type="button" onClick={() => { setCatalogType('exercise'); setCatalogEditor(null); }}>
          <span aria-hidden="true">↗</span><span><strong>{isArabic ? 'التمارين' : 'Exercises'}</strong><small>{number(catalog.exercises.length)} {isArabic ? 'عنصر' : 'items'}</small></span>
        </button>
      </div>
      <label className="wellness-catalog-search wellness-library-search">{isArabic ? 'ابحث في مكتبتك' : 'Search your library'}
        <input type="search" value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)}
          placeholder={catalogType === 'food' ? (isArabic ? 'اسم الطعام أو الفئة…' : 'Food name or category…') : (isArabic ? 'اسم التمرين أو الفئة…' : 'Exercise name or category…')} />
      </label>
      {catalogEditor && <form className="wellness-catalog-editor" onSubmit={saveCatalogItem}>
        <div className="wellness-catalog-editor-heading">
          <div><h3>{catalogEditor.value.id ? (isArabic ? 'تعديل العنصر' : 'Edit item') : (isArabic ? 'عنصر جديد' : 'New item')}</h3>
            <p>{catalogEditor.kind === 'food' ? (isArabic ? 'أدخل القيم لحصة واحدة.' : 'Enter values for one serving.') : (isArabic ? 'القيم المقترحة قابلة للتعديل عند التسجيل.' : 'Defaults can be adjusted when logging.')}</p></div>
        </div>
        <div className="wellness-catalog-editor-fields">
          <label>{isArabic ? 'الاسم (إنجليزي)' : 'Name'}<input maxLength="120" value={catalogEditor.value.name} onChange={event => updateCatalogField('name', event.target.value)} required /></label>
          <label>{isArabic ? 'الاسم بالعربية' : 'Arabic name'}<input maxLength="120" dir="auto" value={catalogEditor.value.nameAr} onChange={event => updateCatalogField('nameAr', event.target.value)} /></label>
          <label>{isArabic ? 'الفئة' : 'Category'}<input maxLength="60" value={catalogEditor.value.category} onChange={event => updateCatalogField('category', event.target.value)} required /></label>
          {catalogEditor.kind === 'food' ? <>
            <label>{isArabic ? 'الحصة' : 'Serving'}<input maxLength="120" value={catalogEditor.value.serving} onChange={event => updateCatalogField('serving', event.target.value)} required /></label>
            <label>{isArabic ? 'الحصة بالعربية' : 'Arabic serving'}<input maxLength="120" dir="auto" value={catalogEditor.value.servingAr} onChange={event => updateCatalogField('servingAr', event.target.value)} /></label>
            <label>{isArabic ? 'السعرات' : 'Calories'}<input type="number" min="0" max="20000" step="1" value={catalogEditor.value.calories} onChange={event => updateCatalogField('calories', event.target.value)} required /></label>
            <label>{isArabic ? 'البروتين (غ)' : 'Protein (g)'}<input type="number" min="0" max="1000" step="0.1" value={catalogEditor.value.protein} onChange={event => updateCatalogField('protein', event.target.value)} required /></label>
            <label>{isArabic ? 'الكربوهيدرات (غ)' : 'Carbs (g)'}<input type="number" min="0" max="2000" step="0.1" value={catalogEditor.value.carbs} onChange={event => updateCatalogField('carbs', event.target.value)} required /></label>
            <label>{isArabic ? 'الدهون (غ)' : 'Fat (g)'}<input type="number" min="0" max="1000" step="0.1" value={catalogEditor.value.fat} onChange={event => updateCatalogField('fat', event.target.value)} required /></label>
          </> : <>
            <label>{isArabic ? 'المجموعات المقترحة' : 'Default sets'}<input type="number" min="0" max="100" step="1" value={catalogEditor.value.sets} onChange={event => updateCatalogField('sets', event.target.value)} /></label>
            <label>{isArabic ? 'التكرارات المقترحة' : 'Default reps'}<input type="number" min="0" max="1000" step="1" value={catalogEditor.value.reps} onChange={event => updateCatalogField('reps', event.target.value)} /></label>
            <label>{isArabic ? 'المدة (دقيقة)' : 'Duration (minutes)'}<input type="number" min="0" max="1440" step="1" value={catalogEditor.value.duration_minutes} onChange={event => updateCatalogField('duration_minutes', event.target.value)} /></label>
          </>}
        </div>
        <div className="editor-actions">
          <button className="button button-primary" type="submit">{isArabic ? 'حفظ' : 'Save item'}</button>
          <button className="button button-quiet" type="button" onClick={() => setCatalogEditor(null)}>{t.cancel}</button>
        </div>
      </form>}
      <div className="wellness-managed-catalog">
        {filteredCatalogItems.map(item => <article className="wellness-managed-item" key={item.id}>
          <div className="wellness-managed-item-main">
            <div className="wellness-managed-item-title"><h3>{isArabic ? item.nameAr || item.name : item.name}</h3>
              <span className={item.isBuiltin ? 'wellness-catalog-badge starter' : 'wellness-catalog-badge'}>{item.isBuiltin ? (isArabic ? 'أساسي' : 'Starter') : (isArabic ? 'خاص بي' : 'Custom')}</span>
            </div>
            <p>{item.category}{catalogType === 'food'
              ? ` · ${isArabic ? item.servingAr || item.serving : item.serving} · ${item.calories} kcal · P ${number(item.protein)} · C ${number(item.carbs)} · F ${number(item.fat)} g`
              : ` · ${item.duration_minutes ? `${item.duration_minutes} ${isArabic ? 'دقيقة' : 'min'}` : `${item.sets} × ${item.reps}`}`}</p>
          </div>
          <div className="wellness-managed-actions">
            <button className="button button-quiet" type="button" onClick={() => setCatalogEditor({ kind: catalogType, value: { ...item } })}>{isArabic ? 'تعديل' : 'Edit'}</button>
            <button className="button button-quiet" type="button" onClick={() => deleteCatalogItem(item)}>{isArabic ? 'حذف' : 'Delete'}</button>
          </div>
        </article>)}
        {filteredCatalogItems.length === 0 && <div className="wellness-library-empty">
          <strong>{isArabic ? 'لا توجد نتائج' : 'No results'}</strong>
          <p>{isArabic ? 'غيّر البحث أو أضف عنصراً جديداً إلى مكتبتك.' : 'Try another search or add a new item to your library.'}</p>
        </div>}
      </div>
    </section>}

    {section === 'diet' && <section className="wellness-tools wellness-quick-meal">
      <div className="wellness-tool-heading"><div>
        <h2>{isArabic ? 'تسجيل سريع' : 'Quick log'}</h2>
        <p>{isArabic ? 'اختر طعاماً لإضافة القيم تلقائياً، أو اكتب وجبتك الخاصة.' : 'Choose foods to fill nutrition automatically, or enter a custom meal.'}</p>
      </div><button className="button button-quiet" type="button" onClick={() => { setSection('library'); setCatalogType('food'); }}>{isArabic ? 'إدارة الأطعمة' : 'Manage foods'}</button></div>
      <div className="wellness-catalog">
        <label className="wellness-catalog-search">{isArabic ? 'ابحث عن طعام' : 'Find a food'}
          <input type="search" value={foodSearch} onChange={event => setFoodSearch(event.target.value)}
            placeholder={isArabic ? 'مثال: بيض، أرز، تفاح…' : 'e.g. eggs, rice, apple…'} />
        </label>
        <div className="wellness-catalog-results" aria-live="polite">
          {visibleFoods.map(food => <button className={`wellness-catalog-item ${selectedFood?.id === food.id ? 'selected' : ''}`} type="button" key={food.id} onClick={() => fillFood(food)}>
            <span><strong>{isArabic ? food.nameAr || food.name : food.name}</strong><small>{isArabic ? food.servingAr || food.serving : food.serving}</small></span>
            <span className="wellness-catalog-nutrition"><strong>{food.calories} kcal</strong><small>P {number(food.protein)} · C {number(food.carbs)} · F {number(food.fat)} g</small></span>
          </button>)}
          {visibleFoods.length === 0 && <p className="wellness-catalog-empty">{isArabic ? 'لا توجد أطعمة مطابقة. يمكنك كتابة اسمها يدوياً.' : 'No matching foods. You can still enter a custom meal below.'}</p>}
        </div>
        <p className="wellness-catalog-note">{isArabic ? 'القيم تقديرية للحصة المذكورة؛ راجع ملصق المنتج عند الحاجة للدقة.' : 'Nutrition is an estimate per listed serving; check the product label when accuracy matters.'}</p>
      </div>
      <form className="wellness-quick-meal-form" onSubmit={saveQuickMeal}>
        <label className="wellness-quick-meal-name">{isArabic ? 'ماذا أكلت؟' : 'What did you eat?'}
          <input autoComplete="off" maxLength="160" value={quickMeal.name} onChange={event => setQuickMeal(current => ({ ...current, name: event.target.value }))}
            placeholder={isArabic ? 'مثال: شوفان وموز' : 'e.g. Oatmeal and banana'} required />
        </label>
        <label>{isArabic ? 'الوجبة' : 'Meal'}
          <select value={quickMeal.meal_type} onChange={event => setQuickMeal(current => ({ ...current, meal_type: event.target.value }))}>
            {['breakfast', 'lunch', 'dinner', 'snack'].map(type => <option value={type} key={type}>{mealTypeName(type)}</option>)}
          </select>
        </label>
        <button className="button button-primary wellness-quick-meal-submit" type="submit" disabled={quickMealSaving || !quickMeal.name.trim()}>
          {quickMealSaving ? (isArabic ? 'جارٍ التسجيل…' : 'Logging…') : (isArabic ? 'تسجيل الوجبة' : 'Log meal')}
        </button>
        <button className="wellness-meal-details-toggle" type="button" aria-expanded={showMealDetails} onClick={() => setShowMealDetails(value => !value)}>
          {showMealDetails ? '−' : '+'} {showMealDetails ? (isArabic ? 'إخفاء التفاصيل' : 'Hide details') : (isArabic ? 'إضافة السعرات والمغذيات (اختياري)' : 'Add calories and macros (optional)')}
        </button>
        {selectedFood && <label className="wellness-food-servings">{isArabic ? `الحصص · ${selectedFood.servingAr}` : `Servings · ${selectedFood.serving}`}
          <input type="number" min="0.25" max="20" step="0.25" value={foodServings}
            onChange={event => {
              const value = event.target.value;
              setFoodServings(value);
              if (value && Number(value) > 0 && Number(value) <= 20) fillFood(selectedFood, value);
            }} />
        </label>}
        {showMealDetails && <div className="wellness-quick-meal-details">
          <label>{isArabic ? 'السعرات' : 'Calories'}<input type="number" min="0" max="20000" step="1" value={quickMeal.calories} onChange={event => setQuickMeal(current => ({ ...current, calories: event.target.value }))} /></label>
          <label>{isArabic ? 'البروتين (غ)' : 'Protein (g)'}<input type="number" min="0" max="1000" step="0.1" value={quickMeal.protein_g} onChange={event => setQuickMeal(current => ({ ...current, protein_g: event.target.value }))} /></label>
          <label>{isArabic ? 'الكربوهيدرات (غ)' : 'Carbs (g)'}<input type="number" min="0" max="2000" step="0.1" value={quickMeal.carbs_g} onChange={event => setQuickMeal(current => ({ ...current, carbs_g: event.target.value }))} /></label>
          <label>{isArabic ? 'الدهون (غ)' : 'Fat (g)'}<input type="number" min="0" max="1000" step="0.1" value={quickMeal.fat_g} onChange={event => setQuickMeal(current => ({ ...current, fat_g: event.target.value }))} /></label>
          <p>{isArabic ? 'اتركها فارغة إذا لم تكن تعرف القيم؛ لن نقدّرها نيابةً عنك.' : 'Leave values blank if you do not know them; the app will not guess.'}</p>
        </div>}
      </form>
      {data.recent_meals.length > 0 && <div className="wellness-recent-meals">
        <span>{isArabic ? 'سجّلتها من قبل · اضغط لإعادتها' : 'Logged before · tap to log again'}</span>
        <div>{data.recent_meals.map(meal => <button className="wellness-recent-meal" type="button" key={`${meal.meal_type}-${meal.name}`}
          onClick={() => logRecentMeal(meal)} disabled={quickMealSaving}>
          <strong>{meal.name}</strong><small>{mealTypeName(meal.meal_type)}{meal.calories ? ` · ${number(meal.calories)} kcal` : ''}</small>
        </button>)}</div>
      </div>}
    </section>}

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
    </> : section === 'gym' ? <>
      <div className="metric-grid wellness-metrics">
        <Metric label={isArabic ? 'تمارين اليوم' : 'Exercises today'} value={number(data.summary.sessions)} />
        <Metric label={isArabic ? 'مدة التمرين' : 'Training time'} value={number(data.summary.duration_minutes)} suffix={isArabic ? 'دقيقة' : 'min'} />
        <Metric label={isArabic ? 'حجم الأوزان' : 'Volume lifted'} value={number(data.summary.volume_kg)} suffix="kg" />
        <Metric label={isArabic ? 'تمارين هذا الأسبوع' : 'Exercises this week'} value={number(data.week.sessions)} />
      </div>
      <div className="wellness-week"><strong>{isArabic ? 'آخر ٧ أيام' : 'Last 7 days'}</strong><span>{number(data.week.duration_minutes)} {isArabic ? 'دقيقة تدريب' : 'training minutes'}</span><span>{number(data.week.volume_kg)} kg {isArabic ? 'حجم الأوزان' : 'volume lifted'}</span></div>
      <section className="wellness-tools wellness-exercise-catalog">
        <div className="wellness-tool-heading"><div><h2>{isArabic ? 'مكتبة التمارين' : 'Exercise library'}</h2><p>{isArabic ? 'اختر تمريناً لبدء سجل قابل للتعديل.' : 'Choose an exercise to start an editable workout log.'}</p></div>
          <button className="button button-quiet" type="button" onClick={() => { setSection('library'); setCatalogType('exercise'); }}>{isArabic ? 'إدارة التمارين' : 'Manage exercises'}</button>
        </div>
        <label className="wellness-catalog-search">{isArabic ? 'ابحث عن تمرين' : 'Find an exercise'}
          <input type="search" value={exerciseSearch} onChange={event => setExerciseSearch(event.target.value)}
            placeholder={isArabic ? 'مثال: سكوات، صدر، مشي…' : 'e.g. squat, chest, walking…'} />
        </label>
        <div className="wellness-catalog-results" aria-live="polite">
          {visibleExercises.map(exercise => <button className="wellness-catalog-item" type="button" key={exercise.id} onClick={() => chooseExercise(exercise)}>
            <span><strong>{isArabic ? exercise.nameAr : exercise.name}</strong><small>{exerciseCategoryName(exercise.category)}</small></span>
            <span className="wellness-catalog-nutrition"><strong>{exercise.duration_minutes
              ? `${exercise.duration_minutes} ${isArabic ? 'دقيقة' : 'min'}`
              : `${exercise.sets} × ${exercise.reps}`}</strong><small>{isArabic ? 'اختيار' : 'Select'} →</small></span>
          </button>)}
          {visibleExercises.length === 0 && <p className="wellness-catalog-empty">{isArabic ? 'لا توجد تمارين مطابقة. يمكنك كتابة تمرينك يدوياً.' : 'No matching exercises. You can still enter a custom exercise.'}</p>}
        </div>
      </section>
      {data.templates.length > 0 && <section className="wellness-tools">
        <div className="wellness-tool-heading"><div><h2>{isArabic ? 'قوالب التمرين' : 'Workout templates'}</h2><p>{isArabic ? 'ابدأ سجلاً جديداً من قالب محفوظ.' : 'Start a new log from a saved template.'}</p></div></div>
        <div className="wellness-template-list">{data.templates.map(template => <div className="wellness-template" key={template.id}>
          <button className="button button-quiet" type="button" onClick={() => { setForm({ kind: 'workout', value: { ...template, entry_date: date } }); setError(''); }}>
            {template.name} · {template.exercise}
          </button>
          <button className="icon-button" type="button" aria-label={isArabic ? `حذف قالب ${template.name}` : `Delete ${template.name} template`} onClick={() => removeEntry('templates', template.id)}>×</button>
        </div>)}</div>
      </section>}
    </> : null}

    {section !== 'library' && <>
    <div className="wellness-tracking-grid">
      <section className="wellness-tools wellness-water-tool">
        <div className="wellness-tool-heading">
          <div><h2>{isArabic ? 'شرب الماء' : 'Water tracker'}</h2><p>{isArabic ? 'اضغط الدائرة لتسجيل كوب ماء.' : 'Tap the circle to log a glass of water.'}</p></div>
        </div>
        <div className="wellness-water-main">
          <button
            className="water-progress-button"
            type="button"
            style={{ '--water-progress': `${waterProgress}%` }}
            onClick={() => addWater(250)}
            disabled={waterSaving}
            aria-label={isArabic
              ? `إضافة ٢٥٠ مل ماء. شربت ${number(data.water_total_ml)} مل${data.profile.water_goal_ml ? ` من هدف ${number(data.profile.water_goal_ml)} مل` : ''}`
              : `Add 250 ml of water. ${number(data.water_total_ml)} ml logged${data.profile.water_goal_ml ? ` of ${number(data.profile.water_goal_ml)} ml goal` : ''}`}
          >
            <span className="water-progress-content">
              <strong>{number(data.water_total_ml)}</strong>
              <small>{isArabic ? 'مل اليوم' : 'ml today'}</small>
              <span className="water-progress-add">{waterSaving ? '…' : '+ 250 ml'}</span>
            </span>
          </button>
          <div className="wellness-water-controls">
            <div className="wellness-water-summary">
              <strong>{data.profile.water_goal_ml ? `${number(waterProgress)}%` : (isArabic ? 'هدف مرئي' : 'Daily guide')}</strong>
              <span>{data.profile.water_goal_ml
                ? (isArabic ? `من هدف ${number(data.profile.water_goal_ml)} مل` : `of ${number(data.profile.water_goal_ml)} ml goal`)
                : (isArabic ? '٢٬٠٠٠ مل · اضبط هدفك في الأهداف الغذائية' : '2,000 ml · set a personal goal above')}</span>
            </div>
            <div className="wellness-water-actions">
              <button className="button button-quiet" type="button" onClick={() => addWater(500)} disabled={waterSaving}>+500 ml</button>
            </div>
          </div>
        </div>
        {data.water.length > 0
          ? <div className="wellness-water-history">
            <span className="wellness-water-history-label">{isArabic ? 'سجلات اليوم' : 'Today’s entries'}</span>
            <div className="wellness-water-list">{visibleWaterEntries.map(entry => <span key={entry.id}>{number(entry.amount_ml)} ml
              <button type="button" aria-label={isArabic ? `حذف إدخال ${number(entry.amount_ml)} مل من الماء` : `Remove ${number(entry.amount_ml)} ml water entry`} onClick={() => removeEntry('water', entry.id)}>×</button>
            </span>)}</div>
            {data.water.length > 4 && <button className="wellness-water-history-toggle" type="button" onClick={() => setShowAllWater(value => !value)} aria-expanded={showAllWater}>
              {showAllWater
                ? (isArabic ? 'عرض أقل' : 'Show less')
                : (isArabic ? `عرض كل السجلات (${number(data.water.length)})` : `Show all ${number(data.water.length)} entries`)}
            </button>}
          </div>
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

    {form && <form className="wellness-form" ref={formRef} onSubmit={saveEntry}>
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
    </>}
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
