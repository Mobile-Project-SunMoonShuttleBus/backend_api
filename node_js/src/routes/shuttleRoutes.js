const express = require('express');
const router = express.Router();
const shuttleController = require('../controllers/shuttleController');
const busScheduleService = require('../services/busScheduleService');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /shuttle/routes:
 *   get:
 *     summary: 셔틀 노선 전체 목록 조회
 *     tags: [Shuttle Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: busType
 *         schema:
 *           type: string
 *         description: 버스 타입 필터
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *         description: |
 *           요일 필터.
 *           
 *           입력 가능 값:
 *           - `평일`
 *           - `토요일/공휴일`
 *           - `일요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *     responses:
 *       200:
 *         description: 셔틀 노선 목록
 */
router.get('/routes', authToken, shuttleController.getShuttleRoutes);

/**
 * @swagger
 * /shuttle/route/{routeId}:
 *   get:
 *     summary: 셔틀 노선 상세 조회
 *     tags: [Shuttle Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema:
 *           type: string
 *         description: 노선 ID
 *     responses:
 *       200:
 *         description: 노선 상세 정보
 *       404:
 *         description: 노선을 찾을 수 없음
 */
router.get('/route/:routeId', authToken, shuttleController.getShuttleRoute);

/**
 * @swagger
 * /shuttle/schedules:
 *   get:
 *     summary: 셔틀버스 시간표 조회
 *     tags: [Shuttle Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *         description: |
 *           요일 필터 (쉼표로 여러 개 가능).
 *           
 *           입력 가능 값:
 *           - `평일`
 *           - `토요일/공휴일`
 *           - `일요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "평일"
 *       - in: query
 *         name: departure
 *         schema:
 *           type: string
 *         description: 출발지 (경유지도 검색 가능)
 *         example: "아산캠퍼스"
 *       - in: query
 *         name: arrival
 *         schema:
 *           type: string
 *         description: 도착지 (경유지도 검색 가능)
 *         example: "천안 아산역"
 *       - in: query
 *         name: fridayOperates
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: 금요일 운행 여부
 *       - in: query
 *         name: includeFridayOff
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: 금요일 미운행 포함 여부. 기본값은 true
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *         description: 시작 시간. HH:mm 형식
 *         example: "08:00"
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: string
 *           pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *         description: 종료 시간. HH:mm 형식
 *         example: "18:00"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 0
 *           maximum: 200
 *         description: 페이지당 개수 (0이면 전체, 최대 200)
 *         example: 10
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: 페이지 번호. 기본값은 1
 *         example: 1
 *     responses:
 *       200:
 *         description: 시간표 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: 전체 개수
 *                 count:
 *                   type: integer
 *                   description: 현재 페이지 개수
 *                 page:
 *                   type: integer
 *                   nullable: true
 *                   description: 페이지 번호
 *                 limit:
 *                   type: integer
 *                   nullable: true
 *                   description: 페이지당 개수
 *                 filters:
 *                   type: object
 *                   description: 적용된 필터
 *                 viaStopsSummary:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 경유지 목록 요약
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ShuttleSchedule'
 *       500:
 *         description: 서버 오류
 */
router.get('/schedules', authToken, shuttleController.getShuttleSchedules);

/**
 * @swagger
 * /shuttle/schedules/meta:
 *   get:
 *     summary: 셔틀버스 시간표 메타 정보 조회
 *     tags: [Shuttle Schedules]
 *     security:
 *       - bearerAuth: []
 *     description: 출발지별 도착지 목록 및 경유지 정보를 조회합니다. 셀렉터(드롭다운) 구성 시 사용합니다.
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *         description: |
 *           요일 필터 (쉼표로 여러 개 가능).
 *           
 *           입력 가능 값:
 *           - `평일`
 *           - `토요일/공휴일`
 *           - `일요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "토요일/공휴일"
 *     responses:
 *       200:
 *         description: 메타 정보 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 dayTypes:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: 사용 가능한 요일 목록
 *                 departures:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       dayType:
 *                         type: string
 *                       departures:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             dayType:
 *                               type: string
 *                             departure:
 *                               type: string
 *                             arrivals:
 *                               type: array
 *                               items:
 *                                 type: string
 *                             viaStops:
 *                               type: array
 *                               items:
 *                                 type: string
 *       500:
 *         description: 서버 오류
 */
router.get('/schedules/meta', authToken, shuttleController.getShuttleScheduleMeta);

/**
 * @swagger
 * /shuttle/stops:
 *   get:
 *     summary: 셔틀 정류장 목록 조회
 *     tags: [Shuttle Stops]
 *     security:
 *       - bearerAuth: []
 *     description: 모든 정류장 목록과 각 정류장이 어떤 요일에 출발지/도착지로 사용되는지 조회합니다.
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *         description: |
 *           요일 필터.
 *           
 *           입력 가능 값:
 *           - `평일`
 *           - `토요일/공휴일`
 *           - `일요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "일요일"
 *     responses:
 *       200:
 *         description: 정류장 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   description: 전체 정류장 개수
 *                 filters:
 *                   type: object
 *                   properties:
 *                     dayType:
 *                       type: string
 *                       nullable: true
 *                 stops:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: 정류장 이름
 *                       dayTypes:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: 운행 요일 목록
 *                       operatesAsDeparture:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: 출발지로 사용되는 요일
 *                       operatesAsArrival:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: 도착지로 사용되는 요일
 *                       coordinates:
 *                         type: object
 *                         nullable: true
 *                         description: 정류장 좌표 정보 (네이버 지도 API 연동용)
 *                         properties:
 *                           latitude:
 *                             type: number
 *                             description: 위도 (WGS84 좌표계)
 *                             example: 36.773844
 *                           longitude:
 *                             type: number
 *                             description: 경도 (WGS84 좌표계)
 *                             example: 127.053849
 *                           naverPlaceId:
 *                             type: string
 *                             nullable: true
 *                             description: 네이버 장소 ID (현재 미사용)
 *                           address:
 *                             type: string
 *                             nullable: true
 *                             description: 정류장 주소
 *                             example: "충청남도 아산시 배방읍"
 *       500:
 *         description: 서버 오류
 */
router.get('/stops', authToken, shuttleController.getShuttleStops);

/**
 * @swagger
 * /shuttle/update-schedule:
 *   post:
 *     summary: 시간표 수동 업데이트 (관리용)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: 크롤러를 실행하여 시간표를 수동으로 업데이트합니다. 테스트/관리용 엔드포인트입니다.
 *     responses:
 *       200:
 *         description: 시간표 업데이트 완료
 *       500:
 *         description: 업데이트 실패
 */
router.post('/update-schedule', authToken, async (req, res) => {
  try {
    const result = await busScheduleService.updateAllSchedules();
    res.json({ message: '시간표 업데이트 완료', result });
  } catch (error) {
    res.status(500).json({ message: '시간표 업데이트 실패', error: error.message });
  }
});

module.exports = router;

