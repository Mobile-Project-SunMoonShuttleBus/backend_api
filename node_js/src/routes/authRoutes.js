const express = require('express');
const router = express.Router();
const { register, login, logout, saveSchoolAccount } = require('../controllers/authController');
const { authToken } = require('../middleware/auth');

// 회원가입
router.post('/register', register);

// 로그인
router.post('/login', login);

// 로그아웃 (인증 필요)
router.post('/logout', authToken, logout);

// 학교 포털 계정 정보 저장 (인증 필요)
router.post('/school-account', authToken, saveSchoolAccount);

module.exports = router;

