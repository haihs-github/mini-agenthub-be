const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// API: Admin tạo User mới
router.post('/create', userController.createUser);

module.exports = router;