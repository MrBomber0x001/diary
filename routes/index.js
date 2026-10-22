const createActivityRouter = require('./activity');
const createBookClubRouter = require('./book-clubs');
const createManagementRouter = require('./management');
const createDiscoveryRouter = require('./discovery');
const createFinanceRouter = require('./finance');
const createLibraryRouter = require('./library');
const createMediaRouter = require('./media');
const createItemPageRouter = require('./item-page');
const createLearningRouter = require('./learning');
const createNotesRouter = require('./notes');
const createPlanningRouter = require('./planning');
const createTasksRouter = require('./tasks');

function registerApiRoutes(app, services) {
  app.use('/api', createPlanningRouter(services.planning));
  app.use('/api', createActivityRouter(services.activity));
  app.use('/api', createTasksRouter(services.tasks));
  app.use('/api', createNotesRouter(services.notes));
  app.use('/api', createLearningRouter(services.learning));
  app.use('/api', createFinanceRouter(services.finance));
  app.use('/api', createBookClubRouter(services.bookClubs));
  app.use('/api', createManagementRouter(services.management));
  app.use('/api', createDiscoveryRouter(services.discovery));
  const media = createMediaRouter(services.media);
  app.use('/api', media.apiRouter);
  app.use(media.uploadsRouter);
  app.use('/api', createLibraryRouter(services.library));
  app.use('/item', createItemPageRouter(services.itemPage));
}

module.exports = registerApiRoutes;
