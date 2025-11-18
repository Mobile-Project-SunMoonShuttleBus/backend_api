const express = require('express');
const router = express.Router();
const campusController = require('../controllers/campusController');
const campusBusCrawler = require('../services/campusBusCrawlerService');

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
 *           enum: [등교, 하교]
 *         description: 방향 (등교/하교)
 *         example: "등교"
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *         description: 시작 시간. HH:mm 형식
 *         example: "07:00"
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
 *       500:
 *         description: 서버 오류
 */
router.get('/schedules', campusController.getCampusSchedules);

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
router.get('/schedules/meta', campusController.getCampusScheduleMeta);

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
router.get('/stops', campusController.getCampusStops);

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
router.post('/update-schedule', async (req, res) => {
  try {
    const result = await campusBusCrawler.crawlAndSave();
    res.json({ message: '통학버스 시간표 업데이트 완료', result });
  } catch (error) {
    res.status(500).json({ message: '통학버스 시간표 업데이트 실패', error: error.message });
  }
});

module.exports = router;

