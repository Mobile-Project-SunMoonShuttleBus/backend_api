const express = require('express');
const router = express.Router();
const congestionController = require('../controllers/congestionController');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /api/congestion:
 *   post:
 *     summary: 혼잡도 조회 (요구사항 DB_table_crowd-02)
 *     tags: [Congestion]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       집계된 혼잡도 스냅샷 데이터를 조회합니다.
 *       요구사항 DB_table_crowd-02에 따라 crowd_snapshots 컬렉션에서 조회합니다.
 *       
 *       **조건부 조회:**
 *       - 모든 필터 조건은 선택 사항입니다.
 *       - 필터 조건을 입력하지 않으면 전체 데이터를 조회합니다.
 *       - 여러 조건을 조합하여 필터링할 수 있습니다.
 *       
 *       **버스 타입 (busType):**
 *       - `shuttle`: 셔틀버스만 조회
 *       - `campus`: 통학버스만 조회
 *       - 입력하지 않으면 셔틀버스와 통학버스 모두 조회
 *       
 *       **출발지/도착지 (startId/stopId):**
 *       - 정류장 이름을 문자열로 입력 (예: "아산캠퍼스", "천안 아산역")
 *       - `/api/stops` API에서 반환하는 정류장 이름과 동일한 형식 사용
 *       - 입력하지 않으면 모든 출발지/도착지 조회
 *       
 *       **출발 시간 (departureTime):**
 *       - HH:mm 형식으로 입력 (예: "08:00", "14:30")
 *       - 입력하지 않으면 모든 출발 시간 조회
 *       
 *       **날짜 (dayKey):**
 *       - YYYY-MM-DD 형식으로 입력 (예: "2025-12-02")
 *       - 특정 날짜의 혼잡도만 조회
 *       - 입력하지 않으면 모든 날짜 조회
 *       
 *       **응답 데이터:**
 *       - `samples`: 해당 조건의 리포트 개수
 *       - `avgLevelScore`: 평균 혼잡도 점수 (0.0~1.0, 낮을수록 여유)
 *       - `topLevel`: 최빈 혼잡도 수준 (LOW/MEDIUM/HIGH)
 *       - `dayKey`: 날짜 키 (YYYY-MM-DD 형식)
 *       - `updatedAt`: 마지막 업데이트 시각
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               busType:
 *                 type: string
 *                 enum: [shuttle, campus]
 *                 description: |
 *                   버스 타입 필터
 *                   - `shuttle`: 셔틀버스만 조회
 *                   - `campus`: 통학버스만 조회
 *                   - 입력하지 않으면 전체 조회
 *                 example: "shuttle"
 *               startId:
 *                 type: string
 *                 description: |
 *                   출발지 정류장 이름 필터
 *                   - `/api/stops` API에서 반환하는 정류장 이름과 동일한 형식 사용
 *                   - 예: "아산캠퍼스", "천안 아산역", "성남(분당)", "안산"
 *                   - 입력하지 않으면 모든 출발지 조회
 *                 example: "아산캠퍼스"
 *               stopId:
 *                 type: string
 *                 description: |
 *                   도착지 정류장 이름 필터
 *                   - `/api/stops` API에서 반환하는 정류장 이름과 동일한 형식 사용
 *                   - 예: "아산캠퍼스", "천안 아산역", "아산(KTX)역"
 *                   - 입력하지 않으면 모든 도착지 조회
 *                 example: "천안 아산역"
 *               departureTime:
 *                 type: string
 *                 pattern: '^([0-1][0-9]|2[0-3]):[0-5][0-9]$'
 *                 description: |
 *                   출발 시간 필터 (HH:mm 형식)
 *                   - 예: "08:00", "09:30", "14:15", "23:45"
 *                   - 입력하지 않으면 모든 출발 시간 조회
 *                 example: "08:00"
 *               dayKey:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}-\d{2}$'
 *                 description: |
 *                   날짜 필터 (YYYY-MM-DD 형식)
 *                   - 특정 날짜의 혼잡도만 조회
 *                   - 예: "2025-12-02", "2025-12-03"
 *                   - 입력하지 않으면 모든 날짜 조회
 *                 example: "2025-12-02"
 *     responses:
 *       200:
 *         description: 혼잡도 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total:
 *                   type: integer
 *                   description: 조회된 데이터 개수
 *                   example: 5
 *                 filters:
 *                   type: object
 *                   description: 적용된 필터 조건
 *                   properties:
 *                     busType:
 *                       type: string
 *                       example: "shuttle"
 *                       description: "all"이면 전체 조회
 *                     startId:
 *                       type: string
 *                       example: "아산캠퍼스"
 *                       description: "all"이면 전체 조회
 *                     stopId:
 *                       type: string
 *                       example: "천안 아산역"
 *                       description: "all"이면 전체 조회
 *                     departureTime:
 *                       type: string
 *                       example: "08:00"
 *                       description: "all"이면 전체 조회
 *                     dayKey:
 *                       type: string
 *                       example: "2025-12-02"
 *                       description: "all"이면 전체 조회
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: 스냅샷 ID (ObjectId)
 *                         example: "507f1f77bcf86cd799439014"
 *                       busType:
 *                         type: string
 *                         enum: [shuttle, campus]
 *                         example: "shuttle"
 *                         description: 버스 타입
 *                       startId:
 *                         type: string
 *                         example: "아산캠퍼스"
 *                         description: 출발지 정류장 이름
 *                       stopId:
 *                         type: string
 *                         example: "천안 아산역"
 *                         description: 도착지 정류장 이름
 *                       departureTime:
 *                         type: string
 *                         example: "08:00"
 *                         description: 출발 시간 (HH:mm 형식)
 *                       dayKey:
 *                         type: string
 *                         example: "2025-12-02"
 *                         description: 날짜 키 (YYYY-MM-DD 형식)
 *                       samples:
 *                         type: integer
 *                         example: 15
 *                         description: 해당 조건의 리포트 개수 (샘플 수)
 *                       avgLevelScore:
 *                         type: number
 *                         minimum: 0.0
 *                         maximum: 1.0
 *                         example: 0.45
 *                         description: 평균 혼잡도 점수 (0.0~1.0, 낮을수록 여유)
 *                       topLevel:
 *                         type: string
 *                         enum: [LOW, MEDIUM, HIGH]
 *                         example: "MEDIUM"
 *                         description: 최빈 혼잡도 수준
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-02T10:30:00.000Z"
 *                         description: 마지막 업데이트 시각
 *       400:
 *         description: 잘못된 요청 (파라미터 형식 오류)
 *       500:
 *         description: 서버 오류
 */
// POST /api/congestion - 혼잡도 조회 API
router.post('/', authToken, congestionController.getCongestion);

// /api/bus/congestion 레거시 라우트는 제거되었습니다.
// 혼잡도 저장은 /api/congestion/report를 사용하세요.

/**
 * @swagger
 * /api/congestion/report:
 *   post:
 *     summary: 혼잡도 리포트 저장 (요구사항 DB_table_crowd-01)
 *     tags: [Congestion]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       사용자 단말에서 자동으로 전송되는 혼잡도 리포트를 저장합니다.
 *       요구사항 DB_table_crowd-01에 따라 crowd_reports 컬렉션에 저장됩니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - busType
 *               - startId
 *               - stopId
 *               - weekday
 *               - timeSlot
 *               - index
 *             properties:
 *               busType:
 *                 type: string
 *                 enum: [shuttle, campus]
 *                 example: "shuttle"
 *                 description: "버스 타입 (shuttle: 셔틀버스, campus: 통학버스)"
 *               startId:
 *                 type: string
 *                 example: "아산캠퍼스"
 *                 description: "출발지 이름 (셔틀: '아산캠퍼스', '아산(KTX)역' 등 / 통학: '성남(분당)', '안산' 등)"
 *               stopId:
 *                 type: string
 *                 example: "아산(KTX)역"
 *                 description: "도착지 이름 (현재 정류장, 셔틀: '아산캠퍼스', '아산(KTX)역' 등 / 통학: '아산캠퍼스')"
 *               weekday:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 6
 *                 example: 0
 *                 description: 요일 (0=월요일, 6=일요일)
 *               timeSlot:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 143
 *                 example: 48
 *                 description: 시간 슬롯 (10분 단위, 08:00 = 8*6+0 = 48)
 *               index:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *                 example: 50
 *                 description: 혼잡도 지수 (0~100, 낮을수록 여유)
 *               clientTs:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-20T10:30:00.000Z"
 *                 description: 단말에서 리포트 전송 시각 (선택)
 *               meta:
 *                 type: object
 *                 properties:
 *                   app_ver:
 *                     type: string
 *                     example: "1.0.0"
 *                     description: 앱 버전
 *                   os:
 *                     type: string
 *                     enum: [android, ios]
 *                     example: "android"
 *                     description: 단말 OS
 *                   gps_acc:
 *                     type: number
 *                     example: 10.5
 *                     description: GPS 정확도 (미터 단위)
 *     responses:
 *       201:
 *         description: 혼잡도 리포트 저장 성공
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
 *                   example: "혼잡도 리포트가 성공적으로 저장되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     logId:
 *                       type: string
 *                       example: "507f1f77bcf86cd799439013"
 *                     busType:
 *                       type: string
 *                       example: "shuttle"
 *                     startId:
 *                       type: string
 *                       example: "아산캠퍼스"
 *                     stopId:
 *                       type: string
 *                       example: "아산(KTX)역"
 *                     departureTime:
 *                       type: string
 *                       example: "08:00"
 *                     dayKey:
 *                       type: string
 *                       example: "2025-01-20"
 *                     level:
 *                       type: string
 *                       enum: [LOW, MEDIUM, HIGH]
 *                       example: "MEDIUM"
 *                     signal:
 *                       type: string
 *                       enum: [BOARDING, FAILED, UNKNOWN]
 *                       example: "BOARDING"
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 존재하지 않는 노선 또는 정류장
 *       500:
 *         description: 서버 오류
 */
router.post('/report', authToken, congestionController.reportCongestionNew);

/**
 * @swagger
 * /api/congestion/snapshots/aggregate:
 *   post:
 *     summary: 혼잡도 스냅샷 수동 집계 (테스트용)
 *     tags: [Congestion]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       혼잡도 리포트를 집계하여 스냅샷을 생성합니다.
 *       주로 테스트 목적으로 사용됩니다.
 *       
 *       **집계 방식:**
 *       - `dayKey` 파라미터 제공: 해당 날짜의 리포트만 집계
 *       - `all=true` 파라미터 제공: DB에 있는 모든 날짜의 리포트를 집계
 *       - 파라미터 없음: 오늘 날짜의 리포트만 집계
 *       
 *       **주의사항:**
 *       - 이미 집계된 스냅샷이 있으면 업데이트됩니다.
 *       - 리포트가 없는 날짜는 스냅샷을 생성하지 않습니다.
 *     parameters:
 *       - in: query
 *         name: dayKey
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}-\d{2}$'
 *         description: |
 *           날짜 키 (YYYY-MM-DD 형식)
 *           - 특정 날짜의 리포트만 집계
 *           - 예: "2025-12-02"
 *           - `all=true`와 함께 사용하면 무시됨
 *         example: "2025-12-02"
 *       - in: query
 *         name: all
 *         schema:
 *           type: boolean
 *         description: |
 *           전체 날짜 집계 여부
 *           - `true`: DB에 있는 모든 날짜의 리포트를 집계
 *           - `false` 또는 미입력: 특정 날짜만 집계
 *         example: false
 *     responses:
 *       200:
 *         description: 스냅샷 집계 성공
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
 *                   example: "스냅샷이 성공적으로 생성되었습니다."
 *                 dayKey:
 *                   type: string
 *                   example: "2025-12-02"
 *                   description: 집계된 날짜 (전체 집계 시 없음)
 *                 result:
 *                   type: object
 *                   properties:
 *                     processed:
 *                       type: integer
 *                       example: 5
 *                       description: 처리된 그룹 개수
 *                     snapshotsCount:
 *                       type: integer
 *                       example: 5
 *                       description: 생성된 스냅샷 개수
 *                 totalDays:
 *                   type: integer
 *                   example: 3
 *                   description: 전체 집계 시 처리된 날짜 개수
 *                 results:
 *                   type: array
 *                   description: 전체 집계 시 각 날짜별 결과
 *                   items:
 *                     type: object
 *                     properties:
 *                       dayKey:
 *                         type: string
 *                         example: "2025-12-02"
 *                       processed:
 *                         type: integer
 *                         example: 5
 *                       snapshotsCount:
 *                         type: integer
 *                         example: 5
 *       400:
 *         description: 잘못된 요청 (dayKey 형식 오류)
 *       500:
 *         description: 서버 오류
 */
router.post('/snapshots/aggregate', authToken, congestionController.aggregateSnapshots);

/**
 * @swagger
 * /api/congestion/snapshots/status:
 *   get:
 *     summary: 혼잡도 집계 상태 확인
 *     tags: [Congestion]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       혼잡도 리포트와 스냅샷의 집계 상태를 확인합니다.
 *       어떤 날짜에 리포트는 있지만 스냅샷이 없는지 확인할 수 있습니다.
 *     responses:
 *       200:
 *         description: 집계 상태 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalReports:
 *                       type: integer
 *                       example: 150
 *                       description: 전체 리포트 개수
 *                     totalSnapshots:
 *                       type: integer
 *                       example: 45
 *                       description: 전체 스냅샷 개수
 *                     totalDays:
 *                       type: integer
 *                       example: 5
 *                       description: 리포트 또는 스냅샷이 있는 날짜 개수
 *                     daysNeedingAggregation:
 *                       type: integer
 *                       example: 2
 *                       description: 리포트는 있지만 스냅샷이 없는 날짜 개수
 *                 byDay:
 *                   type: array
 *                   description: 날짜별 상세 정보
 *                   items:
 *                     type: object
 *                     properties:
 *                       dayKey:
 *                         type: string
 *                         example: "2025-12-02"
 *                         description: 날짜 키 (YYYY-MM-DD)
 *                       reports:
 *                         type: integer
 *                         example: 30
 *                         description: 해당 날짜의 리포트 개수
 *                       snapshots:
 *                         type: integer
 *                         example: 10
 *                         description: 해당 날짜의 스냅샷 개수
 *                       reportLastUpdated:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-02T10:30:00.000Z"
 *                         description: 마지막 리포트 저장 시각
 *                       snapshotLastUpdated:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: "2025-12-02T11:00:00.000Z"
 *                         description: 마지막 스냅샷 업데이트 시각 (없으면 null)
 *                       needsAggregation:
 *                         type: boolean
 *                         example: false
 *                         description: 집계가 필요한지 여부 (리포트는 있지만 스냅샷이 없으면 true)
 *       500:
 *         description: 서버 오류
 */
router.get('/snapshots/status', authToken, congestionController.getSnapshotStatus);

/**
 * @swagger
 * /api/congestion/snapshots/stats:
 *   get:
 *     summary: 혼잡도 집계 통계
 *     tags: [Congestion]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       혼잡도 리포트와 스냅샷의 통계 정보를 조회합니다.
 *       버스 타입별, 날짜별 통계를 확인할 수 있습니다.
 *     responses:
 *       200:
 *         description: 통계 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalReports:
 *                       type: integer
 *                       example: 150
 *                       description: 전체 리포트 개수
 *                     totalSnapshots:
 *                       type: integer
 *                       example: 45
 *                       description: 전체 스냅샷 개수
 *                     reportsToSnapshotsRatio:
 *                       type: string
 *                       example: "0.30"
 *                       description: 리포트 대비 스냅샷 비율
 *                 byBusType:
 *                   type: object
 *                   properties:
 *                     reports:
 *                       type: array
 *                       description: 버스 타입별 리포트 개수
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             enum: [shuttle, campus]
 *                             example: "shuttle"
 *                           count:
 *                             type: integer
 *                             example: 100
 *                     snapshots:
 *                       type: array
 *                       description: 버스 타입별 스냅샷 개수
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             enum: [shuttle, campus]
 *                             example: "shuttle"
 *                           count:
 *                             type: integer
 *                             example: 30
 *                 byDay:
 *                   type: object
 *                   properties:
 *                     reports:
 *                       type: array
 *                       description: 최근 30일 리포트 개수 (날짜별)
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "2025-12-02"
 *                           count:
 *                             type: integer
 *                             example: 30
 *                     snapshots:
 *                       type: array
 *                       description: 최근 30일 스냅샷 개수 (날짜별)
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "2025-12-02"
 *                           count:
 *                             type: integer
 *                             example: 10
 *       500:
 *         description: 서버 오류
 */
router.get('/snapshots/stats', authToken, congestionController.getSnapshotStats);

// 혼잡도 웹페이지 (인증 없이 접근 가능)
router.get('/view', congestionController.renderCongestionView);
router.post('/view/data', congestionController.getCongestionViewData);

module.exports = router;

