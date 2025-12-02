const mongoose = require('mongoose');
const CrowdReport = require('../models/CrowdReport'); // 새로운 스키마 (요구사항에 맞게)
const CrowdReportOld = require('../models/CrowdReportOld'); // 기존 스키마 (레거시)
const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');
const ShuttleRoute = require('../models/ShuttleRoute');
const BusStop = require('../models/BusStop');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

exports.reportCongestion = async (req, res) => {
  try {
    const { busType, departure, arrival, direction, departureTime, dayOfWeek, date, dayType, congestionLevel } = mergeRequestParams(req);
    const userId = req.user.userId;

    if (!busType || !departure || !arrival || !departureTime || !dayOfWeek || !date || !dayType || !congestionLevel) {
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

    if (!['월', '화', '수', '목', '금', '토', '일'].includes(dayOfWeek)) {
      return res.status(400).json({
        message: 'dayOfWeek는 "월", "화", "수", "목", "금", "토", "일" 중 하나여야 합니다.'
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

    const validDayTypes = {
      shuttle: ['평일', '토요일/공휴일', '일요일'],
      campus: ['평일', '월~목', '금요일', '토요일/공휴일', '일요일']
    };

    if (!validDayTypes[busType].includes(dayType)) {
      return res.status(400).json({
        message: `${busType} 버스의 dayType은 ${validDayTypes[busType].join(', ')} 중 하나여야 합니다.`
      });
    }

    const BusModel = busType === 'shuttle' ? ShuttleBus : CampusBus;
    const busFilter = {
      departure,
      arrival,
      departureTime,
      dayType
    };

    if (busType === 'campus') {
      busFilter.direction = direction;
    }

    const busSchedule = await BusModel.findOne(busFilter);

    if (!busSchedule) {
      // 경유지 확인
      const viaStopsCheck = await BusModel.findOne({
        departure,
        'viaStops.name': arrival,
        departureTime,
        dayType,
        ...(busType === 'campus' ? { direction } : {})
      });

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
      const similarSchedules = await BusModel.find({
        departure,
        arrival,
        dayType
      }).limit(5);

      const similarDepartureSchedules = await BusModel.find({
        departure,
        dayType
      }).limit(5);

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
      departure,
      arrival,
      direction: busType === 'campus' ? direction : null,
      departureTime,
      dayOfWeek,
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
    const { routeId, stopId, weekday, timeSlot, index } = req.body;
    const userId = req.user?.userId || null; // 익명일 경우 null

    // 필수 파라미터 검증
    if (!routeId || !stopId || weekday === undefined || timeSlot === undefined || index === undefined) {
      return res.status(400).json({
        success: false,
        message: '필수 파라미터가 누락되었습니다.',
        required: ['routeId', 'stopId', 'weekday', 'timeSlot', 'index']
      });
    }

    // routeId와 stopId가 ObjectId 형식인지 확인
    if (!mongoose.Types.ObjectId.isValid(routeId)) {
      return res.status(400).json({
        success: false,
        message: 'routeId가 유효한 ObjectId 형식이 아닙니다.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(stopId)) {
      return res.status(400).json({
        success: false,
        message: 'stopId가 유효한 ObjectId 형식이 아닙니다.'
      });
    }

    // routeId와 stopId가 실제로 존재하는지 확인
    const route = await ShuttleRoute.findById(routeId);
    if (!route) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 노선입니다.'
      });
    }

    const stop = await BusStop.findById(stopId);
    if (!stop) {
      return res.status(404).json({
        success: false,
        message: '존재하지 않는 정류장입니다.'
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
      route_id: routeId,
      stop_id: stopId,
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
        routeId: crowdReport.route_id,
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

