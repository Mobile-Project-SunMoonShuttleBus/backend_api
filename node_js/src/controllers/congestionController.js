const mongoose = require('mongoose');
const CrowdReport = require('../models/CrowdReport'); // 새로운 스키마 (요구사항에 맞게)
const CrowdReportOld = require('../models/CrowdReportOld'); // 기존 스키마 (레거시)
const CrowdSnapshot = require('../models/CrowdSnapshot');
const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');
const ShuttleRoute = require('../models/ShuttleRoute');
const BusStop = require('../models/BusStop');
const SchoolAccount = require('../models/SchoolAccount');
const { normalizeDeparture: normalizeShuttleDeparture, normalizeArrival: normalizeShuttleArrival } = require('../services/shuttleBusCrawlerService');
const { normalizeDeparture: normalizeCampusDeparture } = require('../services/campusBusCrawlerService');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

exports.reportCongestion = async (req, res) => {
  try {
    const params = mergeRequestParams(req);
    
    // 디버깅용 로그
    console.log('>>> /bus/congestion raw body:', req.body);
    console.log('>>> /bus/congestion merged params:', params);
    
    const { busType, departure, arrival, direction, departureTime, dayOfWeek, date, dayType, congestionLevel } = params;
    const userId = req.user.userId;

    // 디버깅용 로그: dayOfWeek 값 확인
    console.log('>>> /bus/congestion dayOfWeek =', JSON.stringify(dayOfWeek), 'typeof =', typeof dayOfWeek);
    if (dayOfWeek) {
      console.log('>>> /bus/congestion dayOfWeek charCodes:', Array.from(String(dayOfWeek)).map(c => c.charCodeAt(0)));
      console.log('>>> /bus/congestion dayOfWeek length:', String(dayOfWeek).length);
    }

    // congestionLevel은 0도 유효한 값이므로 undefined/null 체크로 변경
    if (
      !busType || !departure || !arrival || !departureTime || 
      !dayOfWeek || !date || !dayType ||
      congestionLevel === undefined || congestionLevel === null
    ) {
      return res.status(400).json({
        message: '필수 파라미터가 누락되었습니다.',
        required: ['busType', 'departure', 'arrival', 'departureTime', 'dayOfWeek', 'date', 'dayType', 'congestionLevel']
      });
    }

    if (!['shuttle', 'campus'].includes(busType)) {
      return res.status(400).json({
        message: 'busType은 "shuttle" 또는 "campus"여야 합니다.'
      });
    }

    const congestionLevelNum = typeof congestionLevel === 'string' ? parseInt(congestionLevel, 10) : congestionLevel;
    if (![0, 1, 2].includes(congestionLevelNum) || isNaN(congestionLevelNum)) {
      return res.status(400).json({
        message: 'congestionLevel은 0(원활), 1(보통), 2(혼잡) 중 하나여야 합니다.'
      });
    }

    // dayOfWeek 정규화 (공백/개행 제거)
    const normalizedDayOfWeek = String(dayOfWeek).trim();
    const validDays = ['월', '화', '수', '목', '금', '토', '일'];
    
    if (!validDays.includes(normalizedDayOfWeek)) {
      return res.status(400).json({
        message: 'dayOfWeek는 "월", "화", "수", "목", "금", "토", "일" 중 하나여야 합니다.',
        received: dayOfWeek  // 디버깅용으로 원본 값도 함께 반환
      });
    }

    if (busType === 'campus' && !direction) {
      return res.status(400).json({
        message: '통학버스(campus)의 경우 direction(등교/하교)이 필수입니다.'
      });
    }

    if (busType === 'campus' && !['등교', '하교'].includes(direction)) {
      return res.status(400).json({
        message: 'direction은 "등교" 또는 "하교"여야 합니다.'
      });
    }

    const validDayTypes = ['평일', '월~목', '금요일', '토요일/공휴일', '일요일'];

    if (!validDayTypes.includes(dayType)) {
      return res.status(400).json({
        message: `dayType은 ${validDayTypes.join(', ')} 중 하나여야 합니다.`
      });
    }

    const BusModel = busType === 'shuttle' ? ShuttleBus : CampusBus;
    
    // 출발지와 도착지 정규화 (공백 제거, 이름 통일)
    // reportCongestion은 레거시 함수이므로 셔틀 정규화 함수 사용
    const normalizedDeparture = normalizeShuttleDeparture(departure);
    const normalizedArrival = normalizeShuttleArrival(arrival);
    
    // 통학버스의 경우 평일을 월~목과 금요일로 확장하여 검색
    let busFilter;
    if (busType === 'campus' && dayType === '평일') {
      // 통학버스는 평일을 월~목과 금요일로 검색
      busFilter = {
        departure: normalizedDeparture,
        arrival: normalizedArrival,
        departureTime,
        dayType: { $in: ['월~목', '금요일'] }
      };
    } else {
      busFilter = {
        departure: normalizedDeparture,
        arrival: normalizedArrival,
        departureTime,
        dayType
      };
    }

    if (busType === 'campus') {
      busFilter.direction = direction;
    }

    const busSchedule = await BusModel.findOne(busFilter);

    if (!busSchedule) {
      // 경유지 확인
      let viaStopsFilter;
      if (busType === 'campus' && dayType === '평일') {
        viaStopsFilter = {
          departure: normalizedDeparture,
          'viaStops.name': normalizedArrival,
          departureTime,
          dayType: { $in: ['월~목', '금요일'] },
          ...(busType === 'campus' ? { direction } : {})
        };
      } else {
        viaStopsFilter = {
          departure: normalizedDeparture,
          'viaStops.name': normalizedArrival,
          departureTime,
          dayType,
          ...(busType === 'campus' ? { direction } : {})
        };
      }
      const viaStopsCheck = await BusModel.findOne(viaStopsFilter);

      if (viaStopsCheck) {
        return res.status(400).json({
          success: false,
          message: '도착지에 경유지를 입력하셨습니다. 경유지가 아닌 최종 도착지를 입력해주세요.',
          hint: `입력하신 "${arrival}"은 경유지입니다. 이 노선의 최종 도착지는 "${viaStopsCheck.arrival}"입니다.`,
          requested: {
            departure,
            arrival,
            departureTime,
            dayType,
            ...(busType === 'campus' ? { direction } : {})
          },
          correctArrival: viaStopsCheck.arrival
        });
      }

      // 디버깅: 유사한 시간표 검색
      let similarFilter;
      if (busType === 'campus' && dayType === '평일') {
        similarFilter = {
          departure: normalizedDeparture,
          arrival: normalizedArrival,
          dayType: { $in: ['월~목', '금요일'] }
        };
      } else {
        similarFilter = {
          departure: normalizedDeparture,
          arrival: normalizedArrival,
          dayType
        };
      }
      const similarSchedules = await BusModel.find(similarFilter).limit(5);

      let similarDepartureFilter;
      if (busType === 'campus' && dayType === '평일') {
        similarDepartureFilter = {
          departure: normalizedDeparture,
          dayType: { $in: ['월~목', '금요일'] }
        };
      } else {
        similarDepartureFilter = {
          departure: normalizedDeparture,
          dayType
        };
      }
      const similarDepartureSchedules = await BusModel.find(similarDepartureFilter).limit(5);

      return res.status(404).json({
        success: false,
        message: '존재하지 않는 시간표입니다.',
        error: '입력하신 조건에 맞는 시간표가 존재하지 않습니다.',
        requested: {
          busType,
          departure,
          arrival,
          departureTime,
          dayType,
          ...(busType === 'campus' ? { direction } : {})
        },
        hint: '출발지, 도착지(최종 도착지), 출발시간, 요일타입을 확인해주세요.',
        suggestions: {
          similarSchedules: similarSchedules.length > 0 ? similarSchedules.map(s => ({
            departureTime: s.departureTime,
            arrival: s.arrival
          })) : null,
          availableDepartureTimes: similarDepartureSchedules.length > 0 ? [...new Set(similarDepartureSchedules.map(s => s.departureTime))].slice(0, 5) : null
        },
        note: '도착지는 경유지가 아닌 최종 목적지를 입력해야 합니다.'
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        message: 'date는 YYYY-MM-DD 형식이어야 합니다.'
      });
    }

    const congestionReport = new CrowdReportOld({
      busType,
      departure: normalizedDeparture,
      arrival: normalizedArrival,
      direction: busType === 'campus' ? direction : null,
      departureTime,
      dayOfWeek: normalizedDayOfWeek,  // 정규화된 값 사용
      date,
      dayType,
      congestionLevel: congestionLevelNum,
      reportedBy: userId,
      reportedAt: new Date()
    });

    await congestionReport.save();

    res.status(201).json({
      success: true,
      message: '혼잡도가 성공적으로 저장되었습니다.',
      data: {
        id: congestionReport._id,
        busType: congestionReport.busType,
        departure: congestionReport.departure,
        arrival: congestionReport.arrival,
        direction: congestionReport.direction,
        departureTime: congestionReport.departureTime,
        dayOfWeek: congestionReport.dayOfWeek,
        date: congestionReport.date,
        dayType: congestionReport.dayType,
        congestionLevel: congestionReport.congestionLevel,
        reportedBy: congestionReport.reportedBy,
        reportedAt: congestionReport.reportedAt
      }
    });
  } catch (error) {
    console.error('혼잡도 저장 오류:', error);
    res.status(500).json({
      message: '혼잡도 저장 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 새로운 혼잡도 리포트 저장 (요구사항 DB_table_crowd-01)
 * POST /api/congestion/report
 * 프론트엔드에서 자동으로 전송되는 혼잡도 리포트를 저장
 */
exports.reportCongestionNew = async (req, res) => {
  try {
    const { busType, startId, stopId, weekday, timeSlot, index } = req.body;
    const userId = req.user?.userId || null; // 익명일 경우 null

    // 필수 파라미터 검증
    if (!busType || !startId || !stopId || weekday === undefined || timeSlot === undefined || index === undefined) {
      return res.status(400).json({
        success: false,
        message: '필수 파라미터가 누락되었습니다.',
        required: ['busType', 'startId', 'stopId', 'weekday', 'timeSlot', 'index']
      });
    }

    // busType 검증
    if (!['shuttle', 'campus'].includes(busType)) {
      return res.status(400).json({
        success: false,
        message: 'busType은 "shuttle" 또는 "campus"여야 합니다.'
      });
    }

    // startId와 stopId가 문자열인지 확인
    if (typeof startId !== 'string' || startId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'startId는 비어있지 않은 문자열이어야 합니다.'
      });
    }

    if (typeof stopId !== 'string' || stopId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'stopId는 비어있지 않은 문자열이어야 합니다.'
      });
    }

    // startId와 stopId 정규화 (공백 제거, 이름 통일)
    // 버스 타입에 따라 적절한 정규화 함수 사용
    const normalizeDepartureFunc = busType === 'campus' ? normalizeCampusDeparture : normalizeShuttleDeparture;
    const normalizedStartId = normalizeDepartureFunc(startId);
    // 통학버스는 도착지가 항상 '아산캠퍼스'이므로 셔틀 정규화 함수 사용
    const normalizedStopId = normalizeShuttleArrival(stopId);

    // startId(출발지)와 stopId(도착지)가 실제로 존재하는지 확인
    let isValidRoute = false;
    if (busType === 'shuttle') {
      // 셔틀버스: ShuttleBus에서 출발지와 도착지 조합 확인
      const shuttleBus = await ShuttleBus.findOne({ 
        departure: normalizedStartId,
        arrival: normalizedStopId
      });
      isValidRoute = !!shuttleBus;
    } else if (busType === 'campus') {
      // 통학버스: CampusBus에서 출발지와 도착지 조합 확인
      const campusBus = await CampusBus.findOne({ 
        departure: normalizedStartId,
        arrival: normalizedStopId
      });
      isValidRoute = !!campusBus;
    }

    if (!isValidRoute) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 노선입니다.',
        busType: busType,
        startId: startId,
        stopId: stopId
      });
    }

    // weekday 검증 (0-6)
    const weekdayNum = typeof weekday === 'string' ? parseInt(weekday, 10) : weekday;
    if (isNaN(weekdayNum) || weekdayNum < 0 || weekdayNum > 6) {
      return res.status(400).json({
        success: false,
        message: 'weekday는 0(월요일)부터 6(일요일)까지의 숫자여야 합니다.'
      });
    }

    // timeSlot 검증 (0-143, 10분 단위)
    const timeSlotNum = typeof timeSlot === 'string' ? parseInt(timeSlot, 10) : timeSlot;
    if (isNaN(timeSlotNum) || timeSlotNum < 0 || timeSlotNum > 143) {
      return res.status(400).json({
        success: false,
        message: 'timeSlot은 0부터 143까지의 숫자여야 합니다. (10분 단위)'
      });
    }

    // index 검증 (0-100)
    const indexNum = typeof index === 'string' ? parseFloat(index) : index;
    if (isNaN(indexNum) || indexNum < 0 || indexNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'index는 0부터 100까지의 숫자여야 합니다.'
      });
    }

    // timeSlot을 departure_time (HH:mm)으로 변환
    const hour = Math.floor(timeSlotNum / 6);
    const minute = (timeSlotNum % 6) * 10;
    const departureTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // day_key 계산 (YYYY-MM-DD)
    const now = new Date();
    const dayKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

    // index를 level로 변환 (0-100 → LOW/MEDIUM/HIGH)
    let level;
    if (indexNum <= 33) {
      level = 'LOW';
    } else if (indexNum <= 66) {
      level = 'MEDIUM';
    } else {
      level = 'HIGH';
    }

    // signal 판단 (현재는 BOARDING으로 가정, 추후 개선 가능)
    // 프론트엔드에서 signal 정보를 보내지 않으므로 기본값 사용
    const signal = 'BOARDING'; // TODO: 프론트엔드에서 signal 정보 전송 시 수정

    // client_ts (프론트엔드에서 전송 시각, 없으면 현재 시각)
    const clientTs = req.body.clientTs ? new Date(req.body.clientTs) : new Date();

    // meta 정보 추출
    const meta = {
      app_ver: req.body.meta?.app_ver || null,
      os: req.body.meta?.os || null,
      gps_acc: req.body.meta?.gps_acc || null
    };

    // 혼잡도 리포트 저장
    const crowdReport = new CrowdReport({
      busType: busType,
      start_id: normalizedStartId,  // 출발지 (정규화된 값)
      stop_id: normalizedStopId,  // 도착지 (현재 정류장, 정규화된 값)
      departure_time: departureTime,
      day_key: dayKey,
      level: level,
      signal: signal,
      user_id: userId,
      client_ts: clientTs,
      server_ts: new Date(),
      meta: meta
    });

    await crowdReport.save();

    res.status(201).json({
      success: true,
      message: '혼잡도 리포트가 성공적으로 저장되었습니다.',
      data: {
        logId: crowdReport._id,
        busType: crowdReport.busType,
        startId: crowdReport.start_id,
        stopId: crowdReport.stop_id,
        departureTime: crowdReport.departure_time,
        dayKey: crowdReport.day_key,
        level: crowdReport.level,
        signal: crowdReport.signal
      }
    });
  } catch (error) {
    console.error('혼잡도 리포트 저장 오류:', error);
    res.status(500).json({
      success: false,
      message: '혼잡도 리포트 저장 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 혼잡도 조회 (요구사항 DB_table_crowd-02)
 * POST /api/congestion
 * 집계된 혼잡도 스냅샷 데이터를 조회
 * 필터 조건은 body로 받음
 */
exports.getCongestion = async (req, res) => {
  try {
    // 디버깅용 로그
    console.log('>>> /api/congestion getCongestion 호출됨');
    console.log('>>> getCongestion raw body:', req.body);
    console.log('>>> getCongestion path:', req.path);
    console.log('>>> getCongestion baseUrl:', req.baseUrl);
    
    // body에서 필터 조건 추출
    const { 
      busType, 
      startId, 
      stopId, 
      departureTime, 
      dayKey 
    } = req.body;

    // 필터 조건 구성
    const filter = {};

    if (busType && ['shuttle', 'campus'].includes(busType)) {
      filter.busType = busType;
    }

    if (startId && typeof startId === 'string' && startId.trim().length > 0) {
      // 버스 타입에 따라 적절한 정규화 함수 사용
      const normalizeFunc = busType === 'campus' ? normalizeCampusDeparture : normalizeShuttleDeparture;
      const normalizedStartId = normalizeFunc(startId.trim());
      filter.start_id = normalizedStartId;
    }

    if (stopId && typeof stopId === 'string' && stopId.trim().length > 0) {
      // 통학버스는 도착지가 항상 '아산캠퍼스'이므로 셔틀 정규화 함수 사용
      // 셔틀버스도 셔틀 정규화 함수 사용
      const normalizedStopId = normalizeShuttleArrival(stopId.trim());
      filter.stop_id = normalizedStopId;
    }

    if (departureTime && /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(departureTime)) {
      filter.departure_time = departureTime;
    }

    if (dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      filter.day_key = dayKey;
    }

    // 스냅샷 조회
    const snapshots = await CrowdSnapshot.find(filter).sort({ day_key: -1, updated_at: -1 });

    // 응답 데이터 포맷팅
    const data = snapshots.map(snapshot => ({
      id: snapshot._id,
      busType: snapshot.busType,
      startId: snapshot.start_id,
      stopId: snapshot.stop_id,
      departureTime: snapshot.departure_time,
      dayKey: snapshot.day_key,
      samples: snapshot.samples,
      avgLevelScore: snapshot.avg_level_score,
      topLevel: snapshot.top_level,
      updatedAt: snapshot.updated_at
    }));

    res.status(200).json({
      success: true,
      total: data.length,
      filters: {
        busType: busType || 'all',
        startId: startId || 'all',
        stopId: stopId || 'all',
        departureTime: departureTime || 'all',
        dayKey: dayKey || 'all'
      },
      data
    });
  } catch (error) {
    console.error('혼잡도 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '혼잡도 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 혼잡도 스냅샷 수동 집계 (테스트용)
 * POST /api/congestion/snapshots/aggregate
 */
exports.aggregateSnapshots = async (req, res) => {
  try {
    const { dayKey, all } = req.query;
    const { aggregateDaySnapshots } = require('../services/crowdSnapshotService');

    if (all === 'true') {
      // 모든 날짜 집계
      const reports = await CrowdReport.distinct('day_key');
      const results = [];

      for (const key of reports) {
        try {
          const result = await aggregateDaySnapshots(key);
          results.push({
            dayKey: key,
            processed: result.processed,
            snapshotsCount: result.snapshots.length
          });
        } catch (error) {
          console.error(`날짜 ${key} 집계 오류:`, error);
          results.push({
            dayKey: key,
            error: error.message
          });
        }
      }

      res.status(200).json({
        success: true,
        message: '전체 날짜 집계 완료',
        totalDays: results.length,
        results
      });
    } else if (dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      // 특정 날짜 집계
      const result = await aggregateDaySnapshots(dayKey);
      res.status(200).json({
        success: true,
        message: '스냅샷이 성공적으로 생성되었습니다.',
        dayKey,
        result: {
          processed: result.processed,
          snapshotsCount: result.snapshots.length
        }
      });
    } else {
      // 오늘 날짜 집계
      const today = new Date().toISOString().split('T')[0];
      const result = await aggregateDaySnapshots(today);
      res.status(200).json({
        success: true,
        message: '스냅샷이 성공적으로 생성되었습니다.',
        dayKey: today,
        result: {
          processed: result.processed,
          snapshotsCount: result.snapshots.length
        }
      });
    }
  } catch (error) {
    console.error('스냅샷 집계 오류:', error);
    res.status(500).json({
      success: false,
      message: '스냅샷 집계 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 혼잡도 집계 상태 확인
 * GET /api/congestion/snapshots/status
 */
exports.getSnapshotStatus = async (req, res) => {
  try {
    // 리포트와 스냅샷의 날짜별 개수 조회
    const reportDays = await CrowdReport.aggregate([
      {
        $group: {
          _id: '$day_key',
          count: { $sum: 1 },
          lastUpdated: { $max: '$server_ts' }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const snapshotCounts = await CrowdSnapshot.aggregate([
      {
        $group: {
          _id: '$day_key',
          count: { $sum: 1 },
          lastUpdated: { $max: '$updated_at' }
        }
      }
    ]);

    const snapshotMap = new Map();
    snapshotCounts.forEach(item => {
      snapshotMap.set(item._id, {
        count: item.count,
        lastUpdated: item.lastUpdated
      });
    });

    const byDay = reportDays.map(day => {
      const snapshotInfo = snapshotMap.get(day._id) || { count: 0, lastUpdated: null };
      return {
        dayKey: day._id,
        reports: day.count,
        snapshots: snapshotInfo.count,
        reportLastUpdated: day.lastUpdated,
        snapshotLastUpdated: snapshotInfo.lastUpdated,
        needsAggregation: day.count > 0 && snapshotInfo.count === 0
      };
    });

    const totalReports = reportDays.reduce((sum, day) => sum + day.count, 0);
    const totalSnapshots = snapshotCounts.reduce((sum, day) => sum + day.count, 0);
    const daysNeedingAggregation = byDay.filter(day => day.needsAggregation).length;

    res.status(200).json({
      success: true,
      summary: {
        totalReports,
        totalSnapshots,
        totalDays: reportDays.length,
        daysNeedingAggregation
      },
      byDay
    });
  } catch (error) {
    console.error('집계 상태 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '집계 상태 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 혼잡도 집계 통계
 * GET /api/congestion/snapshots/stats
 */
exports.getSnapshotStats = async (req, res) => {
  try {
    // 전체 리포트/스냅샷 개수
    const totalReports = await CrowdReport.countDocuments();
    const totalSnapshots = await CrowdSnapshot.countDocuments();
    const ratio = totalReports > 0 ? (totalSnapshots / totalReports).toFixed(2) : '0.00';

    // 버스 타입별 통계
    const reportsByBusType = await CrowdReport.aggregate([
      { $group: { _id: '$busType', count: { $sum: 1 } } }
    ]);
    const snapshotsByBusType = await CrowdSnapshot.aggregate([
      { $group: { _id: '$busType', count: { $sum: 1 } } }
    ]);

    // 날짜별 통계 (최근 30일)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dayKeyThreshold = thirtyDaysAgo.toISOString().split('T')[0];

    const reportsByDay = await CrowdReport.aggregate([
      { $match: { day_key: { $gte: dayKeyThreshold } } },
      { $group: { _id: '$day_key', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);

    const snapshotsByDay = await CrowdSnapshot.aggregate([
      { $match: { day_key: { $gte: dayKeyThreshold } } },
      { $group: { _id: '$day_key', count: { $sum: 1 } } },
      { $sort: { _id: -1 } }
    ]);

    res.status(200).json({
      success: true,
      summary: {
        totalReports,
        totalSnapshots,
        reportsToSnapshotsRatio: ratio
      },
      byBusType: {
        reports: reportsByBusType,
        snapshots: snapshotsByBusType
      },
      byDay: {
        reports: reportsByDay,
        snapshots: snapshotsByDay
      }
    });
  } catch (error) {
    console.error('집계 통계 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '집계 통계 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

