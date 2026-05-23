const express = require('express');
const router = express.Router();
const routesController = require('../controllers/routesController');
const authMiddleware = require('../middleware/auth');

// All routes endpoints require JWT authentication
router.post('/', authMiddleware, routesController.create);
// inside routes/routes.js, after the other router.* lines:
router.post('/multimodal', authMiddleware, routesController.findMultimodalRoute);
router.put('/:id', authMiddleware, routesController.update);
router.delete('/:id', authMiddleware, routesController.delete);

module.exports = router;
