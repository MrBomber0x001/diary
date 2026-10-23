import { todayDate } from '../api.js';

const choice = (key, options, label = key) => ({ key, label, type: 'select', options });
const text = (key, label = key, extra = {}) => ({ key, label, ...extra });
const notes = (key = 'notes', label = key) => text(key, label, { type: 'textarea', wide: true });
const date = (key, label = key) => text(key, label, { type: 'date' });

export const collections = {
  library: {
    title: 'المكتبة', endpoint: '/items', singular: 'عنصر', linkKey: 'item', viewType: 'library',
    fields: [
      choice('kind', ['book', 'game', 'movie', 'memo'], 'النوع'),
      text('title', 'العنوان', { required: true }), text('creator', 'المؤلف / المنشئ'),
      choice('status', ['planned', 'in_progress', 'completed', 'paused', 'dropped'], 'الحالة'),
      text('progress', 'التقدم'), text('rating', 'التقييم', { type: 'number', min: 1, max: 5 }),
      text('tags', 'وسوم'), text('cover_image', 'رابط الغلاف'),
      text('near_completion', 'قريب من الإكمال', { type: 'checkbox' }),
      date('started_on', 'تاريخ البدء'), date('finished_on', 'تاريخ الإنهاء'),
      text('review', 'مراجعة', { type: 'textarea', wide: true }), notes(),
    ],
    show: ['kind', 'creator', 'status', 'progress', 'rating', 'tags'],
  },
  tasks: {
    title: 'المهام', endpoint: '/todos', singular: 'مهمة', viewType: 'tasks',
    fields: [
      text('title', 'عنوان المهمة', { required: true }), notes(),
      date('due_date', 'تاريخ الاستحقاق'), text('due_time', 'الوقت', { type: 'time' }),
      choice('recurrence', ['none', 'daily', 'weekly', 'monthly', 'yearly']),
      text('completed', 'مكتملة', { type: 'checkbox' }),
    ],
    show: ['notes', 'due_date', 'due_time', 'recurrence'],
    afterSave: row => ({ ...row, completed: Boolean(row.completed) }),
    prepare: value => ({ ...value, completed: Boolean(value.completed) }),
    toggle: { key: 'completed', label: 'اكتملت' },
  },
  calendar: {
    title: 'التقويم', endpoint: () => `/events?start=${todayDate()}&end=${dateOffset(21)}`, singular: 'موعد',
    writeEndpoint: '/events',
    fields: [
      text('title', 'عنوان الموعد', { required: true }), notes('description', 'الوصف'),
      text('starts_at', 'يبدأ', { type: 'datetime-local', required: true }),
      text('ends_at', 'ينتهي', { type: 'datetime-local' }),
      text('all_day', 'طوال اليوم', { type: 'checkbox' }),
      choice('recurrence', ['none', 'daily', 'weekly', 'monthly']),
    ],
    show: ['occurrence_start', 'description', 'recurrence'],
  },
  habits: {
    title: 'العادات', endpoint: '/habits', singular: 'عادة', viewType: 'habits',
    fields: [
      text('title', 'اسم العادة', { required: true }), notes(),
      choice('frequency', ['daily', 'weekly']),
      text('target_per_week', 'الهدف الأسبوعي', { type: 'number', min: 1, max: 7, defaultValue: 7 }),
    ],
    show: ['notes', 'frequency', 'target_per_week', 'completed_this_week', 'total_completions'],
    action: { label: 'إنجاز اليوم', run: (row, call) => call(`/habits/${row.id}/log`, { method: 'PUT', body: { completed: !row.completed_today } }), updateKey: 'completed_today' },
  },
  routines: {
    title: 'الروتين اليومي', endpoint: '/routines', singular: 'روتين', viewType: 'routines',
    fields: [
      text('title', 'اسم الروتين', { required: true }), notes('description', 'الوصف'),
      text('steps', 'الخطوات (كل خطوة في سطر)', { type: 'textarea', wide: true, parse: 'lines' }),
    ],
    show: ['description', 'steps', 'completed_this_week', 'total_completions'],
    action: { label: 'إنجاز اليوم', run: (row, call) => call(`/routines/${row.id}/log`, { method: 'PUT', body: { completed: !row.completed_today } }), updateKey: 'completed_today' },
  },
  articles: {
    title: 'قائمة القراءة', endpoint: '/articles', singular: 'مقال', viewType: 'reading',
    fields: [
      text('title', 'العنوان', { required: true }), text('url', 'الرابط', { type: 'url' }),
      choice('status', ['unread', 'reading', 'read', 'archived']),
      text('description', 'الوصف', { type: 'textarea' }), text('excerpt', 'مقتطف', { type: 'textarea' }),
      text('review', 'ملاحظات القراءة', { type: 'textarea', wide: true }),
    ],
    show: ['url', 'status', 'description', 'excerpt', 'review'],
  },
  bookmarks: {
    title: 'الروابط المحفوظة', endpoint: '/bookmarks', singular: 'رابط',
    fields: [
      text('title', 'العنوان', { required: true }), text('url', 'الرابط', { type: 'url', required: true }),
      text('category', 'المجلد'), text('image_url', 'رابط الصورة'),
      text('note', 'ملاحظة', { type: 'textarea', wide: true }),
    ],
    show: ['url', 'category', 'note'],
  },
  snippets: {
    title: 'مقاطع برمجية', endpoint: '/snippets', singular: 'مقطع', viewType: 'snippets',
    fields: [
      text('title', 'العنوان', { required: true }), text('language', 'لغة البرمجة'),
      text('description', 'الوصف', { type: 'textarea' }),
      text('code', 'الكود', { type: 'textarea', wide: true, required: true }),
    ],
    show: ['language', 'description', 'code'],
  },
  areas: {
    title: 'مجالات الحياة', endpoint: '/areas', singular: 'مجال',
    fields: [text('name', 'اسم المجال', { required: true }), text('color', 'اللون', { type: 'color', defaultValue: '#527b6c' })],
    show: ['active_goals', 'active_projects', 'color'],
  },
  goals: {
    title: 'الأهداف', endpoint: '/goals', singular: 'هدف',
    fields: [
      text('title', 'الهدف', { required: true }), text('area_id', 'رقم المجال', { type: 'number' }),
      choice('status', ['planned', 'active', 'completed']), date('target_date', 'التاريخ المستهدف'),
      text('description', 'الوصف', { type: 'textarea', wide: true }),
    ],
    show: ['area_name', 'status', 'target_date', 'total_projects', 'completed_projects', 'description'],
  },
  projects: {
    title: 'المشاريع', endpoint: '/projects', singular: 'مشروع',
    fields: [
      text('title', 'المشروع', { required: true }), text('area_id', 'رقم المجال', { type: 'number' }),
      text('goal_id', 'رقم الهدف', { type: 'number' }), choice('status', ['planned', 'active', 'on_hold', 'completed']),
      date('due_date', 'الموعد النهائي'), text('next_action', 'الخطوة التالية'),
      text('description', 'الوصف', { type: 'textarea', wide: true }),
    ],
    show: ['area_name', 'goal_title', 'status', 'due_date', 'next_action', 'completed_tasks', 'total_tasks'],
  },
  learning: {
    title: 'التعلم', endpoint: '/learning/topics', singular: 'موضوع',
    fields: [
      text('title', 'الموضوع', { required: true }), choice('status', ['exploring', 'learning', 'reviewed']),
      text('description', 'الوصف', { type: 'textarea', wide: true }),
    ],
    show: ['status', 'description', 'note_count', 'file_count'],
  },
  clubs: {
    title: 'نوادي القراءة', endpoint: '/book-clubs', singular: 'نادٍ',
    fields: [text('name', 'اسم النادي', { required: true }), text('description', 'الوصف', { type: 'textarea', wide: true })],
    show: ['description', 'role', 'member_count', 'book_count'],
  },
  interviews: {
    title: 'طلبات التوظيف', endpoint: '/interviews', singular: 'طلب', viewType: 'applications',
    fields: [
      text('company', 'الشركة', { required: true }), text('role', 'المسمى الوظيفي', { required: true }),
      choice('status', ['applied', 'screening', 'interviewing', 'offer', 'rejected', 'withdrawn']),
      text('job_url', 'رابط الوظيفة', { type: 'url' }), date('applied_on', 'تاريخ التقديم'),
      text('notes', 'ملاحظات', { type: 'textarea', wide: true }),
    ],
    show: ['role', 'status', 'job_url', 'applied_on', 'rounds'],
  },
};

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
}
