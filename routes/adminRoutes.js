const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminMemberController = require('../controllers/adminMemberController');
const verifyToken = require('../middleware/verifyToken');
const isAdmin = require('../middleware/isAdmin');

// POST /api/admin/login
router.post('/login', adminController.login);

// GET /api/admin/members
router.get('/members', verifyToken, isAdmin, adminMemberController.getMembers);

// PUT /api/admin/members/:id
router.put('/members/:id', verifyToken, isAdmin, adminMemberController.updateMember);

// GET /api/admin/members/:id/quiz-stats
router.get(
  '/members/:id/quiz-stats',
  verifyToken,
  isAdmin,
  adminMemberController.getMemberQuizStats
);

module.exports = router;