const express = require('express');
const path = require('node:path');

function createItemPageRouter({ authenticate, getOwnedItem, publicDirectory }) {
  const router = express.Router();

  router.get('/:id', authenticate, (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).send('Not found');
    if (!getOwnedItem.get(req.params.id, req.user.id)) return res.status(404).send('Not found');
    res.sendFile(path.join(publicDirectory, 'index.html'), error => {
      if (error) next(error);
    });
  });

  return router;
}

module.exports = createItemPageRouter;
