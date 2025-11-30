const express = require('express');
const router = express.Router();
const routeTimeController = require('../controllers/routeTimeController');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /bus/route-time:
 *   get:
 *     summary: 현재 위치에서 최종 도착지까지 예상 시간 조회
 *     tags: [Bus Route Time]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       현재 위치에서 가장 가까운 정류장까지 도보 시간과
 *       정류장 도착 후 탈 수 있는 가장 빠른 버스 시간을 계산합니다.
 *       
 *       **응답 정보:**
 *       - 도보 시간: 현재 위치 → 정류장
 *       - 정류장 도착 시간: 현재 시간 + 도보 시간
 *       - 대기 시간: 정류장 도착 후 버스 출발까지 대기 시간
 *       - 버스 출발 시간: 탈 수 있는 가장 빠른 버스 시간
 *       - 최종 도착 시간: 버스를 타고 최종 도착지까지 도착하는 시간
 *       
 *       **주의사항:**
 *       - 도착지는 경유지가 아닌 최종 목적지를 입력해야 합니다.
 *       - 현재 시간 기준으로 탈 수 있는 가장 빠른 버스를 찾습니다.
 *       - 버스 시간표에 도착 시간이 없으면 최종 도착 시간은 계산되지 않습니다.
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
 *         name: arrival
 *         required: true
 *         schema:
 *           type: string
 *         description: 최종 도착지 정류장 이름 (경유지가 아닌 최종 목적지)
 *         example: "천안 아산역"
 *       - in: query
 *         name: busType
 *         schema:
 *           type: string
 *           enum: [shuttle, campus]
 *         description: "버스 타입 필터 (shuttle: 셔틀버스만, campus: 통학버스만, 미지정: 모두)"
 *         example: "shuttle"
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *         description: "요일 타입 필터 (셔틀: 평일/토요일/공휴일/일요일, 통학: 평일/월~목/금요일/토요일/공휴일/일요일)"
 *         example: "평일"
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: [등교, 하교]
 *         description: 방향 필터 (통학버스만 적용)
 *         example: "하교"
 *       - in: query
 *         name: currentTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 현재 시간 (ISO 8601 형식, 미지정 시 서버 시간 사용)
 *         example: "2025-12-01T08:30:00.000Z"
 *     responses:
 *       200:
 *         description: 경로 시간 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 currentLocation:
 *                   type: object
 *                   properties:
 *                     latitude:
 *                       type: number
 *                       example: 36.790013
 *                     longitude:
 *                       type: number
 *                       example: 127.002474
 *                 arrival:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "천안 아산역"
 *                     latitude:
 *                       type: number
 *                       example: 36.773844
 *                     longitude:
 *                       type: number
 *                       example: 127.053849
 *                 bestRoute:
 *                   type: object
 *                   properties:
 *                     departureStop:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: "아산캠퍼스"
 *                         latitude:
 *                           type: number
 *                         longitude:
 *                           type: number
 *                     arrivalStop:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           example: "천안 아산역"
 *                         latitude:
 *                           type: number
 *                         longitude:
 *                           type: number
 *                     busType:
 *                       type: string
 *                       enum: [shuttle, campus]
 *                       example: "shuttle"
 *                     direction:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     dayType:
 *                       type: string
 *                       example: "평일"
 *                     walkingTime:
 *                       type: number
 *                       description: 도보 시간 (밀리초)
 *                       example: 600000
 *                     walkingDistance:
 *                       type: number
 *                       description: 도보 거리 (미터)
 *                       example: 500
 *                     walkingTimeMinutes:
 *                       type: number
 *                       description: 도보 시간 (분)
 *                       example: 10
 *                     stopArrivalTime:
 *                       type: string
 *                       format: date-time
 *                       description: 정류장 도착 시간
 *                       example: "2025-12-01T08:40:00.000Z"
 *                     busDepartureTime:
 *                       type: string
 *                       format: date-time
 *                       description: 버스 출발 시간
 *                       example: "2025-12-01T08:50:00.000Z"
 *                     waitTime:
 *                       type: number
 *                       description: 대기 시간 (밀리초)
 *                       example: 600000
 *                     waitTimeMinutes:
 *                       type: number
 *                       description: 대기 시간 (분)
 *                       example: 10
 *                     busArrivalTime:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: 최종 도착 시간 (버스 시간표에 도착 시간이 있는 경우)
 *                       example: "2025-12-01T09:20:00.000Z"
 *                     totalTime:
 *                       type: number
 *                       nullable: true
 *                       description: 총 소요 시간 (밀리초, 도착 시간이 있는 경우)
 *                       example: 3000000
 *                     totalTimeMinutes:
 *                       type: number
 *                       nullable: true
 *                       description: 총 소요 시간 (분, 도착 시간이 있는 경우)
 *                       example: 50
 *                 allRoutes:
 *                   type: array
 *                   description: 모든 가능한 경로 목록 (최종 도착 시간 순으로 정렬)
 *                   items:
 *                     type: object
 *                     properties:
 *                       departureStop:
 *                         type: object
 *                       busType:
 *                         type: string
 *                       walkingTimeMinutes:
 *                         type: number
 *                       waitTimeMinutes:
 *                         type: number
 *                       busDepartureTime:
 *                         type: string
 *                         format: date-time
 *                       busArrivalTime:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       totalTimeMinutes:
 *                         type: number
 *                         nullable: true
 *       400:
 *         description: 잘못된 요청 (필수 파라미터 누락 또는 잘못된 좌표)
 *       404:
 *         description: 경로를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
router.get('/', authToken, routeTimeController.getRouteTime);

module.exports = router;

