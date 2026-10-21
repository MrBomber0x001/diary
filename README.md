# مذكرتي

A standalone memo and media library for books, games, films, personal notes, life planning, and shared reading. The SQLite database and uploaded files are stored on the machine running the server. Optional title lookup contacts Open Library for books, IMDb for films, and Wikipedia for games.

The app supports multiple accounts. Each account has a separate library and signs in with a username and password of at least 12 characters. The first account created after this update takes ownership of any existing library entries. Sessions expire after 30 days. The database and uploaded files are not encrypted at rest, so protect the server's data folder and backups.

See the [authentication guide](./docs/authentication.md) for the registration and sign-in flows, session behavior, API endpoints, validation rules, and screenshots.

The first account is the app owner. The owner can manage automatic daily backups from **الإعدادات**, create a manual full backup, and download backups. Full `.zip` archives include the database, uploaded images, and audio for all accounts; they are stored in `data/backups`, with the latest 7 backup files retained. The daily job runs while the app is running and checks hourly; when the owner signs in, it creates today's full archive if one is missing. Older `.sqlite` backups remain downloadable and can still be restored, but do not contain media.

The owner can optionally enable AWS S3 mirroring in **الإعدادات**. New image and audio uploads, plus generated backups, are copied to the configured private bucket while remaining stored locally. Configure AWS credentials on the server using the AWS SDK default credential chain (environment variables, shared credentials/config, or an IAM role); credentials are never stored in the app database or browser. The app tests bucket access before enabling mirroring. The AWS identity needs `s3:ListBucket`, `s3:PutObject`, and `s3:DeleteObject` for the selected bucket and prefix. Files are stored under the configured prefix in `media/<account-id>/images`, `media/<account-id>/audio`, and `backups`. Enabling mirroring applies to new uploads and backups; it does not migrate existing files.

To restore a full backup, open **الإعدادات**, select its ZIP file, and confirm **استعادة النسخة المحددة**. The app validates the archive and its SQLite database, creates a safety archive of the current database and media, then replaces the database and media together. You will be signed out and must sign in with an account from the restored database. Restoring an older `.sqlite` file replaces only the database; keep a separate copy of matching media if you need those files.

The **طريقة تعديل العناصر** preference switches between inline editing and the edit popup. Choose light, dark, or system-matched appearance, and optionally enable browser notifications for task deadlines. New in-app notifications can play a short tone; control it separately from browser notification permission. Notifications are checked while the application is open, and the panel supports marking individual notifications or all current notifications as read. Completing every task due today opens a once-per-day congratulatory dialog.

The workspace is organized into separate views for **اليوم**, tasks, calendar, planning, habits, your library, saved reading, daily notes, pinned items, and a personal image gallery, with a compact navigation rail on desktop and a multi-row section bar on smaller screens. **اليوم** opens first and brings together today's events, due tasks, habits, and routines. Its quick summary highlights completed, nearly-complete, and in-progress media plus overdue tasks; expand **عرض كل المؤشرات** for the full metrics. Tasks can be added inline, given a due date with one tap, filtered by today/upcoming/completed, and searched; use **تفاصيل** to add a time, project, or notes. Tasks can recur daily, weekly, or monthly; completing a recurring task creates its next occurrence. Overdue tasks stay highlighted and trigger an in-app alert while the application is open.

**التقويم** manages dated and recurring events in a month grid; select a day to see its events or add one directly to that date. Under **التخطيط** you can create life areas, connect goals to areas and projects to goals, and link tasks to active projects so each project has a visible next action. **العادات والروتين** shows today's completion progress, a seven-day tracker and streak for each habit, plus one-tap completion. Routines have their own daily completion action and step list. Its private trophy board ranks this week's habit, routine, and task activity: one point per completed task, two per habit log, and three per completed routine. **مراجعة الأسبوع** summarizes recent completions, overdue and upcoming tasks, and planning prompts.

The **قائمة المهام** section stores private, account-specific tasks with notes, due dates, reminders, recurrence, and completion state. The notification bell surfaces overdue tasks, tasks due today or soon, and upcoming calendar events; optional browser notifications can alert you about overdue tasks and timed reminders while the app is open. The **المقالات والمواقع** section stores URLs with descriptions, selected excerpts, reading status, and Markdown reviews. **الروابط المهمة** presents reference links as searchable cards with their domain, note, quick open, copy, edit, and delete actions; you can paste a URL from the clipboard to start a new bookmark. Use **جلب معلومات وصورة** to retrieve a public page's title, description, and preview image; the image is validated and saved to the account's private uploads. The preview fetcher rejects private-network targets and limits redirects and download sizes. The header search searches the library, tasks, articles, and bookmarks; library filters can narrow results by type, status, rating, and tag. Deleted library items, tasks, articles, and bookmarks can be restored using the temporary **تراجع** action.

The **الخط الزمني** view gathers dated writing, reading, completed media, tasks, habits, routines, calendar events, and article reading activity for a selected date range. **نادي الكتاب** lets members create private clubs, add books from their own library, track each member's page progress, and share messages or reading insights. Owners can create and revoke invitation links; links expire after 30 days and require an account sign-in. New members cannot add books until the owner grants that permission individually; owners can revoke it at any time. Members can mention other club members with `@username` to create an in-app notification, attach images and common documents, and share links in discussions. Members can schedule meetings with a date, link, and discussion notes, and edit their own meetings; owners can manage every meeting. The leaderboard gives 10 points for each completed shared book and 3 for each insight. The club metrics and export are available in the club view; the ZIP export contains `club.json` and shared attachments, while each member's private reading notes are only included for that member. Club uploads are stored in `data/club-uploads`; full backups include them. Membership, discussions, attachments, reading progress, and invitations are scoped to club members.

**مذكرة اليوم** provides one optional, Markdown-enabled page per date and saves edits automatically. Use `[[item:ID|عنوان]]` or `[[daily:YYYY-MM-DD|عنوان]]` to link a note or a dated entry; the linked page lists backlinks from your memos, daily notes, articles, and saved-link notes. The pin control saves library entries, articles, bookmarks, and daily notes to **المثبتة**. Use **وضع هادئ** to hide navigation, dashboard metrics, and other header actions while reading or writing; the account menu and an exit control remain available. **معرض الصور** stores private JPG, PNG, WebP, and GIF uploads in your account's image storage, groups them by a custom category (for example, art or personal), and provides a full-screen viewer with previous/next navigation. Removing an image from the gallery does not remove it from a note or other content where it is used.

Keyboard shortcuts: **Ctrl/Cmd+K** focuses global search, and **Ctrl/Cmd+N** opens the new-item form.

### Chrome extension

The unpacked Chrome extension is in `extension`. To install it, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this folder's `extension` directory. Open the extension's settings and set the application URL (by default `http://127.0.0.1:4178`). Keep the app running and signed in in Chrome. On an article or website, click the extension and choose **حفظ في المقالات**; it sends the page title, URL, description, and selected text to the app in a new tab. Optionally include a bounded text snapshot of the readable page. The article is saved after the app session is authenticated, and the app confirms the save. The extension does not store or transmit your password or send page content to third-party services.

When adding a book, game, or film, enter a title and choose **البحث عن معلومات وصورة** to find matching details and cover art. The **بحث عن عنوان** side panel is also available from the library. You can upload your own JPG, PNG, WebP, or GIF cover image (up to 5 MB).

Reviews, notes, and chapter notes support Markdown headings, ordered and unordered lists, quotes, bold, italic, HTTP(S) links, inline code, fenced code blocks, and uploaded images. Images can be pasted directly from the clipboard or dragged into a Markdown editor. In **الإعدادات**, control Markdown rendering, the formatting toolbar, and image paste/drop per account. Long reviews and notes are shortened in library cards until expanded. On an item's detail page, edit its review or notes in place and preview the Markdown before saving. Each item opens in its own tab from its title or the **فتح في تبويب جديد** action. Books have a chapter list with a separate Markdown notes area for each chapter. Cover images can be selected, dragged onto the cover area, or pasted from the clipboard. Task, planning, and item actions use compact icon buttons with accessible names and hover labels.

Text fields and rendered notes detect the text direction automatically, so Arabic, English, and mixed-language text align naturally. The interface uses IBM Plex Sans Arabic; loading the web font requires an internet connection. Each item detail page can also store and play up to 10 audio attachments per upload request (MP3, M4A, WAV, OGG, WebM, FLAC, or AAC; up to 100 MB per file).

## Project structure

- `server.js` owns application startup, SQLite schema setup and migrations, authentication/session and storage/backup services, shared middleware, and the final error/static handlers.
- `routes/index.js` registers feature routers and supplies their dependencies from the application layer.
- `routes/auth.js` handles registration, login/logout, session status, and the authenticated account endpoint. It is mounted before the authenticated API middleware.
- `routes/planning.js` handles life areas, goals, and projects.
- `routes/activity.js` handles calendar events, habits, routines, the daily overview, timeline, weekly review, and metrics.
- `routes/tasks.js` handles task CRUD and recurring-task creation.
- `routes/notes.js` handles saved articles, bookmarks, daily notes, backlinks, pins, and the personal image gallery.
- `routes/book-clubs.js` handles clubs, invitations, member permissions, messages and attachments, meetings, progress, metrics, notifications, and exports.
- `routes/management.js` handles search, restore-from-trash, settings, and backup endpoints.
- `routes/discovery.js` handles external title lookup and bookmark previews.
- `routes/media.js` handles image/audio upload and authenticated media delivery.
- `routes/library.js` handles library items, reading progress, and book chapters; `routes/item-page.js` serves authenticated item pages.
- `public/` contains the browser client, and `test/` contains the isolated Node.js regression suite.

Keep database connections, authentication, and shared services in the application layer; put feature-specific HTTP handlers in their route module and pass shared dependencies into that module rather than importing the server entry point.

## Run

1. Install Node.js 22 or newer.
2. Open a terminal in this folder and run `npm install`.
3. Run `npm start`.
4. Open `http://127.0.0.1:4178` in your browser.

Run the isolated regression suite with `npm test`. It uses a temporary database and media folders and does not modify the normal `data` directory.

The SQLite database is created at `data/memo.sqlite`, uploaded images at `data/uploads`, and audio at `data/audio`. Back up these to preserve your library and attachments. By default, the server listens only on this computer. Set `PORT` to use another local port. Metadata lookup requires an internet connection; library content and uploaded images/audio are not sent to metadata providers.

For a remotely reachable self-hosted instance, configure `HOST=0.0.0.0` and put the app behind an HTTPS reverse proxy with a domain, firewall rules, persistent database/media storage, and reliable backups. Set `COOKIE_SECURE=1` when TLS terminates at the proxy so authentication cookies are sent only over HTTPS. Do not expose the app over plain HTTP or treat setting `HOST` as a deployment; hosting, TLS, storage persistence, and account administration must be configured separately. For local-only use, leave the default `HOST` unchanged.
