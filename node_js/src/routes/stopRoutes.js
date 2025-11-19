const express = require('express');
const router = express.Router();
const stopController = require('../controllers/stopController');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /stops:
 *   get:
 *     summary: 통합 정류장 목록 조회 (셔틀버스 + 통학버스)
 *     tags: [Stops]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       모든 정류장 목록을 조회합니다. 각 정류장이 셔틀버스(`shuttle`) 또는 통학버스(`campus`)에서 사용 가능한지 정보를 포함합니다.
 *       
 *       프론트엔드에서 정류장 이름(예: "천안 아산역")만으로 어떤 API(`/api/shuttle/*` 또는 `/api/campus/*`)를 사용해야 할지 판단할 수 있습니다.
 *       
 *       예시:
 *       - `availableIn: ["shuttle"]` → `/api/shuttle/schedules` 사용
 *       - `availableIn: ["campus"]` → `/api/campus/schedules` 사용
 *       - `availableIn: ["shuttle", "campus"]` → 둘 다 사용 가능
 *     parameters:
 *       - in: query
 *         name: dayType
 *         schema:
 *           type: string
 *           enum: ["평일", "토요일/공휴일", "일요일", "월~목", "금요일", "월", "화", "수", "목", "금", "토", "일"]
 *         description: |
 *           요일 필터 (쉼표로 여러 개 가능).
 *           
 *           입력 가능 값:
 *           - 셔틀버스: `평일`, `토요일/공휴일`, `일요일`
 *           - 통학버스: `월~목`, `금요일`
 *           - 특정 요일: `월`, `화`, `수`, `목`, `금`, `토`, `일`
 *           
 *           값을 비워두면 모든 요일의 정류장을 조회합니다.
 *         example: "평일,토요일/공휴일"
 *     responses:
 *       200:
 *         description: 통합 정류장 목록 조회 성공
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
 *                         example: "천안 아산역"
 *                       availableIn:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [shuttle, campus]
 *                         description: 사용 가능한 버스 타입
 *                         example: ["shuttle"]
 *                       dayTypes:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: 운행 요일 목록
 *                         example: ["평일", "토요일/공휴일"]
 *                       directions:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [등교, 하교]
 *                         description: 통학버스 방향 (통학버스에만 해당)
 *                         example: ["등교", "하교"]
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
 *                       shuttle:
 *                         type: object
 *                         properties:
 *                           available:
 *                             type: boolean
 *                             description: 셔틀버스에서 사용 가능 여부
 *                           dayTypes:
 *                             type: array
 *                             items:
 *                               type: string
 *                             description: 셔틀버스 운행 요일
 *                       campus:
 *                         type: object
 *                         properties:
 *                           available:
 *                             type: boolean
 *                             description: 통학버스에서 사용 가능 여부
 *                           dayTypes:
 *                             type: array
 *                             items:
 *                               type: string
 *                             description: 통학버스 운행 요일
 *                           directions:
 *                             type: array
 *                             items:
 *                               type: string
 *                               enum: [등교, 하교]
 *                             description: 통학버스 방향
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
router.get('/', authToken, stopController.getAllStops);

module.exports = router;

