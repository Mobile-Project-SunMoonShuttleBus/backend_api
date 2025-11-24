const express = require('express');
const router = express.Router();
const timetableController = require('../controllers/timetableController');
const { authToken } = require('../middleware/auth');

/**
 * @swagger
 * /timetable:
 *   get:
 *     summary: 시간표 조회
 *     tags: [Timetable]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       JWT 토큰으로 인증된 사용자의 시간표를 조회합니다.
 *       시간표는 요일별로 그룹화되어 반환됩니다.
 *       
 *       **응답 형식:**
 *       - `timetable` 객체는 요일(월~일)을 키로 가지며, 각 요일별로 시간순으로 정렬된 과목 배열을 포함합니다.
 *       - 각 과목은 시작 시간(`startTime`)과 종료 시간(`endTime`)을 포함합니다.
 *     responses:
 *       200:
 *         description: 시간표 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: number
 *                   example: 17
 *                   description: 전체 시간표 항목 개수
 *                 crawlingStatus:
 *                   type: string
 *                   enum: [idle, crawling, completed, failed]
 *                   example: "completed"
 *                   description: 크롤링 상태 (idle: 대기, crawling: 진행중, completed: 완료, failed: 실패)
 *                 statusMessage:
 *                   type: string
 *                   nullable: true
 *                   example: "시간표를 불러오는 중입니다. 잠시만 기다려주세요."
 *                   description: 크롤링 상태에 따른 안내 메시지
 *                 lastCrawledAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   example: "2025-11-23T09:30:00.000Z"
 *                   description: 마지막 크롤링 시간
 *                 timetable:
 *                   type: object
 *                   description: 요일별로 그룹화된 시간표
 *                   properties:
 *                     월:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           subjectName:
 *                             type: string
 *                             example: "모바일프로그래밍 11반"
 *                           startTime:
 *                             type: string
 *                             example: "9:30"
 *                             description: 시작 시간 (HH:MM 형식)
 *                           endTime:
 *                             type: string
 *                             example: "10:20"
 *                             description: 종료 시간 (HH:MM 형식)
 *                           location:
 *                             type: string
 *                             nullable: true
 *                             example: "인문 410"
 *                           professor:
 *                             type: string
 *                             nullable: true
 *                             example: "이정빈"
 *                     화:
 *                       type: array
 *                       items:
 *                         type: object
 *                     수:
 *                       type: array
 *                       items:
 *                         type: object
 *                     목:
 *                       type: array
 *                       items:
 *                         type: object
 *                     금:
 *                       type: array
 *                       items:
 *                         type: object
 *                     토:
 *                       type: array
 *                       items:
 *                         type: object
 *                     일:
 *                       type: array
 *                       items:
 *                         type: object
 *                   example:
 *                     월:
 *                       - subjectName: "모바일프로그래밍 11반"
 *                         startTime: "9:30"
 *                         endTime: "10:20"
 *                         location: "인문 410"
 *                         professor: "이정빈"
 *                       - subjectName: "모바일프로그래밍 11반"
 *                         startTime: "10:30"
 *                         endTime: "11:20"
 *                         location: "인문 410"
 *                         professor: "이정빈"
 *                     화:
 *                       - subjectName: "웹프레임워크(백엔드) 11반"
 *                         startTime: "12:30"
 *                         endTime: "13:20"
 *                         location: "인문 410"
 *                         professor: "이정빈"
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 사용자를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
/**
 * @swagger
 * /timetable:
 *   get:
 *     summary: 시간표 조회
 *     tags: [Timetable]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       JWT 토큰으로 인증된 사용자의 시간표를 조회합니다.
 *       시간표는 요일별로 그룹화되어 반환됩니다.
 *       
 *       **크롤링 방식:**
 *       - 시간표는 자동으로 크롤링되어 DB에 저장됩니다.
 *       - 포털 계정 정보를 저장하면 자동으로 크롤링이 시작됩니다 (백그라운드 실행).
 *       - 매일 오전 2시에 자동으로 크롤링이 실행됩니다.
 *       
 *       **응답 형식:**
 *       - `timetable` 객체는 요일(월~일)을 키로 가지며, 각 요일별로 시간순으로 정렬된 과목 배열을 포함합니다.
 *       - 각 과목은 시작 시간(`startTime`)과 종료 시간(`endTime`)을 포함합니다.
 *     responses:
 *       200:
 *         description: 시간표 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: number
 *                   example: 17
 *                   description: 전체 시간표 항목 개수
 *                 crawlingStatus:
 *                   type: string
 *                   enum: [idle, crawling, completed, failed]
 *                   example: "completed"
 *                   description: 크롤링 상태 (idle: 대기, crawling: 진행중, completed: 완료, failed: 실패)
 *                 statusMessage:
 *                   type: string
 *                   nullable: true
 *                   example: "시간표를 불러오는 중입니다. 잠시만 기다려주세요."
 *                   description: 크롤링 상태에 따른 안내 메시지
 *                 lastCrawledAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                   example: "2025-11-23T09:30:00.000Z"
 *                   description: 마지막 크롤링 시간
 *                 timetable:
 *                   type: object
 *                   description: 요일별로 그룹화된 시간표
 *                   properties:
 *                     월:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           subjectName:
 *                             type: string
 *                             example: "모바일프로그래밍 11반"
 *                           startTime:
 *                             type: string
 *                             example: "9:30"
 *                             description: 시작 시간 (HH:MM 형식)
 *                           endTime:
 *                             type: string
 *                             example: "10:20"
 *                             description: 종료 시간 (HH:MM 형식)
 *                           location:
 *                             type: string
 *                             nullable: true
 *                             example: "인문 410"
 *                           professor:
 *                             type: string
 *                             nullable: true
 *                             example: "이정빈"
 *                     화:
 *                       type: array
 *                       items:
 *                         type: object
 *                     수:
 *                       type: array
 *                       items:
 *                         type: object
 *                     목:
 *                       type: array
 *                       items:
 *                         type: object
 *                     금:
 *                       type: array
 *                       items:
 *                         type: object
 *                     토:
 *                       type: array
 *                       items:
 *                         type: object
 *                     일:
 *                       type: array
 *                       items:
 *                         type: object
 *                   example:
 *                     월:
 *                       - subjectName: "모바일프로그래밍 11반"
 *                         startTime: "9:30"
 *                         endTime: "10:20"
 *                         location: "인문 410"
 *                         professor: "이정빈"
 *                       - subjectName: "모바일프로그래밍 11반"
 *                         startTime: "10:30"
 *                         endTime: "11:20"
 *                         location: "인문 410"
 *                         professor: "이정빈"
 *                     화:
 *                       - subjectName: "웹프레임워크(백엔드) 11반"
 *                         startTime: "12:30"
 *                         endTime: "13:20"
 *                         location: "인문 410"
 *                         professor: "이정빈"
 *       401:
 *         description: 인증 실패
 *       404:
 *         description: 사용자를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
router.get('/', authToken, timetableController.getTimetable);

module.exports = router;

