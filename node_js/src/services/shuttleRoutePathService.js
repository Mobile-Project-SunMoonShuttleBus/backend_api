const ShuttleRoutePath = require('../models/ShuttleRoutePath');
const BusStop = require('../models/BusStop');
const crypto = require('crypto');

// 경유지 목록으로 해시 생성
function generateViaStopHash(viaStops) {
  const sorted = [...viaStops].sort();
  const hash = crypto.createHash('md5').update(sorted.join(',')).digest('hex');
  return hash;
}

// 경로 키 생성
function generateRouteKey(departure, arrival, direction, dayType, viaStopHash) {
  return `${departure}-${arrival}-${direction}-${dayType}-${viaStopHash}`;
}

// 정류장 좌표 조회
async function getStopCoordinates(stopNames) {
  const stops = await BusStop.find({
    name: { $in: stopNames }
  }).select('name latitude longitude').lean();

  const coordinatesMap = {};
  stops.forEach(stop => {
    coordinatesMap[stop.name] = {
      latitude: stop.latitude,
      longitude: stop.longitude
    };
  });

  return coordinatesMap;
}

// 경로 계산 및 저장
async function calculateAndSaveRoutePath(departure, arrival, direction, dayType, viaStops) {
  try {
    const viaStopNames = viaStops.map(v => v.name);
    
    // 경유지 좌표 확인 후 사용 가능한 것만 필터링
    const allStopNames = [departure, ...viaStopNames, arrival];
    const coordinatesMap = await getStopCoordinates(allStopNames);
    
    // 출발지와 도착지는 필수
    if (!coordinatesMap[departure]) {
      return {
        success: false,
        error: `출발지 좌표가 없습니다: ${departure}`
      };
    }

    if (!coordinatesMap[arrival]) {
      return {
        success: false,
        error: `도착지 좌표가 없습니다: ${arrival}`
      };
    }

    // 경유지 중 좌표가 있는 것만 필터링
    const availableViaStops = viaStopNames.filter(name => coordinatesMap[name]);
    const missingViaStops = viaStopNames.filter(name => !coordinatesMap[name]);
    
    if (missingViaStops.length > 0) {
      console.warn(`경유지 중 좌표가 없는 정류장이 있어 제외됩니다: ${missingViaStops.join(', ')}`);
      console.log(`사용 가능한 경유지: ${availableViaStops.length}개 / 전체: ${viaStopNames.length}개`);
    }

    // 실제 사용된 경유지로 해시 생성
    const viaStopHash = generateViaStopHash(availableViaStops);
    const routeKey = generateRouteKey(departure, arrival, direction, dayType, viaStopHash);

    const existingRoute = await ShuttleRoutePath.findOne({ routeKey });
    if (existingRoute && existingRoute.viaStopHash === viaStopHash) {
      console.log(`경로 이미 존재: ${routeKey}`);
      return {
        success: true,
        routePath: existingRoute,
        isNew: false
      };
    }


    const startCoord = {
      lat: coordinatesMap[departure].latitude,
      lng: coordinatesMap[departure].longitude
    };

    const goalCoord = {
      lat: coordinatesMap[arrival].latitude,
      lng: coordinatesMap[arrival].longitude
    };

    // 좌표가 있는 경유지만 waypoints로 사용
    const waypoints = availableViaStops
      .map(name => ({
        lat: coordinatesMap[name].latitude,
        lng: coordinatesMap[name].longitude
      }))
      .filter(wp => wp.lat && wp.lng);

    const { getDirections } = require('./naverDirectionsService');
    
    // 네이버 Directions API로 경로 계산
    
    let directionsResult = await getDirections({
      start: startCoord,
      goal: goalCoord,
      waypoints: waypoints.slice(0, 5),
      option: 'trafast'
    });
    
    if (!directionsResult.success && waypoints.length > 5) {
      console.warn(`경유지가 5개를 초과하여 처음 5개만 사용합니다. (전체: ${waypoints.length}개)`);
    }

    if (!directionsResult.success) {
      return {
        success: false,
        error: directionsResult.error || '경로 계산 실패'
      };
    }

    const stopCoordinates = [];
    let order = 0;

    stopCoordinates.push({
      name: departure,
      latitude: startCoord.lat,
      longitude: startCoord.lng,
      order: order++
    });

    // 좌표가 있는 경유지만 stopCoordinates에 추가
    availableViaStops.forEach(name => {
      stopCoordinates.push({
        name: name,
        latitude: coordinatesMap[name].latitude,
        longitude: coordinatesMap[name].longitude,
        order: order++
      });
    });

    stopCoordinates.push({
      name: arrival,
      latitude: goalCoord.lat,
      longitude: goalCoord.lng,
      order: order++
    });

    // 실제 사용된 경유지만 저장 (좌표가 있는 것만)
    const routePathData = {
      routeKey,
      departure,
      arrival,
      direction,
      dayType,
      viaStops: availableViaStops, // 좌표가 있는 경유지만 저장
      path: directionsResult.path,
      distance: directionsResult.distance,
      duration: directionsResult.duration,
      stopCoordinates,
      viaStopHash: viaStopHash // 실제 사용된 경유지로 해시 생성
    };

    const routePath = await ShuttleRoutePath.findOneAndUpdate(
      { routeKey },
      routePathData,
      { upsert: true, new: true }
    );

    console.log(`경로 저장 완료: ${routeKey} (${directionsResult.path.length}개 좌표)`);

    return {
      success: true,
      routePath,
      isNew: !existingRoute
    };
  } catch (error) {
    console.error('경로 계산 및 저장 오류:', error);
    return {
      success: false,
      error: error.message || '경로 계산 및 저장 실패'
    };
  }
}

// 경로 조회
async function getRoutePath(departure, arrival, direction, dayType, viaStops) {
  try {
    const viaStopNames = viaStops ? viaStops.map(v => typeof v === 'string' ? v : v.name) : [];
    
    // 좌표가 있는 경유지만 필터링
    const allStopNames = [departure, ...viaStopNames, arrival];
    const coordinatesMap = await getStopCoordinates(allStopNames);
    const availableViaStops = viaStopNames.filter(name => coordinatesMap[name]);
    
    // 실제 사용된 경유지로 해시 생성하여 조회
    const viaStopHash = generateViaStopHash(availableViaStops);
    const routeKey = generateRouteKey(departure, arrival, direction, dayType, viaStopHash);

    let routePath = await ShuttleRoutePath.findOne({ routeKey });

    // 경로가 없으면 경로 계산 시도
    if (!routePath) {
      const calculateResult = await calculateAndSaveRoutePath(departure, arrival, direction, dayType, viaStops);
      if (calculateResult.success) {
        routePath = calculateResult.routePath;
      } else {
        return {
          success: false,
          error: calculateResult.error || '경로를 찾을 수 없습니다.'
        };
      }
    }

    return {
      success: true,
      routePath
    };
  } catch (error) {
    console.error('경로 조회 오류:', error);
    return {
      success: false,
      error: error.message || '경로 조회 실패'
    };
  }
}

async function checkAndUpdateRoutes(departure, arrival, direction, dayType, newViaStops) {
  try {
    const newViaStopNames = newViaStops.map(v => v.name);
    const newViaStopHash = generateViaStopHash(newViaStopNames);

    const existingRoutes = await ShuttleRoutePath.find({
      departure,
      arrival,
      direction,
      dayType
    });

    const needsUpdate = existingRoutes.some(route => route.viaStopHash !== newViaStopHash);

    if (needsUpdate || existingRoutes.length === 0) {
      const result = await calculateAndSaveRoutePath(departure, arrival, direction, dayType, newViaStops);
      return result;
    }

    const matchingRoute = existingRoutes.find(route => route.viaStopHash === newViaStopHash);
    if (matchingRoute) {
      return {
        success: true,
        routePath: matchingRoute,
        isNew: false
      };
    }

    return {
      success: false,
      error: '경로를 찾을 수 없습니다.'
    };
  } catch (error) {
    console.error('경로 확인 및 업데이트 오류:', error);
    return {
      success: false,
      error: error.message || '경로 확인 및 업데이트 실패'
    };
  }
}

module.exports = {
  calculateAndSaveRoutePath,
  getRoutePath,
  checkAndUpdateRoutes,
  generateRouteKey,
  generateViaStopHash
};

