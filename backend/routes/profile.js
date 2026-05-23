const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/auth');

// GET /api/profile - Get current user's profile
router.get('/', authMiddleware, profileController.getProfile);

// PATCH /api/profile - Update profile
router.patch('/', authMiddleware, profileController.updateProfile);

// GET /api/profile/emergency-contacts - Load emergency contacts
router.get('/emergency-contacts', authMiddleware, profileController.getEmergencyContacts);

// POST /api/profile/emergency-contacts - Add emergency contact
router.post('/emergency-contacts', authMiddleware, profileController.addEmergencyContact);

// DELETE /api/profile/emergency-contacts/:id - Delete emergency contact
router.delete('/emergency-contacts/:id', authMiddleware, profileController.deleteEmergencyContact);

module.exports = router;
