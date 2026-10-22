const KIND_LABELS = { memo: 'مذكرة', book: 'كتاب', game: 'لعبة', movie: 'فيلم' };
const KIND_ICONS = { memo: '✍️', book: '📚', game: '🎮', movie: '🎬' };
const workspaceViews = new Set(['today', 'todos', 'calendar', 'planning', 'habits', 'library', 'articles', 'bookmarks', 'snippets', 'learning', 'finance', 'timeline', 'clubs', 'daily-notes', 'pinned', 'gallery']);
const shortcutChoices = [
  ['', 'غير معين'],
  ['Ctrl+Alt+Shift+KeyA', 'Ctrl + Alt + Shift + A'],
  ['Ctrl+Alt+Shift+KeyB', 'Ctrl + Alt + Shift + B'],
  ['Ctrl+Alt+Shift+KeyD', 'Ctrl + Alt + Shift + D'],
  ['Ctrl+Alt+Shift+KeyL', 'Ctrl + Alt + Shift + L'],
  ['Ctrl+Alt+Shift+KeyN', 'Ctrl + Alt + Shift + N'],
  ['Ctrl+Alt+Shift+KeyQ', 'Ctrl + Alt + Shift + Q'],
  ['Ctrl+Alt+Shift+KeyR', 'Ctrl + Alt + Shift + R'],
  ['Ctrl+Alt+Shift+KeyT', 'Ctrl + Alt + Shift + T'],
];
const requestedWorkspace = location.hash.slice(1);
const STATUS_LABELS = {
  planned: 'في القائمة',
  in_progress: 'أتابعه حالياً',
  completed: 'أنهيته',
  paused: 'متوقف مؤقتاً',
  dropped: 'لم أكمله',
};

const itemsElement = document.getElementById('items');
const statsElement = document.getElementById('stats');
const itemDialog = document.getElementById('itemDialog');
const itemForm = document.getElementById('itemForm');
const progressDialog = document.getElementById('progressDialog');
const progressForm = document.getElementById('progressForm');
const themeToggle = document.getElementById('themeToggle');
const searchInput = document.getElementById('search');
let items = [];
let todos = [];
let articles = [];
let bookmarks = [];
let bookmarkCategoryFilter = '';
let codeSnippets = [];
let snippetLanguageFilter = '';
let learningTopics = [];
let activeLearningTopic = null;
let learningLoadVersion = 0;
let pinnedEntries = [];
let noteIndex = [];
let galleryImages = [];
let galleryImageIndex = 0;
let galleryActiveFilter = '';
let dailyNote = null;
let dailyNoteSaveTimer = null;
let dailyNoteDirty = false;
let dailyNoteVersion = 0;
let bookClubs = [];
let bookClubNotifications = [];
let activeClubId = null;
let activeClub = null;
let areas = [];
let goals = [];
let projects = [];
let events = [];
let reminderEvents = [];
let habits = [];
let routines = [];
let todayPlan = null;
let weeklyReview = null;
let metrics = null;
let activeWorkspace = workspaceViews.has(requestedWorkspace) ? requestedWorkspace : 'today';
let todoFilter = 'all';
let articleFilter = 'all';
let shortcuts = {
  todo: 'Ctrl+Alt+Shift+KeyT',
  dailyNote: 'Ctrl+Alt+Shift+KeyD',
  readLater: 'Ctrl+Alt+Shift+KeyR',
  quickCreate: 'Ctrl+Alt+Shift+KeyQ',
};
let selectedKind = 'all';
let editingId = null;
let editingEventId = null;
let editingGoalId = null;
let editingProjectId = null;
let editingHabitId = null;
let editingRoutineId = null;
let trackingId = null;
let detailItemId = null;
let detailItem = null;
let chapterRows = [];
let editingChapterId = null;
let lookupResults = [];
let currentUser = null;
let hasRegisteredUsers = false;
let editMode = 'inline';
let themeMode = 'system';
let notificationsEnabled = false;
let notificationSoundEnabled = true;
let reminderMinutes = 15;
let markdownRenderingEnabled = true;
let markdownToolbarEnabled = true;
let markdownImagePasteEnabled = true;
let fontSizeOffset = 0;
let lineSpacing = 'comfortable';
let fontFamily = 'plex';
let language = 'ar';
let prayerLocation = { latitude: null, longitude: null, label: '', method: 5 };
let prayerTimesData = null;
let prayerTimesLoadedKey = '';
let prayerTimesRequest = null;
let prayerTimesRefreshTimer = null;
let financeData = null;
let financeLoadVersion = 0;
let quranSurahsRequest = null;
let quranRadiosLoaded = false;
const formatLocale = () => language === 'en' ? 'en-US' : 'ar-EG';
const applyLanguage = value => {
  language = value === 'en' ? 'en' : 'ar';
  window.personalMemoLanguage.set(language);
};
const initialToday = new Date();
let calendarMonth = new Date(initialToday.getFullYear(), initialToday.getMonth(), 1, 12);
let selectedCalendarDate = `${initialToday.getFullYear()}-${String(initialToday.getMonth() + 1).padStart(2, '0')}-${String(initialToday.getDate()).padStart(2, '0')}`;
let readNotificationKeys = new Set();
let activeNotificationKeys = new Set();
let hasRenderedNotifications = false;
let notificationAudioContext = null;
let toastTimer;
let globalSearchTimer;
const notifiedTaskReminders = new Set();
const notifiedOverdueTodos = new Set();

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const arabicNumber = value => language === 'en' ? String(value) : String(value).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]);
const formatDate = value => value ? new Intl.DateTimeFormat(formatLocale(), { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : '';
const actionIcons = {
  edit: '<path d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4 4 16.5Z"/><path d="m14.8 5.7 3.5 3.5"/>',
  delete: '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  progress: '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/>',
  trophy: '<path d="M8 21h8m-4-4v4M7 4h10v6a5 5 0 0 1-10 0V4ZM7 7H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
  task: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.2 1.2L7 4.8m-3.5 7.2 1.2 1.2L7 10.8m-3.5 7.2 1.2 1.2L7 16.8"/>',
  habit: '<path d="M12 21c4.5-2.3 7-6 7-10 0-2.5-1.5-4.5-4-5.5C14 3.5 12 3 10 3 7 3 5 5 5 8c0 2 1 3.5 3 4.5-1 3 0 6 4 8.5Z"/><path d="M8 15c1.3-2.5 3.5-4.5 7-6"/>',
  routine: '<path d="M20 7v5h-5"/><path d="M19 12a7 7 0 1 1-2-5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  pin: '<path d="m16 3 5 5-4 1-4 4 1 4-2 2-4-5-5 5 5-7-5-4 2-2 4 1 4-4 1-4Z"/>',
};
const actionIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${actionIcons[name] || ''}</svg>`;
const iconButton = (name, label, attributes = '') => `<button class="icon-action${name === 'delete' ? ' is-danger' : ''}" type="button" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${attributes}>${actionIcon(name)}</button>`;
const pinKey = (type, id) => `${type}:${id}`;
const isPinned = (type, id) => pinnedEntries.some(entry => entry.entity_type === type && entry.entity_id === Number(id));
function pinButton(type, id, title) {
  const pinned = isPinned(type, id);
  const label = pinned ? `إلغاء تثبيت ${title}` : `تثبيت ${title}`;
  return `<button class="pin-toggle${pinned ? ' is-pinned' : ''}" type="button" data-pin-type="${type}" data-pin-id="${id}"
    aria-label="${escapeHtml(label)}" aria-pressed="${pinned}" title="${escapeHtml(label)}">${actionIcon('pin')}</button>`;
}
const localToday = () => {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function localDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderMarkdownInline(value) {
  const replacements = [];
  const token = html => {
    const placeholder = `\u0000${replacements.length}\u0000`;
    replacements.push(html);
    return placeholder;
  };
  let source = escapeHtml(value);
  source = source.replace(/\[\[item:(\d+)\|([^\]]+)\]\]/g, (match, id, title) =>
    token(`<a class="internal-note-link" href="/item/${id}">${title}</a>`));
  source = source.replace(/\[\[daily:(\d{4}-\d{2}-\d{2})\|([^\]]+)\]\]/g, (match, date, title) =>
    token(`<a class="internal-note-link" href="#daily-notes" data-daily-note-link="${date}">${title}</a>`));
  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, url) => {
    const safeImage = /^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(url)
      || /^https:\/\/(?:m\.media-amazon\.com\/images\/|covers\.openlibrary\.org\/|upload\.wikimedia\.org\/)/.test(url);
    return safeImage ? token(`<img class="markdown-image" src="${url}" alt="${alt}">`) : alt;
  });
  dailyNoteDirty = false;
  source = source.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (match, label, url) =>
    token(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`));
  return source
    .replace(/``([^`]+)``/g, '<code>$1</code>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\u0000(\d+)\u0000/g, (match, index) => replacements[Number(index)]);
}

async function runGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const resultsElement = document.getElementById('globalSearchResults');
  const query = input.value.trim();
  if (query.length < 2) {
    resultsElement.classList.add('hidden');
    resultsElement.innerHTML = '';
    return;
  }
  try {
    const results = await api(`/api/search?q=${encodeURIComponent(query)}`);
    if (input.value.trim() !== query) return;
    const sections = [
      ['items', 'المكتبة', results.items.map(item => `<a class="global-search-result" href="/item/${item.id}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(item.title)}</strong><small>${KIND_LABELS[item.kind]} · ${escapeHtml(item.creator || STATUS_LABELS[item.status])}</small></a>`).join('')],
      ['todos', 'المهام', results.todos.map(todo => `<button class="global-search-result" type="button" data-search-type="todo" data-search-id="${todo.id}"><strong>${escapeHtml(todo.title)}</strong><small>${todo.completed ? 'مكتملة' : 'مفتوحة'}${todo.due_date ? ` · ${formatDate(todo.due_date)}` : ''}</small></button>`).join('')],
      ['articles', 'المقالات', results.articles.map(article => `<button class="global-search-result" type="button" data-search-type="article" data-search-id="${article.id}"><strong>${escapeHtml(article.title)}</strong><small>${articleStatuses[article.status]}</small></button>`).join('')],
      ['bookmarks', 'الروابط المهمة', (results.bookmarks || []).map(bookmark => `<a class="global-search-result" href="${escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer"><strong>${escapeHtml(bookmark.title)}</strong><small>رابط محفوظ</small></a>`).join('')],
    ];
    resultsElement.innerHTML = sections.filter(([, , content]) => content).map(([, label, content]) =>
      `<section><h3>${label}</h3>${content}</section>`).join('')
      || '<p class="global-search-empty">لا توجد نتائج. جرّب عبارة أخرى.</p>';
    resultsElement.classList.remove('hidden');
  } catch (error) {
    resultsElement.innerHTML = `<p class="global-search-empty">${escapeHtml(error.message)}</p>`;
    resultsElement.classList.remove('hidden');
  }
}

function renderMarkdown(value) {
  const lines = String(value).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let listType = '';
  let listItems = [];
  let codeLanguage = null;
  let codeLines = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p dir="auto">${paragraph.map(renderMarkdownInline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<${listType} dir="auto">${listItems.map(line => `<li dir="auto">${renderMarkdownInline(line)}</li>`).join('')}</${listType}>`);
    listItems = [];
    listType = '';
  };

  for (const line of lines) {
    if (codeLanguage !== null) {
      if (/^\s{0,3}```\s*$/.test(line)) {
        const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
        blocks.push(`<pre dir="ltr"><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLanguage = null;
        codeLines = [];
      } else {
        codeLines.push(line);
      }
      continue;
    }
    const codeFence = line.match(/^\s{0,3}```([a-zA-Z0-9_+#.-]*)\s*$/);
    if (codeFence) {
      flushParagraph();
      flushList();
      codeLanguage = codeFence[1];
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level} dir="auto">${renderMarkdownInline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushParagraph();
      const nextType = bullet ? 'ul' : 'ol';
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((bullet || numbered)[1]);
    } else if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote dir="auto">${renderMarkdownInline(quote[1])}</blockquote>`);
    } else if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push('<hr>');
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  if (codeLanguage !== null) {
    const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
    blocks.push(`<pre dir="ltr"><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return `<div class="markdown-content" dir="auto">${blocks.join('')}</div>`;
}

function renderRichText(value) {
  return markdownRenderingEnabled
    ? renderMarkdown(value)
    : `<p>${escapeHtml(value).replace(/\r\n?|\n/g, '<br>')}</p>`;
}

function applyMarkdownSettings(root = document) {
  root.querySelectorAll('.markdown-toolbar').forEach(toolbar => {
    toolbar.classList.toggle('hidden', !markdownToolbarEnabled);
  });
  root.querySelectorAll('#reviewPreviewToggle,#articleReviewPreviewToggle,[data-preview="notes"],[data-detail-preview-toggle]').forEach(button => {
    button.classList.toggle('hidden', !markdownRenderingEnabled);
  });
}

function applyTypographySettings() {
  const root = document.documentElement;
  root.style.setProperty('--font-size-offset', `${fontSizeOffset}px`);
  root.style.setProperty('--app-line-height', {
    compact: '1.5',
    comfortable: '1.8',
    relaxed: '2',
  }[lineSpacing]);
  root.dataset.fontFamily = fontFamily;
}

async function playNotificationSound() {
  if (!notificationSoundEnabled) return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  try {
    notificationAudioContext ||= new AudioContextType();
    const context = notificationAudioContext;
    if (context.state === 'suspended') await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.setValueAtTime(880, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.34);
  } catch (error) {
    console.warn('Unable to play notification sound:', error);
  }
}

function primeNotificationAudio() {
  if (!notificationSoundEnabled) return;
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextType) return;
  try {
    notificationAudioContext ||= new AudioContextType();
    if (notificationAudioContext.state === 'suspended') {
      notificationAudioContext.resume().catch(error => console.warn('Unable to enable notification audio:', error));
    }
  } catch (error) {
    console.warn('Unable to initialize notification audio:', error);
  }
}

document.addEventListener('pointerdown', primeNotificationAudio);
document.addEventListener('keydown', primeNotificationAudio);

function textBlock(value, markdown = false) {
  const content = markdown ? renderRichText(value) : escapeHtml(value).replace(/\n/g, '<br>');
  const needsTrim = value.length > 260;
  return `<div class="review-text${needsTrim ? ' is-truncated' : ''}">${content}</div>${
    needsTrim ? '<button class="text-toggle" type="button" aria-expanded="false">اقرأ المزيد</button>' : ''
  }`;
}

async function api(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const isBlob = options.body instanceof Blob;
  const response = await fetch(url, {
    ...options,
    headers: options.body && !isFormData && !isBlob ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) showAuthentication(null, data.error || 'انتهت الجلسة. سجّل الدخول مجدداً.');
  if (!response.ok) throw new Error(data.error || 'تعذّر إتمام الطلب.');
  return data;
}

function applyAutoDirection(root = document) {
  root.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="password"]), textarea, .review, .review-text, .item-title, .item-creator, .progress-box strong, .lookup-result strong, .detail-heading h1, .chapter-card h3').forEach(element => {
    element.setAttribute('dir', 'auto');
  });
}

function showAuthentication(user, message = '') {
  const previousUserId = currentUser?.id;
  if (previousUserId && previousUserId !== user?.id) {
    prayerTimesRequest?.abort();
    prayerTimesRequest = null;
    prayerLocation = { latitude: null, longitude: null, label: '', method: 5 };
    prayerTimesData = null;
    prayerTimesLoadedKey = '';
    financeData = null;
    financeLoadVersion += 1;
    if (prayerTimesRefreshTimer) clearInterval(prayerTimesRefreshTimer);
    prayerTimesRefreshTimer = null;
  }
  currentUser = user;
  const authenticated = Boolean(user);
  if (!authenticated) applyLanguage('ar');
  document.getElementById('authScreen').classList.toggle('hidden', authenticated);
  document.getElementById('appShell').classList.toggle('hidden', !authenticated);
  document.getElementById('userName').textContent = authenticated ? user.username : '';
  document.getElementById('accountMenu').classList.toggle('hidden', !authenticated);
  document.querySelector('.account-avatar').textContent = authenticated ? user.username.slice(0, 1).toLocaleUpperCase() : 'م';
  if (authenticated && previousUserId !== user.id) {
    activeNotificationKeys = new Set();
    hasRenderedNotifications = false;
    bookClubs = [];
    bookClubNotifications = [];
    pinnedEntries = [];
    noteIndex = [];
    galleryImages = [];
    dailyNote = null;
    dailyNoteDirty = false;
    setWritingFocusMode(false);
    activeClub = null;
    activeClubId = Number(localStorage.getItem(`personal-memo-active-club-${user.id}`)) || null;
    try {
      readNotificationKeys = new Set(JSON.parse(localStorage.getItem(`personal-memo-read-notifications-${user.id}`) || '[]'));
    } catch {
      readNotificationKeys = new Set();
    }
  }
  document.getElementById('settingsButton').classList.toggle('hidden', !authenticated);
  if (!authenticated) setAuthMode('login', hasRegisteredUsers);
  const error = document.getElementById('authError');
  error.textContent = message;
  error.classList.toggle('hidden', !message);
}

function setWorkspaceView(view, updateHash = false) {
  if (!workspaceViews.has(view)) return false;
  activeWorkspace = view;
  setWritingFocusMode(false);
  document.querySelector('.app-layout').classList.remove('detail-mode');
  document.querySelector('.welcome').classList.toggle('hidden', view !== 'today');
  document.querySelectorAll('.dashboard-section, .workspace-section, .library').forEach(section => {
    const visible = section.id === view || (view === 'today' && section.id === 'dashboard');
    section.classList.toggle('hidden', !visible);
  });
  document.getElementById('detailPage').classList.add('hidden');
  document.getElementById('workspaceNav').classList.remove('hidden');
  document.querySelectorAll('.workspace-nav-link').forEach(link => {
    const active = link.hash === `#${view}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (updateHash && location.hash !== `#${view}`) history.pushState(null, '', `#${view}`);
  if (view === 'today') document.title = 'مذكرتي';
  if (view === 'learning' && currentUser) renderLearningHub();
  if (view === 'finance' && currentUser) loadFinance();
  if (view === 'timeline' && currentUser) renderTimeline();
  if (view === 'daily-notes' && currentUser) {
    const requestedDate = document.getElementById('dailyNoteDate').value || localToday();
    if (!dailyNote || dailyNote.note_date !== requestedDate) loadDailyNote(requestedDate);
    else if (!dailyNoteDirty) renderDailyNote();
  }
  if (view === 'gallery') renderGallery();
  if (view === 'pinned') renderPinnedEntries();
  if (view === 'clubs' && currentUser) {
    renderBookClubList();
    if (activeClubId) loadBookClub(activeClubId);
  }
  return true;
}

function locationDate(timeZone, date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

function parsePrayerClock(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

function renderPrayerTimes() {
  const status = document.getElementById('prayerTimesStatus');
    const list = document.getElementById('prayerTimesList');
    const summary = document.getElementById('prayerNextSummary');
    const label = prayerLocation.label || (language === 'en' ? 'Prayer times' : 'مواقيت الصلاة');
    document.getElementById('prayerPanelLocation').textContent = label;
    document.getElementById('prayerPanelDate').textContent = new Intl.DateTimeFormat(formatLocale(), { dateStyle: 'full' }).format(new Date());
    if (prayerLocation.latitude === null || prayerLocation.longitude === null) {
      summary.textContent = language === 'en' ? 'Set location' : 'اضبط موقعك';
      status.textContent = language === 'en' ? 'Set a location to view prayer times.' : 'أضف موقعاً لعرض مواقيت الصلاة.';
      list.innerHTML = '';
      return;
    }
    if (!prayerTimesData) {
      summary.textContent = language === 'en' ? 'Loading…' : 'جارٍ التحميل…';
      if (!prayerTimesRequest) {
        status.textContent = language === 'en' ? 'Prayer times are not loaded yet.' : 'لم تُحمّل المواقيت بعد.';
      }
      list.innerHTML = '';
      return;
    }

    const timezone = prayerTimesData.meta?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const nowParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const localTime = Number(nowParts.find(part => part.type === 'hour')?.value || 0) * 60
      + Number(nowParts.find(part => part.type === 'minute')?.value || 0);
    const prayers = [
      ['Fajr', 'الفجر'],
      ['Sunrise', 'الشروق'],
      ['Dhuhr', 'الظهر'],
      ['Asr', 'العصر'],
      ['Maghrib', 'المغرب'],
      ['Isha', 'العشاء'],
    ].map(([key, arabic]) => ({
      key,
      name: language === 'en' ? key : arabic,
      time: prayerTimesData.timings?.[key],
      minutes: parsePrayerClock(prayerTimesData.timings?.[key]),
    })).filter(prayer => prayer.minutes !== null);
    const nextPrayer = prayers.find(prayer => prayer.key !== 'Sunrise' && prayer.minutes > localTime)
      || prayers.find(prayer => prayer.key === 'Fajr');
    summary.textContent = nextPrayer
      ? `${nextPrayer.name} ${nextPrayer.time.match(/\d{1,2}:\d{2}/)?.[0] || nextPrayer.time}`
      : (language === 'en' ? 'Times available' : 'المواقيت متاحة');
    status.textContent = prayerTimesData.date?.readable || new Intl.DateTimeFormat(formatLocale(), { dateStyle: 'medium' }).format(new Date());
    list.innerHTML = prayers.map(prayer => `<div class="prayer-times-row${prayer.key === nextPrayer?.key ? ' is-next' : ''}">
      <span>${prayer.name}</span><time dir="ltr">${escapeHtml(prayer.time.match(/\d{1,2}:\d{2}/)?.[0] || prayer.time)}</time>
    </div>`).join('');
  }

async function loadPrayerTimes(force = false) {
    if (prayerLocation.latitude === null || prayerLocation.longitude === null) {
      prayerTimesData = null;
      prayerTimesLoadedKey = '';
      renderPrayerTimes();
      return;
    }
    const timezone = prayerTimesData?.meta?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentDate = locationDate(timezone);
    const key = `${currentDate}|${prayerLocation.latitude}|${prayerLocation.longitude}|${prayerLocation.method}`;
    if (!force && prayerTimesLoadedKey === key) {
      renderPrayerTimes();
      return;
    }
    prayerTimesRequest?.abort();
    const controller = new AbortController();
    prayerTimesRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    document.getElementById('prayerTimesStatus').textContent = language === 'en' ? 'Loading prayer times…' : 'جارٍ تحميل مواقيت الصلاة…';
    try {
      const dateParts = currentDate.split('-');
      const apiDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
      const params = new URLSearchParams({
        latitude: String(prayerLocation.latitude),
        longitude: String(prayerLocation.longitude),
        method: String(prayerLocation.method),
      });
      const response = await fetch(`https://api.aladhan.com/v1/timings/${apiDate}?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Prayer times service returned ${response.status}.`);
      const result = await response.json();
      if (result.code !== 200 || !result.data?.timings) throw new Error('Prayer times are unavailable for this location.');
      if (prayerTimesRequest !== controller) return;
      prayerTimesData = result.data;
      prayerTimesLoadedKey = key;
      renderPrayerTimes();
    } catch (error) {
      if (prayerTimesRequest !== controller) return;
      prayerTimesData = null;
      prayerTimesLoadedKey = '';
      const message = error.name === 'AbortError'
        ? (language === 'en' ? 'Prayer times request timed out. Try refreshing.' : 'انتهت مهلة طلب المواقيت. حاول التحديث.')
        : (language === 'en' ? `Could not load prayer times: ${error.message}` : `تعذّر تحميل مواقيت الصلاة: ${error.message}`);
      document.getElementById('prayerNextSummary').textContent = language === 'en' ? 'Unavailable' : 'غير متاحة';
      document.getElementById('prayerTimesStatus').textContent = message;
      document.getElementById('prayerTimesList').innerHTML = '';
    } finally {
      clearTimeout(timeout);
      if (prayerTimesRequest === controller) prayerTimesRequest = null;
    }
  }
function financeMoney(amount, currency = financeData?.currency || 'EGP') {
  return new Intl.NumberFormat(formatLocale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount || 0);
}

function renderFinance() {
  if (!financeData) return;
  const { summary, transactions, subscriptions, budgets, currency, month } = financeData;
  const labels = language === 'en'
    ? ['Income', 'Expenses', 'Balance', 'Monthly subscriptions']
    : ['الدخل', 'المصروفات', 'الرصيد', 'الاشتراكات شهرياً'];
  document.getElementById('financeMonthLabel').textContent = new Intl.DateTimeFormat(formatLocale(), { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T12:00:00`));
  document.getElementById('financeSummary').innerHTML = [
    [labels[0], summary.income, 'income'],
    [labels[1], summary.expenses, 'expense'],
    [labels[2], summary.balance, summary.balance < 0 ? 'expense' : 'income'],
    [labels[3], summary.monthlySubscriptions, 'subscription'],
  ].map(([label, amount, kind]) => `<article class="finance-summary-card"><span>${label}</span><strong class="is-${kind}">${financeMoney(amount, currency)}</strong></article>`).join('');
  const transactionEmpty = language === 'en' ? 'No transactions for this month yet.' : 'لا توجد عمليات مسجلة لهذا الشهر بعد.';
  document.getElementById('financeTransactionList').innerHTML = transactions.length
    ? transactions.map(transaction => `<article class="finance-transaction">
        <div class="finance-transaction-copy"><strong>${escapeHtml(transaction.description)}</strong><span>${escapeHtml(transaction.category)} · ${formatDate(transaction.transaction_date)}</span></div>
        <strong class="finance-amount is-${transaction.type}">${transaction.type === 'income' ? '+' : '−'}${financeMoney(transaction.amount, currency)}</strong>
        <div class="finance-item-actions">
          <button class="icon-action" type="button" data-finance-edit-transaction="${transaction.id}" aria-label="${language === 'en' ? 'Edit transaction' : 'تعديل العملية'}" title="${language === 'en' ? 'Edit' : 'تعديل'}">${actionIcon('edit')}</button>
          <button class="icon-action is-danger" type="button" data-finance-delete-transaction="${transaction.id}" aria-label="${language === 'en' ? 'Delete transaction' : 'حذف العملية'}" title="${language === 'en' ? 'Delete' : 'حذف'}">${actionIcon('delete')}</button>
        </div>
      </article>`).join('')
    : `<p class="finance-empty">${transactionEmpty}</p>`;
  const budgetEmpty = language === 'en' ? 'No budgets for this month.' : 'لم تضف ميزانيات لهذا الشهر.';
  document.getElementById('financeBudgetList').innerHTML = budgets.length
    ? budgets.map(budget => {
      const percent = Math.min(100, Math.round(budget.spent / budget.amount * 100));
      return `<article class="finance-budget"><div><strong>${escapeHtml(budget.category)}</strong><span>${financeMoney(budget.spent, currency)} / ${financeMoney(budget.amount, currency)}</span></div>
        <div class="finance-budget-track" role="progressbar" aria-label="${escapeHtml(budget.category)}" aria-valuemin="0" aria-valuemax="${budget.amount}" aria-valuenow="${budget.spent}"><span class="${budget.spent > budget.amount ? 'is-over' : ''}" style="width:${percent}%"></span></div>
        <button class="finance-text-action" type="button" data-finance-delete-budget="${budget.id}">${language === 'en' ? 'Remove budget' : 'حذف الميزانية'}</button></article>`;
    }).join('')
    : `<p class="finance-empty">${budgetEmpty}</p>`;
  const subscriptionEmpty = language === 'en' ? 'No subscriptions saved yet.' : 'لا توجد اشتراكات محفوظة بعد.';
  document.getElementById('financeSubscriptionList').innerHTML = subscriptions.length
    ? subscriptions.map(subscription => `<article class="finance-subscription${subscription.status === 'active' ? '' : ' is-inactive'}">
        <div class="finance-transaction-copy"><strong>${escapeHtml(subscription.name)}</strong><span>${financeMoney(subscription.amount, subscription.currency)} · ${subscription.billing_cycle === 'monthly' ? (language === 'en' ? 'monthly' : 'شهري') : (language === 'en' ? 'yearly' : 'سنوي')} · ${language === 'en' ? 'Next' : 'التالي'} ${formatDate(subscription.next_renewal_date)}</span></div>
        <div class="finance-item-actions">
          ${subscription.status === 'active' ? `<button class="small-button" type="button" data-finance-pay-subscription="${subscription.id}">${language === 'en' ? 'Mark paid' : 'تسجيل الدفع'}</button>` : ''}
          <button class="icon-action" type="button" data-finance-edit-subscription="${subscription.id}" aria-label="${language === 'en' ? 'Edit subscription' : 'تعديل الاشتراك'}">${actionIcon('edit')}</button>
          <button class="icon-action is-danger" type="button" data-finance-delete-subscription="${subscription.id}" aria-label="${language === 'en' ? 'Delete subscription' : 'حذف الاشتراك'}">${actionIcon('delete')}</button>
        </div>
      </article>`).join('')
    : `<p class="finance-empty">${subscriptionEmpty}</p>`;
}

async function loadFinance() {
  const version = ++financeLoadVersion;
  const monthInput = document.getElementById('financeMonth');
  if (!monthInput.value) monthInput.value = localToday().slice(0, 7);
  try {
    const result = await api(`/api/finance?month=${encodeURIComponent(monthInput.value)}`);
    if (version !== financeLoadVersion) return;
    financeData = result;
    renderFinance();
  } catch (error) {
    if (version === financeLoadVersion) {
      document.getElementById('financeSummary').innerHTML = `<p class="finance-empty">${escapeHtml(error.message)}</p>`;
    }
  }
}

function openFinanceDialog(mode, record = null) {
  const dialog = document.getElementById('financeDialog');
  const form = document.getElementById('financeForm');
  form.reset();
  form.elements.id.value = record?.id || '';
  form.elements.mode.value = mode;
  const isTransaction = mode === 'transaction';
  const isSubscription = mode === 'subscription';
  const editing = Boolean(record);
  document.getElementById('financeDialogTitle').textContent = ({
    transaction: editing ? (language === 'en' ? 'Edit transaction' : 'تعديل عملية') : (language === 'en' ? 'New transaction' : 'عملية جديدة'),
    subscription: editing ? (language === 'en' ? 'Edit subscription' : 'تعديل اشتراك') : (language === 'en' ? 'New subscription' : 'اشتراك جديد'),
    budget: language === 'en' ? 'Set a monthly budget' : 'تحديد ميزانية شهرية',
  })[mode];
  document.getElementById('financeTypeField').classList.toggle('hidden', !isTransaction);
  document.getElementById('financeDescriptionField').classList.toggle('hidden', !isTransaction);
  document.getElementById('financeNameField').classList.toggle('hidden', !isSubscription);
  document.getElementById('financeDateField').classList.toggle('hidden', !isTransaction);
  document.getElementById('financeRenewalField').classList.toggle('hidden', !isSubscription);
  document.getElementById('financeCycleField').classList.toggle('hidden', !isSubscription);
  document.getElementById('financeStatusField').classList.toggle('hidden', !isSubscription);
  document.getElementById('financeMonthField').classList.toggle('hidden', mode !== 'budget');
  document.getElementById('financeNotesField').classList.toggle('hidden', mode === 'budget');
  form.elements.description.required = isTransaction;
  form.elements.name.required = isSubscription;
  form.elements.transaction_date.required = isTransaction;
  form.elements.next_renewal_date.required = isSubscription;
  form.elements.month.required = mode === 'budget';
  form.elements.category.value = record?.category || (isSubscription ? 'اشتراكات' : 'عام');
  form.elements.amount.value = record?.amount ?? '';
  form.elements.description.value = record?.description || '';
  form.elements.name.value = record?.name || '';
  form.elements.type.value = record?.type || 'expense';
  form.elements.transaction_date.value = record?.transaction_date || localToday();
  form.elements.next_renewal_date.value = record?.next_renewal_date || localToday();
  form.elements.billing_cycle.value = record?.billing_cycle || 'monthly';
  form.elements.status.value = record?.status || 'active';
  form.elements.month.value = document.getElementById('financeMonth').value || localToday().slice(0, 7);
  form.elements.notes.value = record?.notes || '';
  dialog.showModal();
}

async function submitFinanceForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const mode = values.mode;
  const id = values.id;
  let url;
  let method;
  let body;
  if (mode === 'transaction') {
    url = id ? `/api/finance/transactions/${id}` : '/api/finance/transactions';
    method = id ? 'PUT' : 'POST';
    body = { type: values.type, description: values.description, amount: values.amount, category: values.category, transaction_date: values.transaction_date, notes: values.notes };
  } else if (mode === 'subscription') {
    url = id ? `/api/finance/subscriptions/${id}` : '/api/finance/subscriptions';
    method = id ? 'PUT' : 'POST';
    body = { name: values.name, amount: values.amount, category: values.category, next_renewal_date: values.next_renewal_date, billing_cycle: values.billing_cycle, status: values.status, notes: values.notes };
  } else {
    url = '/api/finance/budgets';
    method = 'PUT';
    body = { month: values.month, category: values.category, amount: values.amount };
  }
  try {
    await api(url, { method, body: JSON.stringify(body) });
    document.getElementById('financeDialog').close();
    await loadFinance();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadQuranSurahs() {
  const select = document.getElementById('quranSurahSelect');
  if (select.options.length > 1 || quranSurahsRequest) return;
  const controller = new AbortController();
  quranSurahsRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 10000);
  select.innerHTML = `<option value="">${language === 'en' ? 'Loading chapters…' : 'جارٍ تحميل السور…'}</option>`;
  try {
    const response = await fetch('https://api.alquran.cloud/v1/surah', { signal: controller.signal });
    if (!response.ok) throw new Error(`Surah service returned ${response.status}.`);
    const result = await response.json();
    if (!Array.isArray(result.data) || !result.data.length) throw new Error('No surahs were returned.');
    select.innerHTML = `<option value="">${language === 'en' ? 'Choose a surah' : 'اختر سورة'}</option>` + result.data.map(surah =>
      `<option value="${surah.number}">${surah.number}. ${escapeHtml(surah.name)} — ${escapeHtml(surah.englishName)}</option>`).join('');
    if (select.value) setQuranSurahAudio();
  } catch (error) {
    select.innerHTML = `<option value="">${language === 'en' ? 'Could not load surahs' : 'تعذّر تحميل السور'}</option>`;
    document.getElementById('quranPlayerStatus').textContent = language === 'en'
      ? `Could not load surahs: ${error.message}` : `تعذّر تحميل السور: ${error.message}`;
  } finally {
    clearTimeout(timeout);
    if (quranSurahsRequest === controller) quranSurahsRequest = null;
  }
}

function setQuranSurahAudio() {
  const surah = document.getElementById('quranSurahSelect').value;
  if (!surah) return;
  const reciter = document.getElementById('quranReciterSelect').value;
  const audio = document.getElementById('quranAudio');
  audio.src = `https://cdn.islamic.network/quran/audio-surah/128/${encodeURIComponent(reciter)}/${encodeURIComponent(surah)}.mp3`;
  audio.load();
  document.getElementById('quranPlayerStatus').textContent = language === 'en' ? 'Surah ready. Press play to listen.' : 'السورة جاهزة. اضغط تشغيل للاستماع.';
}

async function loadQuranRadios() {
  if (quranRadiosLoaded) return;
  const select = document.getElementById('quranRadioSelect');
  select.innerHTML = `<option value="">${language === 'en' ? 'Loading stations…' : 'جارٍ تحميل الإذاعات…'}</option>`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://mp3quran.net/api/v3/radios?language=ar', { signal: controller.signal });
    if (!response.ok) throw new Error(`Radio service returned ${response.status}.`);
    const result = await response.json();
    const radios = result.radios;
    if (!Array.isArray(radios)) throw new Error('Radio service returned an invalid station list.');
    const validRadios = radios.filter(radio => {
      try {
        return typeof radio.name === 'string' && new URL(radio.url).protocol === 'https:';
      } catch {
        return false;
      }
    });
    const sortedRadios = [...validRadios].sort((a, b) =>
      Number(/القرآن|quran|قرآن/i.test(b.name)) - Number(/القرآن|quran|قرآن/i.test(a.name)));
    select.innerHTML = `<option value="">${language === 'en' ? 'Choose a station' : 'اختر إذاعة'}</option>` + sortedRadios.map(radio =>
      `<option value="${escapeHtml(radio.url)}">${escapeHtml(radio.name)}</option>`).join('');
    quranRadiosLoaded = true;
    if (!validRadios.length) throw new Error('No valid radio stations are available.');
  } catch (error) {
    select.innerHTML = `<option value="">${language === 'en' ? 'Could not load stations' : 'تعذّر تحميل الإذاعات'}</option>`;
    document.getElementById('quranPlayerStatus').textContent = language === 'en'
      ? `Could not load radio stations: ${error.message}` : `تعذّر تحميل الإذاعات: ${error.message}`;
  } finally {
    clearTimeout(timeout);
  }
}

function setWritingFocusMode(enabled) {
  document.querySelector('.app-layout').classList.toggle('writing-focus-mode', enabled);
  document.getElementById('appShell').classList.toggle('writing-focus-mode', enabled);
  for (const button of [document.getElementById('focusModeToggle'), document.getElementById('dailyNoteFocusToggle')]) {
    if (!button) continue;
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? '× إنهاء الوضع الهادئ' : '◉ وضع هادئ';
  }
}

function setAuthMode(mode, hasUsers = true) {
  const registration = mode === 'register';
  const title = document.getElementById('authTitle');
  title.textContent = registration ? 'إنشاء حساب' : 'تسجيل الدخول';
  document.getElementById('authDescription').textContent = registration
    ? 'أنشئ حساباً محلياً جديداً. لكل حساب مكتبة خاصة.'
    : 'سجّل الدخول للوصول إلى مكتبتك الخاصة.';
  document.getElementById('authSubmit').textContent = registration ? 'إنشاء الحساب' : 'تسجيل الدخول';
  document.getElementById('authModeToggle').textContent = registration
    ? 'لدي حساب بالفعل'
    : hasUsers ? 'إنشاء حساب جديد' : 'إنشاء الحساب الأول';
  const password = document.querySelector('#authForm [name="password"]');
  password.autocomplete = registration ? 'new-password' : 'current-password';
  document.getElementById('authForm').dataset.mode = mode;
}

function showToast(message, undoToken = '') {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = message;
  const undo = document.getElementById('toastUndo');
  undo.classList.toggle('hidden', !undoToken);
  undo.dataset.token = undoToken;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    undo.classList.add('hidden');
  }, undoToken ? 8000 : 3000);
}

function setTheme(mode) {
  themeMode = mode;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const theme = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  document.documentElement.dataset.theme = theme;
  const isDark = theme === 'dark';
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', isDark ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن');
  themeToggle.title = isDark ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن';
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#131d1e' : '#f4f7f5';
}

function renderStats() {
  if (!metrics) return;
  const stats = [
    { label: 'تم إنجازه', count: metrics.items.completed, tone: 'normal' },
    { label: 'قارب على الانتهاء', count: metrics.items.nearlyComplete, tone: 'normal' },
    { label: 'قيد الإنجاز', count: metrics.items.inProgress, tone: 'normal' },
    { label: 'في القائمة', count: metrics.items.planned, tone: 'normal' },
    { label: 'متوقف مؤقتاً', count: metrics.items.paused, tone: 'normal' },
    { label: 'لم يكتمل', count: metrics.items.dropped, tone: 'normal' },
    { label: 'كل الكتب والألعاب والأفلام', count: metrics.items.total, tone: 'normal' },
    { label: 'مهام متأخرة', count: metrics.todos.overdue, tone: metrics.todos.overdue ? 'alert' : 'normal' },
    { label: 'مهام مفتوحة', count: metrics.todos.open, tone: 'normal' },
    { label: 'روابط بانتظار القراءة', count: metrics.articles.unread, tone: 'normal' },
    { label: 'أضيفت خلال ٧ أيام', count: metrics.activity?.addedLast7Days || 0, tone: 'normal' },
    { label: 'أُنجزت خلال ٣٠ يوماً', count: metrics.activity?.completedLast30Days || 0, tone: 'normal' },
  ];
  const highlightedStats = [stats[0], stats[1], stats[2], stats[7]];
  const remainingStats = stats.filter(stat => !highlightedStats.includes(stat));
  const renderStat = ({ label, count, tone }) => `
    <article class="stat stat-${tone}"><span>${label}</span><strong>${arabicNumber(count)}</strong></article>
  `;
  statsElement.innerHTML = `
    <div class="stats-featured">${highlightedStats.map(renderStat).join('')}</div>
    <details class="stats-more">
      <summary>عرض كل المؤشرات (${arabicNumber(stats.length)})</summary>
      <div class="stats-secondary">${remainingStats.map(renderStat).join('')}</div>
    </details>`;
  const overdue = todos.filter(isTodoOverdue);
  const notice = document.getElementById('overdueNotice');
  notice.classList.toggle('hidden', overdue.length === 0 || Boolean(detailItemId));
  notice.innerHTML = overdue.length
    ? `<strong>لديك ${arabicNumber(overdue.length)} مهمة متأخرة</strong><span>${overdue.slice(0, 3).map(todo => escapeHtml(todo.title)).join('، ')}</span>`
    : '';
  overdue.forEach(todo => {
    const notificationKey = `${currentUser?.id}:${todo.id}`;
    if (!notifiedOverdueTodos.has(notificationKey)) {
      notifiedOverdueTodos.add(notificationKey);
      showToast(`موعد متأخر: ${todo.title}`);
    }
  });
}

function openTasksDueToday() {
  const today = localToday();
  return todos.filter(todo => !todo.completed && todo.due_date === today).length;
}

function maybeCelebrateToday(todo, wasCompleted, isCompleted, openCountBefore) {
  if (wasCompleted || !isCompleted || todo.due_date !== localToday() || openCountBefore === 0 || openTasksDueToday() !== 0) return;
  const celebrationKey = `personal-memo-daily-celebration-${currentUser?.id}-${localToday()}`;
  if (localStorage.getItem(celebrationKey)) return;
  localStorage.setItem(celebrationKey, '1');
  playNotificationSound();
  document.getElementById('dailyCompletionDialog').showModal();
}

async function saveTodoCompletion(todo, completed) {
  const openCountBefore = openTasksDueToday();
  const wasCompleted = Boolean(todo.completed);
  await api(`/api/todos/${todo.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...todo, completed }),
  });
  await refreshWorkspace();
  maybeCelebrateToday(todo, wasCompleted, completed, openCountBefore);
}

const isTodoOverdue = todo => !todo.completed && todo.due_date
  && (todo.due_date < localToday() || todo.due_date === localToday() && todo.due_time && todo.due_time < new Date().toTimeString().slice(0, 5));

function renderTodos() {
  const list = document.getElementById('todosList');
  const today = localToday();
  const openTodos = todos.filter(todo => !todo.completed);
  const counts = {
    all: todos.length,
    today: openTodos.filter(todo => todo.due_date && todo.due_date <= today).length,
    upcoming: openTodos.filter(todo => todo.due_date && todo.due_date > today).length,
    completed: todos.filter(todo => todo.completed).length,
  };
  Object.entries(counts).forEach(([key, count]) => {
    const element = document.getElementById(`todoCount${key[0].toUpperCase()}${key.slice(1)}`);
    if (element) element.textContent = arabicNumber(count);
  });
  document.querySelectorAll('[data-todo-filter]').forEach(button => {
    const active = button.dataset.todoFilter === todoFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const query = document.getElementById('todoSearch').value.trim().toLocaleLowerCase();
  const visible = todos.filter(todo => {
    const matchesFilter = todoFilter === 'all'
      || todoFilter === 'completed' && Boolean(todo.completed)
      || todoFilter === 'today' && !todo.completed && todo.due_date && todo.due_date <= today
      || todoFilter === 'upcoming' && !todo.completed && todo.due_date && todo.due_date > today;
    const matchesQuery = !query || [todo.title, todo.notes, todo.project_title].join(' ').toLocaleLowerCase().includes(query);
    return matchesFilter && matchesQuery;
  });
  list.innerHTML = visible.length ? visible.map(todo => {
    const overdue = isTodoOverdue(todo);
    const dateLabel = todo.due_date
      ? todo.due_date === today ? 'اليوم' : formatDate(todo.due_date)
      : '';
    const recurrence = { daily: 'يومياً', weekly: 'أسبوعياً', monthly: 'شهرياً' }[todo.recurrence];
    return `<article id="todo-${todo.id}" class="task-card${todo.completed ? ' is-complete' : ''}${overdue ? ' is-overdue' : ''}">
      <label class="task-check"><input type="checkbox" data-todo-toggle="${todo.id}"${todo.completed ? ' checked' : ''} aria-label="${todo.completed ? 'إعادة فتح' : 'إكمال'} ${escapeHtml(todo.title)}"></label>
      <div class="task-content">
        <button class="task-title-button" type="button" data-todo-edit="${todo.id}" dir="auto">${escapeHtml(todo.title)}</button>
        ${todo.notes ? `<p dir="auto">${escapeHtml(todo.notes)}</p>` : ''}
        <div class="task-meta">
          ${dateLabel ? `<span class="task-meta-date${overdue ? ' overdue' : ''}">${overdue ? 'متأخرة · ' : ''}${escapeHtml(dateLabel)}${todo.due_time ? `، ${escapeHtml(todo.due_time)}` : ''}</span>` : ''}
          ${recurrence ? `<span>${recurrence}</span>` : ''}
          ${todo.project_title ? `<span class="task-project">${escapeHtml(todo.project_title)}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">${iconButton('edit', `تعديل ${todo.title}`, `data-todo-edit="${todo.id}"`)}${iconButton('delete', `حذف ${todo.title}`, `data-todo-delete="${todo.id}"`)}</div>
    </article>`;
  }).join('') : `<div class="empty task-empty"><strong>${query ? 'لا توجد مهام مطابقة' : todos.length ? 'لا توجد مهام في هذه القائمة' : 'ابدأ بخطوة واحدة'}</strong>${query ? 'جرّب كلمة أخرى.' : todos.length ? 'اختر قائمة أخرى أو أضف مهمة جديدة.' : 'اكتب مهمة هنا، وأضف موعداً أو تفاصيل عند الحاجة.'}</div>`;
  applyAutoDirection(list);
}

function dateHeading(value) {
  return new Intl.DateTimeFormat(formatLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${value}T12:00:00`));
}

function renderToday() {
  if (!todayPlan) return;
  document.getElementById('todayDate').textContent = dateHeading(todayPlan.date);
  const eventList = document.getElementById('todayEvents');
  eventList.innerHTML = todayPlan.events.length ? todayPlan.events.map(event => `
    <article class="today-row"><span class="today-time">${event.all_day ? 'طوال اليوم' : escapeHtml(event.occurrence_start.slice(11))}</span>
      <strong dir="auto">${escapeHtml(event.title)}</strong>${iconButton('edit', `تعديل ${event.title}`, `data-event-edit="${event.id}"`)}</article>
  `).join('') : '<p class="empty-inline">لا توجد مواعيد اليوم.</p>';
  const taskList = document.getElementById('todayTasks');
  taskList.innerHTML = todayPlan.tasks.length ? todayPlan.tasks.map(task => `
    <label class="today-row"><input type="checkbox" data-today-todo="${task.id}" aria-label="إكمال ${escapeHtml(task.title)}">
      <span dir="auto">${escapeHtml(task.title)}${task.due_time ? `<small>${escapeHtml(task.due_time)}</small>` : ''}</span></label>
  `).join('') : '<p class="empty-inline">لا توجد مهام مستحقة اليوم.</p>';
  document.getElementById('todayHabits').innerHTML = habits.length ? habits.map(habit => `
    <div class="today-row"><button class="habit-check-button habit-check-compact${habit.completed_today ? ' is-checked' : ''}" type="button" data-habit-toggle="${habit.id}" aria-pressed="${habit.completed_today}" aria-label="${habit.completed_today ? 'إلغاء إنجاز' : 'تسجيل إنجاز'}: ${escapeHtml(habit.title)}">${completionIcon(habit.completed_today)}</button>
      <span dir="auto">${escapeHtml(habit.title)}<small>${arabicNumber(habit.completed_this_week)} / ${arabicNumber(habit.target_per_week)} هذا الأسبوع</small></span></div>
  `).join('') : '<p class="empty-inline">أضف عادة صغيرة تريد المحافظة عليها.</p>';
  document.getElementById('todayRoutines').innerHTML = routines.length ? routines.map(routine => `
    <div class="today-row"><button class="habit-check-button habit-check-compact${routine.completed_today ? ' is-checked' : ''}" type="button" data-routine-toggle="${routine.id}" aria-pressed="${routine.completed_today}" aria-label="${routine.completed_today ? 'إلغاء إنجاز' : 'تسجيل إنجاز'}: ${escapeHtml(routine.title)}">${completionIcon(routine.completed_today)}</button>
      <span dir="auto">${escapeHtml(routine.title)}<small>${arabicNumber(routine.steps.length)} خطوات</small></span></div>
  `).join('') : '<p class="empty-inline">أنشئ روتيناً قصيراً لبداية يومك أو نهايته.</p>';
}

function renderCalendar() {
  const list = document.getElementById('calendarList');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthTitle = new Intl.DateTimeFormat(formatLocale(), { month: 'long', year: 'numeric' }).format(calendarMonth);
  const eventsByDate = new Map();
  events.forEach(event => {
    const onDate = eventsByDate.get(event.occurrence_date) || [];
    onDate.push(event);
    eventsByDate.set(event.occurrence_date, onDate);
  });
  const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const days = Array.from({ length: firstDay }, () => '<span class="calendar-day calendar-day-empty" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = eventsByDate.get(date) || [];
    const today = date === localToday();
    const selected = date === selectedCalendarDate;
    const dots = dayEvents.slice(0, 3).map(() => '<i></i>').join('');
    days.push(`<button class="calendar-day${today ? ' is-today' : ''}${selected ? ' is-selected' : ''}${dayEvents.length ? ' has-events' : ''}" type="button"
      data-calendar-date="${date}" aria-pressed="${selected}" aria-label="${escapeHtml(dateHeading(date))}${dayEvents.length ? `، ${arabicNumber(dayEvents.length)} مواعيد` : ''}">
      <span class="calendar-day-number">${arabicNumber(day)}</span>
      <span class="calendar-day-indicators" aria-hidden="true">${dots}${dayEvents.length > 3 ? `<small>+${arabicNumber(dayEvents.length - 3)}</small>` : ''}</span>
    </button>`);
  }
  const selectedEvents = eventsByDate.get(selectedCalendarDate) || [];
  const selectedHeading = dateHeading(selectedCalendarDate);
  const selectedEventMarkup = selectedEvents.length ? selectedEvents.map(event => `
    <article class="calendar-event">
      <time datetime="${escapeHtml(event.occurrence_start)}"><strong>${escapeHtml(event.all_day ? 'طوال اليوم' : event.occurrence_start.slice(11))}</strong></time>
      <div><h3 dir="auto">${escapeHtml(event.title)}</h3>${event.description ? `<p dir="auto">${escapeHtml(event.description)}</p>` : ''}
        ${event.recurrence !== 'none' ? `<small>${event.recurrence === 'daily' ? 'يتكرر يومياً' : event.recurrence === 'weekly' ? 'يتكرر أسبوعياً' : 'يتكرر شهرياً'}</small>` : ''}</div>
      <div class="calendar-event-actions">${iconButton('edit', `تعديل السلسلة: ${event.title}`, `data-event-edit="${event.id}"`)}${iconButton('delete', `حذف ${event.title}`, `data-event-delete="${event.id}"`)}</div>
    </article>
  `).join('') : '<p class="calendar-no-events">لا توجد مواعيد في هذا اليوم.</p>';
  list.innerHTML = `<section class="calendar-month" aria-label="تقويم ${escapeHtml(monthTitle)}">
      <div class="calendar-month-heading">
        <button class="small-button" type="button" data-calendar-step="-1" aria-label="الشهر السابق">‹</button>
        <h3>${escapeHtml(monthTitle)}</h3>
        <button class="small-button" type="button" data-calendar-step="1" aria-label="الشهر التالي">›</button>
        <button class="small-button calendar-today-button" type="button" data-calendar-today>اليوم</button>
      </div>
      <div class="calendar-month-grid" role="grid">
        ${weekdays.map(weekday => `<span class="calendar-weekday" role="columnheader">${weekday}</span>`).join('')}
        ${days.join('')}
      </div>
    </section>
    <section class="calendar-selected-day" aria-labelledby="selectedCalendarDate">
      <div class="calendar-selected-heading"><div><p class="eyebrow">اليوم المحدد</p><h3 id="selectedCalendarDate">${escapeHtml(selectedHeading)}</h3></div>
        <button class="button button-primary" type="button" data-calendar-add-event>＋ إضافة موعد لهذا اليوم</button></div>
      <div class="calendar-day-events">${selectedEventMarkup}</div>
    </section>`;
  applyAutoDirection(list);
}

function calendarMonthRange() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;
  return { start, end };
}

async function changeCalendarMonth(offset) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + offset, 1, 12);
  selectedCalendarDate = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}-01`;
  const { start, end } = calendarMonthRange();
  try {
    events = await api(`/api/events?start=${start}&end=${end}`);
    renderCalendar();
    renderNotifications();
  } catch (error) {
    showToast(error.message);
  }
}

function renderPlanning() {
  const board = document.getElementById('planningBoard');
  const activeGoals = goals.filter(goal => goal.status === 'active').length;
  const activeProjects = projects.filter(project => project.status === 'active').length;
  const openProjectTasks = projects.reduce((sum, project) => sum + Number(project.open_tasks || 0), 0);
  const overview = `<section class="planning-overview">
    <article><span>مجالات حياتك</span><strong>${arabicNumber(areas.length)}</strong></article>
    <article><span>أهداف نشطة</span><strong>${arabicNumber(activeGoals)}</strong></article>
    <article><span>مشاريع نشطة</span><strong>${arabicNumber(activeProjects)}</strong></article>
    <article><span>خطوات مفتوحة</span><strong>${arabicNumber(openProjectTasks)}</strong></article>
  </section>`;
  const areaCards = areas.length ? areas.map(area => `
    <article class="area-card" style="--area-color:${escapeHtml(area.color)}">
      <div class="area-card-heading"><h3>${escapeHtml(area.name)}</h3><div>
        ${iconButton('edit', `تعديل ${area.name}`, `data-area-edit="${area.id}"`)}
        ${iconButton('delete', `حذف ${area.name}`, `data-area-delete="${area.id}"`)}</div></div>
      <p class="field-hint">${arabicNumber(area.active_goals)} أهداف · ${arabicNumber(area.active_projects)} مشاريع نشطة</p>
      <section class="area-planning-group"><h4>الأهداف</h4>
        <div class="area-goal-list">${goals.filter(goal => goal.area_id === area.id).map(goalCard).join('') || '<p class="planning-empty">لا توجد أهداف في هذا المجال بعد.</p>'}</div>
        <button class="planning-add-link" type="button" data-area-add-goal="${area.id}">＋ إضافة هدف</button>
      </section>
      <section class="area-planning-group"><h4>المشاريع</h4>
        <div class="area-project-list">${projects.filter(project => project.area_id === area.id).map(projectCard).join('') || '<p class="planning-empty">لا توجد مشاريع مرتبطة بهذا المجال بعد.</p>'}</div>
        <button class="planning-add-link" type="button" data-area-add-project="${area.id}">＋ إضافة مشروع</button>
      </section>
    </article>
  `).join('') : '';
  const unassignedGoals = goals.filter(goal => !goal.area_id);
  const unassignedProjects = projects.filter(project => !project.area_id);
  board.innerHTML = `${overview}${areaCards}
    ${unassignedGoals.length || unassignedProjects.length ? `<article class="area-card unassigned-area-card"><div class="area-card-heading"><h3>بدون مجال محدد</h3></div>
      <section class="area-planning-group"><h4>الأهداف</h4><div class="area-goal-list">${unassignedGoals.map(goalCard).join('') || '<p class="planning-empty">لا توجد أهداف غير مرتبطة بمجال.</p>'}</div>
        <button class="planning-add-link" type="button" data-area-add-goal="">＋ إضافة هدف</button></section>
      <section class="area-planning-group"><h4>المشاريع</h4><div class="area-project-list">${unassignedProjects.map(projectCard).join('') || '<p class="planning-empty">لا توجد مشاريع غير مرتبطة بمجال.</p>'}</div>
        <button class="planning-add-link" type="button" data-area-add-project="">＋ إضافة مشروع</button></section></article>` : ''}
    ${!areas.length && !goals.length && !projects.length ? '<div class="empty planning-empty-start"><strong>ابدأ من الأشياء التي تهمك</strong>أنشئ مجالاً للحياة، ثم هدفاً ومشروعاً بخطوة تالية واضحة.</div>' : ''}`;
  const areaOptions = `<option value="">بدون مجال</option>${areas.map(area => `<option value="${area.id}">${escapeHtml(area.name)}</option>`).join('')}`;
  document.getElementById('goalArea').innerHTML = areaOptions;
  document.getElementById('projectArea').innerHTML = areaOptions;
  document.getElementById('projectGoal').innerHTML = `<option value="">بدون هدف</option>${goals.filter(goal => goal.status !== 'completed').map(goal => `<option value="${goal.id}">${escapeHtml(goal.title)}</option>`).join('')}`;
  document.getElementById('todoProject').innerHTML = `<option value="">بدون مشروع</option>${projects.filter(project => project.status === 'active').map(project => `<option value="${project.id}">${escapeHtml(project.title)}</option>`).join('')}`;
  document.getElementById('todoQuickProject').innerHTML = `<option value="">بدون مشروع</option>${projects.filter(project => project.status === 'active').map(project => `<option value="${project.id}">${escapeHtml(project.title)}</option>`).join('')}`;
  applyAutoDirection(board);
}

function goalCard(goal) {
  const status = { active: 'نشط', planned: 'مخطط له', completed: 'مكتمل' }[goal.status];
  const totalProjects = Number(goal.total_projects || 0);
  const completedProjects = Number(goal.completed_projects || 0);
  const progress = totalProjects ? Math.round(completedProjects / totalProjects * 100) : 0;
  return `<article class="goal-card"><div><span class="planning-kicker">هدف · ${status}</span><h4 dir="auto">${escapeHtml(goal.title)}</h4>
    ${goal.description ? `<p dir="auto">${escapeHtml(goal.description)}</p>` : ''}${goal.target_date ? `<small>الموعد: ${formatDate(goal.target_date)}</small>` : ''}
    <div class="goal-progress-copy"><span>${totalProjects ? `${arabicNumber(completedProjects)} من ${arabicNumber(totalProjects)} مشاريع مكتملة` : 'اربط مشروعاً بهذا الهدف لمتابعة التقدم'}</span>${totalProjects ? `<strong>${arabicNumber(progress)}٪</strong>` : ''}</div>
    ${totalProjects ? `<div class="goal-progress" role="progressbar" aria-label="تقدم الهدف ${escapeHtml(goal.title)}" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>` : ''}</div>
    <div class="planning-actions">${iconButton('edit', `تعديل ${goal.title}`, `data-goal-edit="${goal.id}"`)}${iconButton('add', `إضافة مشروع إلى ${goal.title}`, `data-goal-project="${goal.id}"`)}${iconButton('delete', `حذف ${goal.title}`, `data-goal-delete="${goal.id}"`)}</div>
  </article>`;
}

function projectCard(project) {
  const totalTasks = Number(project.total_tasks || 0);
  const completedTasks = Number(project.completed_tasks || 0);
  const progress = totalTasks ? Math.round(completedTasks / totalTasks * 100) : 0;
  return `<article class="project-card"><div><span class="planning-kicker">مشروع · ${project.status === 'active' ? 'نشط' : project.status === 'on_hold' ? 'مؤجل' : 'مكتمل'}</span>
    <h4 dir="auto">${escapeHtml(project.title)}</h4>${project.goal_title ? `<small>الهدف: ${escapeHtml(project.goal_title)}</small>` : ''}
    ${project.next_action ? `<p><strong>الخطوة التالية:</strong> ${escapeHtml(project.next_action)}</p>` : ''}${project.due_date ? `<small>الموعد: ${formatDate(project.due_date)}</small>` : ''}
    <div class="project-progress-copy"><span>${totalTasks ? `${arabicNumber(completedTasks)} من ${arabicNumber(totalTasks)} مهام مكتملة` : 'لم تُضف مهاماً لهذا المشروع بعد'}</span>${totalTasks ? `<strong>${arabicNumber(progress)}٪</strong>` : ''}</div>
    ${totalTasks ? `<div class="project-progress" role="progressbar" aria-label="تقدم المشروع ${escapeHtml(project.title)}" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>` : ''}
    </div><div class="planning-actions">${iconButton('add', `إضافة مهمة إلى ${project.title}`, `data-project-task="${project.id}"`)}${iconButton('edit', `تعديل ${project.title}`, `data-project-edit="${project.id}"`)}${iconButton('delete', `حذف ${project.title}`, `data-project-delete="${project.id}"`)}</div></article>`;
}

function completionIcon(checked) {
  return checked
    ? '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/></svg>';
}

async function toggleDailyRecord(button, kind) {
  const records = kind === 'habit' ? habits : routines;
  const record = records.find(row => row.id === Number(button.dataset[`${kind}Toggle`]));
  if (!record) return;
  button.disabled = true;
  try {
    await api(`/api/${kind === 'habit' ? 'habits' : 'routines'}/${record.id}/log`, {
      method: 'PUT',
      body: JSON.stringify({ date: localToday(), completed: !record.completed_today }),
    });
    await refreshWorkspace();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function renderHabitsAndRoutines() {
  const completedToday = habits.filter(habit => habit.completed_today).length;
  const total = habits.length;
  const progress = total ? Math.round((completedToday / total) * 100) : 0;
  document.getElementById('habitsTodayDate').textContent = dateHeading(localToday());
  document.getElementById('habitWeekLabel').textContent = 'هذا الأسبوع';
  document.getElementById('habitProgressSummary').innerHTML = `
    <div class="habit-progress-copy"><span class="habit-progress-icon" aria-hidden="true">✦</span>
      <div><strong>${total ? `${arabicNumber(completedToday)} من ${arabicNumber(total)} عادات` : 'ابدأ بعادة واحدة'}</strong>
        <small>${total ? completedToday === total ? 'أكملت كل عاداتك اليوم، أحسنت!' : 'كل إنجاز صغير يقربك من هدفك.' : 'اختر سلوكاً بسيطاً تريد تكراره هذا الأسبوع.'}</small></div>
    </div>
    <div class="habit-progress-meter" role="progressbar" aria-label="إنجاز العادات اليوم" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>
    <span class="habit-progress-percent">${arabicNumber(progress)}٪</span>`;
  const habitMarkup = habits.length ? habits.map(habit => {
    const week = habit.week || [];
    const weekCompleted = habit.completed_this_week || 0;
    const goal = Math.min(habit.target_per_week, 7);
    const goalPercent = Math.min(100, Math.round((weekCompleted / goal) * 100));
    return `<article class="habit-card${habit.completed_today ? ' habit-card-done' : ''}">
      <div class="habit-card-main">
        <button class="habit-check-button${habit.completed_today ? ' is-checked' : ''}" type="button" data-habit-toggle="${habit.id}" aria-pressed="${habit.completed_today}" aria-label="${habit.completed_today ? 'إلغاء إنجاز' : 'تسجيل إنجاز'}: ${escapeHtml(habit.title)}">
          ${completionIcon(habit.completed_today)}
        </button>
        <div class="habit-card-info"><strong dir="auto">${escapeHtml(habit.title)}</strong>
          ${habit.notes ? `<small dir="auto">${escapeHtml(habit.notes)}</small>` : `<small>${habit.frequency === 'daily' ? 'عادة يومية' : 'عادة أسبوعية'}</small>`}
        </div>
        <div class="habit-streak" aria-label="${arabicNumber(habit.streak)} أيام متتالية"><span aria-hidden="true">🔥</span><strong>${arabicNumber(habit.streak)}</strong><small>يوم</small></div>
        <div class="habit-card-actions">
            ${iconButton('edit', `تعديل ${habit.title}`, `data-habit-edit="${habit.id}"`)}
            ${iconButton('delete', `إيقاف ${habit.title}`, `data-habit-delete="${habit.id}"`)}
        </div>
      </div>
      <div class="habit-week-row" aria-label="إنجازات الأسبوع">
        ${week.map(day => {
          const label = new Intl.DateTimeFormat(formatLocale(), { weekday: 'short' }).format(new Date(`${day.date}T12:00:00`));
          const isToday = day.date === localToday();
          return `<span class="habit-week-day${day.completed ? ' completed' : ''}${isToday ? ' is-today' : ''}" title="${escapeHtml(dateHeading(day.date))}">
            <i>${day.completed ? '✓' : ''}</i><small>${escapeHtml(label)}</small></span>`;
        }).join('')}
        <span class="habit-week-goal">${arabicNumber(weekCompleted)} / ${arabicNumber(goal)} هذا الأسبوع</span>
      </div>
      <div class="habit-goal-meter" role="progressbar" aria-label="تقدم هدف ${escapeHtml(habit.title)} الأسبوعي" aria-valuenow="${goalPercent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${goalPercent}%"></span></div>
    </article>`;
  }).join('') : `<div class="habit-empty"><span aria-hidden="true">✦</span><strong>عادة واحدة تكفي للبداية</strong><p>اختر سلوكاً صغيراً وواقعياً. سنساعدك على متابعة أيامك وسلسلتك الأسبوعية.</p><button class="button button-quiet" type="button" data-habit-empty-add>＋ أضف أول عادة</button></div>`;
  const routineMarkup = routines.length ? routines.map(routine => `
    <article class="routine-card${routine.completed_today ? ' routine-card-done' : ''}">
      <div class="routine-heading"><div><h4 dir="auto">${escapeHtml(routine.title)}</h4>${routine.description ? `<p dir="auto">${escapeHtml(routine.description)}</p>` : ''}</div>
        <button class="routine-done-button${routine.completed_today ? ' is-checked' : ''}" type="button" data-routine-toggle="${routine.id}" aria-pressed="${routine.completed_today}">${completionIcon(routine.completed_today)}<span>${routine.completed_today ? 'اكتمل' : 'إنهاء الروتين'}</span></button>
      </div>
      ${routine.steps.length ? `<ol class="routine-steps">${routine.steps.map((step, index) => `<li dir="auto"><span>${arabicNumber(index + 1)}</span>${escapeHtml(step)}</li>`).join('')}</ol>` : '<p class="routine-no-steps">أضف خطوات قصيرة لتسهيل البدء.</p>'}
      <div class="routine-card-actions">${iconButton('edit', `تعديل ${routine.title}`, `data-routine-edit="${routine.id}"`)}${iconButton('delete', `إيقاف ${routine.title}`, `data-routine-delete="${routine.id}"`)}</div>
    </article>
  `).join('') : `<div class="habit-empty routine-empty"><span aria-hidden="true">↻</span><strong>اجعل بداية يومك أسهل</strong><p>رتّب الخطوات التي تحب تكرارها في روتين واحد.</p><button class="button button-quiet" type="button" data-routine-empty-add>＋ أنشئ روتيناً</button></div>`;
  document.getElementById('habitsList').innerHTML = habitMarkup;
  document.getElementById('routinesList').innerHTML = routineMarkup;
  renderAchievementBoard();
  applyAutoDirection(document.getElementById('habits'));
}

function renderAchievementBoard() {
  const board = document.getElementById('achievementBoard');
  const today = new Date(`${localToday()}T12:00:00`);
  today.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekStart = localDateValue(today);
  const completedTasks = todos.filter(todo => todo.completed);
  const completedTasksThisWeek = completedTasks.filter(todo => todo.updated_at?.slice(0, 10) >= weekStart);
  const habitCompletions = habits.reduce((sum, habit) => sum + Number(habit.completed_this_week || 0), 0);
  const routineCompletions = routines.reduce((sum, routine) => sum + Number(routine.completed_this_week || 0), 0);
  const entries = [
    ...habits.map(habit => ({
      type: 'habit',
      title: habit.title,
      count: Number(habit.completed_this_week || 0),
      total: Number(habit.total_completions || 0),
      points: Number(habit.completed_this_week || 0) * 2,
      detail: `${arabicNumber(habit.completed_this_week || 0)} إنجازات هذا الأسبوع · سلسلة ${arabicNumber(habit.streak || 0)} أيام`,
    })),
    ...routines.map(routine => ({
      type: 'routine',
      title: routine.title,
      count: Number(routine.completed_this_week || 0),
      total: Number(routine.total_completions || 0),
      points: Number(routine.completed_this_week || 0) * 3,
      detail: `${arabicNumber(routine.completed_this_week || 0)} مرات هذا الأسبوع · ${arabicNumber(routine.total_completions || 0)} إجمالاً`,
    })),
  ];
  if (completedTasksThisWeek.length) {
    entries.push({
      type: 'task',
      title: 'إنجاز المهام',
      count: completedTasksThisWeek.length,
      total: completedTasks.length,
      points: completedTasksThisWeek.length,
      detail: `${arabicNumber(completedTasksThisWeek.length)} مهام هذا الأسبوع · ${arabicNumber(completedTasks.length)} إجمالاً`,
    });
  }
  const ranked = entries.filter(entry => entry.count > 0)
    .sort((first, second) => second.points - first.points || second.count - first.count || first.title.localeCompare(second.title, 'ar'));
  const totalPoints = ranked.reduce((sum, entry) => sum + entry.points, 0);
  const podium = ranked.length ? `<ol class="achievement-ranking">${ranked.slice(0, 7).map((entry, index) => `
    <li class="achievement-rank-row${index < 3 ? ` rank-${index + 1}` : ''}">
      <span class="achievement-rank">${index < 3 ? actionIcon('trophy') : arabicNumber(index + 1)}</span>
      <span class="achievement-entry-icon">${actionIcon(entry.type)}</span>
      <span class="achievement-entry-copy"><strong dir="auto">${escapeHtml(entry.title)}</strong><small>${entry.detail}</small></span>
      <strong class="achievement-points">${arabicNumber(entry.points)} <small>نقطة</small></strong>
    </li>`).join('')}</ol>` : `<div class="achievement-empty"><span aria-hidden="true">${actionIcon('trophy')}</span><strong>أول إنجازك ينتظرك</strong><p>سجّل عادة أو أكمل مهمة أو أنهِ روتيناً لتظهر نقاطك هنا.</p></div>`;
  board.innerHTML = `<div class="achievement-board-heading">
      <div><p class="eyebrow">احتفل بتقدمك</p><h3 id="achievementHeading">لوحة الإنجازات</h3></div>
      <div class="achievement-total">${actionIcon('trophy')}<strong>${arabicNumber(totalPoints)}</strong><span>نقطة هذا الأسبوع</span></div>
    </div>
    <p class="achievement-rules">كل مهمة مكتملة = نقطة · كل إنجاز عادة = نقطتان · كل روتين مكتمل = ٣ نقاط. هذه اللوحة خاصة بحسابك.</p>
    <div class="achievement-stats">
      <span>${actionIcon('task')}<strong>${arabicNumber(completedTasksThisWeek.length)}</strong><small>مهام هذا الأسبوع</small></span>
      <span>${actionIcon('habit')}<strong>${arabicNumber(habitCompletions)}</strong><small>إنجازات العادات</small></span>
      <span>${actionIcon('routine')}<strong>${arabicNumber(routineCompletions)}</strong><small>مرات الروتين</small></span>
    </div>${podium}`;
}

function renderWeeklyReview() {
  const element = document.getElementById('weeklyReview');
  if (!weeklyReview) return;
  element.innerHTML = `<div class="weekly-review-heading"><div><p class="eyebrow">مراجعة مرنة لآخر ٧ أيام</p><h3>ما الذي تحرّك؟</h3></div><span>${dateHeading(weeklyReview.period.start)} – ${dateHeading(weeklyReview.period.end)}</span></div>
    <div class="weekly-review-stats"><span><strong>${arabicNumber(weeklyReview.tasks.completed)}</strong> مهام منجزة</span><span><strong>${arabicNumber(weeklyReview.library.added)}</strong> إضافات جديدة</span><span><strong>${arabicNumber(weeklyReview.tasks.upcoming)}</strong> مهام قادمة</span><span><strong>${arabicNumber(weeklyReview.tasks.overdue)}</strong> متأخرة</span></div>
    ${weeklyReview.projectsNeedingAttention.length ? `<p class="weekly-review-prompt"><strong>مشاريع قد تحتاج خطوة صغيرة:</strong> ${weeklyReview.projectsNeedingAttention.map(project => escapeHtml(project.title)).join('، ')}</p>` : '<p class="weekly-review-prompt">لا توجد مشاريع نشطة متوقفة عن التحديث هذا الأسبوع. خذ لحظة لتحديد خطوتك القادمة.</p>'}`;
}

function checkTaskReminders() {
  if (!notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
  const nowTime = Date.now();
  todos.filter(todo => !todo.completed && todo.due_date).forEach(todo => {
    const dueDate = new Date(`${todo.due_date}T${todo.due_time || '23:59'}:00`);
    const overdue = dueDate.getTime() <= nowTime;
    const dueSoon = todo.due_time && dueDate.getTime() > nowTime && dueDate.getTime() - nowTime <= reminderMinutes * 60 * 1000;
    if (!overdue && !dueSoon) return;
    const key = `${currentUser?.id}:todo:${todo.id}:${todo.due_date}:${todo.due_time || ''}`;
    if (notifiedTaskReminders.has(key)) return;
    notifiedTaskReminders.add(key);
    const notification = new Notification(overdue ? 'مهمة متأخرة' : 'تذكير بمهمة قريبة', {
      body: overdue ? todo.title : `باقي أقل من ${arabicNumber(reminderMinutes)} دقيقة: ${todo.title}`,
      tag: `personal-memo-todo-${todo.id}`,
    });
    notification.onclick = () => {
      window.focus();
      setWorkspaceView('todos', true);
      notification.close();
    };
  });
  reminderEvents.filter(event => !event.all_day).forEach(event => {
    const startsAt = new Date(event.occurrence_start).getTime();
    const minutesUntil = (startsAt - nowTime) / 60000;
    if (minutesUntil < 0 || minutesUntil > reminderMinutes) return;
    const key = `${currentUser?.id}:event:${event.id}:${event.occurrence_date}`;
    if (notifiedTaskReminders.has(key)) return;
    notifiedTaskReminders.add(key);
    const notification = new Notification('موعد قريب', {
      body: `بعد أقل من ${arabicNumber(reminderMinutes)} دقيقة: ${event.title}`,
      tag: `personal-memo-event-${event.id}-${event.occurrence_date}`,
    });
    notification.onclick = () => {
      window.focus();
      setWorkspaceView('calendar', true);
      notification.close();
    };
  });
}

function renderNotifications() {
  const today = localToday();
  const nowTime = Date.now();
  const nextDay = new Date(nowTime + 24 * 60 * 60 * 1000);
  const notifications = [];
  todos.filter(todo => !todo.completed && todo.due_date).forEach(todo => {
    const key = `${currentUser?.id}:todo:${todo.id}:${todo.due_date}:${todo.due_time || ''}`;
    const dueAt = new Date(`${todo.due_date}T${todo.due_time || '23:59'}:00`);
    if (dueAt.getTime() <= nowTime) {
      notifications.push({
        type: 'todo',
        id: todo.id,
        title: todo.title,
        detail: `متأخرة · ${formatDate(todo.due_date)}${todo.due_time ? ` · ${todo.due_time}` : ''}`,
        priority: 0,
        key,
      });
    } else if (todo.due_date === today || dueAt <= nextDay) {
      notifications.push({
        type: 'todo',
        id: todo.id,
        title: todo.title,
        detail: `${todo.due_date === today ? 'تستحق اليوم' : 'تستحق قريباً'} · ${formatDate(todo.due_date)}${todo.due_time ? ` · ${todo.due_time}` : ''}`,
        priority: 1,
        key,
      });
    }
  });
  reminderEvents.forEach(event => {
    const key = `${currentUser?.id}:event:${event.id}:${event.occurrence_date}`;
    if (event.occurrence_date === today && event.all_day) {
      notifications.push({ type: 'event', id: event.id, date: event.occurrence_date, title: event.title, detail: 'موعد اليوم · طوال اليوم', priority: 1, key });
      return;
    }
    const startsAt = new Date(event.occurrence_start);
    if (startsAt.getTime() >= nowTime && startsAt.getTime() <= nextDay.getTime()) {
      notifications.push({
        type: 'event',
        id: event.id,
        date: event.occurrence_date,
        title: event.title,
        detail: `موعد قريب · ${formatDate(event.occurrence_date)} · ${event.occurrence_start.slice(11)}`,
        priority: 1,
        key,
      });
      bookClubNotifications.forEach(notification => notifications.push({
        type: 'club-mention',
        id: notification.id,
        clubId: notification.club_id,
        title: `ذَكرك ${notification.sender_username} في ${notification.club_name}`,
        detail: notification.content.slice(0, 120),
        priority: 1,
        key: `${currentUser?.id}:club-mention:${notification.id}`,
      }));
    }
  });
  notifications.sort((first, second) => first.priority - second.priority || first.detail.localeCompare(second.detail, 'ar'));
  const nextNotificationKeys = new Set(notifications.map(notification => notification.key));
  let previousKeys = activeNotificationKeys;
  if (!hasRenderedNotifications && currentUser) {
    try {
      previousKeys = new Set(JSON.parse(localStorage.getItem(`personal-memo-active-notifications-${currentUser.id}`) || '[]'));
    } catch {
      previousKeys = new Set();
    }
  }
  if ([...nextNotificationKeys].some(key => !previousKeys.has(key))) {
    playNotificationSound();
  }
  hasRenderedNotifications = true;
  activeNotificationKeys = nextNotificationKeys;
  if (currentUser) {
    localStorage.setItem(`personal-memo-active-notifications-${currentUser.id}`, JSON.stringify([...nextNotificationKeys]));
  }
  readNotificationKeys = new Set([...readNotificationKeys].filter(key => activeNotificationKeys.has(key)));
  const unreadCount = notifications.filter(notification => !readNotificationKeys.has(notification.key)).length;
  const visible = notifications.slice(0, 20);
  const count = document.getElementById('notificationCount');
  count.textContent = arabicNumber(unreadCount);
  count.classList.toggle('hidden', unreadCount === 0);
  document.getElementById('notificationsButton').setAttribute('aria-label',
    unreadCount ? `الإشعارات، ${arabicNumber(unreadCount)} غير مقروء` : 'الإشعارات، لا توجد إشعارات غير مقروءة');
  document.getElementById('notificationSummary').textContent = notifications.length
    ? `${arabicNumber(unreadCount)} غير مقروءة`
    : '';
  const markAll = document.getElementById('markAllNotificationsRead');
  markAll.classList.toggle('hidden', unreadCount === 0);
  markAll.disabled = unreadCount === 0;
  document.getElementById('notificationsList').innerHTML = visible.length
    ? visible.map(notification => {
      const isRead = readNotificationKeys.has(notification.key);
      return `<button class="notification-item${notification.priority === 0 ? ' is-overdue' : ''}${isRead ? ' is-read' : ''}" type="button"
        data-notification-key="${escapeHtml(notification.key)}" data-notification-target="${notification.type}" data-notification-id="${notification.id}"
        ${notification.clubId ? `data-notification-club="${notification.clubId}"` : ''}${notification.date ? ` data-notification-date="${notification.date}"` : ''}>
        <span class="notification-item-icon" aria-hidden="true">${notification.type === 'todo' ? '✓' : notification.type === 'club-mention' ? '@' : '◷'}</span>
        <span><strong dir="auto">${escapeHtml(notification.title)}</strong><small>${escapeHtml(notification.detail)}</small></span>
        ${isRead ? '<span class="notification-read-label">مقروء</span>' : ''}
      </button>`;
    }).join('')
    : '<p class="notifications-empty">لا توجد إشعارات قريبة أو متأخرة.</p>';
  if (currentUser) localStorage.setItem(`personal-memo-read-notifications-${currentUser.id}`, JSON.stringify([...readNotificationKeys]));
}

const articleStatuses = { unread: 'للقراءة لاحقاً', reading: 'أقرأها الآن', read: 'تمت قراءتها' };

function renderArticles() {
  const list = document.getElementById('articlesList');
  const counts = {
    all: articles.length,
    unread: articles.filter(article => article.status === 'unread').length,
    reading: articles.filter(article => article.status === 'reading').length,
    read: articles.filter(article => article.status === 'read').length,
  };
  for (const [key, count] of Object.entries(counts)) {
    const target = document.getElementById(`articleCount${key[0].toUpperCase()}${key.slice(1)}`);
    if (target) target.textContent = arabicNumber(count);
  }
  document.querySelectorAll('[data-article-filter]').forEach(button => {
    const selected = button.dataset.articleFilter === articleFilter;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const visible = articles.filter(article => articleFilter === 'all' || article.status === articleFilter);
  document.getElementById('articlesSummary').textContent = articles.length
    ? `${arabicNumber(articles.length)} محفوظة · ${arabicNumber(counts.unread)} بانتظار القراءة`
    : 'احتفظ بالمقالات والصفحات التي تريد العودة إليها.';
  list.innerHTML = visible.length ? visible.map(article => {
    let domain = article.url;
    try { domain = new URL(article.url).hostname.replace(/^www\./, ''); } catch {}
    const nextStatus = article.status === 'unread' ? 'reading' : article.status === 'reading' ? 'read' : 'unread';
    const nextStatusLabel = article.status === 'read' ? 'إعادة إلى القائمة' : article.status === 'reading' ? 'تمت القراءة' : 'ابدأ القراءة';
    return `<article id="article-${article.id}" class="article-card">
      <div class="article-card-heading"><div class="article-card-title"><span class="status status-${article.status}">${articleStatuses[article.status]}</span>
        <h3 dir="auto">${escapeHtml(article.title)}</h3><span class="article-domain" dir="ltr">${escapeHtml(domain)}</span></div>
        <div class="article-actions">${pinButton('article', article.id, article.title)}<a class="small-button" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">فتح الصفحة</a>
          <button class="small-button" type="button" data-article-status="${article.id}" data-next-status="${nextStatus}">${nextStatusLabel}</button>
          <button class="small-button" type="button" data-article-edit="${article.id}">ملاحظات</button>
          <button class="small-button danger" type="button" data-article-delete="${article.id}">حذف</button></div>
      </div>
      ${article.description ? `<p class="article-description" dir="auto">${escapeHtml(article.description)}</p>` : ''}
      ${article.excerpt ? `<details class="article-excerpt"><summary>عرض المقتطف المحفوظ</summary>${textBlock(article.excerpt)}</details>` : ''}
      ${article.review ? `<div class="review">${textBlock(article.review, true)}</div>` : ''}
    </article>`;
  }).join('') : articles.length
    ? '<div class="empty"><strong>لا توجد عناصر في هذا القسم</strong>جرّب حالة أخرى أو غيّر حالة مقال من بطاقته.</div>'
    : '<div class="empty"><strong>قائمة القراءة فارغة</strong>احفظ صفحة من إضافة Chrome أو أضف رابطاً يدوياً.<p><button class="small-button" type="button" data-empty-action="article">＋ حفظ رابط</button></p></div>';
  applyAutoDirection(list);
}

function renderBookmarks() {
  const list = document.getElementById('bookmarksList');
  const query = document.getElementById('bookmarkSearch').value.trim().toLocaleLowerCase();
  const categories = [...new Set(bookmarks.map(bookmark => bookmark.category || 'عام'))]
    .sort((first, second) => first.localeCompare(second, 'ar'));
  if (bookmarkCategoryFilter && !categories.includes(bookmarkCategoryFilter)) bookmarkCategoryFilter = '';
  const categoryNav = document.getElementById('bookmarkCategories');
  categoryNav.innerHTML = [
    ['', 'الكل', bookmarks.length],
    ...categories.map(category => [category, category, bookmarks.filter(bookmark => (bookmark.category || 'عام') === category).length]),
  ].map(([value, label, count]) => `<button type="button" class="bookmark-category${bookmarkCategoryFilter === value ? ' is-active' : ''}"
      data-bookmark-category="${escapeHtml(value)}" aria-pressed="${bookmarkCategoryFilter === value}">
      <span>${escapeHtml(label)}</span><small>${arabicNumber(count)}</small></button>`).join('');
  document.getElementById('bookmarkCategoryOptions').innerHTML = categories
    .map(category => `<option value="${escapeHtml(category)}"></option>`).join('');
  const visible = bookmarks.filter(bookmark => {
    const matchesQuery = !query || `${bookmark.title} ${bookmark.url} ${bookmark.note} ${bookmark.category || ''}`
      .toLocaleLowerCase().includes(query);
    return matchesQuery && (!bookmarkCategoryFilter || (bookmark.category || 'عام') === bookmarkCategoryFilter);
  });
  document.getElementById('bookmarksSummary').textContent = bookmarks.length
    ? `${arabicNumber(bookmarks.length)} رابط محفوظ`
    : 'احفظ روابطك الأساسية لتصل إليها بسرعة.';
  document.getElementById('bookmarkResultsSummary').textContent = query
    ? `${arabicNumber(visible.length)} نتيجة من ${arabicNumber(bookmarks.length)}`
    : bookmarks.length ? 'مصادرك مرتبة حسب مجموعاتك، مع معاينة وإجراءات سريعة.' : '';
  const cardMarkup = bookmark => {
    const domain = (() => {
      try { return new URL(bookmark.url).hostname; } catch { return bookmark.url; }
    })();
    return `<article class="bookmark-card">
      <div class="bookmark-card-visual">
        ${bookmark.image_url
          ? `<img class="bookmark-card-image" src="${escapeHtml(bookmark.image_url)}" alt="" loading="lazy">`
          : `<span class="bookmark-card-placeholder" aria-hidden="true">${escapeHtml(domain.slice(0, 1).toUpperCase())}</span>`}
      </div>
      <div class="bookmark-card-main">
        <div class="bookmark-card-copy">
          <span class="bookmark-domain" dir="ltr">${escapeHtml(domain)}</span>
          <h3 dir="auto"><a href="${escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(bookmark.title)}</a></h3>
          <span class="bookmark-category-label">${escapeHtml(bookmark.category || 'عام')}</span>
          ${bookmark.note ? `<p dir="auto">${escapeHtml(bookmark.note)}</p>` : ''}
        </div>
      </div>
      <div class="bookmark-actions">
        ${pinButton('bookmark', bookmark.id, bookmark.title)}
        <a class="icon-action" href="${escapeHtml(bookmark.url)}" target="_blank" rel="noopener noreferrer" title="فتح الرابط" aria-label="فتح ${escapeHtml(bookmark.title)}">${actionIcon('open')}</a>
        ${iconButton('copy', 'نسخ الرابط', `data-bookmark-copy="${bookmark.id}"`)}
        ${iconButton('edit', `تعديل ${bookmark.title}`, `data-bookmark-edit="${bookmark.id}"`)}
        ${iconButton('delete', `حذف ${bookmark.title}`, `data-bookmark-delete="${bookmark.id}"`)}
      </div>
    </article>`;
  };
  list.innerHTML = visible.length ? (() => {
    const grouped = new Map();
    visible.forEach(bookmark => {
      const category = bookmark.category || 'عام';
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(bookmark);
    });
    return [...grouped.entries()].map(([category, entries]) => `<section class="bookmark-group">
      <header class="bookmark-group-heading"><h3>${escapeHtml(category)}</h3><span>${arabicNumber(entries.length)} روابط</span></header>
      <div class="bookmark-group-cards">${entries.map(cardMarkup).join('')}</div>
    </section>`).join('');
  })() : `<div class="empty"><strong>${bookmarks.length ? 'لا توجد نتائج مطابقة' : 'ابدأ بمصادرك الأساسية'}</strong>${bookmarks.length ? 'جرّب كلمة أخرى أو مجموعة مختلفة.' : 'احفظ روابط العمل والتعلّم والأدوات التي تستخدمها باستمرار.'}<p><button class="small-button" type="button" data-empty-action="bookmark">＋ حفظ رابط مهم</button></p></div>`;
  applyAutoDirection(list);
}

function renderCodeSnippets() {
  const query = document.getElementById('snippetSearch').value.trim().toLocaleLowerCase();
  const languages = [...new Set(codeSnippets.map(snippet => snippet.language.trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  if (snippetLanguageFilter && !languages.includes(snippetLanguageFilter)) snippetLanguageFilter = '';
  document.getElementById('snippetLanguageFilters').innerHTML = [
    ['', 'الكل', codeSnippets.length],
    ...languages.map(language => [language, language, codeSnippets.filter(snippet => snippet.language.trim() === language).length]),
  ].map(([value, label, count]) => `<button type="button" class="snippet-language-filter${snippetLanguageFilter === value ? ' is-active' : ''}"
    data-snippet-language="${escapeHtml(value)}" aria-pressed="${snippetLanguageFilter === value}">
    <span>${escapeHtml(label)}</span><small>${arabicNumber(count)}</small></button>`).join('');
  const visible = codeSnippets.filter(snippet => {
    const matchesQuery = !query || `${snippet.title} ${snippet.language} ${snippet.description} ${snippet.code}`
      .toLocaleLowerCase().includes(query);
    return matchesQuery && (!snippetLanguageFilter || snippet.language.trim() === snippetLanguageFilter);
  });
  document.getElementById('snippetsSummary').textContent =
    `${arabicNumber(codeSnippets.length)} مقطع محفوظ${query || snippetLanguageFilter ? ` · ${arabicNumber(visible.length)} نتيجة` : ''}`;
  document.getElementById('snippetsList').innerHTML = visible.length ? visible.map(snippet => `
    <article class="snippet-card">
      <header class="snippet-card-heading">
        <div class="snippet-card-title">
          <span class="snippet-card-mark" aria-hidden="true">&lt;/&gt;</span>
          <div><h3 dir="auto">${escapeHtml(snippet.title)}</h3><div class="snippet-meta">${snippet.language ? `<span>${escapeHtml(snippet.language)}</span>` : '<span>عام</span>'}${snippet.description ? `<p dir="auto">${escapeHtml(snippet.description)}</p>` : ''}</div></div>
        </div>
        <div class="snippet-actions">
          ${iconButton('copy', 'نسخ الكود', `data-snippet-copy="${snippet.id}"`)}
          ${iconButton('edit', 'تعديل المقطع', `data-snippet-edit="${snippet.id}"`)}
          ${iconButton('delete', 'حذف المقطع', `data-snippet-delete="${snippet.id}"`)}
        </div>
      </header>
      <div class="snippet-code-window">
        <div class="snippet-code-toolbar" dir="ltr"><span class="snippet-window-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${escapeHtml(snippet.language || 'CODE')}</span><span>${arabicNumber(snippet.code.split('\n').length)} أسطر</span></div>
        <pre dir="ltr"><code>${escapeHtml(snippet.code)}</code></pre>
      </div>
    </article>`).join('') : `<div class="empty"><strong>${codeSnippets.length ? 'لا توجد نتائج مطابقة' : 'مكتبتك البرمجية جاهزة'}</strong>${codeSnippets.length ? 'جرّب البحث بكلمة أخرى.' : 'احفظ أوامر وأمثلة الكود التي تستخدمها يومياً لتعود إليها بسرعة.'}<p><button class="small-button" type="button" data-empty-action="snippet">＋ حفظ أول مقطع</button></p></div>`;
}

async function renderLearningHub() {
  const learningStatusLabels = language === 'en'
    ? { exploring: 'Exploring', learning: 'Learning', reviewed: 'Reviewed' }
    : { exploring: 'استكشاف', learning: 'أتعلم الآن', reviewed: 'تمت المراجعة' };
  const query = document.getElementById('learningSearch').value.trim().toLocaleLowerCase();
  const visible = learningTopics.filter(topic =>
    `${topic.title} ${topic.description}`.toLocaleLowerCase().includes(query));
  document.getElementById('learningSummary').textContent =
    language === 'en'
      ? `${arabicNumber(learningTopics.length)} topics · ${arabicNumber(learningTopics.reduce((sum, topic) => sum + topic.note_count, 0))} notes`
      : `${arabicNumber(learningTopics.length)} موضوع · ${arabicNumber(learningTopics.reduce((sum, topic) => sum + topic.note_count, 0))} ملاحظة`;
  document.getElementById('learningTopicList').innerHTML = visible.length ? visible.map(topic => `
    <button type="button" class="learning-topic-option${activeLearningTopic?.id === topic.id ? ' is-active' : ''}"
      data-learning-topic="${topic.id}" aria-pressed="${activeLearningTopic?.id === topic.id}">
      <span class="learning-topic-glyph" aria-hidden="true">✧</span>
      <span class="learning-topic-option-copy"><strong dir="auto">${escapeHtml(topic.title)}</strong>
        <small>${escapeHtml(learningStatusLabels[topic.status] || 'استكشاف')} · ${arabicNumber(topic.note_count)} ${language === 'en' ? 'notes' : 'ملاحظة'}</small></span>
    </button>`).join('') : `<div class="learning-topic-empty">${learningTopics.length ? 'لا توجد موضوعات تطابق البحث.' : 'ابدأ بإنشاء موضوعك الأول.'}</div>`;
  if (activeLearningTopic && !visible.some(topic => topic.id === activeLearningTopic.id)) activeLearningTopic = null;
  if (!activeLearningTopic && visible.length) activeLearningTopic = { id: visible[0].id };
  if (!activeLearningTopic) {
    document.getElementById('learningTopicContent').innerHTML = `<div class="learning-welcome"><span aria-hidden="true">✧</span>
      <p class="eyebrow">مساحة معرفة خاصة</p><h3>${learningTopics.length ? 'لا توجد نتيجة لهذا البحث' : 'اجمع ما تتعلمه في مكان واحد'}</h3>
      <p>${learningTopics.length ? 'جرّب كلمة أخرى أو أزل البحث.' : 'أنشئ موضوعاً، ثم أضف إليه ملاحظات Markdown وملفات تساعدك على الفهم والرجوع للمعلومة.'}</p>
      ${learningTopics.length ? '' : '<button class="button button-primary" type="button" data-learning-create-topic>＋ إنشاء موضوع</button>'}</div>`;
    return;
  }
  const requestedId = activeLearningTopic.id;
  const loadVersion = ++learningLoadVersion;
  try {
    const topic = await api(`/api/learning/topics/${requestedId}`);
    if (loadVersion !== learningLoadVersion) return;
    activeLearningTopic = topic;
    document.getElementById('learningTopicList').querySelectorAll('[data-learning-topic]').forEach(button => {
      const selected = Number(button.dataset.learningTopic) === topic.id;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const noteCount = topic.notes.length;
    const fileCount = topic.notes.reduce((total, note) => total + note.files.length, 0);
    document.getElementById('learningTopicContent').innerHTML = `
      <header class="learning-topic-heading">
        <div><span class="learning-status">${escapeHtml(learningStatusLabels[topic.status] || 'استكشاف')}</span>
          <h3 dir="auto">${escapeHtml(topic.title)}</h3>${topic.description ? `<p dir="auto">${escapeHtml(topic.description)}</p>` : ''}
          <small>${language === 'en' ? `${arabicNumber(noteCount)} notes · ${arabicNumber(fileCount)} files` : `${arabicNumber(noteCount)} ملاحظة · ${arabicNumber(fileCount)} ملف`}</small></div>
        <div class="learning-topic-actions"><button class="icon-action" type="button" data-learning-edit-topic="${topic.id}" title="تعديل الموضوع" aria-label="تعديل الموضوع">${actionIcon('edit')}</button>
          <button class="icon-action is-danger" type="button" data-learning-delete-topic="${topic.id}" title="حذف الموضوع" aria-label="حذف الموضوع">${actionIcon('delete')}</button>
          <button class="button button-primary" type="button" data-learning-add-note="${topic.id}">＋ ملاحظة</button></div>
      </header>
      <div class="learning-notes-list">${topic.notes.length ? topic.notes.map(note => `
        <article class="learning-note-card">
          <header class="learning-note-heading"><div><h4 dir="auto">${escapeHtml(note.title)}</h4><time>${escapeHtml(new Date(note.updated_at).toLocaleDateString(formatLocale(), { dateStyle: 'medium' }))}</time></div>
            <div class="learning-note-actions"><button class="icon-action" type="button" data-learning-edit-note="${note.id}" title="تعديل الملاحظة" aria-label="تعديل الملاحظة">${actionIcon('edit')}</button>
              <button class="icon-action is-danger" type="button" data-learning-delete-note="${note.id}" title="حذف الملاحظة" aria-label="حذف الملاحظة">${actionIcon('delete')}</button></div>
          </header>
          ${note.body ? `<div class="learning-note-body markdown-preview">${renderRichText(note.body)}</div>` : '<p class="learning-note-empty">لا يوجد نص بعد.</p>'}
          <div class="learning-note-files">${note.files.map(file => `<div class="learning-file">
              <a href="${file.url}" class="learning-file-link"><span aria-hidden="true">${file.content_type === 'application/pdf' ? '▤' : '↗'}</span>
                <span><strong dir="auto">${escapeHtml(file.display_name)}</strong><small>${(file.size / 1024 / 1024).toFixed(1)} MB</small></span></a>
              <button class="icon-action is-danger" type="button" data-learning-delete-file="${file.id}" title="حذف الملف" aria-label="حذف ${escapeHtml(file.display_name)}">${actionIcon('delete')}</button>
            </div>`).join('')}
            <label class="learning-attach-button">＋ إرفاق ملف<input type="file" multiple data-learning-upload="${note.id}" accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp"></label>
          </div>
        </article>`).join('') : `<div class="learning-notes-empty"><strong>هذا الموضوع جاهز لملاحظتك الأولى</strong><p>دوّن الفكرة، أضف مثالاً، أو أرفق ملفاً مرجعياً.</p><button class="button button-primary" type="button" data-learning-add-note="${topic.id}">＋ إضافة ملاحظة</button></div>`}</div>`;
  } catch (error) {
    if (loadVersion !== learningLoadVersion) return;
    document.getElementById('learningTopicContent').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderNoteLinkPickers() {
  const pickers = [...document.querySelectorAll('#dailyNoteLinkPicker, [data-backlink-picker]')];
  pickers.forEach(picker => {
    const current = picker.dataset.currentTarget || '';
    picker.innerHTML = `<option value="">ربط بملاحظة...</option>${noteIndex
      .filter(note => pinKey(note.type, note.type === 'daily-note' ? note.note_date : note.id) !== current)
      .map(note => `<option value="${note.type}:${note.type === 'daily-note' ? note.note_date : note.id}">${escapeHtml(note.title)}${note.type === 'daily-note' ? ` · ${formatDate(note.note_date)}` : ''}</option>`).join('')}`;
  });
}

async function renderBacklinks(container, type, id) {
  if (!id) {
    container.innerHTML = '<p class="backlinks-empty">احفظ المذكرة أولاً لتظهر الروابط العائدة.</p>';
    return;
  }
  try {
    const links = await api(`/api/backlinks/${type}/${encodeURIComponent(id)}`);
    container.innerHTML = links.length ? `<ul class="backlinks-list">${links.map(link => link.type === 'item'
      ? `<li><a href="/item/${link.id}">${escapeHtml(link.title)}</a><span>مذكرة</span></li>`
      : link.type === 'daily-note'
        ? `<li><a href="#daily-notes" data-daily-note-link="${escapeHtml(link.note_date)}">${escapeHtml(link.title)}</a><span>${formatDate(link.note_date)}</span></li>`
        : `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.title)}</a><span>${link.type === 'bookmark' ? 'رابط مهم' : 'مقال'}</span></li>`).join('')}</ul>`
      : '<p class="backlinks-empty">لا توجد ملاحظات مرتبطة بهذا اليوم بعد.</p>';
  } catch (error) {
    container.innerHTML = `<p class="backlinks-empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderDailyNote() {
  if (!dailyNote) return;
  dailyNoteDirty = false;
  const form = document.getElementById('dailyNoteForm');
  document.getElementById('dailyNoteDate').value = dailyNote.note_date;
  form.elements.title.value = dailyNote.title || '';
  form.elements.body.value = dailyNote.body || '';
  document.getElementById('dailyNotePreview').innerHTML = renderRichText(dailyNote.body || '');
  document.getElementById('dailyNotePreviewToggle').setAttribute('aria-pressed', 'false');
  document.getElementById('dailyNotePreviewToggle').textContent = 'معاينة';
  document.getElementById('dailyNotePreview').classList.add('hidden');
  document.getElementById('dailyNoteBody').classList.remove('hidden');
  document.getElementById('dailyNoteLinkPicker').dataset.currentTarget = `daily-note:${dailyNote.note_date}`;
  document.getElementById('dailyNotePin').outerHTML = `<button id="dailyNotePin" class="pin-toggle${isPinned('daily-note', dailyNote.id) ? ' is-pinned' : ''}" type="button"
    data-pin-type="daily-note" data-pin-id="${dailyNote.id || ''}" ${dailyNote.id ? '' : 'disabled'}
    aria-label="${isPinned('daily-note', dailyNote.id) ? 'إلغاء تثبيت مذكرة اليوم' : 'تثبيت مذكرة اليوم'}"
    aria-pressed="${isPinned('daily-note', dailyNote.id)}" title="تثبيت مذكرة اليوم">${actionIcon('pin')}</button>`;
  document.getElementById('dailyNoteSaveStatus').textContent = dailyNote.updated_at
    ? `${language === 'en' ? 'Last saved' : 'آخر حفظ'} ${new Date(dailyNote.updated_at).toLocaleTimeString(formatLocale(), { hour: 'numeric', minute: '2-digit' })}`
    : 'كل شيء اختياري. اكتب ما تريد فقط.';
  renderNoteLinkPickers();
  renderBacklinks(document.getElementById('dailyNoteBacklinks'), 'daily-note', dailyNote.note_date);
  applyAutoDirection(form);
  applyMarkdownSettings(form);
}

async function loadDailyNote(date = localToday()) {
  const requestedDate = date;
  const form = document.getElementById('dailyNoteForm');
  form.querySelectorAll('input, textarea, button, select').forEach(control => { control.disabled = true; });
  document.getElementById('dailyNoteSaveStatus').textContent = 'جارٍ فتح المذكرة...';
  try {
    const result = await api(`/api/daily-notes?date=${encodeURIComponent(requestedDate)}`);
    if (document.getElementById('dailyNoteDate').value && document.getElementById('dailyNoteDate').value !== requestedDate) return;
    dailyNote = result;
    renderDailyNote();
    form.querySelectorAll('input, textarea, button, select').forEach(control => { control.disabled = false; });
  } catch (error) {
    document.getElementById('dailyNoteSaveStatus').textContent = `تعذّر فتح المذكرة: ${error.message}`;
  }
}

async function saveDailyNote() {
  const form = document.getElementById('dailyNoteForm');
  const date = dailyNote?.note_date || document.getElementById('dailyNoteDate').value;
  const values = { title: form.elements.title.value, body: form.elements.body.value };
  const savingVersion = dailyNoteVersion;
  const status = document.getElementById('dailyNoteSaveStatus');
  status.textContent = 'جارٍ الحفظ...';
  try {
    const savedNote = await api(`/api/daily-notes/${encodeURIComponent(date)}`, {
      method: 'PUT',
      body: JSON.stringify(values),
    });
    dailyNote = savedNote;
    if (dailyNoteVersion !== savingVersion) return saveDailyNote();
    dailyNoteDirty = false;
    status.textContent = `${language === 'en' ? 'Saved' : 'تم الحفظ'} ${new Date(savedNote.updated_at).toLocaleTimeString(formatLocale(), { hour: 'numeric', minute: '2-digit' })}`;
    pinnedEntries = await api('/api/pins');
    noteIndex = await api('/api/note-index');
    renderPinnedEntries();
    renderNoteLinkPickers();
    const pin = document.getElementById('dailyNotePin');
    pin.outerHTML = `<button id="dailyNotePin" class="pin-toggle${isPinned('daily-note', dailyNote.id) ? ' is-pinned' : ''}" type="button"
      data-pin-type="daily-note" data-pin-id="${dailyNote.id}" aria-label="${isPinned('daily-note', dailyNote.id) ? 'إلغاء تثبيت مذكرة اليوم' : 'تثبيت مذكرة اليوم'}"
      aria-pressed="${isPinned('daily-note', dailyNote.id)}" title="تثبيت مذكرة اليوم">${actionIcon('pin')}</button>`;
    renderBacklinks(document.getElementById('dailyNoteBacklinks'), 'daily-note', dailyNote.note_date);
  } catch (error) {
    status.textContent = `تعذّر الحفظ: ${error.message}`;
  }
}

function renderPinnedEntries() {
  const list = document.getElementById('pinnedList');
  if (!list) return;
  list.innerHTML = pinnedEntries.length ? pinnedEntries.map(entry => {
    const typeLabels = { item: 'مكتبة', article: 'مقال', bookmark: 'رابط مهم', 'daily-note': 'مذكرة يومية' };
    const href = entry.entity_type === 'item' ? `/item/${entry.entity_id}`
      : entry.entity_type === 'daily-note' ? `#daily-notes`
        : entry.target;
    const attrs = entry.entity_type === 'daily-note' ? ` data-daily-note-link="${escapeHtml(entry.target)}"` : '';
    const target = ['item', 'article'].includes(entry.entity_type) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<article class="pinned-card"><span class="pinned-card-icon" aria-hidden="true">⌖</span><div><span>${typeLabels[entry.entity_type] || 'مثبت'}</span><a href="${escapeHtml(href)}"${target}${attrs}>${escapeHtml(entry.title)}</a></div>
      <button class="pin-toggle is-pinned" type="button" data-pin-type="${entry.entity_type}" data-pin-id="${entry.entity_id}" aria-label="إلغاء تثبيت ${escapeHtml(entry.title)}" aria-pressed="true" title="إلغاء التثبيت">${actionIcon('pin')}</button></article>`;
  }).join('') : '<div class="empty"><strong>لا توجد عناصر مثبتة</strong>استخدم رمز التثبيت بجانب أي مذكرة أو رابط لتجده هنا بسرعة.</div>';
}

function insertNoteLink(picker) {
  const value = picker.value;
  if (!value) return;
  const [type, id] = value.split(':');
  const note = noteIndex.find(candidate => candidate.type === type
    && (type === 'daily-note' ? candidate.note_date === id : String(candidate.id) === id));
  const editor = picker.closest('.daily-notes-page')?.querySelector('#dailyNoteBody')
    || picker.closest('[data-detail-markdown-section]')?.querySelector('textarea')
    || picker.closest('#articleForm')?.querySelector('#articleReviewInput');
  if (!note || !editor) return;
  const safeTitle = note.title.replace(/[\[\]|]/g, ' ').trim();
  const reference = type === 'daily-note' ? `[[daily:${note.note_date}|${safeTitle}]]` : `[[item:${note.id}|${safeTitle}]]`;
  insertAtCursor(editor, reference);
  picker.value = '';
}

function galleryVisibleImages() {
  return galleryActiveFilter ? galleryImages.filter(image => image.category === galleryActiveFilter) : galleryImages;
}

function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;
  const categories = [...new Set(galleryImages.map(image => image.category))].sort((a, b) => a.localeCompare(b, 'ar'));
  const filter = document.getElementById('galleryCategoryFilter');
  const previousValue = galleryActiveFilter;
  filter.innerHTML = `<option value="">كل الصور</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}`;
  filter.value = categories.includes(previousValue) ? previousValue : '';
  galleryActiveFilter = filter.value;
  document.getElementById('galleryCategoryOptions').innerHTML = ['فن', 'شخصي', 'إلهام', ...categories]
    .filter((value, index, all) => all.indexOf(value) === index)
    .map(category => `<option value="${escapeHtml(category)}"></option>`).join('');
  const visible = galleryVisibleImages();
  document.getElementById('gallerySummary').textContent = galleryImages.length
    ? `${arabicNumber(galleryImages.length)} صورة${categories.length ? ` · ${arabicNumber(categories.length)} تصنيفات` : ''}`
    : 'معرضك خاص بحسابك، وصورك لا تظهر للآخرين.';
  grid.innerHTML = visible.length ? visible.map((image, index) => `<article class="gallery-card">
    <button class="gallery-image-button" type="button" data-gallery-open="${image.id}" aria-label="عرض ${escapeHtml(image.caption || image.category)}">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.caption || image.category)}" loading="lazy">
    </button><div class="gallery-card-meta"><div><strong dir="auto">${escapeHtml(image.caption || image.category)}</strong><span>${escapeHtml(image.category)}</span></div>
      <button class="icon-action is-danger" type="button" data-gallery-remove="${image.id}" aria-label="إزالة الصورة من المعرض" title="إزالة من المعرض">${actionIcon('delete')}</button></div>
    <span class="sr-only">${arabicNumber(index + 1)} من ${arabicNumber(visible.length)}</span></article>`).join('')
    : `<div class="empty gallery-empty"><strong>${galleryImages.length ? 'لا توجد صور في هذا التصنيف' : 'معرضك يبدأ بصورة تحبها'}</strong>${galleryImages.length ? 'اختر تصنيفاً آخر أو اعرض كل الصور.' : 'ارفع صور الفن أو اللحظات الشخصية أو أي شيء يلهمك.'}</div>`;
}

function openGalleryViewer(imageId) {
  const images = galleryVisibleImages();
  galleryImageIndex = images.findIndex(image => image.id === Number(imageId));
  if (galleryImageIndex < 0) return;
  renderGalleryViewer();
  document.getElementById('galleryViewer').showModal();
}

function renderGalleryViewer() {
  const images = galleryVisibleImages();
  const image = images[galleryImageIndex];
  if (!image) return;
  document.getElementById('galleryViewerImage').src = image.url;
  document.getElementById('galleryViewerImage').alt = image.caption || image.category;
  document.getElementById('galleryViewerCaption').textContent = image.caption || image.category;
  document.getElementById('galleryViewerMeta').textContent = `${image.category} · ${arabicNumber(galleryImageIndex + 1)} / ${arabicNumber(images.length)}`;
  document.querySelector('.gallery-viewer-previous').disabled = images.length < 2;
  document.querySelector('.gallery-viewer-next').disabled = images.length < 2;
}

function stepGalleryViewer(direction) {
  const images = galleryVisibleImages();
  if (images.length < 2) return;
  galleryImageIndex = (galleryImageIndex + direction + images.length) % images.length;
  renderGalleryViewer();
}

const timelineTypes = {
  writing: ['✍️', 'كتابة'],
  reading: ['📚', 'قراءة'],
  viewing: ['🎬', 'مشاهدة أو لعب'],
  task: ['✓', 'مهمة مكتملة'],
  habit: ['↻', 'عادة'],
  routine: ['☀', 'روتين'],
  thought: ['💭', 'فكرة'],
  event: ['📍', 'حدث'],
};

async function renderTimeline() {
  const form = document.getElementById('timelineFilter');
  const start = form.elements.start.value;
  const end = form.elements.end.value;
  const list = document.getElementById('timelineList');
  list.innerHTML = '<p class="field-hint">جارٍ جمع ذكريات هذه الفترة...</p>';
  try {
    const result = await api(`/api/timeline?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    const days = new Map();
    result.entries.forEach(entry => {
      if (!days.has(entry.date)) days.set(entry.date, []);
      days.get(entry.date).push(entry);
    });
    const typeCount = new Set(result.entries.map(entry => entry.type)).size;
    document.getElementById('timelineSummary').textContent =
      `${arabicNumber(result.entries.length)} ذكرى · ${arabicNumber(days.size)} أيام · ${arabicNumber(typeCount)} أنواع نشاط · ${formatDate(result.start)} — ${formatDate(result.end)}`;
    list.innerHTML = result.entries.length ? [...days.entries()].map(([date, entries]) => {
      const dateObject = new Date(`${date}T12:00:00`);
      const weekday = new Intl.DateTimeFormat(formatLocale(), { weekday: 'long' }).format(dateObject);
      const types = [...new Set(entries.map(entry => (timelineTypes[entry.type] || ['•', 'نشاط'])[1]))];
      return `<section class="timeline-day">
        <header class="timeline-day-heading">
          <div><span>${escapeHtml(weekday)}</span><h3>${escapeHtml(formatDate(date))}</h3></div>
          <div class="timeline-day-meta"><span>${arabicNumber(entries.length)} ${entries.length === 1 ? 'ذكرى' : 'ذكريات'}</span><small>${types.map(escapeHtml).join(' · ')}</small></div>
        </header>
        <div class="timeline-day-entries">${entries.map(entry => {
          const [icon, label] = timelineTypes[entry.type] || ['•', 'نشاط'];
          return `<article class="timeline-entry timeline-entry-${escapeHtml(entry.type)}">
            <span class="timeline-entry-icon" aria-hidden="true">${icon}</span>
            <div><span class="timeline-entry-type">${escapeHtml(label)}</span><h4 dir="auto">${escapeHtml(entry.title)}</h4>
              ${entry.detail ? `<p dir="auto">${escapeHtml(entry.detail)}</p>` : ''}</div>
          </article>`;
        }).join('')}</div>
      </section>`;
    }).join('') : '<div class="timeline-empty"><span aria-hidden="true">⌁</span><strong>الفترة دي لسه هادية</strong><p>أكمل مهمة، سجّل قراءة، أو اكتب مذكرة؛ وستظهر ذكرياتك هنا مرتبة حسب اليوم.</p></div>';
    applyAutoDirection(list);
  } catch (error) {
    list.innerHTML = `<p class="field-hint">${escapeHtml(error.message)}</p>`;
  }
}

function renderBookClubList() {
  const list = document.getElementById('bookClubList');
  if (!bookClubs.length) {
    list.innerHTML = '<div class="empty"><strong>ابدأ أول نادي قراءة</strong>أنشئ نادياً خاصاً ثم شارك رابط دعوة مع أصدقائك.</div>';
    document.getElementById('bookClubDetails').innerHTML = '';
    activeClubId = null;
    activeClub = null;
    return;
  }
  if (!bookClubs.some(club => club.id === activeClubId)) {
    activeClubId = bookClubs[0].id;
    if (currentUser) localStorage.setItem(`personal-memo-active-club-${currentUser.id}`, String(activeClubId));
  }
  list.innerHTML = bookClubs.map(club => `<button class="book-club-picker${club.id === activeClubId ? ' is-active' : ''}"
    type="button" data-club-select="${club.id}">
    <strong dir="auto">${escapeHtml(club.name)}</strong><span>${arabicNumber(club.member_count)} أعضاء · ${arabicNumber(club.book_count)} كتب</span>
  </button>`).join('');
}

async function loadBookClub(clubId = activeClubId) {
  if (!clubId) return;
  activeClubId = Number(clubId);
  try {
    activeClub = await api(`/api/book-clubs/${activeClubId}`);
    if (currentUser) localStorage.setItem(`personal-memo-active-club-${currentUser.id}`, String(activeClubId));
    renderBookClubDetails();
    renderBookClubList();
  } catch (error) {
    showToast(error.message);
  }
}

async function processBookClubInvite() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('clubInvite');
  if (!token) return;
  url.searchParams.delete('clubInvite');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  try {
    const result = await api(`/api/book-club-invites/${encodeURIComponent(token)}/accept`, { method: 'POST' });
    activeClubId = result.clubId;
    await refreshWorkspace();
    setWorkspaceView('clubs', true);
    showToast(`انضممت إلى «${result.name}».`);
  } catch (error) {
    showToast(error.message);
  }
}

function updateClubMentionSuggestions(textarea) {
  const suggestions = document.getElementById('clubMentionSuggestions');
  if (!suggestions || !activeClub) return;
  const beforeCursor = textarea.value.slice(0, textarea.selectionStart);
  const mention = beforeCursor.match(/(?:^|[^\w@])@([a-z0-9_]*)$/i);
  if (!mention) {
    suggestions.classList.add('hidden');
    suggestions.innerHTML = '';
    return;
  }
  const query = mention[1].toLowerCase();
  const members = activeClub.members.filter(member => member.id !== currentUser?.id
    && member.username.toLowerCase().startsWith(query));
  suggestions.innerHTML = members.length ? members.slice(0, 6).map(member => `
    <button class="mention-suggestion" type="button" role="option" data-mention-username="${escapeHtml(member.username)}">@${escapeHtml(member.username)}</button>
  `).join('') : '<span class="mention-empty">لا يوجد عضو بهذا الاسم.</span>';
  suggestions.classList.toggle('hidden', members.length === 0);
}

function renderBookClubDetails() {
  const root = document.getElementById('bookClubDetails');
  if (!activeClub) {
    root.innerHTML = '<div class="empty">اختر نادياً من القائمة لعرض القراءة والنقاش.</div>';
    return;
  }
  const books = activeClub.books.map(book => `<article class="club-book-card">
    <div><h4 dir="auto">${escapeHtml(book.title)}</h4>${book.creator ? `<p dir="auto">${escapeHtml(book.creator)}</p>` : ''}
      <small>${arabicNumber(book.completed_count)} أعضاء أنهوا الكتاب${book.total_pages ? ` · ${arabicNumber(book.total_pages)} صفحة` : ''}</small>
      ${book.total_pages ? `<div class="club-book-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${book.total_pages}" aria-valuenow="${book.my_pages_read || 0}">
        <span style="width:${Math.min(100, Math.round((book.my_pages_read || 0) / book.total_pages * 100))}%"></span></div>` : ''}
    </div>
    <div class="club-book-personal-progress">
      <label>حالتي<select data-club-book-progress="${book.id}"><option value="reading"${(book.my_status || 'reading') === 'reading' ? ' selected' : ''}>أقرأه</option><option value="completed"${book.my_status === 'completed' ? ' selected' : ''}>أنهيته</option></select></label>
      ${book.total_pages ? `<label>وصلت للصفحة<input data-club-pages="${book.id}" type="number" min="0" max="${book.total_pages}" value="${book.my_pages_read || 0}" inputmode="numeric"></label>` : ''}
    </div>
  </article>`).join('');
  const messages = activeClub.messages.map(message => `<article class="club-message${message.message_type === 'insight' ? ' is-insight' : ''}">
    <div><strong dir="auto">${escapeHtml(message.username)}</strong><time>${escapeHtml(new Date(message.created_at).toLocaleString(formatLocale(), { dateStyle: 'medium', timeStyle: 'short' }))}</time></div>
    ${message.message_type === 'insight' ? '<span class="club-insight-label">رؤية</span>' : ''}
    ${message.content ? `<p dir="auto">${escapeHtml(message.content).replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>').replace(/(^|[^\w])(@[a-z0-9_]{3,32})\b/gi, '$1<strong class="club-mention">$2</strong>').replace(/\n/g, '<br>')}</p>` : ''}
    ${message.links?.length ? `<div class="club-message-links">${message.links.map(link => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(link.title || link.url)}</a>`).join('')}</div>` : ''}
    ${message.attachments?.length ? `<div class="club-message-attachments">${message.attachments.map(file => file.content_type.startsWith('image/')
      ? `<a href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(file.url)}" alt="${escapeHtml(file.display_name)}" loading="lazy"></a>`
      : `<a class="club-file-link" href="${escapeHtml(file.url)}">↧ ${escapeHtml(file.display_name)} · ${arabicNumber(Math.max(1, Math.round(file.size / 1024)))} KB</a>`).join('')}</div>` : ''}
  </article>`).join('');
  const ranking = activeClub.leaderboard.map(member => `<li class="club-rank-row">
    <span>${arabicNumber(member.rank)}</span><strong dir="auto">${escapeHtml(member.username)}</strong>
    <span>${arabicNumber(member.points)} نقطة</span></li>`).join('');
  const invitations = activeClub.role === 'owner' ? `<div class="club-admin-grid">
    <section class="club-admin-card" aria-label="روابط الدعوة">
      <div class="club-admin-heading"><div><h4>دعوات الأعضاء</h4><p>الروابط صالحة لمدة ٣٠ يوماً.</p></div>
        <span class="club-admin-count">${arabicNumber(activeClub.invites.length)}</span></div>
      ${activeClub.invites.length ? `<div class="club-invitation-list">${activeClub.invites.map(invite => `<div class="club-invitation">
        <span class="club-invitation-status"><span class="club-status-dot"></span><span>${language === 'en' ? 'Expires on' : 'تنتهي في'} <time datetime="${escapeHtml(invite.expires_at)}">${escapeHtml(new Date(invite.expires_at).toLocaleDateString(formatLocale(), { day: 'numeric', month: 'short', year: 'numeric' }))}</time></span></span>
        <button class="small-button danger" type="button" data-club-invite-revoke="${invite.id}">إلغاء</button>
      </div>`).join('')}</div>` : '<p class="club-admin-empty">لا توجد دعوات نشطة حالياً.</p>'}
    </section>
    <section class="club-admin-card club-member-permissions" aria-label="صلاحية إضافة الكتب">
      <div class="club-admin-heading"><div><h4>إضافة الكتب</h4><p>اختر من يمكنه إضافة كتب إلى رف النادي.</p></div>
        <span class="club-admin-icon" aria-hidden="true">＋</span></div>
      <div class="club-permission-list">${activeClub.members.map(member => `<label class="club-permission-row">
        <span class="club-member-identity"><span class="club-member-avatar" aria-hidden="true">${escapeHtml(member.username.slice(0, 1).toUpperCase())}</span>
          <span class="club-member-name"><strong dir="auto">${escapeHtml(member.username)}</strong><small>${member.role === 'owner' ? 'مالك النادي' : 'عضو'}</small></span></span>
        ${member.role === 'owner' ? '<span class="club-owner-badge">المالك</span>' : `<span class="club-permission-toggle">
          <input type="checkbox" data-club-member-books="${member.id}"${member.can_add_books ? ' checked' : ''} aria-label="السماح لـ ${escapeHtml(member.username)} بإضافة الكتب">
          <span class="club-switch" aria-hidden="true"></span><span class="club-permission-state" aria-hidden="true"></span></span>`}
      </label>`).join('')}</div>
    </section>
  </div>` : '';
  const metrics = activeClub.metrics;
  const meetings = activeClub.meetings.map(meeting => `<article class="club-meeting">
    <div class="club-meeting-heading"><div><span class="eyebrow">${escapeHtml(new Date(meeting.starts_at).toLocaleString(formatLocale(), { dateStyle: 'medium', timeStyle: 'short' }))}</span>
      <h5 dir="auto">${escapeHtml(meeting.title)}</h5></div>
      ${meeting.meeting_url ? `<a class="small-button" href="${escapeHtml(meeting.meeting_url)}" target="_blank" rel="noopener noreferrer">رابط الاجتماع ↗</a>` : ''}
    </div>
    ${meeting.discussion_points ? `<div class="club-meeting-points">${textBlock(meeting.discussion_points, true)}</div>` : '<p class="field-hint">لم تُسجل نقاط النقاش بعد.</p>'}
    ${(activeClub.role === 'owner' || meeting.created_by === currentUser?.id) ? `<details class="club-meeting-edit"><summary>تعديل الموعد أو نقاط النقاش</summary>
      <form data-club-meeting-edit="${meeting.id}">
        <label>العنوان<input name="title" required maxlength="160" value="${escapeHtml(meeting.title)}"></label>
        <label>الموعد<input name="startsAt" type="datetime-local" required value="${escapeHtml(meeting.starts_at)}"></label>
        <label>رابط الاجتماع<input name="meetingUrl" type="url" dir="ltr" maxlength="2048" value="${escapeHtml(meeting.meeting_url)}"></label>
        <label>النقاط التي نوقشت<textarea name="discussionPoints" rows="3" maxlength="10000">${escapeHtml(meeting.discussion_points)}</textarea></label>
        <button class="small-button" type="submit">حفظ التعديلات</button>
        ${(activeClub.role === 'owner' || meeting.created_by === currentUser?.id) ? `<button class="small-button danger" type="button" data-club-meeting-delete="${meeting.id}">حذف الاجتماع</button>` : ''}
      </form>
    </details>` : ''}
  </article>`).join('');
  root.innerHTML = `<header class="club-detail-heading"><div><p class="eyebrow">${arabicNumber(activeClub.members.length)} أعضاء · ${arabicNumber(activeClub.books.length)} كتب</p>
    <h3 dir="auto">${escapeHtml(activeClub.name)}</h3>${activeClub.description ? `<p>${escapeHtml(activeClub.description)}</p>` : ''}</div>
    <div class="club-heading-actions"><a class="small-button" href="/api/book-clubs/${activeClub.id}/export">تصدير بيانات النادي</a>
      <button class="button button-quiet" type="button" data-club-invite="${activeClub.id}">دعوة أعضاء</button></div></header>
    ${invitations}
    <section class="club-panel club-metrics" aria-label="مؤشرات النادي">
      <article><span>أعضاء</span><strong>${arabicNumber(metrics.member_count)}</strong></article>
      <article><span>صفحات قرأها الأعضاء</span><strong>${arabicNumber(metrics.pages_read)}</strong></article>
      <article><span>نسبة الصفحات المقروءة</span><strong>${arabicNumber(metrics.page_completion_percent)}٪</strong></article>
      <article><span>قراءات مكتملة</span><strong>${arabicNumber(metrics.completed_readings)}</strong></article>
      <article><span>اجتماعات</span><strong>${arabicNumber(metrics.meeting_count)}</strong></article>
      <article><span>مشاركات وروابط</span><strong>${arabicNumber(metrics.message_count + metrics.shared_link_count)}</strong></article>
    </section>
    <div class="club-secondary-grid">
      <section class="club-panel"><div class="club-panel-heading"><h4>رف القراءة المشترك</h4>
        ${activeClub.can_add_books ? `<div class="club-add-book-controls"><select id="clubBookSelect" aria-label="اختر كتاباً من مكتبتك"><option value="">اختر كتاباً</option>${items.filter(item => item.kind === 'book').map(item => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('')}</select>
          <input id="clubBookTotalPages" type="number" min="0" max="1000000" inputmode="numeric" placeholder="عدد الصفحات" aria-label="إجمالي صفحات الكتاب">
          <button class="small-button" type="button" data-club-add-book="${activeClub.id}">إضافة كتاب</button></div>` : '<span class="field-hint">يمكنك طلب صلاحية إضافة الكتب من مالك النادي.</span>'}</div>
        <div class="club-book-list">${books || '<p class="empty-inline">أضيفوا أول كتاب للنادي.</p>'}</div></section>
      <section class="club-panel"><div class="club-panel-heading"><h4>لوحة القراءة</h4></div>
        <p class="field-hint">١٠ نقاط لكل كتاب مكتمل · ٣ نقاط لكل رؤية مشتركة.</p>
        <ol class="club-leaderboard">${ranking || '<li class="empty-inline">ابدأوا القراءة لتظهر النتائج.</li>'}</ol>
        <div class="club-members">${activeClub.members.map(member => `<span>${escapeHtml(member.username)}${member.role === 'owner' ? ' · مالك' : ''}</span>`).join('')}</div></section>
    </div>
    <section class="club-panel club-meetings-panel"><div class="club-panel-heading"><h4>الاجتماعات</h4><span>${arabicNumber(metrics.meeting_count)} اجتماعات</span></div>
      <details class="club-meeting-create"><summary>＋ جدولة اجتماع جديد</summary>
        <form class="club-meeting-form" data-club-meeting="${activeClub.id}">
          <label>عنوان الاجتماع<input name="title" required maxlength="160" placeholder="مثال: مناقشة الفصل الثالث"></label>
          <label>التاريخ والوقت<input name="startsAt" type="datetime-local" required></label>
          <label>رابط الاجتماع<input name="meetingUrl" type="url" dir="ltr" maxlength="2048" placeholder="https://..."></label>
          <label>جدول النقاش<textarea name="discussionPoints" rows="2" maxlength="10000" dir="auto" placeholder="أضف نقاط النقاش أو الملاحظات"></textarea></label>
          <button class="button button-primary" type="submit">حفظ موعد الاجتماع</button>
        </form>
      </details>
      <div class="club-meeting-list">${meetings || '<p class="empty-inline">لم تُجدول اجتماعات بعد.</p>'}</div>
    </section>
    <section class="club-panel club-chat-panel"><div class="club-panel-heading"><h4>النقاش والرؤى</h4><span>رسائل الأعضاء فقط</span></div>
      <div class="club-message-list">${messages || '<p class="empty-inline">ابدأوا النقاش بمشاركة فكرة أو سؤال من قراءتكم.</p>'}</div>
      <form class="club-message-form" data-club-message="${activeClub.id}">
        <select name="type" aria-label="نوع المشاركة"><option value="chat">رسالة</option><option value="insight">رؤية من القراءة</option></select>
        <div class="club-message-compose">
          <textarea name="content" id="clubMessageContent" maxlength="4000" rows="2" dir="auto" placeholder="اكتب @ لذكر عضو، أو شارك فكرة..."></textarea>
          <div id="clubMentionSuggestions" class="mention-suggestions hidden" role="listbox" aria-label="أعضاء النادي"></div>
        </div>
        <div class="club-attachment-fields">
          <label>ملفات أو صور<input name="attachments" type="file" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp"></label>
          <label>إرفاق رابط<input name="link" type="url" dir="ltr" maxlength="2048" placeholder="https://..."></label>
        </div>
        <button class="button button-primary" type="submit">إرسال</button>
      </form></section>
    ${activeClub.role === 'owner' ? `<button class="small-button danger" type="button" data-club-delete="${activeClub.id}">حذف النادي</button>` : `<button class="small-button danger" type="button" data-club-leave="${activeClub.id}">مغادرة النادي</button>`}`;
  const messageList = root.querySelector('.club-message-list');
  if (messageList) messageList.scrollTop = messageList.scrollHeight;
}

function itemCard(item) {
  const tags = item.tags.split(',').map(tag => tag.trim()).filter(Boolean);
  const rating = item.rating ? `<div class="rating" aria-label="التقييم ${item.rating} من ٥">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</div>` : '';
  const progress = item.kind !== 'memo' && item.progress
    ? `<div class="progress-box"><span>التقدم</span><strong>${escapeHtml(item.progress)}</strong></div>`
    : '';
  const review = item.review ? `<div class="review">${textBlock(item.review, true)}</div>` : '';
  const notes = item.notes ? `<div class="review notes">${textBlock(item.notes, true)}</div>` : '';
  const cover = item.cover_image
    ? `<img class="item-cover" src="${escapeHtml(item.cover_image)}" alt="غلاف ${escapeHtml(item.title)}" loading="lazy">`
    : '';
  const dates = [
    item.started_on && `بدأ ${formatDate(item.started_on)}`,
    item.finished_on && `أنهي ${formatDate(item.finished_on)}`,
  ].filter(Boolean).join(' · ');
  const trackButton = item.kind !== 'memo'
    ? iconButton('progress', `تحديث تقدم ${item.title}`, `data-action="track" data-id="${item.id}"`)
    : '';
  const chaptersButton = item.kind === 'book'
    ? `<a class="icon-action" href="/item/${item.id}#chapters" target="_blank" rel="noopener noreferrer" title="الفصول والملاحظات" aria-label="الفصول والملاحظات لـ ${escapeHtml(item.title)}">${actionIcon('open')}</a>`
    : '';

  return `<article class="item-card">
    <div class="item-top">
      ${cover}
      <div>
        <span class="item-type">${KIND_ICONS[item.kind]} ${KIND_LABELS[item.kind]}</span>
        <h3 class="item-title"><a href="/item/${item.id}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>
        ${item.creator ? `<p class="item-creator">${escapeHtml(item.creator)}</p>` : ''}
      </div>
      <span class="status status-${item.status}">${STATUS_LABELS[item.status]}</span>
      ${item.near_completion && item.status !== 'completed' ? '<span class="status status-near">قارب على الانتهاء</span>' : ''}
    </div>
    ${rating}${progress}${review}${notes}
    ${tags.length ? `<div class="tags">${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    ${dates ? `<div class="item-meta"><span>${escapeHtml(dates)}</span></div>` : ''}
    <div class="item-actions">
      ${trackButton}
      ${pinButton('item', item.id, item.title)}
      ${chaptersButton}
      <a class="icon-action" href="/item/${item.id}" target="_blank" rel="noopener noreferrer" title="فتح في تبويب جديد" aria-label="فتح ${escapeHtml(item.title)} في تبويب جديد">${actionIcon('open')}</a>
      ${iconButton('edit', `تعديل ${item.title}`, `data-action="edit" data-id="${item.id}"`)}
      ${iconButton('delete', `حذف ${item.title}`, `data-action="delete" data-id="${item.id}"`)}
    </div>
  </article>`;
}

function inlineItemEditor(item) {
  const ratingOptions = [1, 2, 3, 4, 5].map(value =>
    `<option value="${value}"${item.rating === value ? ' selected' : ''}>${'★'.repeat(value)}${'☆'.repeat(5 - value)}</option>`
  ).join('');
  const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) =>
    `<option value="${value}"${item.status === value ? ' selected' : ''}>${label}</option>`
  ).join('');
  return `<form class="inline-editor" data-inline-item="${item.id}">
    <input type="hidden" name="kind" value="${item.kind}">
    <input type="hidden" name="cover_image" value="${escapeHtml(item.cover_image || '')}">
    <div class="inline-editor-heading"><strong>تعديل العنصر</strong><span>${KIND_LABELS[item.kind]}</span></div>
    <label class="wide">العنوان<input name="title" dir="auto" required maxlength="200" value="${escapeHtml(item.title)}"></label>
    ${item.kind !== 'memo' ? `<label>المؤلف / المطور / المخرج<input name="creator" dir="auto" maxlength="200" value="${escapeHtml(item.creator)}"></label>` : `<input type="hidden" name="creator" value="${escapeHtml(item.creator)}">`}
    <label>الحالة<select name="status">${statusOptions}</select></label>
    ${item.kind !== 'memo' ? `<label class="wide checkbox-field"><input name="near_completion" type="checkbox"${item.near_completion ? ' checked' : ''}> قارب على الانتهاء</label>` : '<input type="hidden" name="near_completion" value="">'}
    ${item.kind !== 'memo' ? `
      <label>التقدم<input name="progress" dir="auto" maxlength="200" value="${escapeHtml(item.progress)}"></label>
      <label>التقييم<select name="rating"><option value="">بدون تقييم</option>${ratingOptions}</select></label>
      <label>بدأت في<input name="started_on" type="date" value="${escapeHtml(item.started_on || '')}"></label>
      <label>أنهيت في<input name="finished_on" type="date" value="${escapeHtml(item.finished_on || '')}"></label>
      <label class="wide">الوسوم<input name="tags" dir="auto" maxlength="300" value="${escapeHtml(item.tags)}"></label>
      <label class="wide">المراجعة (Markdown)<textarea name="review" dir="auto" maxlength="5000" rows="4">${escapeHtml(item.review)}</textarea></label>
    ` : `
      <input type="hidden" name="progress" value="${escapeHtml(item.progress)}">
      <input type="hidden" name="rating" value="">
      <input type="hidden" name="started_on" value="">
      <input type="hidden" name="finished_on" value="">
      <input type="hidden" name="tags" value="">
      <input type="hidden" name="review" value="">
    `}
    <label class="wide">${item.kind === 'memo' ? 'نص المذكرة' : 'ملاحظات شخصية'} (Markdown)
      <textarea name="notes" dir="auto" maxlength="10000" rows="5">${escapeHtml(item.notes)}</textarea>
    </label>
    <div class="inline-editor-actions">
      <button class="button button-quiet" type="button" data-inline-cancel="${item.id}">إلغاء</button>
      <button class="button button-primary" type="submit">حفظ التغييرات</button>
    </div>
  </form>`;
}

function beginInlineEdit(item, container) {
  if (editMode === 'popup') return openItemForm(item);
  container.innerHTML = inlineItemEditor(item);
  applyAutoDirection(container);
  container.querySelector('input[name="title"]')?.focus();
}

function renderItems() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const status = document.getElementById('statusFilter').value;
  const rating = document.getElementById('ratingFilter').value;
  const tag = document.getElementById('tagFilter').value.trim().toLocaleLowerCase();
  const visible = items.filter(item => {
    const matchesKind = selectedKind === 'all' || selectedKind === item.kind;
    const searchText = [item.title, item.creator, item.review, item.notes, item.tags].join(' ').toLocaleLowerCase();
    const matchesStatus = status === 'all' || item.status === status;
    const matchesRating = rating === 'all' || (rating === 'unrated' ? !item.rating : item.rating && item.rating >= Number(rating));
    const matchesTag = !tag || item.tags.toLocaleLowerCase().split(',').some(value => value.trim().includes(tag));
    return matchesKind && matchesStatus && matchesRating && matchesTag && (!query || searchText.includes(query));
  });
  if (!visible.length) {
    itemsElement.innerHTML = `<div class="empty"><strong>${items.length ? 'لا توجد نتائج مطابقة' : 'مكتبتك تبدأ من هنا'}</strong>${items.length ? 'جرّب كلمة بحث أو تصنيفاً مختلفاً.' : 'أضف كتاباً أو لعبة أو فيلماً أو اكتب أول مذكرة.'}<p><button class="small-button" type="button" data-empty-action="item">＋ إضافة عنصر</button></p></div>`;
    return;
  }
  itemsElement.innerHTML = visible.map(itemCard).join('');
  applyAutoDirection(itemsElement);
  applyMarkdownSettings(itemsElement);
}

async function refresh() {
  [items] = await Promise.all([api('/api/items'), refreshWorkspace()]);
  if (detailItemId) await loadDetailPage();
  else {
    statsElement.classList.remove('hidden');
    setWorkspaceView(activeWorkspace);
    renderItems();
  }
}

async function refreshWorkspace() {
  const calendarRange = calendarMonthRange();
  [metrics, todos, articles, bookmarks, codeSnippets, learningTopics, areas, goals, projects, events, reminderEvents, habits, routines, todayPlan, weeklyReview, bookClubs, bookClubNotifications, pinnedEntries, noteIndex, galleryImages] = await Promise.all([
    api('/api/metrics'),
    api('/api/todos'),
    api('/api/articles'),
    api('/api/bookmarks'),
    api('/api/snippets'),
    api('/api/learning/topics'),
    api('/api/areas'),
    api('/api/goals'),
    api('/api/projects'),
    api(`/api/events?start=${calendarRange.start}&end=${calendarRange.end}`),
    api('/api/events'),
    api('/api/habits'),
    api('/api/routines'),
    api('/api/today'),
    api('/api/weekly-review'),
    api('/api/book-clubs'),
    api('/api/book-club-notifications'),
    api('/api/pins'),
    api('/api/note-index'),
    api('/api/gallery'),
  ]);
  if (currentUser && !activeClubId) {
    const savedClubId = Number(localStorage.getItem(`personal-memo-active-club-${currentUser.id}`));
    activeClubId = bookClubs.some(club => club.id === savedClubId) ? savedClubId : bookClubs[0]?.id || null;
  }
  renderPlanning();
  renderHabitsAndRoutines();
  renderToday();
  renderCalendar();
  renderWeeklyReview();
  renderStats();
  renderTodos();
  renderArticles();
  renderBookmarks();
  renderCodeSnippets();
  if (activeWorkspace === 'learning') renderLearningHub();
  renderPinnedEntries();
  renderGallery();
  renderNoteLinkPickers();
  renderBookClubList();
  if (activeWorkspace === 'timeline') renderTimeline();
  if (activeWorkspace === 'clubs' && activeClubId) await loadBookClub(activeClubId);
  renderNotifications();
  checkTaskReminders();
}

function openTodoForm(todo = null, projectId = null) {
  const form = document.getElementById('todoForm');
  form.reset();
  form.elements.id.value = todo?.id || '';
  form.elements.title.value = todo?.title || '';
  form.elements.due_date.value = todo?.due_date || '';
  form.elements.due_time.value = todo?.due_time || '';
  form.elements.recurrence.value = todo?.recurrence || 'none';
  form.elements.project_id.value = todo?.project_id || projectId || '';
  form.elements.notes.value = todo?.notes || '';
  form.elements.completed.checked = Boolean(todo?.completed);
  document.getElementById('todoDialogTitle').textContent = todo ? 'تعديل المهمة' : 'إضافة مهمة';
  document.getElementById('todoDialog').showModal();
}

function openEventForm(event = null, date = selectedCalendarDate) {
  const form = document.getElementById('eventForm');
  form.reset();
  editingEventId = event?.id || null;
  form.elements.id.value = event?.id || '';
  form.elements.title.value = event?.title || '';
  form.elements.starts_at.value = event?.starts_at || event?.occurrence_start || `${date}T09:00`;
  form.elements.ends_at.value = event?.ends_at || event?.occurrence_end || `${date}T10:00`;
  form.elements.all_day.checked = Boolean(event?.all_day);
  form.elements.recurrence.value = event?.recurrence || 'none';
  form.elements.description.value = event?.description || '';
  document.getElementById('eventDialogTitle').textContent = event ? 'تعديل الموعد' : `إضافة موعد · ${dateHeading(form.elements.starts_at.value.slice(0, 10))}`;
  document.getElementById('eventDialog').showModal();
}

function openAreaForm(area = null) {
  const form = document.getElementById('areaForm');
  form.reset();
  editingAreaId = area?.id || null;
  form.elements.name.value = area?.name || '';
  form.elements.color.value = area?.color || '#397e75';
  document.querySelector('#areaForm h2').textContent = area ? 'تعديل مجال الحياة' : 'إضافة مجال حياة';
  document.getElementById('areaDialog').showModal();
}

function openGoalForm(goal = null, areaId = null) {
  const form = document.getElementById('goalForm');
  form.reset();
  editingGoalId = goal?.id || null;
  form.elements.title.value = goal?.title || '';
  form.elements.area_id.value = goal?.area_id || areaId || '';
  form.elements.target_date.value = goal?.target_date || '';
  form.elements.status.value = goal?.status || 'active';
  form.elements.description.value = goal?.description || '';
  document.querySelector('#goalForm h2').textContent = goal ? 'تعديل الهدف' : 'إضافة هدف';
  document.getElementById('goalDialog').showModal();
}

function openProjectForm(project = null, goalId = null, areaId = null) {
  const form = document.getElementById('projectForm');
  form.reset();
  editingProjectId = project?.id || null;
  form.elements.title.value = project?.title || '';
  form.elements.goal_id.value = project?.goal_id || goalId || '';
  const selectedGoal = goals.find(goal => goal.id === Number(form.elements.goal_id.value));
  form.elements.area_id.value = project?.area_id || areaId || selectedGoal?.area_id || '';
  form.elements.next_action.value = project?.next_action || '';
  form.elements.due_date.value = project?.due_date || '';
  form.elements.status.value = project?.status || 'active';
  form.elements.description.value = project?.description || '';
  document.querySelector('#projectForm h2').textContent = project ? 'تعديل المشروع' : 'إضافة مشروع';
  document.getElementById('projectDialog').showModal();
}

function openHabitForm(habit = null) {
  const form = document.getElementById('habitForm');
  form.reset();
  editingHabitId = habit?.id || null;
  form.elements.title.value = habit?.title || '';
  form.elements.notes.value = habit?.notes || '';
  form.elements.frequency.value = habit?.frequency || 'daily';
  form.elements.target_per_week.value = habit?.target_per_week || (habit?.frequency === 'weekly' ? 3 : 7);
  document.querySelector('#habitForm h2').textContent = habit ? 'تعديل العادة' : 'إضافة عادة';
  document.getElementById('habitDialog').showModal();
}

function openRoutineForm(routine = null) {
  const form = document.getElementById('routineForm');
  form.reset();
  editingRoutineId = routine?.id || null;
  form.elements.title.value = routine?.title || '';
  form.elements.description.value = routine?.description || '';
  form.elements.steps.value = routine?.steps?.join('\n') || '';
  document.querySelector('#routineForm h2').textContent = routine ? 'تعديل الروتين' : 'إضافة روتين';
  document.getElementById('routineDialog').showModal();
}

let editingAreaId = null;

function openArticleForm(article = null, capture = {}) {
  const form = document.getElementById('articleForm');
  form.reset();
  const reviewInput = document.getElementById('articleReviewInput');
  reviewInput.classList.remove('hidden');
  document.getElementById('articleReviewPreview').classList.add('hidden');
  document.getElementById('articleReviewPreviewToggle').setAttribute('aria-pressed', 'false');
  document.getElementById('articleReviewPreviewToggle').textContent = 'معاينة';
  form.elements.id.value = article?.id || '';
  form.elements.title.value = article?.title || capture.title || '';
  form.elements.url.value = article?.url || capture.url || '';
  form.elements.description.value = article?.description || capture.description || '';
  form.elements.excerpt.value = article?.excerpt || capture.excerpt || '';
  form.elements.review.value = article?.review || '';
  form.elements.status.value = article?.status || 'unread';
  renderNoteLinkPickers();
  document.getElementById('articleDialogTitle').textContent = article ? 'مراجعة الرابط' : 'حفظ رابط';
  document.getElementById('articleDialog').showModal();
  applyMarkdownSettings(form);
}

function openBookmarkForm(bookmark = null) {
  const form = document.getElementById('bookmarkForm');
  form.reset();
  form.elements.id.value = bookmark?.id || '';
  form.elements.title.value = bookmark?.title || '';
  form.elements.url.value = bookmark?.url || '';
  form.elements.image_url.value = bookmark?.image_url || '';
  form.elements.note.value = bookmark?.note || '';
  form.elements.category.value = bookmark?.category || 'عام';
  const imagePreview = document.getElementById('bookmarkImagePreview');
  imagePreview.src = bookmark?.image_url || '';
  imagePreview.classList.toggle('hidden', !bookmark?.image_url);
  document.getElementById('bookmarkPreviewStatus').textContent = '';
  document.getElementById('bookmarkDialogTitle').textContent = bookmark ? 'تعديل الرابط' : 'حفظ رابط مهم';
  document.getElementById('bookmarkDialog').showModal();
}

function openSnippetForm(snippet = null) {
  const form = document.getElementById('snippetForm');
  form.reset();
  form.elements.id.value = snippet?.id || '';
  form.elements.title.value = snippet?.title || '';
  form.elements.language.value = snippet?.language || '';
  form.elements.description.value = snippet?.description || '';
  form.elements.code.value = snippet?.code || '';
  document.getElementById('snippetDialogTitle').textContent = snippet ? 'تعديل المقطع البرمجي' : 'حفظ مقطع برمجي';
  document.getElementById('snippetDialog').showModal();
  form.elements.title.focus();
}

function openLearningTopicForm(topic = null) {
  const form = document.getElementById('learningTopicForm');
  form.reset();
  form.elements.id.value = topic?.id || '';
  form.elements.title.value = topic?.title || '';
  form.elements.description.value = topic?.description || '';
  form.elements.status.value = topic?.status || 'exploring';
  document.getElementById('learningTopicDialogTitle').textContent = topic ? 'تعديل موضوع التعلّم' : 'موضوع تعلّم جديد';
  document.getElementById('learningTopicDialog').showModal();
  form.elements.title.focus();
}

function openLearningNoteForm(topic, note = null) {
  const form = document.getElementById('learningNoteForm');
  form.reset();
  form.elements.id.value = note?.id || '';
  form.elements.topic_id.value = topic.id;
  form.elements.title.value = note?.title || '';
  form.elements.body.value = note?.body || '';
  document.getElementById('learningNoteTopicName').textContent = topic.title;
  document.getElementById('learningNoteDialogTitle').textContent = note ? 'تعديل الملاحظة' : 'ملاحظة جديدة';
  const focusToggle = document.getElementById('learningNoteFocusToggle');
  focusToggle.setAttribute('aria-pressed', 'false');
  focusToggle.textContent = 'وضع التركيز';
  document.getElementById('learningNoteDialog').classList.remove('learning-note-focus');
  const noteUrl = new URL('/', location.origin);
  noteUrl.searchParams.set('learning-note', note?.id || 'new');
  noteUrl.searchParams.set('topic', topic.id);
  document.getElementById('learningNoteOpenTab').href = noteUrl.href;
  const body = document.getElementById('learningNoteBody');
  const preview = document.getElementById('learningNotePreview');
  body.classList.remove('hidden');
  preview.classList.add('hidden');
  document.getElementById('learningNotePreviewToggle').setAttribute('aria-pressed', 'false');
  document.getElementById('learningNoteDialog').showModal();
  form.elements.title.focus();
}

async function openRequestedLearningNote() {
  const noteId = new URLSearchParams(location.search).get('learning-note');
  if (!noteId) return;
  const topicId = Number(new URLSearchParams(location.search).get('topic'));
  const topic = learningTopics.find(entry => entry.id === topicId)
    || learningTopics.find(entry => entry.notes?.some(note => String(note.id) === noteId));
  if (!topic) {
    showToast('لم نعثر على موضوع هذه الملاحظة.');
    return;
  }
  activeLearningTopic = { id: topic.id };
  setWorkspaceView('learning');
  const detail = await api(`/api/learning/topics/${topic.id}`);
  const note = detail.notes.find(entry => String(entry.id) === noteId);
  if (!note && noteId !== 'new') {
    showToast('الملاحظة غير موجودة أو لم تعد متاحة.');
    return;
  }
  openLearningNoteForm(detail, note || null);
  document.getElementById('learningNoteDialog').classList.add('learning-note-focus');
  document.getElementById('learningNoteFocusToggle').setAttribute('aria-pressed', 'true');
  document.getElementById('learningNoteFocusToggle').textContent = 'إنهاء وضع التركيز';
  document.getElementById('learningNoteBody').focus();
}

async function pasteBookmarkUrl() {
  try {
    if (!navigator.clipboard?.readText) throw new Error('المتصفح لا يتيح قراءة الحافظة هنا.');
    const pasted = (await navigator.clipboard.readText()).trim();
    const url = new URL(pasted);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('الصق رابطاً يبدأ بـ http أو https.');
    openBookmarkForm();
    const form = document.getElementById('bookmarkForm');
    form.elements.url.value = url.href;
    form.elements.title.value = url.hostname.replace(/^www\./, '');
    form.elements.title.focus();
  } catch (error) {
    showToast(error.message || 'تعذّر قراءة الرابط من الحافظة.');
  }
}

async function processCaptureLink() {
  if (location.pathname !== '/' || !new URLSearchParams(location.hash.slice(1)).has('capture')) return;
  const params = new URLSearchParams(location.hash.slice(1));
  try {
    const encoded = params.get('capture').replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const capture = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof capture.readableText === 'string') {
      capture.excerpt = [capture.excerpt, capture.readableText].filter(Boolean).join('\n\n').slice(0, 5000);
      delete capture.readableText;
    }
    await api('/api/articles', { method: 'POST', body: JSON.stringify(capture) });
    history.replaceState(null, '', location.pathname);
    await refreshWorkspace();
    showToast('تم حفظ الصفحة في قسم المقالات.');
  } catch (error) {
    showToast(`تعذّر حفظ الصفحة: ${error.message}`);
  }
}

function toggleFormFields() {
  const isMemo = itemForm.elements.kind.value === 'memo';
  ['creatorLabel', 'progressField', 'ratingField', 'tagsField'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', isMemo);
  });
  document.getElementById('lookupTools').classList.toggle('hidden', isMemo);
  document.getElementById('lookupResults').classList.toggle('hidden', isMemo);
  document.getElementById('reviewField').classList.toggle('hidden', isMemo);
  document.getElementById('nearCompletionField').classList.toggle('hidden', isMemo);
  document.getElementById('notesLabel').firstChild.textContent = isMemo ? 'نص المذكرة (Markdown)' : 'ملاحظات شخصية (Markdown)';
}

function openItemForm(item = null) {
  editingId = item?.id ?? null;
  itemForm.reset();
  itemForm.elements.kind.value = item?.kind || 'memo';
  itemForm.elements.title.value = item?.title || '';
  itemForm.elements.creator.value = item?.creator || '';
  itemForm.elements.status.value = item?.status || 'planned';
  itemForm.elements.progress.value = item?.progress || '';
  itemForm.elements.rating.value = item?.rating || '';
  itemForm.elements.review.value = item?.review || '';
  itemForm.elements.notes.value = item?.notes || '';
  itemForm.elements.tags.value = item?.tags || '';
  itemForm.elements.cover_image.value = item?.cover_image || '';
  itemForm.elements.started_on.value = item?.started_on || '';
  itemForm.elements.finished_on.value = item?.finished_on || '';
  itemForm.elements.near_completion.checked = Boolean(item?.near_completion);
  document.getElementById('coverUpload').value = '';
  setCoverPreview(item?.cover_image || '');
  document.getElementById('coverPasteHint').textContent = item?.cover_image
    ? 'يمكنك استبدال الصورة باختيار صورة جديدة أو لصقها من الحافظة.'
    : 'يمكنك أيضاً اختيار صورة الغلاف من نتائج البحث. الحد الأقصى ٥ ميغابايت.';
  document.getElementById('lookupResults').innerHTML = '';
  document.getElementById('lookupHint').textContent = 'ابحث عن الكتاب أو الفيلم أو اللعبة قبل الحفظ.';
  document.getElementById('reviewPreview').classList.add('hidden');
  document.getElementById('reviewInput').classList.remove('hidden');
  document.getElementById('notesPreview').classList.add('hidden');
  document.getElementById('notesInput').classList.remove('hidden');
  document.getElementById('reviewPreviewToggle').setAttribute('aria-pressed', 'false');
  document.getElementById('reviewPreviewToggle').textContent = 'معاينة';
  document.querySelector('[data-preview="notes"]').textContent = 'معاينة الملاحظات';
  document.getElementById('dialogTitle').textContent = item ? 'تعديل العنصر' : 'إضافة إلى مذكرتي';
  toggleFormFields();
  itemDialog.showModal();
  itemForm.elements.title.focus();
}

function openLookupPanel() {
  document.getElementById('lookupPanel').classList.add('is-open');
  document.getElementById('lookupBackdrop').classList.remove('hidden');
  document.getElementById('lookupPanel').setAttribute('aria-hidden', 'false');
  document.getElementById('panelQuery').focus();
}

function closeLookupPanel() {
  document.getElementById('lookupPanel').classList.remove('is-open');
  document.getElementById('lookupBackdrop').classList.add('hidden');
  document.getElementById('lookupPanel').setAttribute('aria-hidden', 'true');
}

async function searchPanel() {
  const kind = document.getElementById('panelKind').value;
  const query = document.getElementById('panelQuery').value.trim();
  if (!query) {
    showToast('اكتب عنواناً للبحث.');
    return;
  }
  const button = document.getElementById('panelSearchButton');
  button.disabled = true;
  document.getElementById('panelHint').textContent = 'جارٍ البحث...';
  document.getElementById('panelResults').innerHTML = '';
  try {
    lookupResults = await api(`/api/lookup?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query)}`);
    if (!lookupResults.length) {
      document.getElementById('panelHint').textContent = 'لم نعثر على نتائج. جرّب عنواناً آخر.';
      return;
    }
    document.getElementById('panelHint').textContent = 'اختر نتيجة لإضافتها إلى مكتبتك.';
    document.getElementById('panelResults').innerHTML = lookupResults.map((result, index) => `
      <button type="button" class="lookup-result" data-panel-result="${index}">
        ${result.image ? `<img src="${escapeHtml(result.image)}" alt="" loading="lazy">` : ''}
        <span><strong>${escapeHtml(result.title)}</strong>
          <small>${escapeHtml([result.creator, result.year, result.source].filter(Boolean).join(' · '))}</small>
          ${result.description ? `<small class="lookup-description">${escapeHtml(result.description)}</small>` : ''}
        </span>
      </button>`).join('');
    applyAutoDirection(document.getElementById('panelResults'));
  } catch (error) {
    document.getElementById('panelHint').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function detailMarkdownSection(field, label, value, placeholder) {
  return `<section class="detail-content detail-markdown-section" data-detail-markdown-section="${field}">
    <div class="detail-section-heading"><h2>${label}</h2>${iconButton('edit', `تعديل ${label}`, `data-detail-field-edit="${field}"`)}</div>
    <div class="review">${value ? renderRichText(value) : `<p class="detail-empty">${placeholder}</p>`}</div>
  </section>`;
}

function openDetailMarkdownEditor(section, field) {
  const label = field === 'review' ? 'المراجعة' : detailItem.kind === 'memo' ? 'نص المذكرة' : 'الملاحظات الشخصية';
  const maxLength = field === 'review' ? 5000 : 10000;
  section.innerHTML = `<div class="detail-section-heading"><h2>تعديل ${label}</h2></div>
    <div class="detail-markdown-editor markdown-field">
      <div class="markdown-toolbar detail-markdown-toolbar">
        <button type="button" data-detail-format="bold" title="نص عريض" aria-label="نص عريض"><strong>B</strong></button>
        <button type="button" data-detail-format="heading" title="عنوان" aria-label="إضافة عنوان">H</button>
        <button type="button" data-detail-format="list" title="قائمة" aria-label="إضافة قائمة">☷</button>
        <button type="button" data-detail-format="quote" title="اقتباس" aria-label="إضافة اقتباس">❞</button>
        <button type="button" data-detail-format="code" title="مقطع برمجي" aria-label="إضافة مقطع برمجي">&lt;/&gt;</button>
        <button type="button" data-detail-format="link" title="رابط" aria-label="إضافة رابط">↗</button>
        <select data-backlink-picker data-current-target="item:${detailItem.id}" aria-label="ربط بملاحظة"></select>
        <button type="button" data-detail-preview-toggle aria-pressed="false">معاينة</button>
      </div>
      <textarea class="detail-markdown-input" dir="auto" rows="10" maxlength="${maxLength}" aria-label="تحرير ${label}">${escapeHtml(detailItem[field] || '')}</textarea>
      <div class="detail-markdown-preview hidden"></div>
    </div>
    <div class="detail-editor-actions">
      <button class="button button-quiet" type="button" data-detail-edit-cancel>إلغاء</button>
      <button class="button button-primary" type="button" data-detail-edit-save="${field}">حفظ التغييرات</button>
    </div>`;
  renderNoteLinkPickers();
  section.querySelector('textarea').focus();
  applyMarkdownSettings(section);
  const editor = section.querySelector('textarea');
  editor.addEventListener('dragover', event => {
    if (!markdownImagePasteEnabled) return;
    event.preventDefault();
    editor.classList.add('is-drop-target');
  });
  editor.addEventListener('dragleave', event => {
    if (!editor.contains(event.relatedTarget)) editor.classList.remove('is-drop-target');
  });
  editor.addEventListener('drop', async event => {
    if (!markdownImagePasteEnabled) return;
    event.preventDefault();
    editor.classList.remove('is-drop-target');
    for (const file of [...(event.dataTransfer?.files || [])].filter(candidate => candidate.type.startsWith('image/'))) {
      await insertUploadedImage(file, editor);
    }
  });
}

async function loadDetailPage() {
  const library = document.querySelector('.library');
  const detailPage = document.getElementById('detailPage');
  document.querySelector('.app-layout').classList.add('detail-mode');
  document.querySelector('.welcome').classList.add('hidden');
  document.getElementById('workspaceNav').classList.add('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  statsElement.classList.add('hidden');
  document.querySelectorAll('.workspace-section').forEach(section => section.classList.add('hidden'));
  document.getElementById('overdueNotice').classList.add('hidden');
  library.classList.add('hidden');
  detailPage.classList.remove('hidden');
  try {
    detailItem = await api(`/api/items/${detailItemId}`);
    chapterRows = detailItem.kind === 'book' ? await api(`/api/items/${detailItemId}/chapters`) : [];
    const audioRows = await api(`/api/items/${detailItemId}/audio`);
    document.title = `${detailItem.title} - مذكرتي`;
    const cover = detailItem.cover_image
      ? `<img class="detail-cover" src="${escapeHtml(detailItem.cover_image)}" alt="غلاف ${escapeHtml(detailItem.title)}">`
      : '';
    const chapters = detailItem.kind === 'book' ? `
      <section id="chapters" class="chapters-section">
        <div class="detail-section-heading"><div><p class="eyebrow">قراءة وملاحظات</p><h2>فصول الكتاب</h2></div>
          <button id="addChapterButton" class="button button-primary" type="button">＋ إضافة فصل</button>
        </div>
        <div class="chapter-list">${chapterRows.length ? chapterRows.map(chapterCard).join('') : '<div class="empty">أضف فصلاً لبدء جمع ملاحظات القراءة.</div>'}</div>
      </section>` : '';
    const audio = `
      <section class="detail-content audio-section">
        <div class="detail-section-heading">
          <div><p class="eyebrow">ملفاتك الخاصة</p><h2>التسجيلات والملفات الصوتية</h2></div>
          <label class="button button-primary audio-upload-label">＋ رفع صوت
            <input id="audioUpload" class="hidden" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/flac,audio/aac" multiple>
          </label>
        </div>
        <p class="field-hint">MP3، M4A، WAV، OGG، WebM، FLAC أو AAC؛ حتى ١٠٠ ميغابايت لكل ملف.</p>
        <p id="audioUploadStatus" class="audio-upload-status" role="status"></p>
        <div class="audio-list">${audioRows.length ? audioRows.map(audioCard).join('') : '<p class="item-creator">لم تُرفع ملفات صوتية لهذا العنصر بعد.</p>'}</div>
      </section>`;
    detailPage.innerHTML = `
      <a class="back-link" href="/">← العودة إلى المكتبة</a>
      <article class="detail-card">
        <div class="detail-header">${cover}<div class="detail-heading">
          <span class="item-type">${KIND_ICONS[detailItem.kind]} ${KIND_LABELS[detailItem.kind]}</span>
          <h1 dir="auto">${escapeHtml(detailItem.title)}</h1>
          ${detailItem.creator ? `<p class="item-creator">${escapeHtml(detailItem.creator)}</p>` : ''}
          <span class="status status-${detailItem.status}">${STATUS_LABELS[detailItem.status]}</span>
          ${pinButton('item', detailItem.id, detailItem.title)}
          ${iconButton('edit', 'تعديل بيانات العنصر', 'id="editDetailButton"')}
        </div></div>
        ${detailItem.kind !== 'memo' ? detailMarkdownSection('review', 'المراجعة', detailItem.review, 'أضف مراجعتك هنا مباشرة.') : ''}
        ${detailItem.notes || detailItem.kind === 'memo' ? detailMarkdownSection(
          'notes', detailItem.kind === 'memo' ? 'نص المذكرة' : 'ملاحظات شخصية', detailItem.notes, 'أضف ملاحظاتك هنا مباشرة.',
        ) : ''}
        ${detailItem.progress ? `<section class="detail-content"><h2>التقدم</h2><p>${escapeHtml(detailItem.progress)}</p></section>` : ''}
        ${audio}
        ${chapters}
        <section class="detail-content backlinks-panel"><div class="backlinks-heading"><h2>روابط عائدة</h2><span>ملاحظات تشير إلى هذا العنصر</span></div><div id="detailBacklinks"></div></section>
      </article>`;
    applyAutoDirection(detailPage);
    applyMarkdownSettings(detailPage);
    renderBacklinks(document.getElementById('detailBacklinks'), 'item', detailItem.id);
    detailPage.querySelectorAll('[data-detail-field-edit]').forEach(button => {
      button.addEventListener('click', () => {
        const section = button.closest('[data-detail-markdown-section]');
        if (section) openDetailMarkdownEditor(section, button.dataset.detailFieldEdit);
      });
    });
    document.getElementById('audioUpload').addEventListener('change', uploadAudioFiles);
    detailPage.querySelectorAll('[data-audio-delete]').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await api(`/api/items/${detailItemId}/audio/${button.dataset.audioDelete}`, { method: 'DELETE' });
          await loadDetailPage();
        } catch (error) { showToast(error.message); }
      });
    });
    document.getElementById('editDetailButton').addEventListener('click', () => beginInlineEdit(detailItem, detailPage));
    if (detailItem.kind === 'book') {
      document.getElementById('addChapterButton').addEventListener('click', () => openChapterForm());
      detailPage.querySelectorAll('[data-chapter-edit]').forEach(button => {
        button.addEventListener('click', () => openChapterForm(chapterRows.find(chapter => chapter.id === Number(button.dataset.chapterEdit))));
      });
      detailPage.querySelectorAll('[data-chapter-delete]').forEach(button => {
        button.addEventListener('click', async () => {
          if (!window.confirm('حذف هذا الفصل وملاحظاته؟')) return;
          try {
            await api(`/api/items/${detailItemId}/chapters/${button.dataset.chapterDelete}`, { method: 'DELETE' });
            await loadDetailPage();
          } catch (error) { showToast(error.message); }
        });
      });
    }

  } catch (error) {
    detailPage.innerHTML = `<div class="empty"><strong>تعذّر فتح العنصر</strong>${escapeHtml(error.message)}<p><a href="/">العودة إلى المكتبة</a></p></div>`;
  }
}

function audioCard(audio) {
  return `<article class="audio-card">
    <div class="audio-card-heading"><strong dir="auto">${escapeHtml(audio.display_name)}</strong>
      <span>${(audio.size / (1024 * 1024)).toFixed(1)} MB</span>
      ${iconButton('delete', `حذف الملف الصوتي ${audio.display_name}`, `data-audio-delete="${audio.id}"`)}
    </div>
    <audio controls preload="metadata" src="${escapeHtml(audio.url)}"></audio>
  </article>`;
}

async function uploadAudioFiles(event) {
  const input = event.currentTarget;
  const files = [...input.files];
  if (!files.length) return;
  const form = new FormData();
  files.forEach(file => form.append('audioFiles', file));
  const status = document.getElementById('audioUploadStatus');
  status.textContent = 'جارٍ رفع الملفات الصوتية...';
  input.disabled = true;
  try {
    const response = await fetch(`/api/items/${detailItemId}/audio`, { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'تعذّر رفع الملفات الصوتية.');
    status.textContent = 'تم رفع الملفات بنجاح.';
    await loadDetailPage();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    input.disabled = false;
    input.value = '';
  }
}

async function initializeSession() {
  try {
    const statusResponse = await fetch('/api/auth/status');
    if (!statusResponse.ok) throw new Error('تعذّر الاتصال بالخادم.');
    hasRegisteredUsers = (await statusResponse.json()).hasUsers;
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      showAuthentication(null);
      setAuthMode(hasRegisteredUsers ? 'login' : 'register', hasRegisteredUsers);
      return;
    }
    const { user } = await response.json();
    showAuthentication(user);
  } catch (error) {
    showAuthentication(null, error.message);
    setAuthMode(hasRegisteredUsers ? 'login' : 'register', hasRegisteredUsers);
    return;
  }
  try {
    await loadAccountSettings();
    await refresh();
    await openRequestedLearningNote();
    await processCaptureLink();
    await processBookClubInvite();
  } catch (error) {
    showToast(error.message);
  }
}

function renderBackupList(backups) {
  const list = document.getElementById('backupList');
  list.innerHTML = backups.length ? backups.map(backup => `
    <div class="backup-entry">
      <span><strong dir="ltr">${escapeHtml(backup.filename)}</strong><small>${(backup.size / (1024 * 1024)).toFixed(2)} MB · ${new Date(backup.createdAt).toLocaleString()}</small></span>
      <a class="small-button" href="/api/backups/${encodeURIComponent(backup.filename)}">تنزيل</a>
    </div>`).join('') : '<p class="field-hint">لا توجد نسخ احتياطية بعد.</p>';
}

async function loadAccountSettings() {
  const settings = await api('/api/settings');
  language = settings.language;
  applyLanguage(language);
  document.querySelector('#settingsForm [name="language"]').value = language;
  document.querySelector('#settingsForm [name="financeCurrency"]').value = settings.financeCurrency || 'EGP';
  prayerLocation = {
    latitude: settings.prayerLatitude,
    longitude: settings.prayerLongitude,
    label: settings.prayerLocation,
    method: settings.prayerMethod,
  };
  document.querySelector('#settingsForm [name="prayerLatitude"]').value = prayerLocation.latitude ?? '';
  document.querySelector('#settingsForm [name="prayerLongitude"]').value = prayerLocation.longitude ?? '';
  document.querySelector('#settingsForm [name="prayerLocation"]').value = prayerLocation.label;
  document.querySelector('#settingsForm [name="prayerMethod"]').value = String(prayerLocation.method);
  renderPrayerTimes();
  loadPrayerTimes();
  if (!prayerTimesRefreshTimer) prayerTimesRefreshTimer = setInterval(() => loadPrayerTimes(true), 30 * 60 * 1000);
  editMode = settings.editMode;
  document.querySelector('#settingsForm [name="editMode"]').value = editMode;
  const legacyTheme = localStorage.getItem('personal-memo-theme');
  themeMode = settings.themeMode === 'system' && legacyTheme ? legacyTheme : settings.themeMode;
  document.querySelector('#settingsForm [name="themeMode"]').value = themeMode;
  notificationsEnabled = settings.notificationsEnabled;
  document.querySelector('#settingsForm [name="notificationsEnabled"]').checked = notificationsEnabled;
  notificationSoundEnabled = settings.notificationSoundEnabled;
  document.querySelector('#settingsForm [name="notificationSoundEnabled"]').checked = notificationSoundEnabled;
  markdownRenderingEnabled = settings.markdownRenderingEnabled;
  markdownToolbarEnabled = settings.markdownToolbarEnabled;
  markdownImagePasteEnabled = settings.markdownImagePasteEnabled;
  document.querySelector('#settingsForm [name="markdownRenderingEnabled"]').checked = markdownRenderingEnabled;
  document.querySelector('#settingsForm [name="markdownToolbarEnabled"]').checked = markdownToolbarEnabled;
  document.querySelector('#settingsForm [name="markdownImagePasteEnabled"]').checked = markdownImagePasteEnabled;
  fontSizeOffset = settings.fontSizeOffset;
  lineSpacing = settings.lineSpacing;
  fontFamily = settings.fontFamily;
  shortcuts = settings.shortcuts;
  document.querySelector('#settingsForm [name="fontSizeOffset"]').value = String(fontSizeOffset);
  document.querySelector('#settingsForm [name="lineSpacing"]').value = lineSpacing;
  document.querySelector('#settingsForm [name="fontFamily"]').value = fontFamily;
  for (const [action, name] of Object.entries({
    todo: 'shortcutTodo',
    dailyNote: 'shortcutDailyNote',
    readLater: 'shortcutReadLater',
    quickCreate: 'shortcutQuickCreate',
  })) {
    const select = document.querySelector(`#settingsForm [name="${name}"]`);
    select.innerHTML = shortcutChoices.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    select.value = shortcuts[action];
  }
  applyTypographySettings();
  applyMarkdownSettings();
  reminderMinutes = settings.reminderMinutes;
  document.querySelector('#settingsForm [name="reminderMinutes"]').value = String(reminderMinutes);
  setTheme(themeMode);
  document.getElementById('backupSettings').classList.toggle('hidden', !settings.isOwner);
  document.querySelector('#settingsForm [name="dailyBackupEnabled"]').checked = settings.dailyBackupEnabled === true;
  document.querySelector('#settingsForm [name="s3Enabled"]').checked = settings.s3?.enabled === true;
  document.querySelector('#settingsForm [name="s3Bucket"]').value = settings.s3?.bucket || '';
  document.querySelector('#settingsForm [name="s3Region"]').value = settings.s3?.region || 'us-east-1';
  document.querySelector('#settingsForm [name="s3Prefix"]').value = settings.s3?.prefix || 'personal-memo';
  renderBackupList(settings.backups);
}

async function openSettings() {
  try {
    await loadAccountSettings();
    document.getElementById('settingsMessage').textContent = '';
    document.getElementById('settingsDialog').showModal();
  } catch (error) {
    showToast(error.message);
  }
}

async function createBackup() {
  const button = document.getElementById('backupNow');
  const message = document.getElementById('settingsMessage');
  button.disabled = true;
  message.textContent = 'جارٍ إنشاء نسخة احتياطية...';
  try {
    const backup = await api('/api/backups', { method: 'POST' });
    const backups = await api('/api/backups');
    renderBackupList(backups);
    message.textContent = `تم إنشاء النسخة ${backup.filename}`;
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function restoreBackup() {
  const input = document.getElementById('backupUpload');
  const [file] = input.files;
  const message = document.getElementById('settingsMessage');
  if (!file) {
    message.textContent = 'اختر ملف نسخة احتياطية أولاً.';
    return;
  }
  const isArchive = file.name.toLocaleLowerCase().endsWith('.zip');
  const replacement = isArchive ? 'قاعدة البيانات والصور والملفات الصوتية' : 'قاعدة البيانات فقط';
  if (!window.confirm(`سيتم استبدال ${replacement} الحالية بمحتوى "${file.name}". سيُنشأ أرشيف أمان كامل أولاً، وستحتاج إلى تسجيل الدخول مجدداً بحساب موجود في النسخة. هل تريد المتابعة؟`)) return;

  const button = document.getElementById('restoreBackup');
  const form = new FormData();
  form.append('backup', file);
  button.disabled = true;
  input.disabled = true;
  message.textContent = 'جارٍ التحقق من النسخة وإنشاء نسخة أمان قبل الاستعادة...';
  try {
    const response = await fetch(isArchive ? '/api/backups/restore-archive' : '/api/backups/restore', { method: 'POST', body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'تعذّرت استعادة النسخة.');
    window.alert(`${result.message}\nنسخة الأمان الحالية: ${result.safetyBackup}`);
    window.location.assign('/');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    input.disabled = false;
  }
}

function chapterCard(chapter) {
  return `<article class="chapter-card">
    <div class="chapter-heading"><div><span class="chapter-number">الفصل ${arabicNumber(chapter.position)}</span><h3>${escapeHtml(chapter.title)}</h3></div>
      <div class="chapter-actions">${iconButton('edit', `تعديل الفصل ${chapter.title}`, `data-chapter-edit="${chapter.id}"`)}
      ${iconButton('delete', `حذف الفصل ${chapter.title}`, `data-chapter-delete="${chapter.id}"`)}</div>
    </div>
    ${chapter.notes ? `<div class="review chapter-notes">${renderRichText(chapter.notes)}</div>` : '<p class="item-creator">لا توجد ملاحظات لهذا الفصل بعد.</p>'}
  </article>`;
}

function openChapterForm(chapter = null) {
  editingChapterId = chapter?.id ?? null;
  const form = document.getElementById('chapterForm');
  form.reset();
  form.elements.title.value = chapter?.title || '';
  form.elements.notes.value = chapter?.notes || '';
  document.getElementById('chapterDialogTitle').textContent = chapter ? 'تعديل الفصل' : 'إضافة فصل';
  document.getElementById('chapterDialog').showModal();
}

async function insertUploadedImage(file, textarea) {
  try {
    const url = await uploadImage(file);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const suffix = after && !after.startsWith('\n') ? '\n' : '';
    insertAtCursor(textarea, `${prefix}![${file.name.replace(/[\]\r\n]/g, '')}](${url})${suffix}`);
  } catch (error) {
    showToast(error.message);
  }
}

function setCoverPreview(url) {
  const preview = document.getElementById('coverPreview');
  preview.classList.toggle('hidden', !url);
  preview.src = url || '';
  document.getElementById('removeCover').classList.toggle('hidden', !url);
}

async function uploadImage(file) {
  const response = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'تعذّر رفع الصورة.');
  return data.url;
}

async function handleCoverFile(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    document.getElementById('coverPasteHint').textContent = 'اختر صورة بصيغة JPG أو PNG أو WebP أو GIF.';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    document.getElementById('coverPasteHint').textContent = 'حجم الصورة يتجاوز الحد الأقصى البالغ ٥ ميغابايت.';
    return;
  }
  const hint = document.getElementById('coverPasteHint');
  hint.textContent = 'جارٍ رفع صورة الغلاف...';
  try {
    const url = await uploadImage(file);
    itemForm.elements.cover_image.value = url;
    setCoverPreview(url);
    hint.textContent = 'تمت إضافة صورة الغلاف.';
  } catch (error) {
    hint.textContent = error.message;
    showToast(error.message);
  }
}

async function pasteCoverFromClipboard() {
  const hint = document.getElementById('coverPasteHint');
  if (!navigator.clipboard?.read) {
    hint.textContent = 'انقر داخل منطقة الصورة ثم الصق بـ Ctrl+V أو ⌘+V.';
    document.getElementById('coverPasteTarget').focus();
    return;
  }
  try {
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find(type => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type));
      if (!imageType) continue;
      await handleCoverFile(await item.getType(imageType));
      return;
    }
    hint.textContent = 'لا توجد صورة في الحافظة. انسخ صورة ثم جرّب مرة أخرى.';
  } catch (error) {
    hint.textContent = 'تعذّر قراءة الحافظة. انقر داخل منطقة الصورة ثم الصق بـ Ctrl+V أو ⌘+V.';
    document.getElementById('coverPasteTarget').focus();
  }
}

async function lookupMetadata() {
  const kind = itemForm.elements.kind.value;
  const query = document.getElementById('itemTitle').value.trim();
  if (!query || kind === 'memo') {
    showToast('اكتب عنواناً أولاً واختر كتاباً أو لعبة أو فيلماً.');
    return;
  }
  const button = document.getElementById('lookupButton');
  const results = document.getElementById('lookupResults');
  button.disabled = true;
  document.getElementById('lookupHint').textContent = 'جارٍ البحث...';
  results.innerHTML = '';
  try {
    lookupResults = await api(`/api/lookup?kind=${encodeURIComponent(kind)}&q=${encodeURIComponent(query)}`);
    if (!lookupResults.length) {
      document.getElementById('lookupHint').textContent = 'لم نعثر على نتائج. يمكنك متابعة الإدخال يدوياً.';
      return;
    }
    document.getElementById('lookupHint').textContent = 'اختر نتيجة لملء العنوان والمؤلف وإضافة صورة الغلاف.';
    results.innerHTML = lookupResults.map((result, index) => `
      <button type="button" class="lookup-result" data-result="${index}">
        ${result.image ? `<img src="${escapeHtml(result.image)}" alt="" loading="lazy">` : ''}
        <span><strong>${escapeHtml(result.title)}</strong>
          <small>${escapeHtml([result.creator, result.year, result.source].filter(Boolean).join(' · '))}</small>
          ${result.description ? `<small class="lookup-description">${escapeHtml(result.description)}</small>` : ''}
        </span>
      </button>
    `).join('');
    applyAutoDirection(results);
  } catch (error) {
    document.getElementById('lookupHint').textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.setRangeText(text, start, end, 'end');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

async function openProgress(id) {
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  trackingId = id;
  document.getElementById('progressTitle').textContent = item.title;
  progressForm.reset();
  progressForm.elements.progress.value = item.progress || '';
  const history = await api(`/api/items/${id}/progress`);
  document.getElementById('progressHistory').innerHTML = history.length
    ? history.map(entry => `<article class="history-entry"><strong>${escapeHtml(entry.progress)}</strong><time>${new Date(entry.logged_at).toLocaleString(formatLocale())}</time>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}</article>`).join('')
    : '<p class="item-creator">سيظهر سجل جلساتك هنا بعد أول تحديث.</p>';
  applyAutoDirection(progressDialog);
  progressDialog.showModal();
  progressForm.elements.progress.focus();
}

document.getElementById('addArticleButton').addEventListener('click', () => openArticleForm());
document.getElementById('addBookmarkButton').addEventListener('click', () => openBookmarkForm());
document.getElementById('addSnippetButton').addEventListener('click', () => openSnippetForm());
document.getElementById('addLearningTopic').addEventListener('click', () => openLearningTopicForm());
document.getElementById('learningSearch').addEventListener('input', () => {
  activeLearningTopic = null;
  renderLearningHub();
});
document.getElementById('learningTopicList').addEventListener('click', event => {
  const button = event.target.closest('[data-learning-topic]');
  if (!button) return;
  activeLearningTopic = { id: Number(button.dataset.learningTopic) };
  renderLearningHub();
});
document.getElementById('learningTopicContent').addEventListener('click', async event => {
  if (event.target.closest('[data-learning-create-topic]')) return openLearningTopicForm();
  const editTopic = event.target.closest('[data-learning-edit-topic]');
  if (editTopic) return openLearningTopicForm(learningTopics.find(topic => topic.id === Number(editTopic.dataset.learningEditTopic)));
  const addNote = event.target.closest('[data-learning-add-note]');
  if (addNote && activeLearningTopic) return openLearningNoteForm(activeLearningTopic);
  const editNote = event.target.closest('[data-learning-edit-note]');
  if (editNote && activeLearningTopic) {
    const note = activeLearningTopic.notes.find(entry => entry.id === Number(editNote.dataset.learningEditNote));
    if (note) openLearningNoteForm(activeLearningTopic, note);
    return;
  }
  const deleteTopic = event.target.closest('[data-learning-delete-topic]');
  if (deleteTopic && activeLearningTopic && window.confirm(`حذف موضوع "${activeLearningTopic.title}" وكل ملاحظاته وملفاته؟`)) {
    try {
      await api(`/api/learning/topics/${activeLearningTopic.id}`, { method: 'DELETE' });
      activeLearningTopic = null;
      learningTopics = await api('/api/learning/topics');
      renderLearningHub();
      showToast('تم حذف الموضوع ومحتوياته.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  const deleteNote = event.target.closest('[data-learning-delete-note]');
  if (deleteNote && activeLearningTopic) {
    const note = activeLearningTopic.notes.find(entry => entry.id === Number(deleteNote.dataset.learningDeleteNote));
    if (!note || !window.confirm(`حذف الملاحظة "${note.title}" وملفاتها؟`)) return;
    try {
      await api(`/api/learning/notes/${note.id}`, { method: 'DELETE' });
      learningTopics = await api('/api/learning/topics');
      await renderLearningHub();
      showToast('تم حذف الملاحظة.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  const deleteFile = event.target.closest('[data-learning-delete-file]');
  if (deleteFile && window.confirm('حذف هذا الملف؟')) {
    try {
      await api(`/api/learning/files/${deleteFile.dataset.learningDeleteFile}`, { method: 'DELETE' });
      learningTopics = await api('/api/learning/topics');
      await renderLearningHub();
      showToast('تم حذف الملف.');
    } catch (error) {
      showToast(error.message);
    }
  }
});
document.getElementById('learningTopicForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.id;
  delete values.id;
  try {
    const topic = await api(id ? `/api/learning/topics/${id}` : '/api/learning/topics', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    activeLearningTopic = { id: topic.id };
    learningTopics = await api('/api/learning/topics');
    document.getElementById('learningTopicDialog').close();
    await renderLearningHub();
    showToast(id ? 'تم تحديث الموضوع.' : 'تم إنشاء الموضوع.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('learningNoteForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const id = values.get('id');
  const topicId = values.get('topic_id');
  const files = [...form.elements.files.files];
  const noteData = { title: values.get('title'), body: values.get('body') };
  try {
    const note = await api(id ? `/api/learning/notes/${id}` : `/api/learning/topics/${topicId}/notes`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(noteData),
    });
    form.elements.id.value = note.id;
    const noteUrl = new URL(location.href);
    if (noteUrl.searchParams.has('learning-note')) {
      noteUrl.searchParams.set('learning-note', note.id);
      noteUrl.searchParams.set('topic', topicId);
      history.replaceState(null, '', noteUrl);
    }
    if (files.length) {
      const attachments = new FormData();
      files.forEach(file => attachments.append('files', file));
      try {
        await api(`/api/learning/notes/${note.id}/files`, { method: 'POST', body: attachments });
      } catch (error) {
        learningTopics = await api('/api/learning/topics');
        activeLearningTopic = { id: Number(topicId) };
        await renderLearningHub();
        showToast(`تم حفظ الملاحظة، لكن تعذّر رفع الملفات: ${error.message}`);
        return;
      }
    }
    learningTopics = await api('/api/learning/topics');
    activeLearningTopic = { id: Number(topicId) };
    document.getElementById('learningNoteDialog').close();
    await renderLearningHub();
    showToast('تم حفظ الملاحظة والملفات.');
  } catch (error) {
    showToast(error.message);
  }
});
document.querySelectorAll('[data-learning-format]').forEach(button => {
  button.addEventListener('click', () => insertAtCursor(document.getElementById('learningNoteBody'), button.dataset.learningFormat));
});
document.getElementById('learningNotePreviewToggle').addEventListener('click', event => {
  const body = document.getElementById('learningNoteBody');
  const preview = document.getElementById('learningNotePreview');
  const showing = preview.classList.toggle('hidden') === false;
  body.classList.toggle('hidden', showing);
  preview.innerHTML = showing ? renderRichText(body.value) : '';
  event.currentTarget.setAttribute('aria-pressed', String(showing));
  event.currentTarget.textContent = showing ? 'تحرير' : 'معاينة';
});
document.getElementById('learningNoteFocusToggle').addEventListener('click', event => {
  const dialog = document.getElementById('learningNoteDialog');
  const focused = dialog.classList.toggle('learning-note-focus');
  event.currentTarget.setAttribute('aria-pressed', String(focused));
  event.currentTarget.textContent = focused ? 'إنهاء وضع التركيز' : 'وضع التركيز';
});
document.getElementById('learningNoteDialog').addEventListener('close', event => {
  event.currentTarget.classList.remove('learning-note-focus');
});
document.getElementById('learningTopicContent').addEventListener('change', async event => {
  const input = event.target.closest('[data-learning-upload]');
  if (!input || !input.files.length) return;
  const formData = new FormData();
  [...input.files].forEach(file => formData.append('files', file));
  input.disabled = true;
  try {
    await api(`/api/learning/notes/${input.dataset.learningUpload}/files`, { method: 'POST', body: formData });
    learningTopics = await api('/api/learning/topics');
    await renderLearningHub();
    showToast('تم إرفاق الملفات.');
  } catch (error) {
    showToast(error.message);
  } finally {
    input.disabled = false;
  }
});
document.getElementById('pasteBookmarkButton').addEventListener('click', pasteBookmarkUrl);
document.getElementById('bookmarkSearch').addEventListener('input', renderBookmarks);
document.getElementById('bookmarkCategories').addEventListener('click', event => {
  const button = event.target.closest('[data-bookmark-category]');
  if (!button) return;
  bookmarkCategoryFilter = button.dataset.bookmarkCategory;
  renderBookmarks();
});
document.getElementById('snippetSearch').addEventListener('input', renderCodeSnippets);
document.getElementById('snippetLanguageFilters').addEventListener('click', event => {
  const button = event.target.closest('[data-snippet-language]');
  if (!button) return;
  snippetLanguageFilter = button.dataset.snippetLanguage;
  renderCodeSnippets();
});
document.getElementById('articleStatusFilters').addEventListener('click', event => {
  const button = event.target.closest('[data-article-filter]');
  if (!button) return;
  articleFilter = button.dataset.articleFilter;
  renderArticles();
});
document.getElementById('dailyNoteForm').addEventListener('submit', async event => {
  event.preventDefault();
  clearTimeout(dailyNoteSaveTimer);
  await saveDailyNote();
});
document.getElementById('dailyNoteForm').addEventListener('input', event => {
  if (event.target.matches('input[name="title"], textarea[name="body"]')) {
    dailyNoteDirty = true;
    dailyNoteVersion += 1;
    document.getElementById('dailyNoteSaveStatus').textContent = 'تُحفظ تغييراتك تلقائياً...';
    clearTimeout(dailyNoteSaveTimer);
    dailyNoteSaveTimer = setTimeout(saveDailyNote, 1000);
  }
});
document.getElementById('dailyNoteDate').addEventListener('change', async event => {
  const nextDate = event.currentTarget.value;
  if (!nextDate) return;
  clearTimeout(dailyNoteSaveTimer);
  if (dailyNoteDirty) await saveDailyNote();
  if (dailyNote?.note_date !== nextDate) loadDailyNote(nextDate);
});
document.querySelectorAll('[data-daily-format]').forEach(button => {
  button.addEventListener('click', () => insertAtCursor(document.getElementById('dailyNoteBody'), button.dataset.dailyFormat));
});
document.querySelectorAll('[data-daily-prompt]').forEach(button => {
  button.addEventListener('click', () => insertAtCursor(document.getElementById('dailyNoteBody'), button.dataset.dailyPrompt));
});
document.getElementById('dailyNoteLinkPicker').addEventListener('change', event => insertNoteLink(event.currentTarget));
document.getElementById('dailyNoteFocusToggle').addEventListener('click', event => {
  setWritingFocusMode(!document.querySelector('.app-layout').classList.contains('writing-focus-mode'));
});
document.getElementById('focusModeToggle').addEventListener('click', () => {
  setWritingFocusMode(!document.querySelector('.app-layout').classList.contains('writing-focus-mode'));
});
document.getElementById('dailyNoteImageButton').addEventListener('click', () => document.getElementById('dailyNoteImageUpload').click());
document.getElementById('dailyNoteImageUpload').addEventListener('change', async event => {
  const [file] = event.currentTarget.files;
  if (file) await insertUploadedImage(file, document.getElementById('dailyNoteBody'));
  event.currentTarget.value = '';
});
document.getElementById('dailyNotePreviewToggle').addEventListener('click', event => {
  const preview = document.getElementById('dailyNotePreview');
  const input = document.getElementById('dailyNoteBody');
  const showing = preview.classList.contains('hidden');
  preview.innerHTML = renderRichText(input.value);
  preview.classList.toggle('hidden', !showing);
  input.classList.toggle('hidden', showing);
  event.currentTarget.setAttribute('aria-pressed', String(showing));
  event.currentTarget.textContent = showing ? 'تحرير' : 'معاينة';
});
document.getElementById('galleryUploadButton').addEventListener('click', () => document.getElementById('galleryUploadInput').click());
document.getElementById('galleryUploadInput').addEventListener('change', async event => {
  const files = [...event.currentTarget.files];
  event.currentTarget.value = '';
  if (!files.length) return;
  if (files.some(file => !file.type.startsWith('image/'))) return showToast('اختر صور JPG أو PNG أو WebP أو GIF فقط.');
  const category = document.getElementById('galleryUploadCategory').value.trim() || 'شخصي';
  const caption = document.getElementById('galleryUploadCaption').value.trim();
  const button = document.getElementById('galleryUploadButton');
  button.disabled = true;
  button.textContent = 'جارٍ رفع الصور...';
  try {
    for (const file of files) {
      await api('/api/gallery', {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type,
          'X-Image-Category': encodeURIComponent(category),
          'X-Image-Caption': encodeURIComponent(caption),
        },
      });
    }
    galleryImages = await api('/api/gallery');
    galleryActiveFilter = category;
    renderGallery();
    showToast(files.length === 1 ? 'أُضيفت الصورة إلى معرضك.' : `أُضيفت ${arabicNumber(files.length)} صور إلى معرضك.`);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '＋ إضافة صورة';
  }
});
document.getElementById('galleryCategoryFilter').addEventListener('change', event => {
  galleryActiveFilter = event.currentTarget.value;
  renderGallery();
});
document.getElementById('galleryGrid').addEventListener('click', async event => {
  const open = event.target.closest('[data-gallery-open]');
  if (open) return openGalleryViewer(open.dataset.galleryOpen);
  const remove = event.target.closest('[data-gallery-remove]');
  if (!remove || !window.confirm('إزالة هذه الصورة من المعرض؟ أصل الصورة ستبقى متاحة في الملاحظات التي تستخدمها.')) return;
  try {
    await api(`/api/gallery/${remove.dataset.galleryRemove}`, { method: 'DELETE' });
    galleryImages = await api('/api/gallery');
    renderGallery();
    showToast('أُزيلت الصورة من المعرض.');
  } catch (error) {
    showToast(error.message);
  }
});
document.querySelector('.gallery-viewer-close').addEventListener('click', () => document.getElementById('galleryViewer').close());
document.querySelector('.gallery-viewer-previous').addEventListener('click', () => stepGalleryViewer(-1));
document.querySelector('.gallery-viewer-next').addEventListener('click', () => stepGalleryViewer(1));
document.getElementById('galleryViewer').addEventListener('click', event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.getElementById('galleryViewer').addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') stepGalleryViewer(1);
  if (event.key === 'ArrowRight') stepGalleryViewer(-1);
});
document.addEventListener('change', event => {
  const picker = event.target.closest('[data-backlink-picker]');
  if (picker) insertNoteLink(picker);
});
document.addEventListener('click', async event => {
  const pin = event.target.closest('[data-pin-type][data-pin-id]');
  if (pin) {
    pin.disabled = true;
    const nextPinned = pin.getAttribute('aria-pressed') !== 'true';
    try {
      await api(`/api/pins/${encodeURIComponent(pin.dataset.pinType)}/${encodeURIComponent(pin.dataset.pinId)}`, {
        method: 'PUT',
        body: JSON.stringify({ pinned: nextPinned }),
      });
      pinnedEntries = await api('/api/pins');
      renderItems();
      renderArticles();
      renderBookmarks();
      renderPinnedEntries();
      if (detailItemId) await loadDetailPage();
      if (dailyNote?.id) {
        const dailyPin = document.getElementById('dailyNotePin');
        dailyPin.outerHTML = `<button id="dailyNotePin" class="pin-toggle${isPinned('daily-note', dailyNote.id) ? ' is-pinned' : ''}" type="button"
          data-pin-type="daily-note" data-pin-id="${dailyNote.id}" aria-label="${isPinned('daily-note', dailyNote.id) ? 'إلغاء تثبيت مذكرة اليوم' : 'تثبيت مذكرة اليوم'}"
          aria-pressed="${isPinned('daily-note', dailyNote.id)}" title="تثبيت مذكرة اليوم">${actionIcon('pin')}</button>`;
      }
      showToast(nextPinned ? 'تم تثبيت العنصر.' : 'تم إلغاء التثبيت.');
    } catch (error) {
      pin.disabled = false;
      showToast(error.message);
    }
    return;
  }
  const dailyLink = event.target.closest('[data-daily-note-link]');
  if (!dailyLink) return;
  event.preventDefault();
  const date = dailyLink.dataset.dailyNoteLink;
  clearTimeout(dailyNoteSaveTimer);
  if (dailyNoteDirty) await saveDailyNote();
  document.getElementById('dailyNoteDate').value = date;
  setWorkspaceView('daily-notes', true);
  if (dailyNote?.note_date !== date) loadDailyNote(date);
});
document.getElementById('fetchBookmarkPreview').addEventListener('click', async event => {
  const button = event.currentTarget;
  const form = document.getElementById('bookmarkForm');
  const status = document.getElementById('bookmarkPreviewStatus');
  if (!form.elements.url.value.trim()) {
    status.textContent = 'أدخل الرابط أولاً.';
    return;
  }
  button.disabled = true;
  status.textContent = 'جارٍ جلب عنوان الصفحة وصورتها...';
  try {
    const preview = await api('/api/bookmarks/preview', {
      method: 'POST',
      body: JSON.stringify({ url: form.elements.url.value.trim() }),
    });
    if (preview.title && !form.elements.title.value.trim()) form.elements.title.value = preview.title;
    else if (preview.title) form.elements.title.value = preview.title;
    if (preview.description && !form.elements.note.value.trim()) form.elements.note.value = preview.description;
    form.elements.image_url.value = preview.image_url || '';
    const image = document.getElementById('bookmarkImagePreview');
    image.src = preview.image_url || '';
    image.classList.toggle('hidden', !preview.image_url);
    status.textContent = preview.image_url ? 'تم جلب صورة الموقع وحفظها في مكتبتك الخاصة.' : 'تم جلب العنوان؛ لم توفر الصفحة صورة معاينة.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#bookmarkForm [name="url"]').addEventListener('input', () => {
  const form = document.getElementById('bookmarkForm');
  form.elements.image_url.value = '';
  document.getElementById('bookmarkImagePreview').classList.add('hidden');
  document.getElementById('bookmarkPreviewStatus').textContent = '';
});
document.getElementById('quickAddTodo').addEventListener('click', () => {
  setWorkspaceView('todos', true);
  document.querySelector('#quickTodoForm [name="title"]').focus();
});
document.getElementById('quickAddEvent').addEventListener('click', () => openEventForm(null, localToday()));
document.getElementById('addEventButton').addEventListener('click', () => openEventForm());
document.getElementById('addAreaButton').addEventListener('click', () => openAreaForm());
document.getElementById('addGoalButton').addEventListener('click', () => openGoalForm());
document.getElementById('addProjectButton').addEventListener('click', () => openProjectForm());
document.getElementById('addHabitButton').addEventListener('click', () => openHabitForm());
document.getElementById('addRoutineButton').addEventListener('click', () => openRoutineForm());
document.getElementById('quickCaptureForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const title = form.elements.title.value.trim();
  try {
    if (form.elements.type.value === 'task') {
      await api('/api/todos', { method: 'POST', body: JSON.stringify({ title, notes: '', due_date: todayPlan.date, completed: false }) });
      showToast('تمت إضافة المهمة إلى اليوم.');
    } else {
      await api('/api/items', {
        method: 'POST',
        body: JSON.stringify({ kind: 'memo', title, notes: '', review: '', status: 'planned' }),
      });
      showToast('تم حفظ المذكرة.');
    }
    form.reset();
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('quickTodoToday').addEventListener('click', () => {
  const dueDate = document.querySelector('#quickTodoForm [name="due_date"]');
  dueDate.value = dueDate.value === localToday() ? '' : localToday();
});
document.getElementById('quickTodoForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const values = Object.fromEntries(new FormData(form));
  values.title = values.title.trim();
  values.completed = false;
  if (!values.title) return;
  submit.disabled = true;
  try {
    await api('/api/todos', { method: 'POST', body: JSON.stringify(values) });
    form.reset();
    document.getElementById('todoSearch').value = '';
    todoFilter = 'all';
    await refreshWorkspace();
    document.querySelector('#quickTodoForm [name="title"]').focus();
    showToast('تمت إضافة المهمة.');
  } catch (error) {
    showToast(error.message);
  } finally {
    submit.disabled = false;
  }
});
document.querySelector('.todo-filters').addEventListener('click', event => {
  const button = event.target.closest('[data-todo-filter]');
  if (!button) return;
  todoFilter = button.dataset.todoFilter;
  renderTodos();
});
document.getElementById('todoSearch').addEventListener('input', renderTodos);
document.getElementById('addItem').addEventListener('click', () => {
  document.getElementById('quickCreateDialog').showModal();
});
document.getElementById('quickCreateDialog').addEventListener('click', event => {
  const button = event.target.closest('[data-create-action]');
  if (!button) return;
  const action = button.dataset.createAction;
  document.getElementById('quickCreateDialog').close();
  if (action === 'todo') {
    setWorkspaceView('todos', true);
    document.querySelector('#quickTodoForm [name="title"]').focus();
  } else if (action === 'item') openItemForm();
  else if (action === 'article') openArticleForm();
  else if (action === 'event') openEventForm();
});
document.querySelector('.welcome-actions').addEventListener('click', event => {
  const button = event.target.closest('[data-shortcut]');
  if (button?.dataset.shortcut === 'item') openItemForm();
  if (button?.dataset.shortcut === 'todo') {
    setWorkspaceView('todos', true);
    document.querySelector('#quickTodoForm [name="title"]').focus();
  }
  if (button?.dataset.shortcut === 'article') openArticleForm();
});
document.getElementById('workspaceNav').addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  const view = link?.hash.slice(1);
  if (!view || !workspaceViews.has(view)) return;
  event.preventDefault();
  setWorkspaceView(view, true);
});
document.getElementById('notificationsButton').addEventListener('click', event => {
  const button = event.currentTarget;
  const panel = document.getElementById('notificationsPanel');
  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!isExpanded));
  panel.classList.toggle('hidden', isExpanded);
});
document.getElementById('notificationsList').addEventListener('click', event => {
  const notification = event.target.closest('[data-notification-target]');
  if (!notification) return;
  readNotificationKeys.add(notification.dataset.notificationKey);
  document.getElementById('notificationsPanel').classList.add('hidden');
  document.getElementById('notificationsButton').setAttribute('aria-expanded', 'false');
  if (notification.dataset.notificationTarget === 'club-mention') {
    api(`/api/book-club-notifications/${notification.dataset.notificationId}/read`, { method: 'POST' })
      .then(async () => {
        bookClubNotifications = bookClubNotifications.filter(row => row.id !== Number(notification.dataset.notificationId));
        setWorkspaceView('clubs', true);
        await loadBookClub(Number(notification.dataset.clubId));
        renderNotifications();
      })
      .catch(error => showToast(error.message));
    return;
  }
  renderNotifications();
  setWorkspaceView(notification.dataset.notificationTarget === 'todo' ? 'todos' : 'calendar', true);
  if (notification.dataset.notificationTarget === 'todo') {
    document.querySelector('[data-todo-filter="all"]').click();
    document.getElementById(`todo-${notification.dataset.notificationId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    document.getElementById('calendarList').querySelector(`[data-event-edit="${notification.dataset.notificationId}"]`)
      ?.closest('.calendar-event')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
});
document.getElementById('markAllNotificationsRead').addEventListener('click', async () => {
  try {
    await api('/api/book-club-notifications/read-all', { method: 'POST' });
    bookClubNotifications = [];
    readNotificationKeys = new Set([...readNotificationKeys, ...activeNotificationKeys]);
    renderNotifications();
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('prayerTimesToggle').addEventListener('click', event => {
  const panel = document.getElementById('prayerTimesPanel');
  const expanded = event.currentTarget.getAttribute('aria-expanded') !== 'true';
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
  panel.classList.toggle('hidden', !expanded);
  if (expanded) loadPrayerTimes();
});
document.getElementById('quranPlayerToggle').addEventListener('click', event => {
  const panel = document.getElementById('quranPlayerPanel');
  const expanded = event.currentTarget.getAttribute('aria-expanded') !== 'true';
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
  panel.classList.toggle('hidden', !expanded);
  if (expanded && document.getElementById('quranPlayerMode').value === 'surah') loadQuranSurahs();
});
document.getElementById('quranPlayerClose').addEventListener('click', () => {
  document.getElementById('quranPlayerPanel').classList.add('hidden');
  document.getElementById('quranPlayerToggle').setAttribute('aria-expanded', 'false');
});
document.getElementById('quranPlayerMode').addEventListener('change', event => {
  const audio = document.getElementById('quranAudio');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  document.getElementById('quranPlayerStatus').textContent = '';
  const radioMode = event.currentTarget.value === 'radio';
  document.getElementById('quranSurahControls').classList.toggle('hidden', radioMode);
  document.getElementById('quranRadioControls').classList.toggle('hidden', !radioMode);
  if (radioMode) loadQuranRadios();
  else loadQuranSurahs();
});
document.getElementById('quranSurahSelect').addEventListener('change', setQuranSurahAudio);
document.getElementById('quranReciterSelect').addEventListener('change', setQuranSurahAudio);
document.getElementById('quranRadioSelect').addEventListener('change', async event => {
  const audio = document.getElementById('quranAudio');
  if (!event.currentTarget.value) return;
  audio.src = event.currentTarget.value;
  audio.load();
  try {
    await audio.play();
    document.getElementById('quranPlayerStatus').textContent = language === 'en' ? 'Live radio is playing.' : 'يتم تشغيل الإذاعة المباشرة.';
  } catch (error) {
    document.getElementById('quranPlayerStatus').textContent = language === 'en'
      ? `Could not start radio: ${error.message}` : `تعذّر تشغيل الإذاعة: ${error.message}`;
  }
});
document.getElementById('quranAudio').addEventListener('error', () => {
  document.getElementById('quranPlayerStatus').textContent = language === 'en'
    ? 'Audio could not be loaded. Choose another station or try again later.'
    : 'تعذّر تحميل الصوت. اختر إذاعة أخرى أو حاول لاحقاً.';
});
document.getElementById('financeMonth').addEventListener('change', loadFinance);
document.getElementById('addFinanceTransaction').addEventListener('click', () => openFinanceDialog('transaction'));
document.getElementById('addFinanceSubscription').addEventListener('click', () => openFinanceDialog('subscription'));
document.getElementById('addFinanceBudget').addEventListener('click', () => openFinanceDialog('budget'));
document.getElementById('financeForm').addEventListener('submit', submitFinanceForm);
document.getElementById('financeTransactionList').addEventListener('click', async event => {
  const edit = event.target.closest('[data-finance-edit-transaction]');
  const remove = event.target.closest('[data-finance-delete-transaction]');
  if (edit) {
    openFinanceDialog('transaction', financeData.transactions.find(item => item.id === Number(edit.dataset.financeEditTransaction)));
    return;
  }
  if (remove && window.confirm(language === 'en' ? 'Delete this transaction?' : 'حذف هذه العملية؟')) {
    try {
      await api(`/api/finance/transactions/${remove.dataset.financeDeleteTransaction}`, { method: 'DELETE' });
      await loadFinance();
    } catch (error) { showToast(error.message); }
  }
});
document.getElementById('financeSubscriptionList').addEventListener('click', async event => {
  const edit = event.target.closest('[data-finance-edit-subscription]');
  const remove = event.target.closest('[data-finance-delete-subscription]');
  const pay = event.target.closest('[data-finance-pay-subscription]');
  if (edit) {
    openFinanceDialog('subscription', financeData.subscriptions.find(item => item.id === Number(edit.dataset.financeEditSubscription)));
    return;
  }
  try {
    if (pay) {
      const subscription = financeData.subscriptions.find(item => item.id === Number(pay.dataset.financePaySubscription));
      if (!subscription) throw new Error(language === 'en' ? 'Subscription not found. Refresh and try again.' : 'الاشتراك غير موجود. حدّث الصفحة وحاول مجدداً.');
      await api(`/api/finance/subscriptions/${subscription.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ period: subscription.next_renewal_date }),
      });
      await loadFinance();
    } else if (remove && window.confirm(language === 'en' ? 'Delete this subscription?' : 'حذف هذا الاشتراك؟')) {
      await api(`/api/finance/subscriptions/${remove.dataset.financeDeleteSubscription}`, { method: 'DELETE' });
      await loadFinance();
    }
  } catch (error) { showToast(error.message); }
});
document.getElementById('financeBudgetList').addEventListener('click', async event => {
  const remove = event.target.closest('[data-finance-delete-budget]');
  if (!remove || !window.confirm(language === 'en' ? 'Delete this budget?' : 'حذف هذه الميزانية؟')) return;
  try {
    await api(`/api/finance/budgets/${remove.dataset.financeDeleteBudget}`, { method: 'DELETE' });
    await loadFinance();
  } catch (error) { showToast(error.message); }
});
document.getElementById('prayerTimesRefresh').addEventListener('click', () => loadPrayerTimes(true));
document.getElementById('prayerTimesSettings').addEventListener('click', () => {
  document.getElementById('prayerTimesPanel').classList.add('hidden');
  document.getElementById('prayerTimesToggle').setAttribute('aria-expanded', 'false');
  openSettings();
});
document.getElementById('useCurrentPrayerLocation').addEventListener('click', event => {
  const button = event.currentTarget;
  const status = document.getElementById('prayerLocationStatus');
  if (!navigator.geolocation) {
    status.textContent = language === 'en' ? 'Geolocation is not available in this browser.' : 'الموقع الجغرافي غير متاح في هذا المتصفح.';
    return;
  }
  button.disabled = true;
  status.textContent = language === 'en' ? 'Requesting your location…' : 'جارٍ طلب موقعك…';
  navigator.geolocation.getCurrentPosition(position => {
    const form = document.getElementById('settingsForm');
    form.elements.prayerLatitude.value = position.coords.latitude.toFixed(6);
    form.elements.prayerLongitude.value = position.coords.longitude.toFixed(6);
    if (!form.elements.prayerLocation.value.trim()) {
      form.elements.prayerLocation.value = language === 'en' ? 'Current location' : 'موقعي الحالي';
    }
    status.textContent = language === 'en'
      ? 'Location filled in. Save settings to apply it.'
      : 'تم إدخال الموقع. احفظ الإعدادات لتطبيقه.';
    button.disabled = false;
  }, error => {
    const reason = error.code === error.PERMISSION_DENIED
      ? (language === 'en' ? 'Location permission was denied.' : 'لم يُسمح بالوصول إلى الموقع.')
      : language === 'en' ? 'Could not determine your location.' : 'تعذّر تحديد موقعك.';
    status.textContent = reason;
    button.disabled = false;
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
});
document.addEventListener('click', event => {
  if (!event.target.closest('#prayerTimesWidget')) {
    document.getElementById('prayerTimesPanel').classList.add('hidden');
    document.getElementById('prayerTimesToggle').setAttribute('aria-expanded', 'false');
  }
  if (!event.target.closest('#quranPlayerWidget')) {
    document.getElementById('quranPlayerPanel').classList.add('hidden');
    document.getElementById('quranPlayerToggle').setAttribute('aria-expanded', 'false');
  }
  if (!event.target.closest('.notification-center')) {
    document.getElementById('notificationsPanel').classList.add('hidden');
    document.getElementById('notificationsButton').setAttribute('aria-expanded', 'false');
  }
  if (!event.target.closest('.account-menu')) document.getElementById('accountMenu').open = false;
});
window.addEventListener('hashchange', () => setWorkspaceView(location.hash.slice(1)));
document.getElementById('settingsButton').addEventListener('click', () => {
  document.getElementById('accountMenu').open = false;
  openSettings();
});
document.getElementById('backupNow').addEventListener('click', createBackup);
document.getElementById('restoreBackup').addEventListener('click', restoreBackup);
document.getElementById('testS3Connection').addEventListener('click', async event => {
  const button = event.currentTarget;
  const form = document.getElementById('settingsForm');
  const status = document.getElementById('s3Status');
  button.disabled = true;
  status.textContent = 'جارٍ اختبار الحاوية وصلاحيات AWS...';
  try {
    const result = await api('/api/settings/s3/test', {
      method: 'POST',
      body: JSON.stringify({
        bucket: form.elements.s3Bucket.value,
        region: form.elements.s3Region.value,
        prefix: form.elements.s3Prefix.value,
      }),
    });
    status.textContent = result.message;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#settingsForm [name="notificationsEnabled"]').addEventListener('change', async event => {
  if (!event.currentTarget.checked || !('Notification' in window)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      event.currentTarget.checked = false;
      notificationsEnabled = false;
      showToast('لم يتم السماح بتنبيهات المتصفح.');
    }
  } catch (error) {
    event.currentTarget.checked = false;
    showToast(`تعذّر تفعيل التنبيهات: ${error.message}`);
  }
});
document.getElementById('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const settings = {
    editMode: form.elements.editMode.value,
    themeMode: form.elements.themeMode.value,
    notificationsEnabled: form.elements.notificationsEnabled.checked,
    notificationSoundEnabled: form.elements.notificationSoundEnabled.checked,
    reminderMinutes: Number(form.elements.reminderMinutes.value),
    markdownRenderingEnabled: form.elements.markdownRenderingEnabled.checked,
    markdownToolbarEnabled: form.elements.markdownToolbarEnabled.checked,
    markdownImagePasteEnabled: form.elements.markdownImagePasteEnabled.checked,
    fontSizeOffset: Number(form.elements.fontSizeOffset.value),
    lineSpacing: form.elements.lineSpacing.value,
    fontFamily: form.elements.fontFamily.value,
    language: form.elements.language.value,
    financeCurrency: form.elements.financeCurrency.value,
    prayerLatitude: form.elements.prayerLatitude.value.trim() === '' ? null : Number(form.elements.prayerLatitude.value),
    prayerLongitude: form.elements.prayerLongitude.value.trim() === '' ? null : Number(form.elements.prayerLongitude.value),
    prayerLocation: form.elements.prayerLocation.value.trim(),
    prayerMethod: Number(form.elements.prayerMethod.value),
    shortcuts: {
      todo: form.elements.shortcutTodo.value,
      dailyNote: form.elements.shortcutDailyNote.value,
      readLater: form.elements.shortcutReadLater.value,
      quickCreate: form.elements.shortcutQuickCreate.value,
    },
  };
  if (settings.notificationsEnabled && (!('Notification' in window) || Notification.permission !== 'granted')) {
    document.getElementById('settingsMessage').textContent = 'فعّل إذن التنبيهات من المتصفح أولاً.';
    return;
  }
  if (currentUser?.isOwner) {
    settings.dailyBackupEnabled = form.elements.dailyBackupEnabled.checked;
    settings.s3Enabled = form.elements.s3Enabled.checked;
    settings.s3Bucket = form.elements.s3Bucket.value.trim();
    settings.s3Region = form.elements.s3Region.value.trim();
    settings.s3Prefix = form.elements.s3Prefix.value.trim();
  }
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    applyLanguage(settings.language);
    document.querySelector('#settingsForm [name="language"]').value = settings.language;
    prayerLocation = {
      latitude: settings.prayerLatitude,
      longitude: settings.prayerLongitude,
      label: settings.prayerLocation,
      method: settings.prayerMethod,
    };
    prayerTimesData = null;
    prayerTimesLoadedKey = '';
    renderPrayerTimes();
    loadPrayerTimes(true);
    editMode = settings.editMode;
    themeMode = settings.themeMode;
    notificationsEnabled = settings.notificationsEnabled;
    notificationSoundEnabled = settings.notificationSoundEnabled;
    reminderMinutes = settings.reminderMinutes;
    markdownRenderingEnabled = settings.markdownRenderingEnabled;
    markdownToolbarEnabled = settings.markdownToolbarEnabled;
    markdownImagePasteEnabled = settings.markdownImagePasteEnabled;
    fontSizeOffset = settings.fontSizeOffset;
    lineSpacing = settings.lineSpacing;
    fontFamily = settings.fontFamily;
    applyTypographySettings();
    if (activeWorkspace === 'finance') loadFinance();
    applyMarkdownSettings();
    if (themeMode === 'system') localStorage.removeItem('personal-memo-theme');
    else localStorage.setItem('personal-memo-theme', themeMode);
    setTheme(themeMode);
    if (detailItemId) await loadDetailPage();
    else {
      renderItems();
      renderArticles();
      renderBookmarks();
    }
    document.getElementById('settingsMessage').textContent = 'تم حفظ الإعدادات.';
    if (currentUser?.isOwner) {
      document.getElementById('s3Status').textContent = settings.s3Enabled
        ? 'التخزين السحابي مفعّل. سيتم رفع الملفات الجديدة والنسخ الاحتياطية إلى S3.'
        : 'التخزين السحابي غير مفعّل.';
    }
  } catch (error) {
    document.getElementById('settingsMessage').textContent = error.message;
  }
});
document.getElementById('toastUndo').addEventListener('click', async event => {
  const token = event.currentTarget.dataset.token;
  if (!token) return;
  event.currentTarget.disabled = true;
  try {
    const result = await api(`/api/trash/${token}/restore`, { method: 'POST' });
    if (result.type === 'item') await refresh();
    else await refreshWorkspace();
    showToast('تمت استعادة العنصر.');
  } catch (error) {
    showToast(error.message);
  } finally {
    event.currentTarget.disabled = false;
  }
});
document.getElementById('openLookupPanel').addEventListener('click', openLookupPanel);
document.getElementById('closeLookupPanel').addEventListener('click', closeLookupPanel);
document.getElementById('lookupBackdrop').addEventListener('click', closeLookupPanel);
document.getElementById('panelSearchButton').addEventListener('click', searchPanel);
document.getElementById('panelQuery').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchPanel();
  }
});
document.getElementById('panelResults').addEventListener('click', event => {
  const button = event.target.closest('[data-panel-result]');
  if (!button) return;
  const result = lookupResults[Number(button.dataset.panelResult)];
  if (!result) return;
  const kind = document.getElementById('panelKind').value;
  closeLookupPanel();
  openItemForm({
    kind,
    title: result.title,
    creator: result.creator,
    cover_image: result.image,
  });
});
themeToggle.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme);
  localStorage.setItem('personal-memo-theme', nextTheme);
  document.querySelector('#settingsForm [name="themeMode"]').value = nextTheme;
  api('/api/settings', { method: 'PUT', body: JSON.stringify({ themeMode: nextTheme }) })
    .catch(error => showToast(error.message));
});
document.getElementById('kind').addEventListener('change', toggleFormFields);
document.getElementById('lookupButton').addEventListener('click', lookupMetadata);
document.getElementById('itemTitle').addEventListener('keydown', event => {
  if (event.key === 'Enter' && itemForm.elements.kind.value !== 'memo') {
    event.preventDefault();
    lookupMetadata();
  }
});
document.getElementById('lookupResults').addEventListener('click', event => {
  const resultButton = event.target.closest('[data-result]');
  if (!resultButton) return;
  const result = lookupResults[Number(resultButton.dataset.result)];
  if (!result) return;
  itemForm.elements.title.value = result.title;
  if (result.creator) itemForm.elements.creator.value = result.creator;
  if (result.image) {
    itemForm.elements.cover_image.value = result.image;
    setCoverPreview(result.image);
  }
  document.getElementById('lookupResults').innerHTML = '';
  document.getElementById('lookupHint').textContent = `تم اختيار نتيجة من ${result.source}. يمكنك تعديل البيانات أو الصورة.`;
});
document.getElementById('coverUpload').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (!file) return;
  await handleCoverFile(file);
  event.target.value = '';
});
document.getElementById('chooseCoverButton').addEventListener('click', () => document.getElementById('coverUpload').click());
document.getElementById('pasteCoverButton').addEventListener('click', pasteCoverFromClipboard);
document.getElementById('coverPasteTarget').addEventListener('paste', async event => {
  const file = [...(event.clipboardData?.items || [])]
    .find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
  if (!file) return;
  event.preventDefault();
  await handleCoverFile(file);
});
document.getElementById('coverPasteTarget').addEventListener('dragover', event => {
  event.preventDefault();
  event.currentTarget.classList.add('is-drop-target');
});
document.getElementById('coverPasteTarget').addEventListener('dragleave', event => {
  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('is-drop-target');
});
document.getElementById('coverPasteTarget').addEventListener('drop', async event => {
  event.preventDefault();
  event.currentTarget.classList.remove('is-drop-target');
  const [file] = [...(event.dataTransfer?.files || [])].filter(candidate => candidate.type.startsWith('image/'));
  if (!file) {
    document.getElementById('coverPasteHint').textContent = 'اسحب صورة JPG أو PNG أو WebP أو GIF إلى هذه المنطقة.';
    return;
  }
  await handleCoverFile(file);
});
document.getElementById('removeCover').addEventListener('click', () => {
  itemForm.elements.cover_image.value = '';
  document.getElementById('coverUpload').value = '';
  setCoverPreview('');
  document.getElementById('coverPasteHint').textContent = 'يمكنك أيضاً اختيار صورة الغلاف من نتائج البحث. الحد الأقصى ٥ ميغابايت.';
});
document.getElementById('reviewImageButton').addEventListener('click', () => {
  document.getElementById('reviewImageUpload').click();
});
document.getElementById('reviewImageUpload').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (!file) return;
  await insertUploadedImage(file, document.getElementById('reviewInput'));
  event.target.value = '';
});
document.getElementById('articleImageButton').addEventListener('click', () => {
  document.getElementById('articleImageUpload').click();
});
document.getElementById('articleImageUpload').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (!file) return;
  await insertUploadedImage(file, document.getElementById('articleReviewInput'));
  event.target.value = '';
});
document.getElementById('articleReviewPreviewToggle').addEventListener('click', event => {
  const preview = document.getElementById('articleReviewPreview');
  const input = document.getElementById('articleReviewInput');
  const showingPreview = preview.classList.contains('hidden');
  preview.innerHTML = renderRichText(input.value);
  preview.classList.toggle('hidden', !showingPreview);
  input.classList.toggle('hidden', showingPreview);
  event.currentTarget.setAttribute('aria-pressed', String(showingPreview));
  event.currentTarget.textContent = showingPreview ? 'تحرير' : 'معاينة';
});
document.getElementById('notesImageButton').addEventListener('click', () => {
  document.getElementById('notesImageUpload').click();
});
document.getElementById('notesImageUpload').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (!file) return;
  await insertUploadedImage(file, document.getElementById('notesInput'));
  event.target.value = '';
});
document.getElementById('chapterImageButton').addEventListener('click', () => {
  document.getElementById('chapterImageUpload').click();
});
document.getElementById('chapterImageUpload').addEventListener('change', async event => {
  const [file] = event.target.files;
  if (!file) return;
  await insertUploadedImage(file, document.getElementById('chapterNotes'));
  event.target.value = '';
});
document.querySelectorAll('[data-markdown-format]').forEach(button => {
  button.addEventListener('click', () => {
    const editor = button.closest('.markdown-field')?.querySelector('textarea') || document.getElementById('reviewInput');
    insertAtCursor(editor, button.dataset.markdownFormat);
  });
});
document.getElementById('reviewPreviewToggle').addEventListener('click', event => {
  const preview = document.getElementById('reviewPreview');
  const input = document.getElementById('reviewInput');
  const showingPreview = preview.classList.contains('hidden');
  preview.innerHTML = renderRichText(input.value);
  preview.classList.toggle('hidden', !showingPreview);
  input.classList.toggle('hidden', showingPreview);
  event.currentTarget.setAttribute('aria-pressed', String(showingPreview));
  event.currentTarget.textContent = showingPreview ? 'تحرير' : 'معاينة';
});
document.querySelector('[data-preview="notes"]').addEventListener('click', event => {
  const preview = document.getElementById('notesPreview');
  const input = document.getElementById('notesInput');
  const showingPreview = preview.classList.contains('hidden');
  preview.innerHTML = renderRichText(input.value);
  preview.classList.toggle('hidden', !showingPreview);
  input.classList.toggle('hidden', showingPreview);
  event.currentTarget.textContent = showingPreview ? 'تحرير الملاحظات' : 'معاينة الملاحظات';
});
document.querySelectorAll('.markdown-input').forEach(editor => {
  editor.addEventListener('dragover', event => {
    if (!markdownImagePasteEnabled) return;
    event.preventDefault();
    editor.classList.add('is-drop-target');
  });
  editor.addEventListener('dragleave', event => {
    if (!editor.contains(event.relatedTarget)) editor.classList.remove('is-drop-target');
  });
  editor.addEventListener('drop', async event => {
    if (!markdownImagePasteEnabled) return;
    event.preventDefault();
    editor.classList.remove('is-drop-target');
    const images = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith('image/'));
    if (!images.length) {
      showToast('اسحب صورة JPG أو PNG أو WebP أو GIF إلى مساحة الكتابة.');
      return;
    }
    for (const file of images) await insertUploadedImage(file, editor);
  });
});
document.addEventListener('paste', async event => {
  const editor = event.target.closest('textarea.markdown-input, textarea.detail-markdown-input');
  if (!editor) return;
  const image = [...(event.clipboardData?.items || [])]
    .find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
  if (!image) return;
  if (!markdownImagePasteEnabled) {
    showToast('لصق الصور معطّل من إعدادات Markdown.');
    return;
  }
  event.preventDefault();
  await insertUploadedImage(image, editor);
});
document.getElementById('chapterForm').addEventListener('submit', async event => {
  event.preventDefault();
  const chapter = Object.fromEntries(new FormData(event.currentTarget));
  const url = `/api/items/${detailItemId}/chapters${editingChapterId ? `/${editingChapterId}` : ''}`;
  try {
    await api(url, { method: editingChapterId ? 'PUT' : 'POST', body: JSON.stringify(chapter) });
    document.getElementById('chapterDialog').close();
    await loadDetailPage();
    if (location.hash !== '#chapters') location.hash = 'chapters';
  } catch (error) {
    showToast(error.message);
  }
});
document.addEventListener('click', event => {
  const cancelButton = event.target.closest('[data-inline-cancel]');
  if (!cancelButton) return;
  const itemId = Number(cancelButton.dataset.inlineCancel);
  if (detailItemId === itemId) loadDetailPage();
  else renderItems();
});
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-inline-item]');
  if (!form) return;
  event.preventDefault();
  const itemId = Number(form.dataset.inlineItem);
  const item = Object.fromEntries(new FormData(form));
  item.near_completion = form.elements.near_completion.checked;
  try {
    await api(`/api/items/${itemId}`, { method: 'PUT', body: JSON.stringify(item) });
    await refresh();
    showToast('تم حفظ التغييرات.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('authModeToggle').addEventListener('click', () => {
  const currentMode = document.getElementById('authForm').dataset.mode;
  setAuthMode(currentMode === 'register' ? 'login' : 'register', hasRegisteredUsers);
  document.getElementById('authError').classList.add('hidden');
});
document.getElementById('authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const registration = form.dataset.mode === 'register';
  const body = Object.fromEntries(new FormData(form));
  const submit = document.getElementById('authSubmit');
  submit.disabled = true;
  try {
    const response = await fetch(`/api/auth/${registration ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'تعذّر تسجيل الدخول.');
    hasRegisteredUsers = true;
    form.reset();
    showAuthentication(result.user);
    await loadAccountSettings();
    await refresh();
    await openRequestedLearningNote();
    await processCaptureLink();
  } catch (error) {
    document.getElementById('authError').textContent = error.message;
    document.getElementById('authError').classList.remove('hidden');
  } finally {
    submit.disabled = false;
  }
});
document.getElementById('logoutButton').addEventListener('click', async () => {
  try {
    document.getElementById('accountMenu').open = false;
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('تعذّر تسجيل الخروج.');
    setAuthMode('login', true);
    showAuthentication(null);
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('filters').addEventListener('click', event => {
  const button = event.target.closest('[data-kind]');
  if (!button) return;
  selectedKind = button.dataset.kind;
  document.querySelectorAll('.filter').forEach(filter => filter.classList.toggle('active', filter === button));
  renderItems();
});
searchInput.addEventListener('input', renderItems);
['statusFilter', 'ratingFilter', 'tagFilter'].forEach(id =>
  document.getElementById(id).addEventListener('input', renderItems));
document.getElementById('globalSearch').addEventListener('input', () => {
  clearTimeout(globalSearchTimer);
  globalSearchTimer = setTimeout(runGlobalSearch, 180);
});
document.getElementById('globalSearch').addEventListener('focus', runGlobalSearch);
document.addEventListener('click', event => {
  const results = document.getElementById('globalSearchResults');
  const search = document.querySelector('.global-search');
  if (!search.contains(event.target)) results.classList.add('hidden');
  const result = event.target.closest('[data-search-type]');
  if (result) {
    const view = result.dataset.searchType === 'todo' ? 'todos' : 'articles';
    const row = document.getElementById(`${result.dataset.searchType}-${result.dataset.searchId}`);
    results.classList.add('hidden');
    setWorkspaceView(view, true);
    setTimeout(() => row?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }
});
document.addEventListener('keydown', event => {
  const isTyping = event.target.closest('input,textarea,select,[contenteditable="true"]');
  const configuredShortcut = currentUser && !isTyping && !document.querySelector('dialog[open]')
    && event.ctrlKey && event.altKey && event.shiftKey && !event.metaKey
    ? Object.entries(shortcuts).find(([, key]) => key && key === `Ctrl+Alt+Shift+${event.code}`)?.[0]
    : null;
  if (configuredShortcut === 'todo') {
    event.preventDefault();
    setWorkspaceView('todos', true);
    document.querySelector('#quickTodoForm [name="title"]').focus();
  } else if (configuredShortcut === 'dailyNote') {
    event.preventDefault();
    setWorkspaceView('daily-notes', true);
    document.querySelector('#dailyNoteBody').focus();
  } else if (configuredShortcut === 'readLater') {
    event.preventDefault();
    setWorkspaceView('articles', true);
    openArticleForm();
  } else if (configuredShortcut === 'quickCreate') {
    event.preventDefault();
    document.getElementById('quickCreateDialog').showModal();
  } else if (currentUser && !document.querySelector('dialog[open]')
    && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    document.getElementById('globalSearch').focus();
    document.getElementById('globalSearch').select();
  } else if (currentUser && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n'
    && !isTyping
    && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    document.getElementById('quickCreateDialog').showModal();
  } else if (event.key === 'Escape') {
    document.getElementById('globalSearchResults').classList.add('hidden');
  }
});
itemsElement.addEventListener('click', async event => {
  const emptyAction = event.target.closest('[data-empty-action="item"]');
  if (emptyAction) return openItemForm();
  const button = event.target.closest('[data-action]');
  if (!button) {
    const toggle = event.target.closest('.text-toggle');
    if (toggle) {
      const text = toggle.previousElementSibling;
      const expanded = text.classList.toggle('is-truncated') === false;
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? 'عرض أقل' : 'اقرأ المزيد';
    }
    return;
  }
  const item = items.find(entry => entry.id === Number(button.dataset.id));
  if (!item) return;
  try {
    if (button.dataset.action === 'edit') return beginInlineEdit(item, button.closest('.item-card'));
    if (button.dataset.action === 'track') return await openProgress(item.id);
    if (button.dataset.action === 'delete') {
      const result = await api(`/api/items/${item.id}`, { method: 'DELETE' });
      showToast('تم نقل العنصر إلى المحذوفات مؤقتاً.', result.undoToken);
      await refresh();
    }
  } catch (error) {
    showToast(error.message);
  }
});

itemForm.addEventListener('submit', async event => {
  event.preventDefault();
  const item = Object.fromEntries(new FormData(itemForm));
  item.near_completion = itemForm.elements.near_completion.checked;
  try {
    await api(editingId ? `/api/items/${editingId}` : '/api/items', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify(item),
    });
    itemDialog.close();
    showToast(editingId ? 'تم تحديث العنصر.' : 'تمت الإضافة إلى مذكرتك.');
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('eventForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.id;
  values.all_day = form.elements.all_day.checked;
  delete values.id;
  try {
    await api(id ? `/api/events/${id}` : '/api/events', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    form.closest('dialog').close();
    await refreshWorkspace();
    showToast('تم حفظ الموعد.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('calendarList').addEventListener('click', async event => {
  const dateButton = event.target.closest('[data-calendar-date]');
  if (dateButton) {
    selectedCalendarDate = dateButton.dataset.calendarDate;
    renderCalendar();
    return;
  }
  const monthStep = event.target.closest('[data-calendar-step]');
  if (monthStep) return changeCalendarMonth(Number(monthStep.dataset.calendarStep));
  if (event.target.closest('[data-calendar-today]')) {
    const today = localToday();
    calendarMonth = new Date(`${today}T12:00:00`);
    calendarMonth.setDate(1);
    selectedCalendarDate = today;
    const range = calendarMonthRange();
    try {
      events = await api(`/api/events?start=${range.start}&end=${range.end}`);
      renderCalendar();
      renderNotifications();
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (event.target.closest('[data-calendar-add-event]')) {
    return openEventForm(null, selectedCalendarDate);
  }
  const edit = event.target.closest('[data-event-edit]');
  if (edit) {
    const record = events.find(row => row.id === Number(edit.dataset.eventEdit));
    if (record) openEventForm(record);
    return;
  }
  const remove = event.target.closest('[data-event-delete]');
  if (!remove || !window.confirm('حذف هذا الموعد وكل تكراراته؟')) return;
  try {
    await api(`/api/events/${remove.dataset.eventDelete}`, { method: 'DELETE' });
    await refreshWorkspace();
    showToast('تم حذف الموعد.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('todayEvents').addEventListener('click', event => {
  const edit = event.target.closest('[data-event-edit]');
  if (edit) {
    const record = events.find(row => row.id === Number(edit.dataset.eventEdit));
    if (record) openEventForm(record);
  }
});

document.getElementById('areaForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  try {
    await api(editingAreaId ? `/api/areas/${editingAreaId}` : '/api/areas', {
      method: editingAreaId ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    form.closest('dialog').close();
    await refreshWorkspace();
    showToast('تم حفظ مجال الحياة.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('goalForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  try {
    await api(editingGoalId ? `/api/goals/${editingGoalId}` : '/api/goals', {
      method: editingGoalId ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    form.closest('dialog').close();
    await refreshWorkspace();
    showToast('تم حفظ الهدف.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('projectForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  try {
    await api(editingProjectId ? `/api/projects/${editingProjectId}` : '/api/projects', {
      method: editingProjectId ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    form.closest('dialog').close();
    await refreshWorkspace();
    showToast('تم حفظ المشروع.');
  } catch (error) {
    showToast(error.message);
  }
});
document.querySelector('#projectForm [name="goal_id"]').addEventListener('change', event => {
  const goal = goals.find(row => row.id === Number(event.currentTarget.value));
  if (goal) document.querySelector('#projectForm [name="area_id"]').value = goal.area_id ? String(goal.area_id) : '';
});

document.getElementById('planningBoard').addEventListener('click', async event => {
  const addGoal = event.target.closest('[data-area-add-goal]');
  if (addGoal) return openGoalForm(null, Number(addGoal.dataset.areaAddGoal) || null);
  const addProject = event.target.closest('[data-area-add-project]');
  if (addProject) return openProjectForm(null, null, Number(addProject.dataset.areaAddProject) || null);
  const editArea = event.target.closest('[data-area-edit]');
  if (editArea) return openAreaForm(areas.find(row => row.id === Number(editArea.dataset.areaEdit)));
  const editGoal = event.target.closest('[data-goal-edit]');
  if (editGoal) return openGoalForm(goals.find(row => row.id === Number(editGoal.dataset.goalEdit)));
  const newProject = event.target.closest('[data-goal-project]');
  if (newProject) return openProjectForm(null, Number(newProject.dataset.goalProject));
  const editProject = event.target.closest('[data-project-edit]');
  if (editProject) return openProjectForm(projects.find(row => row.id === Number(editProject.dataset.projectEdit)));
  const projectTask = event.target.closest('[data-project-task]');
  if (projectTask) return openTodoForm(null, Number(projectTask.dataset.projectTask));
  const deleteButton = event.target.closest('[data-area-delete],[data-goal-delete],[data-project-delete]');
  if (!deleteButton || !window.confirm('حذف هذا العنصر؟ ستبقى المهام مستقلة عن المشروع بعد حذفه.')) return;
  const [type, id] = Object.entries(deleteButton.dataset).find(([key]) =>
    ['areaDelete', 'goalDelete', 'projectDelete'].includes(key));
  const path = { areaDelete: 'areas', goalDelete: 'goals', projectDelete: 'projects' }[type];
  try {
    await api(`/api/${path}/${id}`, { method: 'DELETE' });
    await refreshWorkspace();
    showToast('تم الحذف.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('habitForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  values.target_per_week = Number(values.target_per_week);
  try {
    await api(editingHabitId ? `/api/habits/${editingHabitId}` : '/api/habits', {
      method: editingHabitId ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    form.closest('dialog').close();
    await refreshWorkspace();
    showToast('تم حفظ العادة.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('routineForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  values.steps = values.steps.split(/\r?\n/).map(step => step.trim()).filter(Boolean);
  try {
    await api(editingRoutineId ? `/api/routines/${editingRoutineId}` : '/api/routines', {
      method: editingRoutineId ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    form.closest('dialog').close();
    await refreshWorkspace();
    showToast('تم حفظ الروتين.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('habits').addEventListener('click', event => {
  if (event.target.closest('[data-habit-empty-add]')) return openHabitForm();
  if (event.target.closest('[data-routine-empty-add]')) return openRoutineForm();
  const edit = event.target.closest('[data-habit-edit]');
  if (edit) return openHabitForm(habits.find(row => row.id === Number(edit.dataset.habitEdit)));
  const editRoutine = event.target.closest('[data-routine-edit]');
  if (editRoutine) return openRoutineForm(routines.find(row => row.id === Number(editRoutine.dataset.routineEdit)));
  const removeHabit = event.target.closest('[data-habit-delete]');
  const removeRoutine = event.target.closest('[data-routine-delete]');
  if (!removeHabit && !removeRoutine) return;
  const isHabit = Boolean(removeHabit);
  const id = isHabit ? removeHabit.dataset.habitDelete : removeRoutine.dataset.routineDelete;
  const path = isHabit ? 'habits' : 'routines';
  api(`/api/${path}/${id}`, { method: 'DELETE' })
    .then(refreshWorkspace)
    .then(() => showToast(isHabit ? 'تم إيقاف العادة.' : 'تم إيقاف الروتين.'))
    .catch(error => showToast(error.message));
});

document.getElementById('detailPage').addEventListener('click', async event => {
  const formatButton = event.target.closest('[data-detail-format]');
  if (formatButton) {
    const textarea = formatButton.closest('.detail-markdown-editor')?.querySelector('textarea');
    const formats = {
      bold: '**نص عريض**',
      heading: '## عنوان',
      list: '- عنصر قائمة',
      quote: '> اقتباس',
      code: '```text\nمقطع برمجي\n```',
      link: '[نص الرابط](https://example.com)',
    };
    if (textarea) insertAtCursor(textarea, formats[formatButton.dataset.detailFormat] || '');
    return;
  }
  const previewButton = event.target.closest('[data-detail-preview-toggle]');
  if (previewButton) {
    const editor = previewButton.closest('.detail-markdown-editor');
    const textarea = editor.querySelector('textarea');
    const preview = editor.querySelector('.detail-markdown-preview');
    const showPreview = preview.classList.contains('hidden');
    preview.innerHTML = renderRichText(textarea.value);
    preview.classList.toggle('hidden', !showPreview);
    textarea.classList.toggle('hidden', showPreview);
    previewButton.textContent = showPreview ? 'تحرير' : 'معاينة';
    previewButton.setAttribute('aria-pressed', String(showPreview));
    return;
  }
  if (event.target.closest('[data-detail-edit-cancel]')) {
    await loadDetailPage();
    return;
  }
  const saveButton = event.target.closest('[data-detail-edit-save]');
  if (!saveButton || !detailItem) return;
  const field = saveButton.dataset.detailEditSave;
  if (!['review', 'notes'].includes(field)) return;
  const textarea = saveButton.closest('.detail-markdown-section')?.querySelector('textarea');
  if (!textarea) return;
  saveButton.disabled = true;
  try {
    await api(`/api/items/${detailItemId}`, {
      method: 'PUT',
      body: JSON.stringify({ ...detailItem, [field]: textarea.value }),
    });
    await loadDetailPage();
    showToast(`تم حفظ ${field === 'review' ? 'المراجعة' : 'الملاحظات'}.`);
  } catch (error) {
    showToast(error.message);
    saveButton.disabled = false;
  }
});

document.addEventListener('click', event => {
  const habitToggle = event.target.closest('[data-habit-toggle]');
  if (habitToggle) return toggleDailyRecord(habitToggle, 'habit');
  const routineToggle = event.target.closest('[data-routine-toggle]');
  if (routineToggle) toggleDailyRecord(routineToggle, 'routine');
});

document.addEventListener('change', async event => {
  const todayTodo = event.target.closest('[data-today-todo]');
  try {
    if (todayTodo) {
      const todo = todos.find(row => row.id === Number(todayTodo.dataset.todayTodo));
      if (!todo) return;
      await saveTodoCompletion(todo, todayTodo.checked);
    }
  } catch (error) {
    if (todayTodo) todayTodo.checked = false;
    showToast(error.message);
  }
});

document.getElementById('todoForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.id;
  const existingTodo = todos.find(todo => todo.id === Number(id));
  const openCountBefore = openTasksDueToday();
  values.completed = form.elements.completed.checked;
  delete values.id;
  try {
    await api(id ? `/api/todos/${id}` : '/api/todos', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    document.getElementById('todoDialog').close();
    await refreshWorkspace();
    if (existingTodo) maybeCelebrateToday(existingTodo, Boolean(existingTodo.completed), values.completed, openCountBefore);
    showToast('تم حفظ المهمة.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('celebrationDone').addEventListener('click', () => {
  document.getElementById('dailyCompletionDialog').close();
});

document.getElementById('todosList').addEventListener('change', async event => {
  const checkbox = event.target.closest('[data-todo-toggle]');
  if (!checkbox) return;
  const todo = todos.find(row => row.id === Number(checkbox.dataset.todoToggle));
  if (!todo) return;
  try {
    await saveTodoCompletion(todo, checkbox.checked);
  } catch (error) {
    checkbox.checked = Boolean(todo.completed);
    showToast(error.message);
  }
});

document.getElementById('todosList').addEventListener('click', async event => {
  const edit = event.target.closest('[data-todo-edit]');
  if (edit) return openTodoForm(todos.find(todo => todo.id === Number(edit.dataset.todoEdit)));
  const remove = event.target.closest('[data-todo-delete]');
  if (!remove) return;
  try {
    const result = await api(`/api/todos/${remove.dataset.todoDelete}`, { method: 'DELETE' });
    await refreshWorkspace();
    showToast('تم نقل المهمة إلى المحذوفات مؤقتاً.', result.undoToken);
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('articleForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.id;
  delete values.id;
  try {
    await api(id ? `/api/articles/${id}` : '/api/articles', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    document.getElementById('articleDialog').close();
    await refreshWorkspace();
    showToast('تم حفظ المقال والرابط.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('bookmarkForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.id;
  delete values.id;
  try {
    await api(id ? `/api/bookmarks/${id}` : '/api/bookmarks', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    document.getElementById('bookmarkDialog').close();
    await refreshWorkspace();
    showToast('تم حفظ الرابط المهم.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('snippetForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const id = values.id;
  delete values.id;
  try {
    await api(id ? `/api/snippets/${id}` : '/api/snippets', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    document.getElementById('snippetDialog').close();
    await refreshWorkspace();
    showToast('تم حفظ المقطع البرمجي.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('createClubButton').addEventListener('click', () => {
  document.getElementById('bookClubForm').reset();
  document.getElementById('bookClubDialog').showModal();
});
document.getElementById('bookClubForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const club = await api('/api/book-clubs', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    document.getElementById('bookClubDialog').close();
    activeClubId = club.id;
    await refreshWorkspace();
    await loadBookClub(activeClubId);
    showToast('تم إنشاء نادي الكتاب.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('bookClubList').addEventListener('click', event => {
  const button = event.target.closest('[data-club-select]');
  if (button) loadBookClub(Number(button.dataset.clubSelect));
});
document.getElementById('bookClubDetails').addEventListener('click', async event => {
  const revokeInvite = event.target.closest('[data-club-invite-revoke]');
  if (revokeInvite) {
    try {
      await api(`/api/book-clubs/${activeClubId}/invites/${revokeInvite.dataset.clubInviteRevoke}`, { method: 'DELETE' });
      await loadBookClub(activeClubId);
      showToast('تم إلغاء رابط الدعوة.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  const inviteButton = event.target.closest('[data-club-invite]');
  if (inviteButton) {
    try {
      const invite = await api(`/api/book-clubs/${inviteButton.dataset.clubInvite}/invites`, { method: 'POST' });
      const inviteUrl = new URL(invite.invitePath, window.location.origin).href;
      try {
        await navigator.clipboard.writeText(inviteUrl);
        showToast('تم نسخ رابط الدعوة. صلاحيته ٣٠ يوماً.');
      } catch {
        window.prompt('انسخ رابط دعوة نادي الكتاب (صالح ٣٠ يوماً):', inviteUrl);
      }
      await loadBookClub(activeClubId);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  const addBook = event.target.closest('[data-club-add-book]');
  if (addBook) {
    const itemId = document.getElementById('clubBookSelect').value;
    if (!itemId) return showToast('اختر كتاباً من مكتبتك أولاً.');
    try {
      await api(`/api/book-clubs/${addBook.dataset.clubAddBook}/books`, {
        method: 'POST',
        body: JSON.stringify({
          itemId: Number(itemId),
          totalPages: document.getElementById('clubBookTotalPages').value || 0,
        }),
      });
      await refreshWorkspace();
      showToast('أُضيف الكتاب إلى رف النادي.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  const deleteMeeting = event.target.closest('[data-club-meeting-delete]');
  if (deleteMeeting) {
    if (!window.confirm('حذف هذا الاجتماع ونقاطه؟')) return;
    try {
      await api(`/api/book-clubs/${activeClubId}/meetings/${deleteMeeting.dataset.clubMeetingDelete}`, { method: 'DELETE' });
      await loadBookClub(activeClubId);
      showToast('تم حذف الاجتماع.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  const deleteButton = event.target.closest('[data-club-delete]');
  const leaveButton = event.target.closest('[data-club-leave]');
  if (!deleteButton && !leaveButton) return;
  if (!window.confirm(deleteButton ? 'حذف النادي وكل رسائله وبياناته؟ لا يمكن التراجع عن ذلك.' : 'مغادرة هذا النادي؟')) return;
  try {
    await api(`/api/book-clubs/${deleteButton?.dataset.clubDelete || leaveButton.dataset.clubLeave}${deleteButton ? '' : '/membership'}`, {
      method: 'DELETE',
    });
    activeClubId = null;
    activeClub = null;
    await refreshWorkspace();
    showToast(deleteButton ? 'تم حذف النادي.' : 'غادرت النادي.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('bookClubDetails').addEventListener('change', async event => {
  const permission = event.target.closest('[data-club-member-books]');
  if (permission) {
    permission.disabled = true;
    try {
      await api(`/api/book-clubs/${activeClubId}/members/${permission.dataset.clubMemberBooks}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ canAddBooks: permission.checked }),
      });
      await loadBookClub(activeClubId);
      showToast(permission.checked ? 'مُنح العضو صلاحية إضافة الكتب.' : 'أُلغيت صلاحية إضافة الكتب.');
    } catch (error) {
      permission.checked = !permission.checked;
      showToast(error.message);
    } finally {
      permission.disabled = false;
    }
    return;
  }
  const select = event.target.closest('[data-club-book-progress]');
  const pagesInput = event.target.closest('[data-club-pages]');
  if (!select && !pagesInput) return;
  const card = event.target.closest('.club-book-card');
  const progressSelect = select || card.querySelector('[data-club-book-progress]');
  const pagesField = card.querySelector('[data-club-pages]');
  if (progressSelect.value === 'completed' && pagesField && !pagesField.value) pagesField.value = pagesField.max;
  try {
    await api(`/api/book-clubs/${activeClubId}/books/${progressSelect.dataset.clubBookProgress}/progress`, {
      method: 'PUT',
      body: JSON.stringify({
        status: progressSelect.value,
        pagesRead: pagesField ? Number(pagesField.value) : undefined,
        note: '',
      }),
    });
    await loadBookClub(activeClubId);
    showToast('تم تحديث تقدمك في القراءة.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('bookClubDetails').addEventListener('input', event => {
  const textarea = event.target.closest('#clubMessageContent');
  if (textarea) updateClubMentionSuggestions(textarea);
});
document.getElementById('bookClubDetails').addEventListener('click', event => {
  const suggestion = event.target.closest('[data-mention-username]');
  if (suggestion) {
    const textarea = document.getElementById('clubMessageContent');
    const beforeCursor = textarea.value.slice(0, textarea.selectionStart);
    const start = beforeCursor.lastIndexOf('@');
    const cursor = textarea.selectionStart;
    textarea.setRangeText(`@${suggestion.dataset.mentionUsername} `, start, cursor, 'end');
    document.getElementById('clubMentionSuggestions').classList.add('hidden');
    textarea.focus();
  }
});
document.getElementById('bookClubDetails').addEventListener('submit', async event => {
  const form = event.target.closest('[data-club-message]');
  const meetingForm = event.target.closest('[data-club-meeting]');
  const meetingEditForm = event.target.closest('[data-club-meeting-edit]');
  if (!form && !meetingForm && !meetingEditForm) return;
  event.preventDefault();
  try {
    if (form) {
      const formData = new FormData(form);
      await api(`/api/book-clubs/${form.dataset.clubMessage}/messages`, { method: 'POST', body: formData });
      await loadBookClub(activeClubId);
      return;
    }
    const values = Object.fromEntries(new FormData(meetingForm || meetingEditForm));
    const editing = Boolean(meetingEditForm);
    await api(editing
      ? `/api/book-clubs/${activeClubId}/meetings/${meetingEditForm.dataset.clubMeetingEdit}`
      : `/api/book-clubs/${meetingForm.dataset.clubMeeting}/meetings`, {
      method: editing ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });
    await loadBookClub(activeClubId);
    showToast(editing ? 'تم تحديث الاجتماع ونقاطه.' : 'تمت جدولة الاجتماع.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('snippetsList').addEventListener('click', async event => {
  const create = event.target.closest('[data-empty-action="snippet"]');
  if (create) return openSnippetForm();
  const edit = event.target.closest('[data-snippet-edit]');
  if (edit) return openSnippetForm(codeSnippets.find(snippet => snippet.id === Number(edit.dataset.snippetEdit)));
  const copy = event.target.closest('[data-snippet-copy]');
  if (copy) {
    const snippet = codeSnippets.find(row => row.id === Number(copy.dataset.snippetCopy));
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet.code);
      showToast('تم نسخ المقطع البرمجي.');
    } catch (error) {
      showToast(`تعذّر نسخ الكود: ${error.message}`);
    }
    return;
  }
  const remove = event.target.closest('[data-snippet-delete]');
  if (!remove) return;
  const snippet = codeSnippets.find(row => row.id === Number(remove.dataset.snippetDelete));
  if (!snippet || !window.confirm(`حذف المقطع "${snippet.title}"؟`)) return;
  try {
    await api(`/api/snippets/${snippet.id}`, { method: 'DELETE' });
    await refreshWorkspace();
    showToast('تم حذف المقطع البرمجي.');
  } catch (error) {
    showToast(error.message);
  }
});
document.getElementById('timelineFilter').addEventListener('submit', event => {
  event.preventDefault();
  renderTimeline();
});
document.querySelectorAll('[data-timeline-range]').forEach(button => {
  button.addEventListener('click', () => {
    const form = document.getElementById('timelineFilter');
    const end = form.elements.end.value || localToday();
    const startDate = new Date(`${end}T12:00:00`);
    startDate.setDate(startDate.getDate() - Number(button.dataset.timelineRange) + 1);
    form.elements.start.value = localDateValue(startDate);
    form.elements.end.value = end;
    renderTimeline();
  });
});

document.getElementById('bookmarksList').addEventListener('click', async event => {
  const emptyAction = event.target.closest('[data-empty-action="bookmark"]');
  if (emptyAction) return openBookmarkForm();
  const edit = event.target.closest('[data-bookmark-edit]');
  if (edit) return openBookmarkForm(bookmarks.find(bookmark => bookmark.id === Number(edit.dataset.bookmarkEdit)));
  const copy = event.target.closest('[data-bookmark-copy]');
  if (copy) {
    const bookmark = bookmarks.find(row => row.id === Number(copy.dataset.bookmarkCopy));
    if (!bookmark) return;
    try {
      await navigator.clipboard.writeText(bookmark.url);
      showToast('تم نسخ الرابط.');
    } catch (error) {
      showToast(`تعذّر نسخ الرابط: ${error.message}`);
    }
    return;
  }
  const remove = event.target.closest('[data-bookmark-delete]');
  if (!remove) return;
  try {
    const result = await api(`/api/bookmarks/${remove.dataset.bookmarkDelete}`, { method: 'DELETE' });
    await refreshWorkspace();
    showToast('تم نقل الرابط إلى المحذوفات مؤقتاً.', result.undoToken);
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('articlesList').addEventListener('click', async event => {
  const emptyAction = event.target.closest('[data-empty-action="article"]');
  if (emptyAction) return openArticleForm();
  const toggle = event.target.closest('.text-toggle');
  if (toggle) {
    const text = toggle.previousElementSibling;
    const expanded = text.classList.toggle('is-truncated') === false;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'عرض أقل' : 'اقرأ المزيد';
    return;
  }
  const edit = event.target.closest('[data-article-edit]');
  if (edit) return openArticleForm(articles.find(article => article.id === Number(edit.dataset.articleEdit)));
  const status = event.target.closest('[data-article-status]');
  if (status) {
    const article = articles.find(row => row.id === Number(status.dataset.articleStatus));
    if (!article) return;
    status.disabled = true;
    try {
      await api(`/api/articles/${article.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...article, status: status.dataset.nextStatus }),
      });
      await refreshWorkspace();
      showToast('تم تحديث حالة القراءة.');
    } catch (error) {
      status.disabled = false;
      showToast(error.message);
    }
    return;
  }
  const remove = event.target.closest('[data-article-delete]');
  if (!remove) return;
  try {
    const result = await api(`/api/articles/${remove.dataset.articleDelete}`, { method: 'DELETE' });
    await refreshWorkspace();
    showToast('تم نقل الرابط إلى المحذوفات مؤقتاً.', result.undoToken);
  } catch (error) {
    showToast(error.message);
  }
});

progressForm.addEventListener('submit', async event => {
  event.preventDefault();
  const update = Object.fromEntries(new FormData(progressForm));
  try {
    await api(`/api/items/${trackingId}/progress`, { method: 'POST', body: JSON.stringify(update) });
    showToast('تم حفظ تقدمك.');
    await openProgress(trackingId);
    await refresh();
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll('[data-close]').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
});

setTheme('system');
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themeMode === 'system') setTheme('system');
});
const detailMatch = location.pathname.match(/^\/item\/(\d+)\/?$/);
detailItemId = detailMatch ? Number(detailMatch[1]) : null;
const timelineEnd = localToday();
const timelineStartDate = new Date(`${timelineEnd}T12:00:00`);
timelineStartDate.setDate(timelineStartDate.getDate() - 29);
document.querySelector('#timelineFilter [name="start"]').value = localDateValue(timelineStartDate);
document.querySelector('#timelineFilter [name="end"]').value = timelineEnd;
applyAutoDirection();
initializeSession();
setInterval(() => {
  if (currentUser) refreshWorkspace().catch(error => showToast(error.message));
}, 60000);
