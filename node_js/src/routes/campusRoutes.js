const express = require('express');
const router = express.Router();
const campusController = require('../controllers/campusController');
const campusBusCrawler = require('../services/campusBusCrawlerService');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /campus/routes:
 *   get:
 *     summary: 통학버스 노선 전체 목록 조회
 *     tags: [Campus Bus Routes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *           enum: ["월~목", "금요일"]
 *         description: |
 *           요일 필터.
 *           
 *           입력 가능 값:
 *           - `월~목`
 *           - `금요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "월~목"
 *     responses:
 *       200:
 *         description: 통학버스 노선 목록
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
 *                     example: "성남(분당)-아산캠퍼스"
 *                   routeName:
 *                     type: string
 *                     description: 노선 이름
 *                     example: "성남(분당) → 아산캠퍼스"
 *                   departure:
 *                     type: string
 *                     description: 출발지
 *                     example: "성남(분당)"
 *                   arrival:
 *                     type: string
 *                     description: 도착지
 *                     example: "아산캠퍼스"
 *                   dayTypes:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: ["월~목", "금요일"]
 *                     description: 운행 요일 목록
 *                     example: ["월~목", "금요일"]
 *                   directions:
 *                     type: array
 *                     items:
 *                       type: string
 *                       enum: ["등교", "하교"]
 *                     description: 운행 방향 목록
 *                     example: ["등교", "하교"]
 */
router.get('/routes', authToken, campusController.getCampusRoutes);

/**
 * @swagger
 * /campus/schedules:
 *   get:
 *     summary: 통학버스 시간표 조회
 *     tags: [Campus Bus Schedules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *           enum: ["월~목", "금요일"]
 *         description: |
 *           요일 필터 (쉼표로 여러 개 가능).
 *           
 *           입력 가능 값:
 *           - `월~목`
 *           - `금요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "월~목"
 *       - in: query
 *         name: departure
 *         schema:
 *           type: string
 *         description: 출발지 (경유지도 검색 가능)
 *         example: "성남(분당)"
 *       - in: query
 *         name: arrival
 *         schema:
 *           type: string
 *         description: 도착지 (경유지도 검색 가능)
 *         example: "아산캠퍼스"
 *       - in: query
 *         name: direction
 *         schema:
 *           type: string
 *           enum: ["등교", "하교"]
 *         description: |
 *           방향 필터 (통학버스 전용).
 *           
 *           입력 가능 값:
 *           - `등교` - 등교 방향 시간표만 조회
 *           - `하교` - 하교 방향 시간표만 조회
 *           
 *           값을 비워두면 모든 방향을 조회합니다.
 *         example: "등교"
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
 *           예: `07:00`을 지정하면 07:00 이후 출발하는 시간표만 반환됩니다.
 *         example: "07:00"
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
 *                     $ref: '#/components/schemas/CampusSchedule'
 *                   description: |
 *                     시간표 목록. 각 항목에는 다음 정보가 포함됩니다:
 *                     - 출발지, 도착지, 출발시간, 도착시간, 방향(등교/하교)
 *                     - 경유지 목록 (viaStops): 각 경유지의 이름과 도착 시간
 *                     - 경유지의 시간은 해당 경유지에 도착하는 시간이자, 동시에 그 경유지에서 출발하는 시간입니다.
 *                     
 *                     예시:
 *                     - 출발지: "성남(분당)", 출발시간: "07:00", 방향: "등교"
 *                     - 경유지: [{ name: "죽전", time: "07:30" }]
 *                     - 도착지: "아산캠퍼스", 도착시간: "08:00"
 *                     
 *                     이 경우:
 *                     - 07:00에 성남(분당)에서 출발
 *                     - 07:30에 죽전에 도착 (동시에 07:30에 죽전에서 출발)
 *                     - 08:00에 아산캠퍼스에 도착
 *       500:
 *         description: 서버 오류
 */
router.get('/schedules', authToken, campusController.getCampusSchedules);

/**
 * @swagger
 * /campus/schedules/meta:
 *   get:
 *     summary: 통학버스 시간표 메타 정보 조회
 *     tags: [Campus Bus Schedules]
 *     security:
 *       - bearerAuth: []
 *     description: 출발지별 도착지 목록 및 경유지 정보를 조회합니다. 셀렉터(드롭다운) 구성 시 사용합니다.
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *           enum: ["월~목", "금요일"]
 *         description: |
 *           요일 필터 (쉼표로 여러 개 가능).
 *           
 *           입력 가능 값:
 *           - `월~목`
 *           - `금요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "금요일"
 *     responses:
 *       200:
 *         description: 메타 정보 조회 성공
 *       500:
 *         description: 서버 오류
 */
router.get('/schedules/meta', authToken, campusController.getCampusScheduleMeta);

/**
 * @swagger
 * /campus/stops:
 *   get:
 *     summary: 통학버스 정류장 목록 조회
 *     tags: [Campus Bus Stops]
 *     security:
 *       - bearerAuth: []
 *     description: 모든 정류장 목록과 각 정류장이 어떤 요일에 출발지/도착지로 사용되는지 조회합니다.
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *           enum: ["월~목", "금요일"]
 *         description: |
 *           요일 필터 (쉼표로 여러 개 가능).
 *           
 *           입력 가능 값:
 *           - `월~목`
 *           - `금요일`
 *           
 *           값을 비워두면 전체 요일을 조회합니다.
 *         example: "월~목"
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
 *                         description: 출발지로 사용되는 요일 목록
 *                       operatesAsArrival:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: 도착지로 사용되는 요일 목록
 *                       coordinates:
 *                         type: object
 *                         nullable: true
 *                         description: 정류장 좌표 정보 (네이버 지도 API 연동용)
 *                         properties:
 *                           latitude:
 *                             type: number
 *                             description: 위도 (WGS84 좌표계)
 *                             example: 36.790013
 *                           longitude:
 *                             type: number
 *                             description: 경도 (WGS84 좌표계)
 *                             example: 127.002474
 *                           naverPlaceId:
 *                             type: string
 *                             nullable: true
 *                             description: 네이버 장소 ID (현재 미사용)
 *                           address:
 *                             type: string
 *                             nullable: true
 *                             description: 정류장 주소
 *                             example: "충청남도 아산시"
 *       500:
 *         description: 서버 오류
 */
router.get('/stops', authToken, campusController.getCampusStops);

/**
 * @swagger
 * /campus/update-schedule:
 *   post:
 *     summary: 통학버스 시간표 수동 업데이트 (관리용)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: 크롤러를 실행하여 통학버스 시간표를 수동으로 업데이트합니다. 테스트/관리용 엔드포인트입니다.
 *     responses:
 *       200:
 *         description: 시간표 업데이트 완료
 *       500:
 *         description: 업데이트 실패
 */
router.post('/update-schedule', authToken, async (req, res) => {
  try {
    const result = await campusBusCrawler.crawlAndSave();
    res.json({ message: '통학버스 시간표 업데이트 완료', result });
  } catch (error) {
    res.status(500).json({ message: '통학버스 시간표 업데이트 실패', error: error.message });
  }
});

module.exports = router;

