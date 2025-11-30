const CrowdReport = require('../models/CrowdReport');
const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');

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

    const congestionReport = new CrowdReport({
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


