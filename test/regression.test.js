const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const yauzl = require('yauzl');
const Database = require('better-sqlite3');
const express = require('express');
const createAIInterviewsRouter = require('../routes/ai-interviews');
const createFinanceAIRouter = require('../routes/finance-ai');
const aiProvider = require('../lib/ai-provider');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-memo-regression-'));
process.env.PERSONAL_MEMO_AI_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('hex');
process.env.PERSONAL_MEMO_DB = path.join(testDirectory, 'memo.sqlite');
process.env.PERSONAL_MEMO_UPLOAD_DIR = path.join(testDirectory, 'uploads');
process.env.PERSONAL_MEMO_AUDIO_DIR = path.join(testDirectory, 'audio');
process.env.PERSONAL_MEMO_CLUB_UPLOAD_DIR = path.join(testDirectory, 'club-uploads');
process.env.PERSONAL_MEMO_LEARNING_UPLOAD_DIR = path.join(testDirectory, 'learning-uploads');
process.env.PERSONAL_MEMO_BACKUP_DIR = path.join(testDirectory, 'backups');

const legacyDatabase = new Database(process.env.PERSONAL_MEMO_DB);
legacyDatabase.exec(`CREATE TABLE book_club_members (
  club_id INTEGER NOT NULL REFERENCES book_clubs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (club_id,user_id)
);
CREATE TABLE user_preferences (
  user_id INTEGER PRIMARY KEY,
  edit_mode TEXT NOT NULL DEFAULT 'inline',
  notification_enabled INTEGER NOT NULL DEFAULT 0,
  theme_mode TEXT NOT NULL DEFAULT 'system',
  reminder_minutes INTEGER NOT NULL DEFAULT 15,
  notification_sound_enabled INTEGER NOT NULL DEFAULT 1,
  markdown_rendering_enabled INTEGER NOT NULL DEFAULT 1,
  markdown_toolbar_enabled INTEGER NOT NULL DEFAULT 1,
  markdown_image_paste_enabled INTEGER NOT NULL DEFAULT 1
);`);
legacyDatabase.close();

const { app, db } = require('../server');
assert.ok(db.prepare('PRAGMA table_info(book_club_members)').all().some(column => column.name === 'can_add_books'));
const migratedPreferenceColumns = db.prepare('PRAGMA table_info(user_preferences)').all().map(column => column.name);
assert.ok(migratedPreferenceColumns.includes('font_size_offset'));
assert.ok(migratedPreferenceColumns.includes('line_spacing'));
assert.ok(migratedPreferenceColumns.includes('font_family'));
assert.ok(migratedPreferenceColumns.includes('language'));
assert.ok(migratedPreferenceColumns.includes('prayer_latitude'));
assert.ok(migratedPreferenceColumns.includes('prayer_longitude'));
assert.ok(migratedPreferenceColumns.includes('prayer_location'));
assert.ok(migratedPreferenceColumns.includes('prayer_method'));
assert.ok(migratedPreferenceColumns.includes('finance_currency'));
assert.ok(migratedPreferenceColumns.includes('focus_duration_minutes'));
assert.ok(migratedPreferenceColumns.includes('focus_break_minutes'));
assert.ok(db.prepare('PRAGMA table_info(focus_sessions)').all().some(column => column.name === 'session_key'));
assert.ok(migratedPreferenceColumns.includes('shortcut_todo'));
assert.ok(db.prepare('PRAGMA table_info(bookmarks)').all().some(column => column.name === 'category'));
assert.ok(db.prepare('PRAGMA table_info(focus_sessions)').all().some(column => column.name === 'todo_id'));
assert.ok(db.prepare('PRAGMA table_info(focus_sessions)').all().some(column => column.name === 'elapsed_seconds'));
assert.ok(db.prepare('PRAGMA table_info(interview_applications)').all().some(column => column.name === 'company'));
assert.ok(db.prepare('PRAGMA table_info(interview_rounds)').all().some(column => column.name === 'questions_answers'));
assert.ok(db.prepare('PRAGMA table_info(interview_rounds)').all().some(column => column.name === 'scheduled_start'));
assert.ok(db.prepare('PRAGMA table_info(interview_rounds)').all().some(column => column.name === 'scheduled_end'));
assert.ok(db.prepare('PRAGMA table_info(interview_rounds)').all().some(column => column.name === 'calendar_event_id'));
assert.ok(db.prepare('PRAGMA table_info(interview_topics)').all().some(column => column.name === 'title'));
assert.ok(db.prepare('PRAGMA table_info(interview_cards)').all().some(column => column.name === 'answer'));
let server;
let baseUrl;
let ownerCookie;
let itemId;
let coverFilename;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (ownerCookie) {
    const backupSettings = await jsonRequest('/api/settings', 'PUT', { dailyBackupEnabled: false }, ownerCookie);
    assert.equal(backupSettings.response.status, 200);
  }
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

async function request(url, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    body,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
  return { response, result };
}

async function createAccount(username, password) {
  const { response, result } = await request('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
}

async function jsonRequest(url, method, payload, cookie) {
  return request(url, {
    method,
    cookie,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function withAIHarness(userId, callback) {
  let callNumber = 0;
  const providerRequests = [];
  const aiApp = express();
  aiApp.use(express.json({ limit: '32kb' }));
  aiApp.use((req, res, next) => { req.user = { id: userId }; next(); });
  const requestProviderCompletion = async ({ messages }) => {
    const prompt = messages.at(-1)?.content || '';
    providerRequests.push(prompt);
    if (prompt.includes('Reply with the single word OK.')) return 'OK';
    const data = JSON.parse(prompt);
    if (data.task?.startsWith('Review these finance aggregates')) {
      return JSON.stringify({
        overview: 'Spending is concentrated in the largest categories in the selected period.',
        observations: ['The supplied data covers six months.'],
        actions: [{ action: 'Review recurring costs alongside current priorities.', category: 'Subscriptions', priority: 'medium' }],
        watchouts: ['This is educational guidance, not professional financial advice.'],
      });
    }
    if (data.task?.startsWith('Start this interview')) return JSON.stringify({ question: 'Tell me about a challenging project.' });
    if (data.task?.startsWith('Review this interview')) {
      return JSON.stringify({
        summary: 'A focused practice session.',
        overall_score: 3,
        top_strengths: ['Clear communication'],
        focus_areas: ['Add more detail'],
        next_steps: ['Practice a concise example'],
      });
    }
    callNumber += 1;
    if (data.final_question) {
      return JSON.stringify({
        feedback: 'You clearly explained the trade-offs.',
        strengths: ['Clear technical reasoning'],
        improvements: ['Add measurable outcomes'],
        score: 4,
        next_question: null,
        final_report: {
          summary: 'A thoughtful interview with strong technical reasoning.',
          overall_score: 4,
          top_strengths: ['Clear technical reasoning'],
          focus_areas: ['Quantify impact'],
          next_steps: ['Practice concise STAR stories'],
        },
      });
    }
    return JSON.stringify({
      feedback: `Specific feedback ${callNumber}.`,
      strengths: ['Explains the decision'],
      improvements: ['Add a concrete metric'],
      score: 3,
      next_question: `Adaptive follow-up ${callNumber}?`,
      final_report: null,
    });
  };
  const providerServices = {
    db,
    now: () => new Date().toISOString(),
    text: value => typeof value === 'string' ? value.trim() : '',
    ...aiProvider,
    requestProviderCompletion,
  };
  aiApp.use('/api', createAIInterviewsRouter(providerServices));
  aiApp.use('/api', createFinanceAIRouter(providerServices));
  const aiServer = aiApp.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    aiServer.once('listening', resolve);
    aiServer.once('error', reject);
  });
  const aiBaseUrl = `http://127.0.0.1:${aiServer.address().port}`;
  const aiJsonRequest = async (url, method = 'GET', body) => {
    const response = await fetch(`${aiBaseUrl}${url}`, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { response, result: await response.json() };
  };
  try {
    await callback(aiJsonRequest, providerRequests);
  } finally {
    await new Promise(resolve => aiServer.close(resolve));
  }
}

function archiveEntries(filePath) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      const entries = [];
      archive.on('entry', entry => {
        entries.push(entry.fileName);
        archive.readEntry();
      });
      archive.once('end', () => resolve(entries));
      archive.once('error', reject);
      archive.readEntry();
    });
  });
}

function readArchiveEntry(filePath, targetName) {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (error, archive) => {
      if (error) return reject(error);
      archive.on('entry', entry => {
        if (entry.fileName !== targetName) {
          archive.readEntry();
          return;
        }
        archive.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.once('end', () => {
            archive.close();
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
          stream.once('error', reject);
        });
      });
      archive.once('end', () => reject(new Error(`Archive entry not found: ${targetName}`)));
      archive.once('error', reject);
      archive.readEntry();
    });
  });
}

test('question imports parse quoted CSV and JSON metadata safely', async () => {
  const { parseQuestionImport } = await import('../src/question-import.mjs');
  const csv = '\uFEFFquestion,answer,answer_notes,tags,difficulty\r\n"What is ""idempotency""?\nExplain it","Same result, repeated.","Use an example.","api, design",advanced\r\n';
  assert.deepEqual(parseQuestionImport('csv', csv), [{
    question: 'What is "idempotency"?\nExplain it',
    answer: 'Same result, repeated.',
    answer_notes: 'Use an example.',
    tags: ['api', 'design'],
    difficulty: 'advanced',
  }]);
  assert.deepEqual(parseQuestionImport('json', '[{"question":"Explain caching","answer":"Store reusable results","tags":["backend"]}]'), [{
    question: 'Explain caching',
    answer: 'Store reusable results',
    answer_notes: '',
    tags: ['backend'],
    difficulty: 'intermediate',
  }]);
  assert.throws(() => parseQuestionImport('csv', 'question,answer\n"What is this?,No answer'), /unclosed quoted field/);
  assert.throws(() => parseQuestionImport('json', '[{"question":"Q","answer":"A","difficulty":"expert"}]'), /difficulty must be/);
});

test('accounts, library search, recurring tasks, undo, and full media backup restore', async () => {
  ownerCookie = await createAccount('owner_test', 'test-password-1234');
  const ownerUserId = db.prepare('SELECT id FROM users WHERE username=?').get('owner_test').id;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const uploadResponse = await request('/api/images', {
    method: 'POST',
    body: png,
    cookie: ownerCookie,
    headers: { 'Content-Type': 'image/png' },
  });
  assert.equal(uploadResponse.response.status, 201);
  coverFilename = uploadResponse.result.url.split('/').pop();

  const createdItem = await jsonRequest('/api/items', 'POST', {
    kind: 'book',
    title: 'Regression handbook',
    creator: 'Memo tests',
    status: 'planned',
    cover_image: uploadResponse.result.url,
  }, ownerCookie);
  assert.equal(createdItem.response.status, 201);
  itemId = createdItem.result.id;

  const spaShell = await request('/', { cookie: ownerCookie });
  assert.equal(spaShell.response.status, 200);
  const spaHtml = new TextDecoder().decode(spaShell.result);
  assert.match(spaHtml, /<div id="root"><\/div>/);
  assert.doesNotMatch(spaHtml, /legacy-shell|app\.js|i18n\.js/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'src', 'legacy-shell.html')), false);
  const reactEntry = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.jsx'), 'utf8');
  assert.doesNotMatch(reactEntry, /dangerouslySetInnerHTML|legacy-shell|loadClassicScript/);
  const clientBundlePath = spaHtml.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(clientBundlePath, 'React client bundle is referenced by the SPA shell');
  assert.equal((await request(clientBundlePath)).response.status, 200);
  const stylesheetPath = spaHtml.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert.ok(stylesheetPath, 'Bundled React stylesheet is referenced by the SPA shell');
  assert.equal((await request(stylesheetPath)).response.status, 200);
  assert.equal((await request('/app.js')).response.status, 404);

  const itemPage = await request(`/item/${itemId}`, { cookie: ownerCookie });
  assert.equal(itemPage.response.status, 200);
  assert.match(new TextDecoder().decode(itemPage.result), /<div id="root"><\/div>/);
  assert.equal((await request(`/item/${itemId}`)).response.status, 401);

  const audioForm = new FormData();
  audioForm.append('audioFiles', new Blob(['ID3'], { type: 'audio/mpeg' }), 'sample.mp3');
  const audioResponse = await request(`/api/items/${itemId}/audio`, {
    method: 'POST',
    body: audioForm,
    cookie: ownerCookie,
  });
  assert.equal(audioResponse.response.status, 201);
  const audioFilename = db.prepare('SELECT filename FROM audio_attachments WHERE item_id=?').get(itemId).filename;

  const article = await jsonRequest('/api/articles', 'POST', {
    title: 'Regression article',
    url: 'https://example.com/regression',
    description: 'Searchable content',
    excerpt: '',
    review: '',
    status: 'unread',
  }, ownerCookie);
  assert.equal(article.response.status, 201);
  const paginatedArticles = await request('/api/articles?page=1&pageSize=1&q=Searchable', { cookie: ownerCookie });
  assert.equal(paginatedArticles.response.status, 200);
  assert.deepEqual({
    total: paginatedArticles.result.total,
    page: paginatedArticles.result.page,
    pageSize: paginatedArticles.result.pageSize,
    pageCount: paginatedArticles.result.pageCount,
  }, { total: 1, page: 1, pageSize: 1, pageCount: 1 });
  assert.equal(paginatedArticles.result.items[0].id, article.result.id);
  const emptyArticlePage = await request('/api/articles?page=9&pageSize=1&q=No%20matching%20article', { cookie: ownerCookie });
  assert.equal(emptyArticlePage.result.page, 1);
  assert.equal(emptyArticlePage.result.pageCount, 0);
  assert.equal(emptyArticlePage.result.items.length, 0);

  const bookmark = await jsonRequest('/api/bookmarks', 'POST', {
    title: 'Regression guide',
    url: 'https://example.com/guide',
    note: 'Keep this useful reference nearby',
    category: 'تعلم',
  }, ownerCookie);
  assert.equal(bookmark.response.status, 201);
  assert.equal(bookmark.result.note, 'Keep this useful reference nearby');
  assert.equal(bookmark.result.category, 'تعلم');
  const categorizedBookmarkUpdate = await jsonRequest(`/api/bookmarks/${bookmark.result.id}`, 'PUT', {
    title: 'Regression guide',
    url: 'https://example.com/guide',
    note: 'Keep this useful reference nearby',
    category: 'عمل',
  }, ownerCookie);
  assert.equal(categorizedBookmarkUpdate.response.status, 200);
  assert.equal(categorizedBookmarkUpdate.result.category, 'عمل');
  const invalidBookmarkCategory = await jsonRequest('/api/bookmarks', 'POST', {
    title: 'Too long group',
    url: 'https://example.com/category',
    category: 'a'.repeat(41),
  }, ownerCookie);
  assert.equal(invalidBookmarkCategory.response.status, 400);
  const invalidBookmark = await jsonRequest('/api/bookmarks', 'POST', {
    title: 'Unsafe link',
    url: 'javascript:alert(1)',
    note: '',
  }, ownerCookie);
  assert.equal(invalidBookmark.response.status, 400);
  const snippet = await jsonRequest('/api/snippets', 'POST', {
    title: 'Fetch with timeout',
    language: 'JavaScript',
    description: 'A reusable fetch example',
    code: 'const response = await fetch(url);',
  }, ownerCookie);
  assert.equal(snippet.response.status, 201);
  assert.equal(snippet.result.code, 'const response = await fetch(url);');
  const invalidSnippet = await jsonRequest('/api/snippets', 'POST', {
    title: '',
    code: '',
  }, ownerCookie);
  assert.equal(invalidSnippet.response.status, 400);
  const updatedSnippet = await jsonRequest(`/api/snippets/${snippet.result.id}`, 'PUT', {
    title: 'Fetch with timeout',
    language: 'JavaScript',
    description: 'Updated description',
    code: 'const response = await fetch(url, { signal });',
  }, ownerCookie);
  assert.equal(updatedSnippet.response.status, 200);
  assert.equal(updatedSnippet.result.description, 'Updated description');

  const learningTopic = await jsonRequest('/api/learning/topics', 'POST', {
    title: 'TypeScript foundations',
    description: 'Types and practical patterns',
    status: 'learning',
  }, ownerCookie);
  assert.equal(learningTopic.response.status, 201);
  const learningNote = await jsonRequest(`/api/learning/topics/${learningTopic.result.id}/notes`, 'POST', {
    title: 'Narrowing union types',
    body: '## Discriminated unions\nUse a shared property to narrow safely.',
  }, ownerCookie);
  assert.equal(learningNote.response.status, 201);
  const learningFiles = new FormData();
  learningFiles.append('files', new Blob(['Useful reference material'], { type: 'text/plain' }), 'reference.txt');
  const uploadedLearningFiles = await request(`/api/learning/notes/${learningNote.result.id}/files`, {
    method: 'POST',
    body: learningFiles,
    cookie: ownerCookie,
  });
  assert.equal(uploadedLearningFiles.response.status, 201);
  const learningDetail = await request(`/api/learning/topics/${learningTopic.result.id}`, { cookie: ownerCookie });
  assert.equal(learningDetail.result.notes[0].title, 'Narrowing union types');
  assert.equal(learningDetail.result.notes[0].files.length, 1);
  const downloadedLearningFile = await request(learningDetail.result.notes[0].files[0].url, { cookie: ownerCookie });
  assert.equal(downloadedLearningFile.response.status, 200);
  assert.equal(Buffer.from(downloadedLearningFile.result).toString('utf8'), 'Useful reference material');
  const learningGuestCookie = await createAccount('learning_guest', 'guest-password-1234');
  const privateLearningTopic = await request(`/api/learning/topics/${learningTopic.result.id}`, { cookie: learningGuestCookie });
  assert.equal(privateLearningTopic.response.status, 404);
  assert.equal((await request('/api/focus', { cookie: learningGuestCookie })).result.total_xp, 0);

  const recurring = await jsonRequest('/api/todos', 'POST', {
    title: 'Regression monthly task',
    notes: '',
    due_date: '2024-01-31',
    due_time: '09:30',
    recurrence: 'monthly',
    completed: false,
  }, ownerCookie);
  assert.equal(recurring.response.status, 201);
  const application = await jsonRequest('/api/interviews', 'POST', {
    company: 'Example Labs',
    role: 'Software Engineer',
    status: 'interviewing',
    job_url: 'https://example.com/jobs/engineer',
    applied_on: '2026-10-21',
    notes: 'Prepare a concise project summary.',
  }, ownerCookie);
  assert.equal(application.response.status, 201);
  assert.equal((await request('/api/interviews', { cookie: learningGuestCookie })).result.length, 0);
  assert.equal((await request(`/api/interviews/${application.result.id}`, {
    method: 'DELETE',
    cookie: learningGuestCookie,
  })).response.status, 404);
  const interviewRound = await jsonRequest(`/api/interviews/${application.result.id}/rounds`, 'POST', {
    round_name: 'Technical interview',
    occurred_on: '2026-10-22',
    scheduled_start: '2026-10-23T13:00',
    scheduled_end: '2026-10-23T14:00',
    questions_answers: 'Question: How do you test?\nAnswer: With focused regression tests.',
    questions_for_them: 'How does the team review changes?',
    experience: 'The discussion was thoughtful; review database indexes before the next round.',
    follow_up: 'Send a thank-you note tomorrow.',
  }, ownerCookie);
  assert.equal(interviewRound.response.status, 201);
  assert.ok(interviewRound.result.calendar_event_id);
  const scheduledEvents = await request('/api/events?start=2026-10-23&end=2026-10-23', { cookie: ownerCookie });
  assert.equal(scheduledEvents.result.length, 1);
  assert.equal(scheduledEvents.result[0].id, interviewRound.result.calendar_event_id);
  assert.match(scheduledEvents.result[0].title, /Software Engineer/);
  assert.equal(scheduledEvents.result[0].interview_application_id, application.result.id);
  assert.equal(scheduledEvents.result[0].interview_company, application.result.company);
  assert.equal(scheduledEvents.result[0].interview_role, application.result.role);
  assert.equal((await request(`/api/events/${interviewRound.result.calendar_event_id}`, {
    method: 'DELETE',
    cookie: learningGuestCookie,
  })).response.status, 404);
  assert.equal((await jsonRequest(`/api/interviews/${application.result.id}/rounds/${interviewRound.result.id}`, 'PUT', {
    ...interviewRound.result,
    scheduled_start: '2026-10-23T14:00',
    scheduled_end: '2026-10-23T15:00',
    experience: 'I learned to clarify assumptions before answering.',
  }, ownerCookie)).response.status, 200);
  const rescheduledEvents = await request('/api/events?start=2026-10-23&end=2026-10-23', { cookie: ownerCookie });
  assert.equal(rescheduledEvents.result.length, 1);
  assert.equal(rescheduledEvents.result[0].id, interviewRound.result.calendar_event_id);
  assert.equal(rescheduledEvents.result[0].occurrence_start, '2026-10-23T14:00');
  const invalidSchedule = await jsonRequest(`/api/interviews/${application.result.id}/rounds/${interviewRound.result.id}`, 'PUT', {
    ...interviewRound.result,
    scheduled_start: '2026-10-23T15:00',
    scheduled_end: '2026-10-23T14:00',
  }, ownerCookie);
  assert.equal(invalidSchedule.response.status, 400);
  const updatedApplication = await jsonRequest(`/api/interviews/${application.result.id}`, 'PUT', {
    ...application.result,
    status: 'offer',
    role: 'Senior Software Engineer',
  }, ownerCookie);
  assert.equal(updatedApplication.response.status, 200);
  const renamedApplicationEvents = await request('/api/events?start=2026-10-23&end=2026-10-23', { cookie: ownerCookie });
  assert.match(renamedApplicationEvents.result[0].title, /Senior Software Engineer/);
  const interviewApplications = await request('/api/interviews', { cookie: ownerCookie });
  assert.equal(interviewApplications.result[0].rounds[0].questions_answers,
    'Question: How do you test?\nAnswer: With focused regression tests.');
  assert.equal(interviewApplications.result[0].rounds[0].scheduled_start, '2026-10-23T14:00');
  assert.equal(interviewApplications.result[0].rounds[0].calendar_event_id, interviewRound.result.calendar_event_id);
  assert.equal(interviewApplications.result[0].status, 'offer');
  const cleanupApplication = await jsonRequest('/api/interviews', 'POST', {
    company: 'Cleanup Labs',
    role: 'Engineer',
  }, ownerCookie);
  const cleanupRound = await jsonRequest(`/api/interviews/${cleanupApplication.result.id}/rounds`, 'POST', {
    round_name: 'Final interview',
    scheduled_start: '2026-10-24T10:00',
    scheduled_end: '2026-10-24T11:00',
  }, ownerCookie);
  assert.ok(cleanupRound.result.calendar_event_id);
  assert.equal((await request(`/api/interviews/${cleanupApplication.result.id}/rounds/${cleanupRound.result.id}`, {
    method: 'DELETE',
    cookie: ownerCookie,
  })).response.status, 200);
  assert.equal((await request('/api/events?start=2026-10-24&end=2026-10-24', { cookie: ownerCookie })).result.length, 0);
  const cleanupRoundForApplication = await jsonRequest(`/api/interviews/${cleanupApplication.result.id}/rounds`, 'POST', {
    round_name: 'Final interview',
    scheduled_start: '2026-10-24T10:00',
    scheduled_end: '2026-10-24T11:00',
  }, ownerCookie);
  assert.ok(cleanupRoundForApplication.result.calendar_event_id);
  assert.equal((await request(`/api/interviews/${cleanupApplication.result.id}`, {
    method: 'DELETE',
    cookie: ownerCookie,
  })).response.status, 200);
  assert.equal((await request('/api/events?start=2026-10-24&end=2026-10-24', { cookie: ownerCookie })).result.length, 0);
  const mockTopic = await jsonRequest('/api/interviews/topics', 'POST', {
    title: 'System Design',
  }, ownerCookie);
  assert.equal(mockTopic.response.status, 201);
  const privateMockTopics = await request('/api/interviews/mock', { cookie: learningGuestCookie });
  assert.deepEqual(privateMockTopics.result, []);
  assert.equal((await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}`, 'PUT', {
    title: 'System Design',
  }, learningGuestCookie)).response.status, 404);
  assert.equal((await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}/cards`, 'POST', {
    question: 'Design a rate limiter.',
    answer: 'Use a token bucket backed by shared storage for distributed instances.',
  }, learningGuestCookie)).response.status, 404);
  const mockCard = await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}/cards`, 'POST', {
    question: 'Design a rate limiter.',
    answer: 'Use a token bucket backed by shared storage for distributed instances.',
    answer_notes: 'Cover burst handling, atomic updates, and distributed consistency.',
    tags: 'system design, distributed systems',
    difficulty: 'advanced',
  }, ownerCookie);
  assert.equal(mockCard.response.status, 201);
  assert.deepEqual(mockCard.result.tags, ['system design', 'distributed systems']);
  assert.equal(mockCard.result.difficulty, 'advanced');
  assert.equal((await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}/cards/${mockCard.result.id}`, 'PUT', {
    ...mockCard.result,
    answer: 'Use a token bucket with an atomic shared backing store.',
  }, ownerCookie)).response.status, 200);
  const mockTopics = await request('/api/interviews/mock', { cookie: ownerCookie });
  assert.equal(mockTopics.result[0].title, 'System Design');
  assert.equal(mockTopics.result[0].card_count, 1);
  const mockCardPage = await request(`/api/interviews/topics/${mockTopic.result.id}/cards?page=1&pageSize=1`, { cookie: ownerCookie });
  assert.equal(mockCardPage.result.total, 1);
  assert.equal(mockCardPage.result.cards[0].answer, 'Use a token bucket with an atomic shared backing store.');
  assert.equal(mockCardPage.result.cards[0].answer_notes, 'Cover burst handling, atomic updates, and distributed consistency.');
  assert.deepEqual(mockCardPage.result.cards[0].tags, ['system design', 'distributed systems']);
  const filteredCards = await request(`/api/interviews/topics/${mockTopic.result.id}/cards?tag=distributed%20systems&difficulty=advanced`, { cookie: ownerCookie });
  assert.equal(filteredCards.result.total, 1);
  const emptyFilteredCards = await request(`/api/interviews/topics/${mockTopic.result.id}/cards?tag=unknown`, { cookie: ownerCookie });
  assert.equal(emptyFilteredCards.result.total, 0);
  const mockPractice = await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}/practice-sessions`, 'POST', {
    mode: 'unpracticed',
    count: '5',
    time_limit_seconds: 60,
    difficulty: 'advanced',
    tag: 'distributed systems',
  }, ownerCookie);
  assert.equal(mockPractice.response.status, 201);
  assert.equal(mockPractice.result.cards.length, 1);
  assert.equal(mockPractice.result.cards[0].answer_notes, 'Cover burst handling, atomic updates, and distributed consistency.');
  assert.equal((await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}/practice-sessions`, 'POST', {
    mode: 'random', count: '5', time_limit_seconds: 45,
  }, ownerCookie)).response.status, 400);
  assert.equal((await request(`/api/interviews/topics/${mockTopic.result.id}/practice-sessions`, {
    cookie: learningGuestCookie,
  })).response.status, 404);
  const mockPracticeResponse = await jsonRequest(`/api/interviews/practice-sessions/${mockPractice.result.id}/responses/${mockCard.result.id}`, 'PUT', {
    rating: 'needs_work',
    response: 'Need to explain shared storage consistency.',
    elapsed_seconds: 42,
  }, ownerCookie);
  assert.equal(mockPracticeResponse.response.status, 200);
  const completedMockPractice = await jsonRequest(`/api/interviews/practice-sessions/${mockPractice.result.id}/complete`, 'POST', {
    elapsed_seconds: 58,
  }, ownerCookie);
  assert.equal(completedMockPractice.result.needs_work, 1);
  assert.equal(completedMockPractice.result.answered, 1);
  const needsWorkCards = await request(`/api/interviews/topics/${mockTopic.result.id}/cards?mode=needs_work`, { cookie: ownerCookie });
  assert.equal(needsWorkCards.result.total, 1);
  assert.equal(needsWorkCards.result.cards[0].last_rating, 'needs_work');
  const practicedCards = await request(`/api/interviews/topics/${mockTopic.result.id}/cards?mode=unpracticed`, { cookie: ownerCookie });
  assert.equal(practicedCards.result.total, 0);
  assert.equal((await request(`/api/interviews/topics/${mockTopic.result.id}/practice-sessions`, { cookie: ownerCookie })).result[0].needs_work, 1);
  const mockQuiz = await request(`/api/interviews/topics/${mockTopic.result.id}/quiz?count=10`, { cookie: ownerCookie });
  assert.equal(mockQuiz.result.cards.length, 1);
  assert.equal((await request(`/api/interviews/topics/${mockTopic.result.id}/quiz?count=all`, { cookie: learningGuestCookie })).response.status, 404);
  assert.equal((await request(`/api/interviews/topics/${mockTopic.result.id}/quiz?count=3`, { cookie: ownerCookie })).response.status, 400);
  assert.equal((await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}/cards`, 'POST', {
    question: '',
    answer: 'Missing question',
  }, ownerCookie)).response.status, 400);
  assert.equal((await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}`, 'DELETE', {}, learningGuestCookie)).response.status, 404);
  const bulkCardInsert = db.prepare(`INSERT INTO interview_cards(topic_id,user_id,question,answer,created_at,updated_at)
    VALUES (?,?,?,?,?,?)`);
  const bulkTimestamp = new Date().toISOString();
  const insertBulkCards = db.transaction(() => {
    for (let index = 0; index < 1000; index += 1) {
      bulkCardInsert.run(mockTopic.result.id, ownerUserId, `Scale test question ${index + 1}`,
        `Scale test answer ${index + 1}`, bulkTimestamp, bulkTimestamp);
    }
  });
  insertBulkCards();
  const largeTopicList = await request('/api/interviews/mock', { cookie: ownerCookie });
  assert.equal(largeTopicList.result[0].card_count, 1001);
  assert.equal(Object.hasOwn(largeTopicList.result[0], 'cards'), false);
  const firstLargePage = await request(`/api/interviews/topics/${mockTopic.result.id}/cards?page=1&pageSize=20`, { cookie: ownerCookie });
  assert.equal(firstLargePage.result.total, 1001);
  assert.equal(firstLargePage.result.cards.length, 20);
  assert.equal(firstLargePage.result.pageCount, 51);
  const searchedCards = await request(`/api/interviews/topics/${mockTopic.result.id}/cards?q=Scale%20test%20question%201000&page=1&pageSize=20`, {
    cookie: ownerCookie,
  });
  assert.equal(searchedCards.result.total, 1);
  assert.equal(searchedCards.result.cards[0].question, 'Scale test question 1000');
  const sampledQuiz = await request(`/api/interviews/topics/${mockTopic.result.id}/quiz?count=10`, { cookie: ownerCookie });
  assert.equal(sampledQuiz.result.cards.length, 10);
  assert.equal((await request(`/api/interviews/topics/${mockTopic.result.id}/quiz?count=10`, {
    cookie: learningGuestCookie,
  })).response.status, 404);
  db.prepare('DELETE FROM interview_cards WHERE topic_id=? AND question LIKE ?')
    .run(mockTopic.result.id, 'Scale test question %');
  const importTopic = await jsonRequest('/api/interviews/topics', 'POST', { title: 'Import regression' }, ownerCookie);
  const existingImportCard = await jsonRequest(`/api/interviews/topics/${importTopic.result.id}/cards`, 'POST', {
    question: 'Existing question',
    answer: 'Existing answer',
  }, ownerCookie);
  assert.equal(existingImportCard.response.status, 201);
  assert.equal((await jsonRequest(`/api/interviews/topics/${importTopic.result.id}/cards/import`, 'POST', {
    cards: [{ question: 'Private question', answer: 'Answer' }],
  }, learningGuestCookie)).response.status, 404);
  const importedCards = await jsonRequest(`/api/interviews/topics/${importTopic.result.id}/cards/import`, 'POST', {
    cards: [
      { question: ' Existing   question ', answer: 'Duplicate answer' },
      { question: 'Imported question', answer: 'Imported answer', difficulty: 'beginner', tags: ['backend', 'api'] },
      { question: 'Imported question', answer: 'Duplicate in this batch' },
      { question: 'Second imported question', answer: 'Another answer', answer_notes: 'Keep it concise.' },
    ],
  }, ownerCookie);
  assert.equal(importedCards.response.status, 201);
  assert.deepEqual(importedCards.result, { imported: 2, duplicates: 2 });
  assert.equal((await request(`/api/interviews/topics/${importTopic.result.id}/cards`, { cookie: ownerCookie })).result.total, 3);
  assert.equal((await jsonRequest(`/api/interviews/topics/${importTopic.result.id}/cards/import`, 'POST', {
    cards: [
      { question: 'Would be valid', answer: 'Would be saved only if batch validation were partial.' },
      { question: '', answer: 'Invalid question.' },
    ],
  }, ownerCookie)).response.status, 400);
  assert.equal((await request(`/api/interviews/topics/${importTopic.result.id}/cards`, { cookie: ownerCookie })).result.total, 3);
  assert.equal((await jsonRequest(`/api/interviews/topics/${importTopic.result.id}`, 'DELETE', {}, ownerCookie)).response.status, 200);
  assert.equal((await jsonRequest('/api/interviews', 'POST', {
    company: 'Bad status',
    role: 'Engineer',
    status: 'unknown',
  }, ownerCookie)).response.status, 400);
  const completed = await jsonRequest(`/api/todos/${recurring.result.id}`, 'PUT', {
    ...recurring.result,
    completed: true,
  }, ownerCookie);
  assert.equal(completed.response.status, 200);
  let todoList = await request('/api/todos', { cookie: ownerCookie });
  assert.ok(todoList.result.some(todo => todo.due_date === '2024-02-29' && todo.recurrence === 'monthly'));

  const search = await request('/api/search?q=Regression', { cookie: ownerCookie });
  assert.equal(search.result.items[0].id, itemId);
  assert.ok(search.result.todos.length >= 1);
  assert.equal(search.result.articles[0].id, article.result.id);
  assert.equal(search.result.bookmarks[0].id, bookmark.result.id);
  const bookmarks = await request('/api/bookmarks', { cookie: ownerCookie });
  assert.equal(bookmarks.result.length, 1);

  const preferences = await jsonRequest('/api/settings', 'PUT', {
    editMode: 'inline',
    themeMode: 'dark',
    notificationsEnabled: false,
    reminderMinutes: 30,
    notificationSoundEnabled: false,
    markdownRenderingEnabled: false,
    markdownToolbarEnabled: true,
    markdownImagePasteEnabled: false,
    fontSizeOffset: 2,
    lineSpacing: 'relaxed',
    fontFamily: 'serif',
    language: 'en',
    prayerLatitude: 30.0444,
    prayerLongitude: 31.2357,
    prayerLocation: 'Cairo',
    prayerMethod: 5,
    financeCurrency: 'EGP',
    focusDurationMinutes: 30,
    focusBreakMinutes: 10,
    shortcuts: {
      todo: 'Ctrl+Alt+Shift+KeyA',
      dailyNote: 'Ctrl+Alt+Shift+KeyD',
      readLater: 'Ctrl+Alt+Shift+KeyR',
      quickCreate: 'Ctrl+Alt+Shift+KeyQ',
    },
  }, ownerCookie);
  assert.equal(preferences.response.status, 200);
  const savedPreferences = await request('/api/settings', { cookie: ownerCookie });
  assert.equal(savedPreferences.result.themeMode, 'dark');
  assert.equal(savedPreferences.result.reminderMinutes, 30);
  assert.equal(savedPreferences.result.notificationSoundEnabled, false);
  assert.equal(savedPreferences.result.markdownRenderingEnabled, false);
  assert.equal(savedPreferences.result.markdownToolbarEnabled, true);
  assert.equal(savedPreferences.result.markdownImagePasteEnabled, false);
  assert.equal(savedPreferences.result.fontSizeOffset, 2);
  assert.equal(savedPreferences.result.lineSpacing, 'relaxed');
  assert.equal(savedPreferences.result.fontFamily, 'serif');
  assert.equal(savedPreferences.result.language, 'en');
  assert.equal(savedPreferences.result.prayerLatitude, 30.0444);
  assert.equal(savedPreferences.result.prayerLongitude, 31.2357);
  assert.equal(savedPreferences.result.prayerLocation, 'Cairo');
  assert.equal(savedPreferences.result.prayerMethod, 5);
  assert.equal(savedPreferences.result.financeCurrency, 'EGP');
  assert.equal(savedPreferences.result.focusDurationMinutes, 30);
  assert.equal(savedPreferences.result.focusBreakMinutes, 10);
  assert.deepEqual(savedPreferences.result.shortcuts, {
    todo: 'Ctrl+Alt+Shift+KeyA',
    dailyNote: 'Ctrl+Alt+Shift+KeyD',
    readLater: 'Ctrl+Alt+Shift+KeyR',
    quickCreate: 'Ctrl+Alt+Shift+KeyQ',
  });
  const invalidReminder = await jsonRequest('/api/settings', 'PUT', { reminderMinutes: 17 }, ownerCookie);
  assert.equal(invalidReminder.response.status, 400);
  const invalidLanguage = await jsonRequest('/api/settings', 'PUT', { language: 'fr' }, ownerCookie);
  assert.equal(invalidLanguage.response.status, 400);
  const invalidFinanceCurrency = await jsonRequest('/api/settings', 'PUT', { financeCurrency: 'XXX' }, ownerCookie);
  assert.equal(invalidFinanceCurrency.response.status, 400);
  const changedFinanceCurrency = await jsonRequest('/api/settings', 'PUT', { financeCurrency: 'USD' }, ownerCookie);
  assert.equal(changedFinanceCurrency.response.status, 200);
  assert.equal((await request('/api/settings', { cookie: ownerCookie })).result.financeCurrency, 'USD');
  assert.equal((await jsonRequest('/api/settings', 'PUT', { financeCurrency: 'EGP' }, ownerCookie)).response.status, 200);
  assert.equal((await jsonRequest('/api/settings', 'PUT', { focusDurationMinutes: 181 }, ownerCookie)).response.status, 400);
  assert.equal((await jsonRequest('/api/settings', 'PUT', { focusBreakMinutes: 0 }, ownerCookie)).response.status, 400);
  const focusSessionStart = await jsonRequest('/api/focus/start', 'POST', {
    session_key: 'regression-focus-session-1',
    focus_minutes: 25,
    todo_id: recurring.result.id,
    context_label: 'Review the test project',
  }, ownerCookie);
  assert.equal(focusSessionStart.response.status, 201);
  assert.equal((await jsonRequest('/api/focus/complete', 'POST', {
    session_key: 'regression-focus-session-1',
  }, ownerCookie)).response.status, 409);
  const pausedFocus = await jsonRequest('/api/focus/pause', 'POST', {
    session_key: 'regression-focus-session-1',
  }, ownerCookie);
  assert.equal(pausedFocus.result.paused, true);
  db.prepare('UPDATE focus_sessions SET elapsed_seconds=?,paused=1 WHERE session_key=?')
    .run(24 * 60, 'regression-focus-session-1');
  const resumedFocus = await jsonRequest('/api/focus/start', 'POST', {
    session_key: 'regression-focus-session-1',
    focus_minutes: 25,
    todo_id: recurring.result.id,
    context_label: 'Review the test project',
  }, ownerCookie);
  assert.equal(resumedFocus.result.paused, 0);
  db.prepare('UPDATE focus_sessions SET started_at=? WHERE session_key=?')
    .run(new Date(Date.now() - 61 * 1000).toISOString(), 'regression-focus-session-1');
  const focusSession = await jsonRequest('/api/focus/complete', 'POST', {
    session_key: 'regression-focus-session-1',
  }, ownerCookie);
  assert.equal(focusSession.response.status, 200);
  assert.equal(focusSession.result.xp_earned, 25);
  assert.equal(focusSession.result.total_xp, 25);
  assert.equal(focusSession.result.completed_sessions, 1);
  assert.equal(focusSession.result.sessions[0].todo_id, recurring.result.id);
  assert.equal(focusSession.result.sessions[0].context_label, 'Review the test project');
  assert.equal(focusSession.result.sessions[0].todo_title, recurring.result.title);
  const duplicateFocusSession = await jsonRequest('/api/focus/complete', 'POST', {
    session_key: 'regression-focus-session-1',
  }, ownerCookie);
  assert.equal(duplicateFocusSession.result.xp_earned, 25);
  assert.equal(duplicateFocusSession.result.total_xp, 25);
  assert.equal((await request('/api/focus', { cookie: ownerCookie })).result.focus_minutes, 25);
  assert.equal((await request('/api/focus', { cookie: learningGuestCookie })).result.total_xp, 0);
  assert.equal((await jsonRequest('/api/focus/start', 'POST', {
    session_key: 'guest-link-to-owner',
    focus_minutes: 10,
    todo_id: recurring.result.id,
  }, learningGuestCookie)).response.status, 400);
  assert.equal((await jsonRequest('/api/focus/start', 'POST', {
    session_key: 'regression-focus-cancel-1',
    focus_minutes: 10,
  }, ownerCookie)).response.status, 201);
  const cancelledFocus = await request('/api/focus/regression-focus-cancel-1', { method: 'DELETE', cookie: ownerCookie });
  assert.equal(cancelledFocus.result.cancelled, true);
  assert.equal((await jsonRequest('/api/focus/complete', 'POST', {
    session_key: 'regression-focus-cancel-1',
  }, ownerCookie)).response.status, 404);
  assert.equal((await request('/api/focus', { cookie: ownerCookie })).result.total_xp, 25);
  assert.equal((await jsonRequest('/api/focus/start', 'POST', {
    session_key: 'bad',
    focus_minutes: 181,
  }, ownerCookie)).response.status, 400);
  const invalidFinanceMonth = await request('/api/finance?month=2024-13', { cookie: ownerCookie });
  assert.equal(invalidFinanceMonth.response.status, 400);
  const emptyFinance = await request('/api/finance?month=2024-01', { cookie: ownerCookie });
  assert.equal(emptyFinance.result.currency, 'EGP');
  assert.equal(emptyFinance.result.summary.income, 0);
  const financeIncome = await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'income', description: 'Salary', amount: '4500', category: 'Work', transaction_date: '2024-01-05',
  }, ownerCookie);
  assert.equal(financeIncome.response.status, 201);
  const financeExpense = await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'expense', description: 'Groceries', amount: '100', category: 'Food', transaction_date: '2024-01-10',
  }, ownerCookie);
  assert.equal(financeExpense.response.status, 201);
  const updatedFinanceExpense = await jsonRequest(`/api/finance/transactions/${financeExpense.result.id}`, 'PUT', {
    type: 'expense', description: 'Groceries', amount: '120', category: 'Food', transaction_date: '2024-01-10',
  }, ownerCookie);
  assert.equal(updatedFinanceExpense.response.status, 200);
  const invalidFinanceAmount = await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'expense', description: 'Invalid', amount: 0, transaction_date: '2024-01-10',
  }, ownerCookie);
  assert.equal(invalidFinanceAmount.response.status, 400);
  const invalidFinanceDate = await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'expense', description: 'Invalid date', amount: 1, transaction_date: '2024-02-30',
  }, ownerCookie);
  assert.equal(invalidFinanceDate.response.status, 400);
  const financeBudget = await jsonRequest('/api/finance/budgets', 'PUT', {
    month: '2024-01', category: 'Food', amount: 500,
  }, ownerCookie);
  assert.equal(financeBudget.response.status, 200);
  const monthlySubscription = await jsonRequest('/api/finance/subscriptions', 'POST', {
    name: 'Music', amount: '39.99', billing_cycle: 'monthly', next_renewal_date: '2024-01-31', category: 'Entertainment',
  }, ownerCookie);
  assert.equal(monthlySubscription.response.status, 201);
  assert.ok((await request('/api/finance/reminders', { cookie: ownerCookie })).result
    .some(subscription => subscription.id === monthlySubscription.result.id));
  const monthlyPayment = await jsonRequest(`/api/finance/subscriptions/${monthlySubscription.result.id}/pay`, 'POST', {
    period: '2024-01-31', paid_date: '2024-01-31',
  }, ownerCookie);
  assert.equal(monthlyPayment.response.status, 201);
  assert.equal(monthlyPayment.result.subscription.next_renewal_date, '2024-02-29');
  const duplicateMonthlyPayment = await jsonRequest(`/api/finance/subscriptions/${monthlySubscription.result.id}/pay`, 'POST', {
    period: '2024-01-31', paid_date: '2024-01-31',
  }, ownerCookie);
  assert.equal(duplicateMonthlyPayment.response.status, 409);
  const yearlySubscription = await jsonRequest('/api/finance/subscriptions', 'POST', {
    name: 'Annual service', amount: 1200, billing_cycle: 'yearly', next_renewal_date: '2024-02-29',
  }, ownerCookie);
  assert.equal(yearlySubscription.response.status, 201);
  const yearlyPayment = await jsonRequest(`/api/finance/subscriptions/${yearlySubscription.result.id}/pay`, 'POST', {
    period: '2024-02-29', paid_date: '2024-02-29',
  }, ownerCookie);
  assert.equal(yearlyPayment.result.subscription.next_renewal_date, '2025-02-28');
  const financeMonth = await request('/api/finance?month=2024-01', { cookie: ownerCookie });
  assert.equal(financeMonth.result.summary.income, 4500);
  assert.equal(financeMonth.result.summary.expenses, 159.99);
  assert.equal(financeMonth.result.budgets[0].spent, 120);
  const temporaryTransaction = await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'expense', description: 'Delete test', amount: 1, transaction_date: '2024-01-11',
  }, ownerCookie);
  assert.equal((await request(`/api/finance/transactions/${temporaryTransaction.result.id}`, {
    method: 'DELETE', cookie: ownerCookie,
  })).response.status, 200);
  const temporarySubscription = await jsonRequest('/api/finance/subscriptions', 'POST', {
    name: 'Delete test', amount: 1, billing_cycle: 'monthly', next_renewal_date: '2024-01-11',
  }, ownerCookie);
  assert.equal((await request(`/api/finance/subscriptions/${temporarySubscription.result.id}`, {
    method: 'DELETE', cookie: ownerCookie,
  })).response.status, 200);
  const temporaryBudget = await jsonRequest('/api/finance/budgets', 'PUT', {
    month: '2024-01', category: 'Temporary', amount: 1,
  }, ownerCookie);
  assert.equal(temporaryBudget.response.status, 200);
  const temporaryBudgetId = db.prepare(`SELECT id FROM finance_budgets WHERE user_id=?
    AND month='2024-01' AND category='Temporary'`).get(db.prepare('SELECT id FROM users WHERE username=?').get('owner_test').id).id;
  assert.equal((await request(`/api/finance/budgets/${temporaryBudgetId}`, {
    method: 'DELETE', cookie: ownerCookie,
  })).response.status, 200);
  const invalidPrayerLocation = await jsonRequest('/api/settings', 'PUT', {
    prayerLatitude: 91,
    prayerLongitude: 31,
  }, ownerCookie);
  assert.equal(invalidPrayerLocation.response.status, 400);
  const partialPrayerLocation = await jsonRequest('/api/settings', 'PUT', {
    prayerLatitude: 30,
    prayerLongitude: null,
  }, ownerCookie);
  assert.equal(partialPrayerLocation.response.status, 400);
  const invalidPrayerMethod = await jsonRequest('/api/settings', 'PUT', { prayerMethod: 99 }, ownerCookie);
  assert.equal(invalidPrayerMethod.response.status, 400);
  const invalidMarkdownPreference = await jsonRequest('/api/settings', 'PUT', {
    markdownImagePasteEnabled: 'false',
  }, ownerCookie);
  assert.equal(invalidMarkdownPreference.response.status, 400);
  const invalidTypographyPreference = await jsonRequest('/api/settings', 'PUT', {
    fontSizeOffset: 5,
    lineSpacing: 'extra-wide',
    fontFamily: 'comic-sans',
  }, ownerCookie);
  assert.equal(invalidTypographyPreference.response.status, 400);
  const duplicateShortcuts = await jsonRequest('/api/settings', 'PUT', {
    shortcuts: {
      todo: 'Ctrl+Alt+Shift+KeyT',
      dailyNote: 'Ctrl+Alt+Shift+KeyT',
      readLater: 'Ctrl+Alt+Shift+KeyR',
      quickCreate: 'Ctrl+Alt+Shift+KeyQ',
    },
  }, ownerCookie);
  assert.equal(duplicateShortcuts.response.status, 400);
  const cloudSettings = await jsonRequest('/api/settings', 'PUT', {
    s3Enabled: false,
    s3Bucket: '',
    s3Region: 'us-east-1',
    s3Prefix: 'personal-memo',
  }, ownerCookie);
  assert.equal(cloudSettings.response.status, 200);
  const invalidCloudSettings = await jsonRequest('/api/settings', 'PUT', {
    s3Enabled: true,
    s3Bucket: 'Invalid_Bucket',
    s3Region: 'us-east-1',
    s3Prefix: 'personal-memo',
  }, ownerCookie);
  assert.equal(invalidCloudSettings.response.status, 400);
  const invalidCloudTest = await jsonRequest('/api/settings/s3/test', 'POST', {
    bucket: 'Invalid_Bucket',
    region: 'us-east-1',
    prefix: 'personal-memo',
  }, ownerCookie);
  assert.equal(invalidCloudTest.response.status, 400);

  const today = await request('/api/today', { cookie: ownerCookie });
  const lifeArea = await jsonRequest('/api/areas', 'POST', {
    name: 'Health',
    color: '#397e75',
  }, ownerCookie);
  assert.equal(lifeArea.response.status, 201);
  const goal = await jsonRequest('/api/goals', 'POST', {
    title: 'Walk regularly',
    area_id: lifeArea.result.id,
    target_date: today.result.date,
    status: 'active',
    description: 'Build a steady weekly walking habit',
  }, ownerCookie);
  assert.equal(goal.response.status, 201);
  const project = await jsonRequest('/api/projects', 'POST', {
    title: 'Walking plan',
    area_id: lifeArea.result.id,
    goal_id: goal.result.id,
    next_action: 'Take a short walk',
    due_date: today.result.date,
    status: 'active',
  }, ownerCookie);
  assert.equal(project.response.status, 201);
  const projectTask = await jsonRequest('/api/todos', 'POST', {
    title: 'Walk today',
    due_date: today.result.date,
    project_id: project.result.id,
  }, ownerCookie);
  assert.equal(projectTask.response.status, 201, JSON.stringify({ project: project.result, task: projectTask.result }));
  assert.equal(projectTask.result.project_id, project.result.id);

  const calendarEvent = await jsonRequest('/api/events', 'POST', {
    title: 'Weekly planning',
    description: 'Review the week',
    starts_at: `${today.result.date}T10:00`,
    ends_at: `${today.result.date}T10:30`,
    all_day: false,
    recurrence: 'weekly',
  }, ownerCookie);
  assert.equal(calendarEvent.response.status, 201);
  const todayWithPlanning = await request('/api/today', { cookie: ownerCookie });
  assert.ok(todayWithPlanning.result.events.some(event => event.id === calendarEvent.result.id));
  assert.ok(todayWithPlanning.result.tasks.some(task => task.project_id === project.result.id));
  const upcomingEvents = await request(`/api/events?start=${today.result.date}&end=${today.result.date}`, { cookie: ownerCookie });
  assert.equal(upcomingEvents.result.length, 1);
  const monthEvents = await request(`/api/events?start=${today.result.date.slice(0, 8)}01&end=${today.result.date.slice(0, 8)}31`, { cookie: ownerCookie });
  assert.equal(monthEvents.response.status, 200);
  assert.ok(monthEvents.result.some(event => event.id === calendarEvent.result.id));
  const todayInterviewRound = await jsonRequest(`/api/interviews/${application.result.id}/rounds`, 'POST', {
    round_name: 'Today follow-up',
    occurred_on: today.result.date,
    scheduled_start: `${today.result.date}T12:00`,
    scheduled_end: `${today.result.date}T12:30`,
  }, ownerCookie);
  assert.equal(todayInterviewRound.response.status, 201);
  const todayWithInterview = await request('/api/today', { cookie: ownerCookie });
  const linkedInterviewEvent = todayWithInterview.result.events.find(event => event.id === todayInterviewRound.result.calendar_event_id);
  assert.equal(linkedInterviewEvent.interview_application_id, application.result.id);
  assert.equal(linkedInterviewEvent.interview_company, application.result.company);
  assert.equal(linkedInterviewEvent.interview_role, updatedApplication.result.role);

  const habit = await jsonRequest('/api/habits', 'POST', {
    title: 'Walk',
    frequency: 'daily',
    target_per_week: 5,
    notes: '',
  }, ownerCookie);
  assert.equal(habit.response.status, 201);
  const habitToday = await request('/api/habits', { cookie: ownerCookie });
  assert.equal(habitToday.result[0].week.length, 7);
  assert.ok(habitToday.result[0].week.some(day => day.date === today.result.date));
  const habitLog = await jsonRequest(`/api/habits/${habit.result.id}/log`, 'PUT', {
    date: today.result.date,
    completed: true,
  }, ownerCookie);
  assert.equal(habitLog.response.status, 200);
  const completedHabit = await request('/api/habits', { cookie: ownerCookie });
  assert.equal(completedHabit.result[0].streak, 1);
  assert.equal(completedHabit.result[0].total_completions, 1);
  assert.equal(completedHabit.result[0].completed_this_week, 1);
  assert.ok(completedHabit.result[0].week.find(day => day.date === today.result.date).completed);

  const routine = await jsonRequest('/api/routines', 'POST', {
    title: 'Morning start',
    description: 'Start gently',
    steps: ['Drink water', 'Review priorities'],
  }, ownerCookie);
  assert.equal(routine.response.status, 201);
  assert.equal((await request('/api/routines', { cookie: ownerCookie })).result[0].steps.length, 2);
  const routineLog = await jsonRequest(`/api/routines/${routine.result.id}/log`, 'PUT', {
    date: today.result.date,
    completed: true,
  }, ownerCookie);
  assert.equal(routineLog.response.status, 200);
  const completedRoutines = await request('/api/routines', { cookie: ownerCookie });
  assert.equal(completedRoutines.result[0].completed_this_week, 1);
  assert.equal(completedRoutines.result[0].total_completions, 1);
  const weekly = await request('/api/weekly-review', { cookie: ownerCookie });
  assert.equal(weekly.response.status, 200);
  assert.ok(weekly.result.tasks.upcoming >= 1);

  const planningGuestCookie = await createAccount('planning_guest', 'guest-password-1234');
  const privateArea = await request('/api/areas', { cookie: planningGuestCookie });
  assert.deepEqual(privateArea.result, []);
  const forbiddenCloudSettings = await jsonRequest('/api/settings', 'PUT', {
    s3Enabled: false,
    s3Bucket: '',
    s3Region: 'us-east-1',
    s3Prefix: 'personal-memo',
  }, planningGuestCookie);
  assert.equal(forbiddenCloudSettings.response.status, 403);
  const privateBookmarks = await request('/api/bookmarks', { cookie: await createAccount('bookmark_guest', 'guest-password-1234') });
  assert.deepEqual(privateBookmarks.result, []);

  const updatedBookmark = await jsonRequest(`/api/bookmarks/${bookmark.result.id}`, 'PUT', {
    title: 'Updated regression guide',
    url: 'https://example.com/updated',
    note: 'Updated note',
  }, ownerCookie);
  assert.equal(updatedBookmark.response.status, 200);
  assert.equal(updatedBookmark.result.title, 'Updated regression guide');
  const deletedBookmark = await request(`/api/bookmarks/${bookmark.result.id}`, { method: 'DELETE', cookie: ownerCookie });
  assert.equal(deletedBookmark.response.status, 200);
  const undoneBookmark = await request(`/api/trash/${deletedBookmark.result.undoToken}/restore`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(undoneBookmark.result.type, 'bookmark');

  const deletedArticle = await request(`/api/articles/${article.result.id}`, { method: 'DELETE', cookie: ownerCookie });
  assert.equal(deletedArticle.response.status, 200);
  const undoneArticle = await request(`/api/trash/${deletedArticle.result.undoToken}/restore`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(undoneArticle.result.type, 'article');

  const deletedTodo = await request(`/api/todos/${recurring.result.id}`, { method: 'DELETE', cookie: ownerCookie });
  assert.equal(deletedTodo.response.status, 200);
  const undoneTodo = await request(`/api/trash/${deletedTodo.result.undoToken}/restore`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(undoneTodo.result.type, 'todo');

  const deletedItem = await request(`/api/items/${itemId}`, { method: 'DELETE', cookie: ownerCookie });
  assert.equal(deletedItem.response.status, 200);
  assert.equal((await request(`/api/items/${itemId}`, { cookie: ownerCookie })).response.status, 404);
  const undoneItem = await request(`/api/trash/${deletedItem.result.undoToken}/restore`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(undoneItem.result.type, 'item');

  const backupClub = await jsonRequest('/api/book-clubs', 'POST', { name: 'Backup club' }, ownerCookie);
  assert.equal(backupClub.response.status, 201);
  const backupClubMessage = new FormData();
  backupClubMessage.append('type', 'chat');
  backupClubMessage.append('content', 'Club documents belong in full backups.');
  backupClubMessage.append('attachments', new Blob(['Club backup note.'], { type: 'text/plain' }), 'club-note.txt');
  const uploadedClubMessage = await request(`/api/book-clubs/${backupClub.result.id}/messages`, {
    method: 'POST',
    body: backupClubMessage,
    cookie: ownerCookie,
  });
  assert.equal(uploadedClubMessage.response.status, 201, JSON.stringify(uploadedClubMessage.result));
  const clubAttachment = db.prepare('SELECT filename FROM book_club_message_attachments WHERE club_id=?')
    .get(backupClub.result.id);
  const backupClubInvite = await request(`/api/book-clubs/${backupClub.result.id}/invites`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(backupClubInvite.response.status, 201);
  const backupClubBook = await jsonRequest(`/api/book-clubs/${backupClub.result.id}/books`, 'POST', {
    itemId,
    totalPages: 240,
  }, ownerCookie);
  assert.equal(backupClubBook.response.status, 201);
  assert.equal((await jsonRequest(`/api/book-clubs/${backupClub.result.id}/books/${backupClubBook.result.id}/progress`, 'PUT', {
    status: 'completed',
    note: 'Backup progress',
  }, ownerCookie)).response.status, 200);
  assert.equal((await jsonRequest(`/api/book-clubs/${backupClub.result.id}/messages`, 'POST', {
    type: 'insight',
    content: 'Backup insight',
  }, ownerCookie)).response.status, 201);
  db.prepare(`INSERT INTO finance_ai_reports(user_id,month,scopes_json,report_json,created_at)
    VALUES (?,?,?,?,?)`).run(ownerUserId, '2024-01', '["spending"]',
    JSON.stringify({ overview: 'Finance report backup fixture.', observations: [], actions: [], watchouts: [] }), new Date().toISOString());
  const archiveResponse = await request('/api/backups', { method: 'POST', cookie: ownerCookie });
  assert.equal(archiveResponse.response.status, 201);
  assert.match(archiveResponse.result.filename, /\.zip$/);
  const downloaded = await request(`/api/backups/${archiveResponse.result.filename}`, { cookie: ownerCookie });
  assert.equal(downloaded.response.status, 200);
  const archivePath = path.join(testDirectory, 'downloaded-backup.zip');
  fs.writeFileSync(archivePath, Buffer.from(downloaded.result));
  const entries = await archiveEntries(archivePath);
  assert.ok(entries.includes('memo.sqlite'));
  assert.ok(entries.includes('manifest.json'));
  assert.ok(entries.includes(`uploads/${coverFilename}`));
  assert.ok(entries.includes(`audio/1/${audioFilename}`));
  assert.ok(entries.includes(`club-uploads/${backupClub.result.id}/${clubAttachment.filename}`));
  const learningFileRecord = db.prepare('SELECT user_id,filename FROM learning_files WHERE id=?')
    .get(uploadedLearningFiles.result[0].id);
  assert.ok(entries.includes(`learning-uploads/${learningFileRecord.user_id}/${learningFileRecord.filename}`));

  const invalidForm = new FormData();
  invalidForm.append('backup', new Blob(['not a zip'], { type: 'application/zip' }), 'invalid.zip');
  const invalidRestore = await request('/api/backups/restore-archive', {
    method: 'POST',
    body: invalidForm,
    cookie: ownerCookie,
  });
  assert.equal(invalidRestore.response.status, 400);
  assert.equal((await request(`/api/items/${itemId}`, { cookie: ownerCookie })).response.status, 200);

  fs.rmSync(path.join(testDirectory, 'uploads', coverFilename), { force: true });
  fs.rmSync(path.join(testDirectory, 'audio', '1', audioFilename), { force: true });
  fs.rmSync(path.join(testDirectory, 'learning-uploads', String(learningFileRecord.user_id), learningFileRecord.filename), { force: true });
  const restoreForm = new FormData();
  restoreForm.append('backup', new Blob([Buffer.from(downloaded.result)], { type: 'application/zip' }), 'memo.zip');
  const restored = await request('/api/backups/restore-archive', {
    method: 'POST',
    body: restoreForm,
    cookie: ownerCookie,
  });
  assert.equal(restored.response.status, 200, JSON.stringify(restored.result));
  assert.ok(fs.existsSync(path.join(testDirectory, 'uploads', coverFilename)));
  assert.ok(fs.existsSync(path.join(testDirectory, 'audio', '1', audioFilename)));
  assert.ok(fs.existsSync(path.join(testDirectory, 'club-uploads', String(backupClub.result.id), clubAttachment.filename)));
  assert.ok(fs.existsSync(path.join(testDirectory, 'learning-uploads', String(learningFileRecord.user_id), learningFileRecord.filename)));
  assert.equal((await request('/api/auth/me', { cookie: ownerCookie })).response.status, 401);

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner_test', password: 'test-password-1234' }),
  });
  ownerCookie = login.response.headers.get('set-cookie').split(';')[0];
  assert.equal(login.response.status, 200);
  assert.equal((await request(`/api/items/${itemId}`, { cookie: ownerCookie })).result.title, 'Regression handbook');
  assert.equal((await request('/api/book-clubs', { cookie: ownerCookie })).result
    .some(club => club.id === backupClub.result.id), true);
  const restoredMockTopics = await request('/api/interviews/mock', { cookie: ownerCookie });
  assert.equal(restoredMockTopics.result[0].title, 'System Design');
  assert.equal(restoredMockTopics.result[0].card_count, 1);
  const restoredMockCards = await request(`/api/interviews/topics/${mockTopic.result.id}/cards`, { cookie: ownerCookie });
  assert.equal(restoredMockCards.result.cards[0].answer, 'Use a token bucket with an atomic shared backing store.');
  assert.equal((await jsonRequest(`/api/interviews/topics/${mockTopic.result.id}/cards/${mockCard.result.id}`, 'DELETE', {}, ownerCookie)).response.status, 200);
  const restoredClub = await request(`/api/book-clubs/${backupClub.result.id}`, { cookie: ownerCookie });
  assert.equal(restoredClub.response.status, 200);
  assert.equal(restoredClub.result.books[0].my_status, 'completed');
  assert.equal(restoredClub.result.books[0].my_note, 'Backup progress');
  assert.ok(restoredClub.result.messages.some(message => message.content === 'Backup insight'));
  const restoredFinance = await request('/api/finance?month=2024-01', { cookie: ownerCookie });
  assert.equal(restoredFinance.result.summary.income, 4500);
  assert.equal(restoredFinance.result.summary.expenses, 159.99);
  assert.equal(restoredFinance.result.budgets[0].category, 'Food');
  assert.ok(restoredFinance.result.subscriptions.some(subscription => subscription.name === 'Music'
    && subscription.next_renewal_date === '2024-02-29'));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM finance_ai_reports WHERE user_id=?').get(ownerUserId).count, 1);
  const restoredFocus = await request('/api/focus', { cookie: ownerCookie });
  assert.equal(restoredFocus.result.total_xp, 25);
  assert.equal(restoredFocus.result.completed_sessions, 1);
  const restoredPreferences = await request('/api/settings', { cookie: ownerCookie });
  assert.equal(restoredPreferences.result.focusDurationMinutes, 30);
  assert.equal(restoredPreferences.result.focusBreakMinutes, 10);
  const restoredApplications = await request('/api/interviews', { cookie: ownerCookie });
  assert.equal(restoredApplications.result[0].company, 'Example Labs');
  assert.equal(restoredApplications.result[0].status, 'offer');
  assert.equal(restoredApplications.result[0].rounds[0].experience, 'I learned to clarify assumptions before answering.');
  assert.ok(restoredClub.result.messages.some(message => message.attachments.some(file => file.display_name === 'club-note.txt')));
  assert.equal(restoredClub.result.invites.length, 1);
  const restoredAttachment = restoredClub.result.messages.flatMap(message => message.attachments)
    .find(attachment => attachment.display_name === 'club-note.txt');
  const attachmentResponse = await request(restoredAttachment.url, { cookie: ownerCookie });
  assert.equal(attachmentResponse.response.status, 200);
  assert.equal(Buffer.from(attachmentResponse.result).toString('utf8'), 'Club backup note.');
  const clubExport = await request(`/api/book-clubs/${backupClub.result.id}/export`, { cookie: ownerCookie });
  assert.equal(clubExport.response.status, 200);
  const clubExportPath = path.join(testDirectory, 'club-export.zip');
  fs.writeFileSync(clubExportPath, Buffer.from(clubExport.result));
  const exportedEntries = await archiveEntries(clubExportPath);
  assert.ok(exportedEntries.includes('club.json'));
  assert.ok(exportedEntries.includes(`attachments/${clubAttachment.filename}`));
  const exportedData = JSON.parse(await readArchiveEntry(clubExportPath, 'club.json'));
  assert.equal(exportedData.books[0].progress[0].pages_read, 240);
  assert.equal(exportedData.meetings.length, 0);
  assert.equal(db.pragma('integrity_check')[0].integrity_check, 'ok');
});

test('wellness meals and workouts are validated, summarized, editable, and private to each account', async () => {
  const wellnessCookie = await createAccount('wellness_owner', 'wellness-owner-password-1234');
  const otherCookie = await createAccount('wellness_guest', 'wellness-guest-password-1234');
  const meal = await jsonRequest('/api/wellness/meals', 'POST', {
    entry_date: '2025-04-12', meal_type: 'lunch', name: 'Rice and beans', calories: 620,
    protein_g: 24.5, carbs_g: 90, fat_g: 12, notes: 'After training',
  }, wellnessCookie);
  assert.equal(meal.response.status, 201);
  assert.equal(meal.result.calories, 620);
  const workout = await jsonRequest('/api/wellness/workouts', 'POST', {
    entry_date: '2025-04-12', exercise: 'Squat', sets: 4, reps: 8, weight_kg: 60, duration_minutes: 25,
  }, wellnessCookie);
  assert.equal(workout.response.status, 201);
  const day = await request('/api/wellness?date=2025-04-12', { cookie: wellnessCookie });
  assert.equal(day.result.summary.calories, 620);
  assert.equal(day.result.summary.protein_g, 24.5);
  assert.equal(day.result.summary.volume_kg, 1920);
  assert.equal(day.result.week.sessions, 1);
  assert.equal((await request('/api/wellness?date=2025-02-30', { cookie: wellnessCookie })).response.status, 400);
  assert.equal((await jsonRequest('/api/wellness/meals', 'POST', {
    entry_date: '2025-04-12', meal_type: 'brunch', name: 'Invalid', calories: -5,
  }, wellnessCookie)).response.status, 400);
  const updateMeal = await jsonRequest(`/api/wellness/meals/${meal.result.id}`, 'PUT', {
    entry_date: '2025-04-12', meal_type: 'lunch', name: 'Rice, beans and eggs', calories: 720,
    protein_g: 34, carbs_g: 90, fat_g: 18, notes: '',
  }, wellnessCookie);
  assert.equal(updateMeal.response.status, 200);
  assert.equal(updateMeal.result.calories, 720);
  assert.deepEqual((await request('/api/wellness?date=2025-04-12', { cookie: otherCookie })).result.meals, []);
  assert.equal((await request(`/api/wellness/workouts/${workout.result.id}`, { method: 'DELETE', cookie: otherCookie })).response.status, 404);
  assert.equal((await request(`/api/wellness/workouts/${workout.result.id}`, { method: 'DELETE', cookie: wellnessCookie })).response.status, 200);
});

test('AI interviewer encrypts provider keys, requires consent, saves private adaptive sessions, and reports early finishes', async () => {
  const aiOwnerCookie = await createAccount('ai_owner_test', 'ai-owner-password-1234');
  const aiOwnerId = db.prepare('SELECT id FROM users WHERE username=?').get('ai_owner_test').id;
  const encryptionKey = process.env.PERSONAL_MEMO_AI_ENCRYPTION_KEY;
  assert.equal(aiProvider.validateProviderBaseUrl('http://127.0.0.1:1234/v1').error !== undefined, true);
  assert.equal(aiProvider.validateProviderBaseUrl('https://192.168.1.2/v1').error !== undefined, true);
  await withAIHarness(aiOwnerId, async aiRequest => {
    assert.equal((await aiRequest('/api/interviews/ai/connection')).result.configured, false);
    assert.equal((await aiRequest('/api/interviews/ai/sessions', 'POST', {
      role: 'Backend engineer',
      interviewType: 'technical',
      difficulty: 'intermediate',
      questionLimit: 3,
      shareDataConfirmed: true,
    })).response.status, 409);
    assert.equal((await aiRequest('/api/interviews/ai/connection', 'PUT', {
      baseUrl: 'http://127.0.0.1:1234/v1',
      model: 'mock-model',
      apiKey: 'never-save-this',
    })).response.status, 400);
    const savedConnection = await aiRequest('/api/interviews/ai/connection', 'PUT', {
      baseUrl: 'https://api.example.com/v1',
      model: 'mock-model',
      apiKey: 'test-provider-secret',
    });
    assert.equal(savedConnection.response.status, 200);
    assert.equal(savedConnection.result.configured, true);
    assert.equal(savedConnection.result.keyConfigured, true);
    assert.equal(Object.hasOwn(savedConnection.result, 'apiKey'), false);
    const encryptedConnection = db.prepare('SELECT key_ciphertext,key_iv,key_auth_tag FROM user_ai_connections WHERE user_id=?')
      .get(aiOwnerId);
    assert.notEqual(encryptedConnection.key_ciphertext, 'test-provider-secret');
    assert.equal(aiProvider.decryptSecret({
      ciphertext: encryptedConnection.key_ciphertext,
      iv: encryptedConnection.key_iv,
      authTag: encryptedConnection.key_auth_tag,
    }), 'test-provider-secret');
    process.env.PERSONAL_MEMO_AI_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('hex');
    assert.throws(() => aiProvider.decryptSecret({
      ciphertext: encryptedConnection.key_ciphertext,
      iv: encryptedConnection.key_iv,
      authTag: encryptedConnection.key_auth_tag,
    }));
    process.env.PERSONAL_MEMO_AI_ENCRYPTION_KEY = encryptionKey;
    assert.equal((await aiRequest('/api/interviews/ai/connection/test', 'POST', {})).result.ok, true);
    const notConfirmed = await aiRequest('/api/interviews/ai/sessions', 'POST', {
      role: 'Backend engineer',
      interviewType: 'technical',
      difficulty: 'intermediate',
      questionLimit: 3,
      shareDataConfirmed: false,
    });
    assert.equal(notConfirmed.response.status, 400);
    const startedAI = await aiRequest('/api/interviews/ai/sessions', 'POST', {
      role: 'Backend engineer',
      interviewType: 'technical',
      difficulty: 'intermediate',
      questionLimit: 3,
      shareJobDescription: true,
      jobDescription: 'Design reliable APIs.',
      shareResume: false,
      resumeText: 'This must not be sent or stored.',
      shareDataConfirmed: true,
    });
    assert.equal(startedAI.response.status, 201);
    assert.equal(startedAI.result.currentQuestion, 'Tell me about a challenging project.');
    let aiReply = await aiRequest(`/api/interviews/ai/sessions/${startedAI.result.id}/respond`, 'POST', {
      answer: 'I redesigned a service to improve reliability.',
    });
    assert.equal(aiReply.response.status, 200);
    assert.equal(aiReply.result.nextQuestion, 'Adaptive follow-up 1?');
    aiReply = await aiRequest(`/api/interviews/ai/sessions/${startedAI.result.id}/respond`, 'POST', { answer: 'I used load tests and gradual rollout.' });
    assert.equal(aiReply.result.completed, false);
    aiReply = await aiRequest(`/api/interviews/ai/sessions/${startedAI.result.id}/respond`, 'POST', { answer: 'Latency improved by 30 percent.' });
    assert.equal(aiReply.result.completed, true);
    assert.equal(aiReply.result.report.overall_score, 4);
    const aiHistory = await aiRequest(`/api/interviews/ai/sessions/${startedAI.result.id}`);
    assert.equal(aiHistory.result.status, 'completed');
    assert.equal(aiHistory.result.turns.length, 3);
    assert.equal(aiHistory.result.turns[2].answer, 'Latency improved by 30 percent.');
    assert.equal(aiHistory.result.report.top_strengths[0], 'Clear technical reasoning');
    assert.equal(db.prepare('SELECT resume_text FROM ai_interview_sessions WHERE id=?').get(startedAI.result.id).resume_text, '');

    const earlySession = await aiRequest('/api/interviews/ai/sessions', 'POST', {
      role: 'Product manager',
      interviewType: 'behavioral',
      difficulty: 'beginner',
      questionLimit: 5,
      shareDataConfirmed: true,
    });
    assert.equal(earlySession.response.status, 201);
    assert.equal((await aiRequest(`/api/interviews/ai/sessions/${earlySession.result.id}/respond`, 'POST', {
      answer: 'I aligned the team around a clear outcome.',
    })).response.status, 200);
    const earlyReport = await aiRequest(`/api/interviews/ai/sessions/${earlySession.result.id}/finish`, 'POST', {});
    assert.equal(earlyReport.response.status, 200);
    assert.equal(earlyReport.result.completed, true);
    assert.equal(earlyReport.result.report.overall_score, 3);
    const earlyHistory = await aiRequest(`/api/interviews/ai/sessions/${earlySession.result.id}`);
    assert.equal(earlyHistory.result.turns.length, 2);
    assert.equal(earlyHistory.result.turns[1].answer, '');

    const aiOtherCookie = await createAccount('ai_other_test', 'ai-other-password-1234');
    const aiOtherId = db.prepare('SELECT id FROM users WHERE username=?').get('ai_other_test').id;
    await withAIHarness(aiOtherId, async otherRequest => {
      assert.equal((await otherRequest('/api/interviews/ai/connection')).result.configured, false);
      assert.equal((await otherRequest(`/api/interviews/ai/sessions/${startedAI.result.id}`)).response.status, 404);
    });
    assert.ok(aiOtherCookie);
    assert.equal((await aiRequest(`/api/interviews/ai/sessions/${startedAI.result.id}`, 'DELETE')).response.status, 200);
    assert.equal((await aiRequest(`/api/interviews/ai/sessions/${earlySession.result.id}`, 'DELETE')).response.status, 200);
    assert.equal((await aiRequest('/api/interviews/ai/connection', 'DELETE')).response.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM user_ai_connections WHERE user_id=?').get(aiOwnerId).count, 0);
  });
  assert.ok(aiOwnerCookie);
});

test('finance AI requires consent, analyzes aggregate data, saves private reports, and respects account ownership', async () => {
  const financeCookie = await createAccount('finance_ai_test', 'finance-ai-password-1234');
  const financeUserId = db.prepare('SELECT id FROM users WHERE username=?').get('finance_ai_test').id;
  const expenses = await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'expense',
    description: 'Private health appointment',
    amount: 85.75,
    category: 'Health',
    transaction_date: '2024-01-15',
    notes: 'Sensitive personal note must not reach the AI provider.',
  }, financeCookie);
  assert.equal(expenses.response.status, 201);
  assert.equal((await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'income',
    description: 'Salary',
    amount: 2500,
    category: 'Work',
    transaction_date: '2024-01-01',
  }, financeCookie)).response.status, 201);
  assert.equal((await jsonRequest('/api/finance/budgets', 'PUT', {
    month: '2024-01',
    category: 'Health',
    amount: 100,
  }, financeCookie)).response.status, 200);
  assert.equal((await jsonRequest('/api/finance/subscriptions', 'POST', {
    name: 'Study app',
    amount: 12,
    billing_cycle: 'monthly',
    next_renewal_date: '2024-02-05',
    category: 'Education',
  }, financeCookie)).response.status, 201);
  const financeData = await request('/api/finance?month=2024-01', { cookie: financeCookie });
  assert.equal(financeData.response.status, 200);
  assert.equal(financeData.result.trends.length, 6);
  assert.equal(financeData.result.trends.at(-1).income, 2500);
  assert.equal(financeData.result.trends.at(-1).expenses, 85.75);

  await withAIHarness(financeUserId, async (financeRequest, providerRequests) => {
    assert.equal((await financeRequest('/api/finance/ai/reports')).result.configured, false);
    assert.equal((await financeRequest('/api/finance/ai/analyze', 'POST', {
      month: '2024-01',
      scopes: ['spending', 'budgets', 'subscriptions', 'cashflow'],
      confirmDataSharing: true,
    })).response.status, 409);
    assert.equal((await financeRequest('/api/interviews/ai/connection', 'PUT', {
      baseUrl: 'https://api.example.com/v1',
      model: 'mock-model',
      apiKey: 'finance-test-provider-secret',
    })).response.status, 200);
    const scopes = ['spending', 'budgets', 'subscriptions', 'cashflow'];
    assert.equal((await financeRequest('/api/finance/ai/analyze', 'POST', {
      month: '2024-01',
      scopes,
      confirmDataSharing: false,
    })).response.status, 400);
    assert.equal((await financeRequest('/api/finance/ai/analyze', 'POST', {
      month: '2024-01',
      scopes: ['spending', 'unknown'],
      confirmDataSharing: true,
    })).response.status, 400);
    const analysis = await financeRequest('/api/finance/ai/analyze', 'POST', {
      month: '2024-01',
      scopes,
      confirmDataSharing: true,
    });
    assert.equal(analysis.response.status, 201, JSON.stringify(analysis.result));
    assert.equal(analysis.result.report.observations.length, 1);
    assert.equal(analysis.result.report.actions[0].priority, 'medium');
    const aiPayload = JSON.parse(providerRequests.at(-1));
    const aggregatedData = JSON.stringify(aiPayload.finance_data);
    assert.match(aggregatedData, /Health/);
    assert.match(aggregatedData, /Study app/);
    assert.doesNotMatch(aggregatedData, /Private health appointment|Sensitive personal note/);
    assert.equal(aiPayload.finance_data.monthlyTotals.at(-1).income, 2500);
    assert.equal(aiPayload.finance_data.budgetProgress[0].spent, 85.75);
    const history = await financeRequest('/api/finance/ai/reports');
    assert.equal(history.result.reports.length, 1);
    assert.equal(history.result.reports[0].id, analysis.result.id);

    const otherCookie = await createAccount('finance_ai_other', 'finance-ai-other-password-1234');
    const otherUserId = db.prepare('SELECT id FROM users WHERE username=?').get('finance_ai_other').id;
    await withAIHarness(otherUserId, async otherRequest => {
      assert.equal((await otherRequest('/api/finance/ai/reports')).result.reports.length, 0);
      assert.equal((await otherRequest(`/api/finance/ai/reports/${analysis.result.id}`, 'DELETE')).response.status, 404);
    });
    assert.ok(otherCookie);
    assert.equal((await financeRequest(`/api/finance/ai/reports/${analysis.result.id}`, 'DELETE')).response.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM finance_ai_reports WHERE user_id=?').get(financeUserId).count, 0);
  });
});

test('search results and owner backup controls remain account-scoped', async () => {
  const otherCookie = await createAccount('second_test', 'second-password-1234');
  const search = await request('/api/search?q=Regression', { cookie: otherCookie });
  assert.equal(search.response.status, 200);
  assert.deepEqual(search.result.items, []);
  assert.deepEqual(search.result.todos, []);
  const otherPreferences = await request('/api/settings', { cookie: otherCookie });
  assert.equal(otherPreferences.result.notificationSoundEnabled, true);
  assert.equal(otherPreferences.result.markdownRenderingEnabled, true);
  assert.equal(otherPreferences.result.markdownToolbarEnabled, true);
  assert.equal(otherPreferences.result.markdownImagePasteEnabled, true);
  assert.equal(otherPreferences.result.fontSizeOffset, 0);
  assert.equal(otherPreferences.result.language, 'ar');
  assert.equal(otherPreferences.result.prayerLatitude, null);
  assert.equal(otherPreferences.result.prayerMethod, 5);
  assert.equal(otherPreferences.result.financeCurrency, 'EGP');
  assert.equal(otherPreferences.result.lineSpacing, 'comfortable');
  assert.equal(otherPreferences.result.fontFamily, 'plex');
  assert.deepEqual(otherPreferences.result.shortcuts, {
    todo: 'Ctrl+Alt+Shift+KeyT',
    dailyNote: 'Ctrl+Alt+Shift+KeyD',
    readLater: 'Ctrl+Alt+Shift+KeyR',
    quickCreate: 'Ctrl+Alt+Shift+KeyQ',
  });
  assert.deepEqual((await request('/api/snippets', { cookie: otherCookie })).result, []);
  const otherFinance = await request('/api/finance?month=2024-01', { cookie: otherCookie });
  assert.equal(otherFinance.result.currency, 'EGP');
  assert.equal(otherFinance.result.transactions.length, 0);
  assert.equal(otherFinance.result.subscriptions.length, 0);
  assert.equal(otherFinance.result.budgets.length, 0);
  const ownerTransactionId = db.prepare(`SELECT t.id FROM finance_transactions t
    JOIN users u ON u.id=t.user_id WHERE u.username='owner_test' AND t.description='Salary'`).get().id;
  assert.equal((await request(`/api/finance/transactions/${ownerTransactionId}`, {
    method: 'DELETE', cookie: otherCookie,
  })).response.status, 404);
  const otherIncome = await jsonRequest('/api/finance/transactions', 'POST', {
    type: 'income', description: 'Other account', amount: 20, transaction_date: '2024-01-05',
  }, otherCookie);
  assert.equal(otherIncome.response.status, 201);
  const isolatedFinance = await request('/api/finance?month=2024-01', { cookie: otherCookie });
  assert.deepEqual(isolatedFinance.result.transactions.map(transaction => transaction.description), ['Other account']);
  assert.deepEqual(search.result.articles, []);
  assert.deepEqual((await request('/api/areas', { cookie: otherCookie })).result, []);
  assert.deepEqual((await request('/api/goals', { cookie: otherCookie })).result, []);
  assert.deepEqual((await request('/api/projects', { cookie: otherCookie })).result, []);
  assert.deepEqual((await request('/api/habits', { cookie: otherCookie })).result, []);
  assert.deepEqual((await request('/api/routines', { cookie: otherCookie })).result, []);
  assert.deepEqual((await request('/api/events', { cookie: otherCookie })).result, []);
  assert.equal((await request(`/api/items/${itemId}`, { cookie: otherCookie })).response.status, 404);
  assert.equal((await request('/api/backups', { cookie: otherCookie })).response.status, 403);
  assert.equal(db.pragma('foreign_key_check').length, 0);
});

test('daily notes, backlinks, pins, and categorized gallery images stay private', async () => {
  const noteOwner = await createAccount('note_writer', 'note-writer-password-1234');
  const noteGuest = await createAccount('note_reader', 'note-reader-password-1234');
  const memo = await jsonRequest('/api/items', 'POST', {
    kind: 'memo',
    title: 'Backlink target memo',
    notes: 'A note with no incoming links yet.',
  }, noteOwner);
  assert.equal(memo.response.status, 201);

  const yesterday = await jsonRequest('/api/daily-notes/2026-10-20', 'PUT', {
    title: 'A quiet day',
    body: `I want to revisit [[item:${memo.result.id}|Backlink target memo]].`,
  }, noteOwner);
  assert.equal(yesterday.response.status, 200);
  assert.equal((await request('/api/daily-notes?date=2026-10-20', { cookie: noteOwner })).result.body,
    `I want to revisit [[item:${memo.result.id}|Backlink target memo]].`);

  const todayNote = await jsonRequest('/api/daily-notes/2026-10-21', 'PUT', {
    title: '',
    body: 'Yesterday: [[daily:2026-10-20|A quiet day]].',
  }, noteOwner);
  assert.equal(todayNote.response.status, 200);
  assert.ok(todayNote.result.id);
  const linkedArticle = await jsonRequest('/api/articles', 'POST', {
    title: 'Linked article',
    url: 'https://example.com/article',
    review: `Worth revisiting: [[item:${memo.result.id}|Backlink target memo]].`,
  }, noteOwner);
  assert.equal(linkedArticle.response.status, 201);
  const linkedBookmark = await jsonRequest('/api/bookmarks', 'POST', {
    title: 'Linked reference',
    url: 'https://example.com/reference',
    note: `Use with [[daily:2026-10-20|A quiet day]].`,
  }, noteOwner);
  assert.equal(linkedBookmark.response.status, 201);
  assert.equal((await request(`/api/backlinks/item/${memo.result.id}`, { cookie: noteOwner })).result[0].note_date, '2026-10-20');
  const dayLinks = await request('/api/backlinks/daily-note/2026-10-20', { cookie: noteOwner });
  assert.equal(dayLinks.response.status, 200);
  assert.equal(dayLinks.result[0].note_date, '2026-10-21');
  assert.equal(dayLinks.result.find(link => link.type === 'bookmark').url, 'https://example.com/reference');
  assert.equal((await request(`/api/backlinks/item/${memo.result.id}`, { cookie: noteOwner }))
    .result.find(link => link.type === 'article').url, 'https://example.com/article');
  const timeline = await request('/api/timeline?start=2026-10-20&end=2026-10-21', { cookie: noteOwner });
  assert.ok(timeline.result.entries.some(entry => entry.title === 'A quiet day' && entry.type === 'writing'
    && entry.href === '/?view=daily-note&date=2026-10-20'));
  const memoTimeline = await request(`/api/timeline?start=${memo.result.created_at.slice(0, 10)}&end=${memo.result.created_at.slice(0, 10)}`, {
    cookie: noteOwner,
  });
  assert.ok(memoTimeline.result.entries.some(entry => entry.title === 'Backlink target memo'
    && entry.href === `/item/${memo.result.id}`));
  const timelineUserId = db.prepare("SELECT id FROM users WHERE username='note_writer'").get().id;
  const insertTimelineEvent = db.prepare(`INSERT INTO calendar_events(
    user_id,title,description,starts_at,ends_at,all_day,recurrence,created_at,updated_at
  ) VALUES (?,?,?,?,?,0,'none',?,?)`);
  const timelineEventDate = '2026-10-20';
  for (let index = 0; index < 301; index += 1) {
    const timestamp = new Date().toISOString();
    insertTimelineEvent.run(timelineUserId, `Timeline event ${index}`, '', `${timelineEventDate}T10:00`, null, timestamp, timestamp);
  }
  const busyTimeline = await request(`/api/timeline?start=${timelineEventDate}&end=${timelineEventDate}`, { cookie: noteOwner });
  assert.equal(busyTimeline.response.status, 200);
  assert.ok(busyTimeline.result.entries.length > 300);
  assert.equal(busyTimeline.result.entries.find(entry => entry.type === 'event').href,
    `/?view=calendar&date=${timelineEventDate}`);
  assert.ok((await request('/api/note-index', { cookie: noteOwner })).result.some(note => note.title === 'Backlink target memo'));
  assert.equal((await request('/api/daily-notes?date=not-a-date', { cookie: noteOwner })).response.status, 400);
  assert.equal((await request(`/api/backlinks/item/${memo.result.id}`, { cookie: noteGuest })).response.status, 404);

  for (const [type, id] of [
    ['item', memo.result.id],
    ['daily-note', todayNote.result.id],
    ['article', linkedArticle.result.id],
    ['bookmark', linkedBookmark.result.id],
  ]) {
    const pinned = await jsonRequest(`/api/pins/${type}/${id}`, 'PUT', { pinned: true }, noteOwner);
    assert.equal(pinned.response.status, 200);
  }
  assert.equal((await request('/api/pins', { cookie: noteOwner })).result.length, 4);
  assert.equal((await request('/api/pins', { cookie: noteGuest })).result.length, 0);
  assert.equal((await jsonRequest(`/api/pins/item/${memo.result.id}`, 'PUT', { pinned: false }, noteOwner)).result.pinned, false);
  assert.equal((await jsonRequest(`/api/pins/item/${memo.result.id}`, 'PUT', { pinned: true }, noteGuest)).response.status, 404);
  assert.equal((await jsonRequest('/api/pins/not-a-type/1', 'PUT', { pinned: true }, noteOwner)).response.status, 400);

  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const galleryUpload = await request('/api/gallery', {
    method: 'POST',
    body: png,
    cookie: noteOwner,
    headers: {
      'Content-Type': 'image/png',
      'X-Image-Category': encodeURIComponent('فن'),
      'X-Image-Caption': encodeURIComponent('ألوان مفضلة'),
    },
  });
  assert.equal(galleryUpload.response.status, 201);
  assert.equal(galleryUpload.result.category, 'فن');
  assert.equal(galleryUpload.result.caption, 'ألوان مفضلة');
  const gallery = await request('/api/gallery', { cookie: noteOwner });
  assert.equal(gallery.result.length, 1);
  assert.equal((await request(gallery.result[0].url, { cookie: noteGuest })).response.status, 404);
  assert.equal((await request(`/uploads/${gallery.result[0].filename}`, { cookie: noteOwner })).response.status, 200);
  const invalidGalleryImage = await request('/api/gallery', {
    method: 'POST',
    body: Buffer.from('not an image'),
    cookie: noteOwner,
    headers: {
      'Content-Type': 'image/png',
      'X-Image-Category': encodeURIComponent('فن'),
    },
  });
  assert.equal(invalidGalleryImage.response.status, 400);
  assert.equal((await request(`/api/gallery/${gallery.result[0].id}`, { method: 'DELETE', cookie: noteOwner })).response.status, 200);
  assert.equal((await request('/api/gallery', { cookie: noteOwner })).result.length, 0);
  assert.equal((await request(`/uploads/${gallery.result[0].filename}`, { cookie: noteOwner })).response.status, 200);
  assert.equal((await request('/api/gallery')).response.status, 401);
  assert.equal((await request('/api/daily-notes?date=2026-10-20')).response.status, 401);
});

test('Chrome capture remains local and offers an optional bounded text snapshot', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  const popup = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.js'), 'utf8');
  const markup = fs.readFileSync(path.join(__dirname, '..', 'extension', 'popup.html'), 'utf8');
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.match(markup, /includeSnapshot/);
  assert.match(popup, /slice\(0, 4500\)/);
  assert.match(popup, /127\.0\.0\.1/);
});

test('book clubs keep invites, books, progress, chat, and timeline data private', async () => {
  const guestCookie = await createAccount('club_guest', 'club-guest-password-1234');
  const outsiderCookie = await createAccount('club_outsider', 'club-outsider-password-1234');
  const guestBook = await jsonRequest('/api/items', 'POST', {
    kind: 'book',
    title: 'A Shared Regression Book',
    creator: 'Test Author',
    status: 'completed',
  }, guestCookie);
  assert.equal(guestBook.response.status, 201, JSON.stringify(guestBook.result));
  const secondGuestBook = await jsonRequest('/api/items', 'POST', {
    kind: 'book',
    title: 'A Second Regression Book',
  }, guestCookie);
  assert.equal(secondGuestBook.response.status, 201);

  const club = await jsonRequest('/api/book-clubs', 'POST', {
    name: 'Regression Readers',
    description: 'Private integration test club',
  }, ownerCookie);
  assert.equal(club.response.status, 201);
  const privateClub = await request(`/api/book-clubs/${club.result.id}`, { cookie: outsiderCookie });
  assert.equal(privateClub.response.status, 404);

  const invitation = await request(`/api/book-clubs/${club.result.id}/invites`, {
    method: 'POST',
    cookie: ownerCookie,
  });
  assert.equal(invitation.response.status, 201);
  const token = new URL(invitation.result.invitePath, baseUrl).searchParams.get('clubInvite');
  const accepted = await request(`/api/book-club-invites/${token}/accept`, {
    method: 'POST',
    cookie: guestCookie,
  });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.result.clubId, club.result.id);
  const today = (await request('/api/today', { cookie: guestCookie })).result.date;
  const shiftDate = (value, days) => {
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const deniedBook = await jsonRequest(`/api/book-clubs/${club.result.id}/books`, 'POST', {
    itemId: guestBook.result.id,
    totalPages: 240,
  }, guestCookie);
  assert.equal(deniedBook.response.status, 403);
  const guestAccount = (await request('/api/auth/me', { cookie: guestCookie })).result.user;
  const deniedPermissionChange = await jsonRequest(
    `/api/book-clubs/${club.result.id}/members/${guestAccount.id}/permissions`,
    'PUT',
    { canAddBooks: true },
    guestCookie,
  );
  assert.equal(deniedPermissionChange.response.status, 403);
  const grantedPermission = await jsonRequest(
    `/api/book-clubs/${club.result.id}/members/${guestAccount.id}/permissions`,
    'PUT',
    { canAddBooks: true },
    ownerCookie,
  );
  assert.equal(grantedPermission.response.status, 200);

  const sharedBook = await jsonRequest(`/api/book-clubs/${club.result.id}/books`, 'POST', {
    itemId: guestBook.result.id,
    totalPages: 240,
  }, guestCookie);
  assert.equal(sharedBook.response.status, 201);
  const revokedPermission = await jsonRequest(
    `/api/book-clubs/${club.result.id}/members/${guestAccount.id}/permissions`,
    'PUT',
    { canAddBooks: false },
    ownerCookie,
  );
  assert.equal(revokedPermission.response.status, 200);
  const deniedAfterRevocation = await jsonRequest(`/api/book-clubs/${club.result.id}/books`, 'POST', {
    itemId: secondGuestBook.result.id,
    totalPages: 88,
  }, guestCookie);
  assert.equal(deniedAfterRevocation.response.status, 403);
  const progress = await jsonRequest(
    `/api/book-clubs/${club.result.id}/books/${sharedBook.result.id}/progress`,
    'PUT',
    { status: 'reading', pagesRead: 84, note: 'Currently on page 84.' },
    guestCookie,
  );
  assert.equal(progress.response.status, 200);
  assert.equal(progress.result.pages_read, 84);
  const overProgress = await jsonRequest(
    `/api/book-clubs/${club.result.id}/books/${sharedBook.result.id}/progress`,
    'PUT',
    { status: 'reading', pagesRead: 241, note: '' },
    guestCookie,
  );
  assert.equal(overProgress.response.status, 400);
  const completedProgress = await jsonRequest(
    `/api/book-clubs/${club.result.id}/books/${sharedBook.result.id}/progress`,
    'PUT',
    { status: 'completed', note: 'Finished and discussed.' },
    guestCookie,
  );
  assert.equal(completedProgress.result.pages_read, 240);
  const insight = await jsonRequest(`/api/book-clubs/${club.result.id}/messages`, 'POST', {
    type: 'insight',
    content: '@owner_test A shared insight.',
  }, guestCookie);
  assert.equal(insight.response.status, 201);
  const mentionNotifications = await request('/api/book-club-notifications', { cookie: ownerCookie });
  assert.equal(mentionNotifications.response.status, 200);
  assert.equal(mentionNotifications.result.length, 1);
  assert.equal(mentionNotifications.result[0].sender_username, 'club_guest');
  assert.equal((await request(`/api/book-club-notifications/${mentionNotifications.result[0].id}/read`, {
    method: 'POST',
    cookie: outsiderCookie,
  })).response.status, 404);
  assert.equal((await request(`/api/book-club-notifications/${mentionNotifications.result[0].id}/read`, {
    method: 'POST',
    cookie: ownerCookie,
  })).response.status, 200);

  const messageForm = new FormData();
  messageForm.append('type', 'chat');
  messageForm.append('content', 'A note with a document.');
  messageForm.append('link', 'https://example.com/club-reading');
  messageForm.append('attachments', new Blob(['Member-only attachment.'], { type: 'text/plain' }), 'discussion.txt');
  const attachedMessage = await request(`/api/book-clubs/${club.result.id}/messages`, {
    method: 'POST',
    body: messageForm,
    cookie: guestCookie,
  });
  assert.equal(attachedMessage.response.status, 201, JSON.stringify(attachedMessage.result));
  assert.equal((await request(`/api/book-clubs/${club.result.id}/export`, {
    cookie: outsiderCookie,
  })).response.status, 404);

  const meeting = await jsonRequest(`/api/book-clubs/${club.result.id}/meetings`, 'POST', {
    title: 'Next reading discussion',
    startsAt: `${shiftDate(today, 7)}T18:30`,
    meetingUrl: 'https://meet.example.com/reading',
    discussionPoints: 'First agenda draft.',
  }, guestCookie);
  assert.equal(meeting.response.status, 201);
  const editMeetingDenied = await jsonRequest(`/api/book-clubs/${club.result.id}/meetings/${meeting.result.id}`, 'PUT', {
    title: 'Changed by another member',
    startsAt: meeting.result.starts_at,
    meetingUrl: meeting.result.meeting_url,
    discussionPoints: 'Unauthorized edit.',
  }, outsiderCookie);
  assert.equal(editMeetingDenied.response.status, 404);
  const meetingUpdated = await jsonRequest(`/api/book-clubs/${club.result.id}/meetings/${meeting.result.id}`, 'PUT', {
    title: meeting.result.title,
    startsAt: meeting.result.starts_at,
    meetingUrl: meeting.result.meeting_url,
    discussionPoints: 'Pages 25–40 and character motivations.',
  }, guestCookie);
  assert.equal(meetingUpdated.response.status, 200);

  const clubDetails = await request(`/api/book-clubs/${club.result.id}`, { cookie: ownerCookie });
  assert.equal(clubDetails.response.status, 200);
  assert.equal(clubDetails.result.members.length, 2);
  assert.equal(clubDetails.result.books[0].completed_count, 1);
  assert.equal(clubDetails.result.books[0].my_pages_read, null);
  assert.ok(clubDetails.result.messages.some(message => message.content.includes('A shared insight.')));
  assert.equal(clubDetails.result.messages.find(message => message.content === 'A note with a document.').attachments[0].display_name, 'discussion.txt');
  assert.equal(clubDetails.result.messages.find(message => message.content === 'A note with a document.').links[0].url, 'https://example.com/club-reading');
  const attachmentUrl = clubDetails.result.messages.find(message => message.content === 'A note with a document.').attachments[0].url;
  assert.equal((await request(attachmentUrl, { cookie: outsiderCookie })).response.status, 404);
  assert.equal(clubDetails.result.meetings[0].discussion_points, 'Pages 25–40 and character motivations.');
  assert.equal(clubDetails.result.metrics.pages_read, 240);
  assert.equal(clubDetails.result.metrics.meeting_count, 1);
  assert.equal(clubDetails.result.leaderboard.find(member => member.username === 'club_guest').points, 13);
  const privateClubExport = await request(`/api/book-clubs/${club.result.id}/export`, { cookie: ownerCookie });
  assert.equal(privateClubExport.response.status, 200);
  const privateClubExportPath = path.join(testDirectory, 'private-club-export.zip');
  fs.writeFileSync(privateClubExportPath, Buffer.from(privateClubExport.result));
  const privateClubExportData = JSON.parse(await readArchiveEntry(privateClubExportPath, 'club.json'));
  assert.equal(privateClubExportData.books[0].progress.find(row => row.username === 'club_guest').note, '');
  assert.equal((await request(`/api/book-clubs/${club.result.id}`, { cookie: outsiderCookie })).response.status, 404);
  assert.equal((await request(`/api/book-clubs/${club.result.id}/messages`, {
    method: 'POST',
    cookie: outsiderCookie,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Should be denied.' }),
  })).response.status, 404);

  const recurringEvent = await jsonRequest('/api/events', 'POST', {
    title: 'Daily reading reminder',
    description: 'A recurring calendar event.',
    starts_at: `${shiftDate(today, -30)}T09:00`,
    recurrence: 'daily',
  }, guestCookie);
  assert.equal(recurringEvent.response.status, 201);
  const thought = await jsonRequest('/api/items', 'POST', {
    kind: 'memo',
    title: 'An idea for the timeline',
    tags: 'idea',
    notes: 'An idea should be one timeline entry.',
  }, guestCookie);
  assert.equal(thought.response.status, 201);
  const timeline = await request(`/api/timeline?start=${shiftDate(today, -14)}&end=${shiftDate(today, 1)}`, {
    cookie: guestCookie,
  });
  assert.equal(timeline.response.status, 200);
  assert.ok(timeline.result.entries.some(entry => entry.title === 'A Shared Regression Book' && entry.type === 'reading'));
  assert.ok(timeline.result.entries.some(entry => entry.title === 'Daily reading reminder' && entry.date === today && entry.type === 'event'));
  assert.equal(timeline.result.entries.filter(entry => entry.title === 'An idea for the timeline').length, 1);
  assert.equal(timeline.result.entries.find(entry => entry.title === 'An idea for the timeline').type, 'thought');
  assert.equal((await request(`/api/timeline?start=${shiftDate(today, -14)}&end=${shiftDate(today, 1)}`, {
    cookie: outsiderCookie,
  })).result.entries.some(entry => entry.title === 'A Shared Regression Book'), false);

  const privatePreview = await request('/api/bookmarks/preview', {
    method: 'POST',
    cookie: guestCookie,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1/private' }),
  });
  assert.equal(privatePreview.response.status, 422);
  const privateIpv6Preview = await request('/api/bookmarks/preview', {
    method: 'POST',
    cookie: guestCookie,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'http://[::1]/private' }),
  });
  assert.equal(privateIpv6Preview.response.status, 422);
  assert.equal((await request('/api/timeline?start=2020-01-01&end=9999-01-01', {
    cookie: guestCookie,
  })).response.status, 400);
  assert.equal((await request('/api/timeline?end=not-a-date', {
    cookie: guestCookie,
  })).response.status, 400);
});
