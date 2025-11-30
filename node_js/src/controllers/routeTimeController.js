const { calculateRouteTime } = require('../services/routeTimeService');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

exports.getRouteTime = async (req, res, next) => {
  try {
    const { currentLat, currentLng, arrival, busType, dayType, direction, currentTime } = mergeRequestParams(req);

    if (!currentLat || !currentLng || !arrival) {
      return res.status(400).json({
        success: false,
        message: '필수 파라미터가 누락되었습니다.',
        error: 'currentLat, currentLng, arrival 중 하나 이상이 누락되었습니다.',
        required: ['currentLat', 'currentLng', 'arrival'],
        received: {
          currentLat: currentLat || null,
          currentLng: currentLng || null,
          arrival: arrival || null
        },
        hint: '쿼리 파라미터 또는 JSON body에 모든 필수 파라미터를 포함해주세요.'
      });
    }

    const lat = parseFloat(currentLat);
    const lng = parseFloat(currentLng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        message: '좌표 형식이 올바르지 않습니다.',
        error: 'currentLat와 currentLng는 숫자여야 합니다.',
        received: {
          currentLat: currentLat,
          currentLng: currentLng
        },
        hint: '좌표는 숫자 형식으로 입력해주세요. 예: currentLat=36.790013&currentLng=127.002474'
      });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: '좌표 범위가 올바르지 않습니다.',
        error: `위도는 -90~90 사이, 경도는 -180~180 사이여야 합니다.`,
        received: {
          currentLat: lat,
          currentLng: lng
        },
        validRange: {
          latitude: { min: -90, max: 90 },
          longitude: { min: -180, max: 180 }
        },
        hint: '올바른 좌표 범위를 입력해주세요.'
      });
    }

    if (busType && !['shuttle', 'campus'].includes(busType)) {
      return res.status(400).json({
        success: false,
        message: '버스 타입이 올바르지 않습니다.',
        error: `busType은 'shuttle' 또는 'campus'여야 합니다.`,
        received: busType,
        validValues: ['shuttle', 'campus'],
        hint: 'busType 파라미터를 "shuttle" 또는 "campus"로 설정해주세요.'
      });
    }

    if (direction && !['등교', '하교'].includes(direction)) {
      return res.status(400).json({
        success: false,
        message: '방향이 올바르지 않습니다.',
        error: `direction은 '등교' 또는 '하교'여야 합니다.`,
        received: direction,
        validValues: ['등교', '하교'],
        hint: 'direction 파라미터를 "등교" 또는 "하교"로 설정해주세요.'
      });
    }

    let result;
    try {
      result = await calculateRouteTime(lat, lng, arrival, {
        busType,
        dayType,
        direction,
        currentTime
      });
    } catch (serviceError) {
      console.error('서비스 함수 오류:', serviceError);
      return res.status(500).json({
        success: false,
        message: '경로 시간 계산 중 오류가 발생했습니다.',
        error: serviceError.message || '알 수 없는 오류가 발생했습니다.',
        hint: '서버 내부 오류입니다. 잠시 후 다시 시도해주세요.'
      });
    }

    if (!result || !result.success) {
      return res.status(404).json({
        success: false,
        message: result?.error || '경로를 찾을 수 없습니다.',
        error: result?.error || '요청하신 조건에 맞는 버스 경로를 찾을 수 없습니다.',
        requested: {
          arrival: arrival,
          busType: busType || 'all',
          dayType: dayType || 'auto',
          direction: direction || null
        },
        hint: '도착지 이름을 확인하거나, 다른 버스 타입이나 요일을 시도해보세요.'
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('경로 시간 조회 오류:', error);
    return res.status(500).json({
      success: false,
      message: '경로 시간 조회 중 오류가 발생했습니다.',
      error: error.message || '알 수 없는 오류가 발생했습니다.',
      hint: '서버 내부 오류입니다. 잠시 후 다시 시도해주세요.'
    });
  }
};

