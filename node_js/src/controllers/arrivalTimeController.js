const { calculateArrivalTime } = require('../services/arrivalTimeService');

const mergeRequestParams = (req) => ({
  ...(req.body || {}),
  ...(req.query || {})
});

exports.getArrivalTime = async (req, res, next) => {
  try {
    const { currentLat, currentLng, departure, arrival } = mergeRequestParams(req);

    if (!currentLat || !currentLng || !departure || !arrival) {
      return res.status(400).json({
        success: false,
        message: '필수 파라미터가 누락되었습니다.',
        error: 'currentLat, currentLng, departure, arrival 중 하나 이상이 누락되었습니다.',
        required: ['currentLat', 'currentLng', 'departure', 'arrival'],
        received: {
          currentLat: currentLat || null,
          currentLng: currentLng || null,
          departure: departure || null,
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

    let result;
    try {
      result = await calculateArrivalTime(lat, lng, departure, arrival, {
        currentTime: new Date()
      });
    } catch (serviceError) {
      console.error('서비스 함수 오류:', serviceError);
      return res.status(500).json({
        success: false,
        message: '도착 시간 계산 중 오류가 발생했습니다.',
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
          departure: departure,
          arrival: arrival
        },
        hint: '출발지와 도착지 이름을 확인해주세요.'
      });
    }

    return res.json({
      success: true,
      walkingTimeMinutes: result.walkingTimeMinutes,
      arrivalTime: result.arrivalTime,
      arrivalTimeFull: result.arrivalTimeFull
    });
  } catch (error) {
    console.error('도착 시간 조회 오류:', error);
    return res.status(500).json({
      success: false,
      message: '도착 시간 조회 중 오류가 발생했습니다.',
      error: error.message || '알 수 없는 오류가 발생했습니다.',
      hint: '서버 내부 오류입니다. 잠시 후 다시 시도해주세요.'
    });
  }
};

