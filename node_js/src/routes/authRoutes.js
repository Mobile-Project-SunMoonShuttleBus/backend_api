const express = require('express');
const router = express.Router();
const { register, login, logout, saveSchoolAccount } = require('../controllers/authController');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 회원가입
 *     tags: [Auth]
 *     security: []
 *     description: 새로운 사용자를 생성합니다. 비밀번호는 서버에서 해시 처리됩니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - password
 *             properties:
 *               userId:
 *                 type: string
 *                 description: 로그인에 사용할 ID (4~20자)
 *                 example: "sunmoon123"
 *               password:
 *                 type: string
 *                 description: 로그인 비밀번호
 *                 example: "P@ssw0rd!"
 *     responses:
 *       201:
 *         description: 회원가입 성공
 *       400:
 *         description: 잘못된 요청
 *       409:
 *         description: 이미 존재하는 사용자
 *       500:
 *         description: 서버 오류
 */
router.post('/register', register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 로그인
 *     tags: [Auth]
 *     security: []
 *     description: 로그인 성공 시 JWT 토큰을 반환합니다. Swagger 상단의 Authorize 버튼에 토큰을 입력하면 보호된 API를 테스트할 수 있습니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - password
 *             properties:
 *               userId:
 *                 type: string
 *                 description: 로그인 ID
 *                 example: "sunmoon123"
 *               password:
 *                 type: string
 *                 description: 로그인 비밀번호
 *                 example: "P@ssw0rd!"
 *     responses:
 *       200:
 *         description: 로그인 성공
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.post('/login', login);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 로그아웃
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     description: 로그인한 사용자의 토큰을 무효화합니다. Authorization 헤더에 Bearer 토큰을 포함해야 합니다.
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.post('/logout', authToken, logout);

/**
 * @swagger
 * /auth/school-account:
 *   post:
 *     summary: 학교 포털 계정 정보 저장
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     description: 인증된 사용자의 학교 포털 계정 정보를 저장합니다. JWT 토큰이 필요합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - schoolId
 *               - schoolPassword
 *             properties:
 *               schoolId:
 *                 type: string
 *                 description: 학교 포털 ID (학번)
 *                 example: "20251234"
 *               schoolPassword:
 *                 type: string
 *                 description: 학교 포털 비밀번호
 *                 example: "포털비밀번호"
 *     responses:
 *       200:
 *         description: 저장 성공
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.post('/school-account', authToken, saveSchoolAccount);

module.exports = router;

