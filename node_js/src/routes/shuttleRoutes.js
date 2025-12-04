const express = require('express');
const router = express.Router();
const shuttleController = require('../controllers/shuttleController');
const shuttleRoutePathController = require('../controllers/shuttleRoutePathController');
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
 *         name: dayType
 *         schema:
 *           type: string
 *           enum: ["평일", "토요일/공휴일", "일요일"]
 *         description: |
 *           요일 필터.
 *           
 *           입력 가능 값:
 *           - `평일`
 *           - `토요일/공휴일`
 *           - `일요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "평일"
 *     responses:
 *       200:
 *         description: 셔틀 노선 목록
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   routeId:
 *                     type: string
 *                     description: 노선 ID (상세 조회 시 사용)
 *                     example: "아산캠퍼스-천안 아산역"
 *                   routeName:
 *                     type: string
 *                     description: 노선 이름
 *                     example: "아산캠퍼스 → 천안 아산역"
 *                   departure:
 *                     type: string
 *                     description: 출발지
 *                     example: "아산캠퍼스"
 *                   arrival:
 *                     type: string
 *                     description: 도착지
 *                     example: "천안 아산역"
 *                   dayTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: ["평일", "토요일/공휴일", "일요일"]
 *                     description: 운행 요일 목록
 *                     example: ["평일", "토요일/공휴일", "일요일"]
 */
router.get('/routes', authToken, shuttleController.getShuttleRoutes);

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
 *           enum: ["평일", "토요일/공휴일", "일요일"]
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
 *           enum: ["true", "false"]
 *         description: |
 *           금요일 운행 여부 필터.
 *           
 *           입력 가능 값:
 *           - `true` - 금요일 운행하는 시간표만 조회
 *           - `false` - 금요일 미운행하는 시간표만 조회
 *           
 *           값을 비워두면 금요일 운행 여부와 관계없이 조회합니다.
 *         example: "true"
 *       - in: query
 *         name: includeFridayOff
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *         description: |
 *           금요일 미운행 포함 여부. 기본값은 `true`.
 *           
 *           입력 가능 값:
 *           - `true` - 금요일 미운행 시간표도 포함 (기본값)
 *           - `false` - 금요일 미운행 시간표 제외
 *         example: "true"
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *         description: |
 *           출발 시간 필터. 지정한 시간 이상의 출발시간만 반환합니다.
 *           
 *           - 값을 비워두면 전체 시간대를 반환합니다.
 *           - 값을 지정하면 해당 시간 이상의 출발시간만 반환합니다.
 *           
 *           예: `08:00`을 지정하면 08:00 이후 출발하는 시간표만 반환됩니다.
 *         example: "08:00"
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
 *                   description: |
 *                     시간표 목록. 각 항목에는 다음 정보가 포함됩니다:
 *                     - 출발지, 도착지, 출발시간, 도착시간
 *                     - 경유지 목록 (viaStops): 각 경유지의 이름과 도착 시간
 *                     - 경유지의 시간은 해당 경유지에 도착하는 시간이자, 동시에 그 경유지에서 출발하는 시간입니다.
 *                     
 *                     예시:
 *                     - 출발지: "아산캠퍼스", 출발시간: "08:00"
 *                     - 경유지: [{ name: "천안 아산역", time: "08:30" }]
 *                     - 도착지: "천안역", 도착시간: "09:00"
 *                     
 *                     이 경우:
 *                     - 08:00에 아산캠퍼스에서 출발
 *                     - 08:30에 천안 아산역에 도착 (동시에 08:30에 천안 아산역에서 출발)
 *                     - 09:00에 천안역에 도착
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
 *           enum: ["평일", "토요일/공휴일", "일요일"]
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
 *           enum: ["평일", "토요일/공휴일", "일요일"]
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
 * /shuttle/route-path:
 *   get:
 *     summary: 셔틀버스 경로 좌표 조회
 *     tags: [Shuttle Routes]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       출발지-도착지 간 경로 좌표를 조회합니다. 경유지를 포함한 전체 경로 좌표를 반환합니다.
 *       
 *       **중요 사항:**
 *       - 경유지 중 좌표가 없는 정류장은 자동으로 제외됩니다.
 *       - 좌표가 있는 경유지만 경로 계산에 포함됩니다.
 *       - 경로 좌표는 네이버 Directions API를 사용하여 계산됩니다.
 *       - 경유지는 최대 5개까지 지원됩니다.
 *     parameters:
 *       - in: query
 *         name: departure
 *         schema:
 *           type: string
 *         required: true
 *         description: 출발지 정류장 이름
 *         example: "아산캠퍼스"
 *       - in: query
 *         name: arrival
 *         schema:
 *           type: string
 *         required: true
 *         description: 도착지 정류장 이름
 *         example: "천안 아산역"
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: ["등교", "하교"]
 *         required: true
 *         description: 방향 (등교/하교)
 *         example: "하교"
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *           enum: ["평일", "토요일/공휴일", "일요일"]
 *         required: true
 *         description: 운행 요일
 *         example: "평일"
 *     responses:
 *       200:
 *         description: 경로 좌표 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: 조회 성공 여부
 *                   example: true
 *                 route:
 *                   type: object
 *                   description: 경로 정보
 *                   properties:
 *                     departure:
 *                       type: string
 *                       description: 출발지 정류장 이름
 *                       example: "천안역"
 *                     arrival:
 *                       type: string
 *                       description: 도착지 정류장 이름
 *                       example: "아산캠퍼스"
 *                     direction:
 *                       type: string
 *                       description: 방향
 *                       example: "등교"
 *                     dayType:
 *                       type: string
 *                       description: 운행 요일
 *                       example: "평일"
 *                     viaStops:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: 사용된 경유지 목록 (좌표가 있는 경유지만 포함)
 *                       example: ["하이렉스파 건너편", "용암마을"]
 *                     path:
 *                       type: array
 *                       items:
 *                         type: array
 *                         items:
 *                           type: number
 *                       description: 경로 좌표 배열 [[경도, 위도], ...] (네이버 지도 표시용)
 *                       example: [[127.1464289, 36.8102415], [127.1542, 36.8194], [127.526112, 36.620449], [127.002474, 36.790013]]
 *                     distance:
 *                       type: number
 *                       description: 총 거리 (미터)
 *                       example: 45230
 *                     duration:
 *                       type: number
 *                       description: 총 소요 시간 (밀리초)
 *                       example: 3240000
 *                     stopCoordinates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: 정류장 좌표 정보 (출발지 -> 경유지 -> 도착지 순서)
 *                         properties:
 *                           name:
 *                             type: string
 *                             description: 정류장 이름
 *                             example: "천안역"
 *                           latitude:
 *                             type: number
 *                             description: 위도 (WGS84 좌표계)
 *                             example: 36.8102415
 *                           longitude:
 *                             type: number
 *                             description: 경도 (WGS84 좌표계)
 *                             example: 127.1464289
 *                           order:
 *                             type: number
 *                             description: 정류장 순서 (0부터 시작, 출발지가 0)
 *                             example: 0
 *       400:
 *         description: 필수 파라미터 누락 또는 잘못된 파라미터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "필수 파라미터가 누락되었습니다."
 *                 required:
 *                   type: array
 *                   items:
 *                     type: string
 *       404:
 *         description: 경로를 찾을 수 없음 (시간표가 없거나 경로 계산 실패)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "경로를 찾을 수 없습니다."
 *       500:
 *         description: 서버 오류
 */
router.get('/route-path', authToken, shuttleRoutePathController.getRoutePath);

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

