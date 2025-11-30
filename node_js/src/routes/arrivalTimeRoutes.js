const express = require('express');
const router = express.Router();
const arrivalTimeController = require('../controllers/arrivalTimeController');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /bus/arrival-time:
 *   get:
 *     summary: 현재 위치에서 도착지까지 도착 시간 조회
 *     tags: [Bus Route Time]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       현재 위치에서 출발지까지 도보 시간을 네이버 API로 계산하고,
 *       출발지 도착 예상 시간 이후 가장 빠르게 도착지까지 가는 버스를 찾아
 *       최종 도착 시간을 계산합니다.
 *       
 *       **응답 정보:**
 *       - 출발지까지 도보 시간 (분)
 *       - 최종 도착 시간 (HH:MM 형식)
 *       
 *       **주의사항:**
 *       - 출발지와 도착지는 경유지가 아닌 최종 정류장 이름을 입력해야 합니다.
 *       - 현재 시간 기준으로 출발지 도착 후 탈 수 있는 가장 빠른 버스를 찾습니다.
 *     parameters:
 *       - in: query
 *         name: currentLat
 *         required: true
 *         schema:
 *           type: number
 *         description: 현재 위치 위도
 *         example: 36.790013
 *       - in: query
 *         name: currentLng
 *         required: true
 *         schema:
 *           type: number
 *         description: 현재 위치 경도
 *         example: 127.002474
 *       - in: query
 *         name: departure
 *         required: true
 *         schema:
 *           type: string
 *         description: 출발지 정류장 이름
 *         example: "아산캠퍼스"
 *       - in: query
 *         name: arrival
 *         required: true
 *         schema:
 *           type: string
 *         description: 최종 도착지 정류장 이름 (경유지가 아닌 최종 목적지)
 *         example: "천안 아산역"
 *     responses:
 *       200:
 *         description: 도착 시간 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 walkingTimeMinutes:
 *                   type: number
 *                   description: 정류장까지 도보 시간 (분)
 *                   example: 10
 *                 arrivalTime:
 *                   type: string
 *                   description: 최종 도착 시간 (HH:MM 형식)
 *                   example: "09:20"
 *                 arrivalTimeFull:
 *                   type: string
 *                   format: date-time
 *                   description: 최종 도착 시간 (ISO 8601 형식)
 *                   example: "2025-12-01T09:20:00.000Z"
 *       400:
 *         description: 잘못된 요청 (필수 파라미터 누락 또는 잘못된 좌표)
 *       404:
 *         description: 경로를 찾을 수 없음 또는 도착 시간 계산 불가
 *       500:
 *         description: 서버 오류
 */
router.get('/', authToken, arrivalTimeController.getArrivalTime);

module.exports = router;

