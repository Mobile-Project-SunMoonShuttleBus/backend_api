const BusStop = require('../models/BusStop');

// 좌표값 검증
function validateCoordinates(stopName, latitude, longitude) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: []
  };

  // 좌표 범위 검증
  const KOREA_LAT_MIN = 33.0;
  const KOREA_LAT_MAX = 38.6;
  const KOREA_LNG_MIN = 124.5;
  const KOREA_LNG_MAX = 132.0;

  if (latitude < KOREA_LAT_MIN || latitude > KOREA_LAT_MAX) {
    validation.isValid = false;
    validation.errors.push(`위도가 한국 영역을 벗어남: ${latitude} (범위: ${KOREA_LAT_MIN} ~ ${KOREA_LAT_MAX})`);
  }

  if (longitude < KOREA_LNG_MIN || longitude > KOREA_LNG_MAX) {
    validation.isValid = false;
    validation.errors.push(`경도가 한국 영역을 벗어남: ${longitude} (범위: ${KOREA_LNG_MIN} ~ ${KOREA_LNG_MAX})`);
  }

  if (latitude === 0 && longitude === 0) {
    validation.isValid = false;
    validation.errors.push('좌표값이 (0, 0)입니다. 잘못된 좌표일 가능성이 높습니다.');
  }

  if (latitude == null || longitude == null) {
    validation.isValid = false;
    validation.errors.push('좌표값이 null 또는 undefined입니다.');
  }

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    validation.isValid = false;
    validation.errors.push('좌표값이 숫자가 아닙니다.');
  }

  if (isNaN(latitude) || isNaN(longitude)) {
    validation.isValid = false;
    validation.errors.push('좌표값이 NaN입니다.');
  }

  if (!isFinite(latitude) || !isFinite(longitude)) {
    validation.isValid = false;
    validation.errors.push('좌표값이 무한대입니다.');
  }

  return validation;
}

// 모든 정류장 좌표 검증
async function validateAllStoredCoordinates() {
  try {
    const stops = await BusStop.find({});
    const results = {
      total: stops.length,
      valid: 0,
      invalid: 0,
      details: []
    };

    for (const stop of stops) {
      const validation = validateCoordinates(stop.name, stop.latitude, stop.longitude);
      
      if (validation.isValid) {
        results.valid++;
      } else {
        results.invalid++;
      }

      results.details.push({
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        isValid: validation.isValid,
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    return {
      success: true,
      ...results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 특정 정류장 좌표 검증
async function validateStopCoordinates(stopName) {
  try {
    const stop = await BusStop.findOne({ name: stopName });
    
    if (!stop) {
      return {
        success: false,
        error: '정류장을 찾을 수 없습니다.'
      };
    }

    const validation = validateCoordinates(stop.name, stop.latitude, stop.longitude);

    return {
      success: true,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      ...validation
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  validateCoordinates,
  validateAllStoredCoordinates,
  validateStopCoordinates
};

