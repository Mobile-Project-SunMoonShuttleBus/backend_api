const express = require('express');
const router = express.Router();
const congestionController = require('../controllers/congestionController');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /bus/congestion:
 *   post:
 *     summary: 버스 혼잡도 입력
 *     tags: [Bus Congestion]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       특정 시간대의 버스 혼잡도를 입력합니다.
 *       
 *       **버스 타입:**
 *       - `shuttle`: 셔틀버스
 *       - `campus`: 통학버스
 *       
 *       **혼잡도 레벨 (숫자):**
 *       - `0`: 원활 (여유 있음)
 *       - `1`: 보통
 *       - `2`: 혼잡 (혼잡함)
 *       
 *       **요일:**
 *       - `월`, `화`, `수`, `목`, `금`, `토`, `일`
 *       
 *       **요일 타입:**
 *       - 셔틀버스: `평일`, `토요일/공휴일`, `일요일`
 *       - 통학버스: `평일`, `월~목`, `금요일`, `토요일/공휴일`, `일요일`
 *       
 *       **중요:**
 *       - 입력한 출발지/도착지/출발시간/요일타입이 실제 시간표에 존재하는지 검증합니다.
 *       - **도착지는 반드시 최종 도착지를 입력해야 합니다. 경유지를 입력하면 안 됩니다.**
 *       - 경유지를 도착지로 입력하면 에러 메시지와 함께 올바른 최종 도착지 정보를 제공합니다.
 *       - 통학버스의 경우 `direction`(등교/하교)이 필수입니다.
 *       - 날짜는 YYYY-MM-DD 형식으로 입력해야 합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - busType
 *               - departure
 *               - arrival
 *               - departureTime
 *               - dayOfWeek
 *               - date
 *               - dayType
 *               - congestionLevel
 *             properties:
 *               busType:
 *                 type: string
 *                 enum: [shuttle, campus]
 *                 example: "shuttle"
 *                 description: "버스 타입 (shuttle: 셔틀버스, campus: 통학버스)"
 *               departure:
 *                 type: string
 *                 example: "아산캠퍼스"
 *                 description: 출발지 정류장 이름
 *               arrival:
 *                 type: string
 *                 example: "천안 아산역"
 *                 description: |
 *                   최종 도착지 정류장 이름 (경유지가 아닌 최종 목적지)
 *                   - 경유지를 입력하면 안 됩니다. 반드시 최종 도착지만 입력해야 합니다.
 *                   - 예: "천안 아산역" (O), "온양역" (X - 경유지인 경우)
 *               direction:
 *                 type: string
 *                 enum: [등교, 하교]
 *                 example: "하교"
 *                 description: 방향 (통학버스만 필수, 셔틀버스는 생략 가능)
 *               departureTime:
 *                 type: string
 *                 example: "09:40"
 *                 description: 출발 시간 (HH:MM 형식)
 *               dayOfWeek:
 *                 type: string
 *                 enum: [월, 화, 수, 목, 금, 토, 일]
 *                 example: "월"
 *                 description: 요일
 *               date:
 *                 type: string
 *                 example: "2025-01-20"
 *                 description: 날짜 (YYYY-MM-DD 형식)
 *               dayType:
 *                 type: string
 *                 example: "평일"
 *                 description: "요일 타입 (셔틀: 평일/토요일/공휴일/일요일, 통학: 평일/월~목/금요일/토요일/공휴일/일요일)"
 *               congestionLevel:
 *                 type: integer
 *                 enum: [0, 1, 2]
 *                 example: 1
 *                 description: |
 *                   혼잡도 레벨 (숫자)
 *                   - 0: 원활 (여유 있음)
 *                   - 1: 보통
 *                   - 2: 혼잡 (혼잡함)
 *     responses:
 *       201:
 *         description: 혼잡도 저장 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "혼잡도가 성공적으로 저장되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "507f1f77bcf86cd799439011"
 *                     busType:
 *                       type: string
 *                       example: "shuttle"
 *                     departure:
 *                       type: string
 *                       example: "아산캠퍼스"
 *                     arrival:
 *                       type: string
 *                       example: "천안 아산역"
 *                     direction:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     departureTime:
 *                       type: string
 *                       example: "09:40"
 *                     dayOfWeek:
 *                       type: string
 *                       example: "월"
 *                     date:
 *                       type: string
 *                       example: "2025-01-20"
 *                     dayType:
 *                       type: string
 *                       example: "평일"
 *                     congestionLevel:
 *                       type: integer
 *                       example: 1
 *                       description: "혼잡도 레벨 (0: 원활, 1: 보통, 2: 혼잡)"
 *                     reportedBy:
 *                       type: string
 *                       description: 보고한 사용자 ID (ObjectId)
 *                       example: "507f1f77bcf86cd799439012"
 *                     reportedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-01-20T10:30:00.000Z"
 *       400:
 *         description: 잘못된 요청 (필수 파라미터 누락 또는 잘못된 값)
 *       404:
 *         description: 존재하지 않는 시간표
 *       500:
 *         description: 서버 오류
 */
router.post('/', authToken, congestionController.reportCongestion);

module.exports = router;

