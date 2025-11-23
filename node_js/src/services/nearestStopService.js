const BusStop = require('../models/BusStop');
const ShuttleBus = require('../models/ShuttleBus');

/**
 * 두 좌표 간 거리 계산 (Haversine 공식)
 * @param {number} lat1 - 첫 번째 위도
 * @param {number} lon1 - 첫 번째 경도
 * @param {number} lat2 - 두 번째 위도
 * @param {number} lon2 - 두 번째 경도
 * @returns {number} - 거리 (미터)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 지구 반경 (미터)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 현재 위치에서 가장 가까운 탑승 가능한 정류장 찾기
 * @param {number} currentLat - 현재 위도
 * @param {number} currentLon - 현재 경도
 * @param {string} dayType - 요일 타입
 * @param {string} departureTime - 출발 시간 (HH:mm, 선택)
 * @returns {Promise<Object>} - 가장 가까운 정류장 정보
 */
async function findNearestBoardingStop(currentLat, currentLon, dayType, departureTime = null) {
  try {
    // 선문대 출발 정류장 목록
    const sunmoonStops = [
      '충남 아산시 선문대 정류소',
      '선문대학생회관 앞'
    ];

    // 정류장 정보 조회
    const stops = await BusStop.find({
      name: { $in: sunmoonStops }
    });

    if (stops.length === 0) {
      return {
        success: false,
        error: '정류장 정보를 찾을 수 없습니다.'
      };
    }

    // 출발 시간이 지정된 경우, 학생회관 앞 탑승 가능 여부 확인
    let availableStops = [];
    
    if (departureTime) {
      // 해당 시간대의 스케줄 조회
      const schedules = await ShuttleBus.find({
        dayType: dayType,
        departure: '아산캠퍼스',
        departureTime: departureTime
      });

      // 학생회관 앞 탑승 가능한 시간대인지 확인
      const studentHallAvailable = schedules.some(s => s.studentHallBoardingAvailable === true);

      for (const stop of stops) {
        // 출발 정류장은 항상 사용 가능
        if (stop.stopType === 'departure') {
          availableStops.push(stop);
        }
        // 조건부 탑승 정류장은 해당 시간대에만 사용 가능
        else if (stop.stopType === 'conditional' && stop.requiresStudentHallBoarding) {
          if (studentHallAvailable) {
            availableStops.push(stop);
          }
        }
      }
    } else {
      // 출발 시간이 지정되지 않은 경우, 출발 정류장만 반환
      availableStops = stops.filter(s => s.stopType === 'departure');
    }

    if (availableStops.length === 0) {
      return {
        success: false,
        error: '탑승 가능한 정류장이 없습니다.'
      };
    }

    // 거리 계산 및 정렬
    const stopsWithDistance = availableStops.map(stop => {
      const distance = calculateDistance(
        currentLat,
        currentLon,
        stop.latitude,
        stop.longitude
      );
      return {
        stop: {
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          address: stop.naverAddress,
          stopType: stop.stopType,
          requiresStudentHallBoarding: stop.requiresStudentHallBoarding
        },
        distance: Math.round(distance), // 미터 단위
        distanceKm: (distance / 1000).toFixed(2) // 킬로미터 단위
      };
    });

    // 거리순 정렬
    stopsWithDistance.sort((a, b) => a.distance - b.distance);

    const nearest = stopsWithDistance[0];

    return {
      success: true,
      nearestStop: nearest.stop,
      distance: nearest.distance,
      distanceKm: nearest.distanceKm,
      allAvailableStops: stopsWithDistance.map(s => ({
        stop: s.stop,
        distance: s.distance,
        distanceKm: s.distanceKm
      }))
    };
  } catch (error) {
    console.error('가장 가까운 정류장 찾기 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  findNearestBoardingStop,
  calculateDistance
};

