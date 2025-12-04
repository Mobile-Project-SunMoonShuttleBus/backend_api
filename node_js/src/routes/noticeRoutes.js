/**
 * 셔틀 공지 라우터
 * 공지 동기화, 리스트 조회, 상세 조회 엔드포인트
 */
const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/noticeController');
// 필요 시 나중에 auth 미들웨어 추가 가능
// const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /notices/shuttle/sync:
 *   post:
 *     summary: 셔틀 공지 동기화
 *     description: 포털에서 공지를 수집하고 LLM으로 분류하여 셔틀 관련 공지만 DB에 저장. 전체 작업은 최대 5분 내에 완료됩니다.
 *     tags: [Notices]
 *     responses:
 *       200:
 *         description: 동기화 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 셔틀 공지 동기화 완료
 *                 processed:
 *                   type: number
 *                   description: 처리된 공지 개수
 *                   example: 50
 *                 shuttleRelated:
 *                   type: number
 *                   description: 셔틀 관련 공지 개수 (DB에 저장된 개수)
 *                   example: 5
 *                 errors:
 *                   type: number
 *                   description: 처리 중 발생한 오류 개수
 *                   example: 0
 *                 llmFailures:
 *                   type: number
 *                   description: LLM(Ollama) 연결 실패 횟수 (0이 아니면 Ollama 서버 상태 확인 필요)
 *                   example: 0
 *       500:
 *         description: 동기화 실패 (크롤링 실패, Ollama 서버 오류, 타임아웃 등)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 셔틀 공지 동기화 실패
 */
// 셔틀 공지 동기화 (개발/운영용 - 나중에 관리자 권한 필요시 보호)
// GET 요청에 대한 명시적 처리 추가 (잘못된 메서드 방지)
router.get('/shuttle/sync', (req, res) => {
  res.status(405).json({ 
    message: '동기화는 POST 메서드로만 요청 가능합니다. POST /api/notices/shuttle/sync를 사용해주세요.' 
  });
});
router.post('/shuttle/sync', noticeController.syncNotices);

/**
 * @swagger
 * /notices/shuttle:
 *   get:
 *     summary: 셔틀 공지 리스트 조회
 *     description: 셔틀 관련 공지 목록을 최신순으로 조회
 *     tags: [Notices]
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     description: 공지 ID
 *                   title:
 *                     type: string
 *                     description: 공지 제목
 *                   postedAt:
 *                     type: string
 *                     format: date-time
 *                     description: 게시일
 *       500:
 *         description: 조회 오류
 */
router.get('/shuttle', noticeController.getShuttleNotices);

/**
 * @swagger
 * /notices/shuttle/{id}:
 *   get:
 *     summary: 셔틀 공지 상세 조회
 *     description: 공지 상세 정보와 LLM 요약을 조회 (요약이 없으면 자동 생성)
 *     tags: [Notices]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 공지 ID (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id:
 *                   type: string
 *                 portalNoticeId:
 *                   type: string
 *                 title:
 *                   type: string
 *                 content:
 *                   type: string
 *                 summary:
 *                   type: string
 *                   description: LLM으로 생성된 요약
 *                 url:
 *                   type: string
 *                 postedAt:
 *                   type: string
 *                   format: date-time
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: 공지 없음
 *       500:
 *         description: 조회 오류
 */
router.get('/shuttle/:id', noticeController.getShuttleNoticeDetail);

/**
 * @swagger
 * /notices/shuttle/health:
 *   get:
 *     summary: Ollama 서버 상태 확인 (진단용)
 *     description: Ollama 서버 연결 상태를 확인합니다.
 *     tags: [Notices]
 *     responses:
 *       200:
 *         description: Ollama 서버가 정상적으로 연결됩니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 message:
 *                   type: string
 *                 ollamaUrl:
 *                   type: string
 *                 model:
 *                   type: string
 *       503:
 *         description: Ollama 서버에 연결할 수 없습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: unhealthy
 *                 message:
 *                   type: string
 *                 troubleshooting:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/shuttle/health', noticeController.checkOllamaHealth);

module.exports = router;

