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

    // weekday 검증 (0-6)
    const weekdayNum = typeof weekday === 'string' ? parseInt(weekday, 10) : weekday;
    if (isNaN(weekdayNum) || weekdayNum < 0 || weekdayNum > 6) {
      return res.status(400).json({
        success: false,
        message: 'weekday는 0(월요일)부터 6(일요일)까지의 숫자여야 합니다.'
      });
    }

    // timeSlot 검증 (0-143, 10분 단위)
    // timeSlot은 하루 24시간을 10분 단위로 나눈 값 (0 = 00:00, 143 = 23:50)
    // 24시간 * 6 (10분 단위) = 144개 슬롯이지만, 0부터 시작하므로 0-143
    const timeSlotNum = typeof timeSlot === 'string' ? parseInt(timeSlot, 10) : timeSlot;
    if (isNaN(timeSlotNum) || timeSlotNum < 0 || timeSlotNum > 143) {
      return res.status(400).json({
        success: false,
        message: 'timeSlot은 0부터 143까지의 숫자여야 합니다. (10분 단위, 0=00:00, 143=23:50)'
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
    // timeSlot은 10분 단위이므로:
    // - hour = timeSlot / 6 (1시간 = 6개 슬롯)
    // - minute = (timeSlot % 6) * 10 (나머지 슬롯 * 10분)
    // 예: timeSlot 45 → hour = 7, minute = 30 → "07:30"
    // 예: timeSlot 48 → hour = 8, minute = 0 → "08:00"
    const hour = Math.floor(timeSlotNum / 6);
    const minute = (timeSlotNum % 6) * 10;
    const departureTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // weekday를 dayType으로 변환
    let dayTypes = [];
    if (busType === 'shuttle') {
      if (weekdayNum >= 1 && weekdayNum <= 5) {
        dayTypes.push('평일');
      } else if (weekdayNum === 6) {
        dayTypes.push('토요일/공휴일');
      } else if (weekdayNum === 0) {
        dayTypes.push('일요일');
      }
    } else if (busType === 'campus') {
      if (weekdayNum >= 1 && weekdayNum <= 4) {
        dayTypes.push('월~목');
      } else if (weekdayNum === 5) {
        dayTypes.push('금요일');
      } else if (weekdayNum === 6) {
        dayTypes.push('토요일/공휴일');
      } else if (weekdayNum === 0) {
        dayTypes.push('일요일');
      }
    }

    // 실제 운행 스케줄 확인
    let isValidSchedule = false;
    if (busType === 'shuttle') {
      const scheduleFilter = {
        departure: normalizedStartId,
        arrival: normalizedStopId,
        departureTime: departureTime,
        dayType: { $in: dayTypes }
      };
      
      // 금요일은 fridayOperates가 true인 스케줄만 허용
      if (weekdayNum === 5) {
        scheduleFilter.fridayOperates = true;
      }
      // 월~목은 모든 평일 스케줄 허용
      
      const shuttleSchedule = await ShuttleBus.findOne(scheduleFilter);
      isValidSchedule = !!shuttleSchedule;
    } else if (busType === 'campus') {
      const campusSchedule = await CampusBus.findOne({
        departure: normalizedStartId,
        arrival: normalizedStopId,
        departureTime: departureTime,
        dayType: { $in: dayTypes }
      });
      isValidSchedule = !!campusSchedule;
    }

    if (!isValidSchedule) {
      return res.status(404).json({
        success: false,
        message: '해당 시간대에 운행하는 스케줄이 없습니다.',
        busType: busType,
        startId: startId,
        stopId: stopId,
        departureTime: departureTime,
        weekday: weekdayNum,
        dayTypes: dayTypes
      });
    }

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
    
    // clientTs 유효성 검증 (너무 오래되었거나 미래인 경우 경고)
    const timeDiff = Math.abs(now - clientTs); // 밀리초 단위 차이
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24); // 일 단위 차이
    
    // 30일 이상 차이나는 경우 경고 로그 (과거 데이터 적재 테스트는 허용)
    if (daysDiff > 30) {
      console.warn(`[경고] clientTs가 서버 시간과 ${Math.floor(daysDiff)}일 차이납니다.`, {
        clientTs: clientTs.toISOString(),
        serverTs: now.toISOString(),
        daysDiff: Math.floor(daysDiff),
        hint: '과거 데이터 적재 테스트인 경우 정상입니다.'
      });
    }
    
    // 미래 날짜인 경우 (1일 이상 미래) 경고
    if (clientTs > now && daysDiff > 1) {
      console.warn(`[경고] clientTs가 서버 시간보다 ${Math.floor(daysDiff)}일 미래입니다.`, {
        clientTs: clientTs.toISOString(),
        serverTs: now.toISOString(),
        daysDiff: Math.floor(daysDiff)
      });
    }

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

    // 리포트 저장 후 즉시 스냅샷 집계
    const { aggregateAndSaveSnapshot } = require('../services/crowdSnapshotService');
    setImmediate(async () => {
      try {
        await aggregateAndSaveSnapshot(
          busType,
          normalizedStartId,
          normalizedStopId,
          departureTime,
          dayKey
        );
      } catch (error) {
        // 집계 실패 시 로그만 남김
        console.error('혼잡도 스냅샷 집계 오류 (비동기):', error);
      }
    });

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

    // 파라미터 충돌 검증: all=true와 dayKey를 동시에 보내면 에러
    if (all === 'true' && dayKey) {
      return res.status(400).json({
        success: false,
        message: '파라미터 충돌: all=true와 dayKey를 동시에 사용할 수 없습니다.',
        error: 'all=true를 사용하면 모든 날짜를 집계하므로 dayKey는 무시됩니다.',
        hint: '특정 날짜만 집계하려면 all 파라미터를 제거하고 dayKey만 사용하세요.',
        received: {
          all: all,
          dayKey: dayKey
        }
      });
    }

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

/**
 * 혼잡도 웹페이지 렌더링 (인증 없이 접근 가능)
 * GET /congestion/view
 */
exports.renderCongestionView = async (req, res) => {
  try {
    const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>실시간 혼잡도 모니터링</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    .header {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .header h1 {
      color: #333;
      font-size: 28px;
      margin-bottom: 8px;
    }
    .header .subtitle {
      color: #666;
      font-size: 14px;
    }
    .status-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }
    .status-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #4caf50;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .tabs {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
    }
    .tab {
      background: white;
      border: none;
      padding: 12px 24px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      transition: all 0.3s;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .tab:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }
    .tab.active {
      background: #667eea;
      color: white;
    }
    .content {
      display: none;
    }
    .content.active {
      display: block;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    .card-title {
      font-size: 20px;
      font-weight: 600;
      color: #333;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .route-list {
      display: grid;
      gap: 16px;
    }
    .route-item {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      border-left: 4px solid #667eea;
    }
    .route-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .route-name {
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }
    .route-meta {
      font-size: 12px;
      color: #666;
    }
    .time-slots {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }
    .time-slot {
      background: white;
      border-radius: 6px;
      padding: 10px;
      text-align: center;
      border: 2px solid transparent;
      transition: all 0.2s;
    }
    .time-slot:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .time-slot.low {
      border-color: #4caf50;
      background: #e8f5e9;
    }
    .time-slot.medium {
      border-color: #ff9800;
      background: #fff3e0;
    }
    .time-slot.high {
      border-color: #f44336;
      background: #ffebee;
    }
    .time-slot .time {
      font-size: 14px;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }
    .time-slot .level {
      font-size: 12px;
      font-weight: 500;
    }
    .time-slot.low .level {
      color: #2e7d32;
    }
    .time-slot.medium .level {
      color: #e65100;
    }
    .time-slot.high .level {
      color: #c62828;
    }
    .time-slot .samples {
      font-size: 10px;
      color: #999;
      margin-top: 4px;
    }
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #999;
    }
    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: #666;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .error {
      background: #ffebee;
      color: #c62828;
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
      border-left: 4px solid #c62828;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>실시간 혼잡도 모니터링</h1>
      <div class="subtitle">선문대학교 셔틀버스 및 통학버스 혼잡도 현황</div>
      <div class="status-bar">
        <div class="status-item">
          <div class="status-dot"></div>
          <span>실시간 업데이트 중</span>
        </div>
        <div class="status-item">
          <span id="lastUpdate">로딩 중...</span>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" onclick="switchTab('shuttle')">셔틀버스</button>
      <button class="tab" onclick="switchTab('campus')">통학버스</button>
    </div>

    <div id="shuttle-content" class="content active">
      <div class="card">
        <div class="card-title">셔틀버스 혼잡도</div>
        <div id="shuttle-data" class="loading">
          <div class="spinner"></div>
          <div>데이터를 불러오는 중...</div>
        </div>
      </div>
    </div>

    <div id="campus-content" class="content">
      <div class="card">
        <div class="card-title">통학버스 혼잡도</div>
        <div id="campus-data" class="loading">
          <div class="spinner"></div>
          <div>데이터를 불러오는 중...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let currentTab = 'shuttle';
    let updateInterval = null;

    function switchTab(tab) {
      currentTab = tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById(tab + '-content').classList.add('active');
      loadData();
    }

    function formatTime(date) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return hours + ':' + minutes + ':' + seconds;
    }

    function updateLastUpdateTime() {
      const now = new Date();
      document.getElementById('lastUpdate').textContent = '마지막 업데이트: ' + formatTime(now);
    }

    function getLevelClass(level) {
      if (level === 'LOW') return 'low';
      if (level === 'MEDIUM') return 'medium';
      return 'high';
    }

    function getLevelText(level) {
      if (level === 'LOW') return '여유';
      if (level === 'MEDIUM') return '보통';
      return '혼잡';
    }

    function groupByRoute(data) {
      const routeMap = new Map();
      data.forEach(item => {
        const key = item.startId + ' → ' + item.stopId;
        if (!routeMap.has(key)) {
          routeMap.set(key, {
            routeName: key,
            startId: item.startId,
            stopId: item.stopId,
            timeSlots: []
          });
        }
        routeMap.get(key).timeSlots.push({
          time: item.departureTime,
          level: item.topLevel,
          avgScore: item.avgLevelScore,
          samples: item.samples,
          dayKey: item.dayKey
        });
      });
      return Array.from(routeMap.values());
    }

    function renderData(containerId, data) {
      const container = document.getElementById(containerId);
      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div><div>현재 혼잡도 데이터가 없습니다.</div></div>';
        return;
      }

      const routes = groupByRoute(data);
      routes.forEach(route => {
        route.timeSlots.sort((a, b) => a.time.localeCompare(b.time));
      });

      let html = '<div class="route-list">';
      routes.forEach(route => {
        html += '<div class="route-item">';
        html += '<div class="route-header">';
        html += '<div class="route-name">' + route.routeName + '</div>';
        html += '<div class="route-meta">' + route.timeSlots.length + '개 시간대</div>';
        html += '</div>';
        html += '<div class="time-slots">';
        route.timeSlots.forEach(slot => {
          html += '<div class="time-slot ' + getLevelClass(slot.level) + '">';
          html += '<div class="time">' + slot.time + '</div>';
          html += '<div class="level">' + getLevelText(slot.level) + '</div>';
          html += '<div class="samples">' + slot.samples + '건</div>';
          html += '</div>';
        });
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
      container.innerHTML = html;
    }

    async function loadData() {
      try {
        const busType = currentTab;
        const today = new Date().toISOString().split('T')[0];
        
        const response = await fetch('/api/congestion/view/data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            busType: busType,
            dayKey: today
          })
        });

        if (!response.ok) {
          throw new Error('데이터 로드 실패');
        }

        const result = await response.json();
        const containerId = busType + '-data';
        renderData(containerId, result.data || []);
        updateLastUpdateTime();
      } catch (error) {
        const containerId = currentTab + '-data';
        document.getElementById(containerId).innerHTML = 
          '<div class="error">데이터를 불러오는 중 오류가 발생했습니다: ' + error.message + '</div>';
        console.error('데이터 로드 오류:', error);
      }
    }

    function startAutoUpdate() {
      loadData();
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      updateInterval = setInterval(loadData, 5000);
    }

    window.addEventListener('load', () => {
      startAutoUpdate();
    });

    window.addEventListener('beforeunload', () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
    });
  </script>
</body>
</html>
    `;
    res.send(html);
  } catch (error) {
    console.error('혼잡도 웹페이지 렌더링 오류:', error);
    res.status(500).send('웹페이지 로드 중 오류가 발생했습니다.');
  }
};

/**
 * 혼잡도 웹페이지용 데이터 API (인증 없이 접근 가능)
 * POST /api/congestion/view/data
 */
exports.getCongestionViewData = async (req, res) => {
  try {
    const { busType, startId, stopId, departureTime, dayKey } = req.body;

    const filter = {};

    if (busType && ['shuttle', 'campus'].includes(busType)) {
      filter.busType = busType;
    }

    if (startId && typeof startId === 'string' && startId.trim().length > 0) {
      const normalizeFunc = busType === 'campus' ? normalizeCampusDeparture : normalizeShuttleDeparture;
      const normalizedStartId = normalizeFunc(startId.trim());
      filter.start_id = normalizedStartId;
    }

    if (stopId && typeof stopId === 'string' && stopId.trim().length > 0) {
      const normalizedStopId = normalizeShuttleArrival(stopId.trim());
      filter.stop_id = normalizedStopId;
    }

    if (departureTime && /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(departureTime)) {
      filter.departure_time = departureTime;
    }

    if (dayKey && /^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      filter.day_key = dayKey;
    }

    const snapshots = await CrowdSnapshot.find(filter).sort({ day_key: -1, departure_time: 1, updated_at: -1 });

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
      data
    });
  } catch (error) {
    console.error('혼잡도 웹페이지 데이터 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '혼잡도 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 혼잡도 레벨을 한글 라벨로 변환
 */
const getCongestionLabel = (level) => {
  const labelMap = {
    'LOW': '여유',
    'MEDIUM': '보통',
    'HIGH': '혼잡'
  };
  return labelMap[level] || '알 수 없음';
};

/**
 * 셔틀버스 혼잡도 대시보드 조회
 * GET /api/congestion/shuttle/overview
 * 집계된 혼잡도 스냅샷을 기반으로 노선별·출발 시간대별 혼잡도 정보를 조회합니다.
 */
exports.getShuttleOverview = async (req, res) => {
  try {
    // dayKey 쿼리 파라미터 받기 (없으면 오늘 날짜)
    let dayKey = req.query.dayKey;
    
    if (!dayKey) {
      // 오늘 날짜로 설정
      dayKey = new Date().toISOString().split('T')[0];
    } else {
      // dayKey 형식 검증
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        return res.status(400).json({
          success: false,
          message: 'dayKey는 YYYY-MM-DD 형식이어야 합니다.',
          example: '2025-12-02'
        });
      }
    }

    // busType을 shuttle로 고정
    const busType = 'shuttle';

    // CrowdSnapshot에서 해당 날짜의 셔틀버스 스냅샷 조회
    const filter = {
      busType: busType,
      day_key: dayKey
    };

    const snapshots = await CrowdSnapshot.find(filter)
      .sort({ start_id: 1, stop_id: 1, departure_time: 1 })
      .lean();

    // 노선별로 그룹핑 (start_id + stop_id 조합)
    const routeMap = new Map();

    snapshots.forEach(snapshot => {
      const routeKey = `${snapshot.start_id}|${snapshot.stop_id}`;
      
      if (!routeMap.has(routeKey)) {
        routeMap.set(routeKey, {
          routeTitle: `${snapshot.start_id} → ${snapshot.stop_id}`,
          startId: snapshot.start_id,
          stopId: snapshot.stop_id,
          cards: []
        });
      }

      const route = routeMap.get(routeKey);
      route.cards.push({
        departureTime: snapshot.departure_time,
        congestionLevel: snapshot.top_level,
        congestionLabel: getCongestionLabel(snapshot.top_level),
        samples: snapshot.samples
      });
    });

    // routes 배열로 변환
    const routes = Array.from(routeMap.values()).map(route => ({
      routeTitle: route.routeTitle,
      timeSlotsCount: route.cards.length,
      cards: route.cards.sort((a, b) => a.departureTime.localeCompare(b.departureTime))
    }));

    // 전체 중 가장 최신 updated_at 찾기
    let lastUpdated = null;
    if (snapshots.length > 0) {
      const maxUpdatedAt = Math.max(...snapshots.map(s => new Date(s.updated_at).getTime()));
      lastUpdated = new Date(maxUpdatedAt).toISOString();
    }

    res.status(200).json({
      success: true,
      busType: busType,
      dayKey: dayKey,
      lastUpdated: lastUpdated,
      routes: routes
    });
  } catch (error) {
    console.error('셔틀버스 혼잡도 대시보드 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '혼잡도 대시보드 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

/**
 * 통학버스 혼잡도 대시보드 조회
 * GET /api/congestion/campus/overview
 * 집계된 혼잡도 스냅샷을 기반으로 노선별·출발 시간대별 혼잡도 정보를 조회합니다.
 */
exports.getCampusOverview = async (req, res) => {
  try {
    // dayKey 쿼리 파라미터 받기 (없으면 오늘 날짜)
    let dayKey = req.query.dayKey;
    
    if (!dayKey) {
      // 오늘 날짜로 설정
      dayKey = new Date().toISOString().split('T')[0];
    } else {
      // dayKey 형식 검증
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        return res.status(400).json({
          success: false,
          message: 'dayKey는 YYYY-MM-DD 형식이어야 합니다.',
          example: '2025-12-02'
        });
      }
    }

    // busType을 campus로 고정
    const busType = 'campus';

    // CrowdSnapshot에서 해당 날짜의 통학버스 스냅샷 조회
    const filter = {
      busType: busType,
      day_key: dayKey
    };

    const snapshots = await CrowdSnapshot.find(filter)
      .sort({ start_id: 1, stop_id: 1, departure_time: 1 })
      .lean();

    // 노선별로 그룹핑 (start_id + stop_id 조합)
    const routeMap = new Map();

    snapshots.forEach(snapshot => {
      const routeKey = `${snapshot.start_id}|${snapshot.stop_id}`;
      
      if (!routeMap.has(routeKey)) {
        routeMap.set(routeKey, {
          routeTitle: `${snapshot.start_id} → ${snapshot.stop_id}`,
          startId: snapshot.start_id,
          stopId: snapshot.stop_id,
          cards: []
        });
      }

      const route = routeMap.get(routeKey);
      route.cards.push({
        departureTime: snapshot.departure_time,
        congestionLevel: snapshot.top_level,
        congestionLabel: getCongestionLabel(snapshot.top_level),
        samples: snapshot.samples
      });
    });

    // routes 배열로 변환
    const routes = Array.from(routeMap.values()).map(route => ({
      routeTitle: route.routeTitle,
      timeSlotsCount: route.cards.length,
      cards: route.cards.sort((a, b) => a.departureTime.localeCompare(b.departureTime))
    }));

    // 전체 중 가장 최신 updated_at 찾기
    let lastUpdated = null;
    if (snapshots.length > 0) {
      const maxUpdatedAt = Math.max(...snapshots.map(s => new Date(s.updated_at).getTime()));
      lastUpdated = new Date(maxUpdatedAt).toISOString();
    }

    res.status(200).json({
      success: true,
      busType: busType,
      dayKey: dayKey,
      lastUpdated: lastUpdated,
      routes: routes
    });
  } catch (error) {
    console.error('통학버스 혼잡도 대시보드 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '혼잡도 대시보드 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

