const { getMultipleStopCoordinates } = require('./busStopCoordinateService');
const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');
const { getDirections } = require('./naverDirectionsService');

function getDayTypeFromDate(date) {
  const dayOfWeek = date.getDay();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const dayName = dayNames[dayOfWeek];

  const shuttleDayTypes = [];
  const campusDayTypes = [];

  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    shuttleDayTypes.push('평일');
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      campusDayTypes.push('월~목');
    } else if (dayOfWeek === 5) {
      campusDayTypes.push('금요일');
    }
  } else if (dayOfWeek === 6) {
    shuttleDayTypes.push('토요일/공휴일');
    campusDayTypes.push('토요일/공휴일');
  } else if (dayOfWeek === 0) {
    shuttleDayTypes.push('일요일');
    campusDayTypes.push('일요일');
  }

  return {
    dayOfWeek: dayName,
    shuttleDayTypes,
    campusDayTypes
  };
}

async function calculateArrivalTime(currentLat, currentLng, departure, arrival, options = {}) {
  try {
    const { currentTime } = options;
    const now = currentTime ? new Date(currentTime) : new Date();
    
    const dateInfo = getDayTypeFromDate(now);

    if (!currentLat || !currentLng || !departure || !arrival) {
      return {
        success: false,
        error: '현재 좌표, 출발지, 도착지를 모두 입력해주세요.'
      };
    }

    // 출발지 좌표 조회
    let departureCoordinatesMap;
    try {
      departureCoordinatesMap = await getMultipleStopCoordinates([departure]);
    } catch (error) {
      console.error('출발지 좌표 조회 중 오류:', error);
      return {
        success: false,
        error: `출발지 좌표 조회 중 오류가 발생했습니다: ${error.message}`
      };
    }
    
    if (!departureCoordinatesMap || !departureCoordinatesMap[departure]) {
      return {
        success: false,
        error: `출발지 "${departure}"의 좌표를 찾을 수 없습니다. 정류장 이름을 확인해주세요.`
      };
    }

    const departureCoord = {
      lat: departureCoordinatesMap[departure].latitude,
      lng: departureCoordinatesMap[departure].longitude
    };

    // 네이버 Directions API로 현재 위치에서 출발지까지 거리 계산 후 도보 시간 변환
    let walkingTimeMinutes = 0;
    const directionsResult = await getDirections({
      start: { lat: currentLat, lng: currentLng },
      goal: { lat: departureCoord.lat, lng: departureCoord.lng },
      option: 'trafast'
    });

    if (!directionsResult) {
      return {
        success: false,
        error: '네이버 Directions API 응답이 없습니다.'
      };
    }

    if (!directionsResult.success) {
      console.error('네이버 Directions API 실패:', directionsResult.error);
      return {
        success: false,
        error: `네이버 Directions API 실패: ${directionsResult.error || '알 수 없는 오류'}`
      };
    }

    if (!directionsResult.distance || directionsResult.distance <= 0) {
      console.error('네이버 Directions API 거리 정보 없음:', {
        success: directionsResult.success,
        distance: directionsResult.distance,
        summary: directionsResult.summary
      });
      return {
        success: false,
        error: '네이버 Directions API에서 거리 정보를 가져올 수 없습니다. 응답에 거리 정보가 없습니다.'
      };
    }

    // 네이버 API에서 거리(미터)를 받아서 도보 시간으로 변환
    const distanceKm = directionsResult.distance / 1000;
    const walkingSpeed = 4.5;
    walkingTimeMinutes = Math.round((distanceKm / walkingSpeed) * 60);
    // 최소 1분으로 설정 (거리가 매우 가까워도 최소 1분은 걸림)
    if (walkingTimeMinutes === 0 && distanceKm > 0) {
      walkingTimeMinutes = 1;
    }
    console.log(`네이버 API 거리: ${distanceKm.toFixed(2)}km, 도보 시간: ${walkingTimeMinutes}분`);

    // 출발지 도착 예상 시간
    const departureArrivalTime = new Date(now.getTime() + walkingTimeMinutes * 60 * 1000);

    // 출발지에서 도착지로 가는 버스 시간표 조회
    let schedules = [];

    const shuttleFilter = { departure, arrival };
    shuttleFilter.dayType = { $in: dateInfo.shuttleDayTypes };
    const shuttleSchedules = await ShuttleBus.find(shuttleFilter);
    schedules.push(...shuttleSchedules.map(s => ({ ...s.toObject(), busType: 'shuttle' })));

    const campusFilter = { departure, arrival };
    campusFilter.dayType = { $in: dateInfo.campusDayTypes };
    const campusSchedules = await CampusBus.find(campusFilter);
    schedules.push(...campusSchedules.map(s => ({ ...s.toObject(), busType: 'campus' })));

    if (schedules.length === 0) {
      return {
        success: false,
        error: `"${departure}"에서 "${arrival}"로 가는 버스 시간표를 찾을 수 없습니다.`
      };
    }

    // 출발지 도착 예상 시간 이후 가장 빠른 버스 찾기
    schedules.sort((a, b) => {
      const [aHours, aMinutes] = a.departureTime.split(':').map(Number);
      const [bHours, bMinutes] = b.departureTime.split(':').map(Number);
      return (aHours * 60 + aMinutes) - (bHours * 60 + bMinutes);
    });

    let bestSchedule = null;
    let bestArrivalTime = null;

    for (const schedule of schedules) {
      const [hours, minutes] = schedule.departureTime.split(':').map(Number);
      
      if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        continue;
      }
      
      let busDepartureTime = new Date(now);
      busDepartureTime.setHours(hours, minutes, 0, 0);

      if (isNaN(busDepartureTime.getTime())) {
        continue;
      }

      if (busDepartureTime < departureArrivalTime) {
        busDepartureTime = new Date(busDepartureTime.getTime() + 24 * 60 * 60 * 1000);
      }

      if (isNaN(busDepartureTime.getTime()) || busDepartureTime < departureArrivalTime) {
        continue;
      }

      if (!schedule.arrivalTime) {
        continue;
      }

      const [arrHours, arrMinutes] = schedule.arrivalTime.split(':').map(Number);
      
      if (isNaN(arrHours) || isNaN(arrMinutes) || arrHours < 0 || arrHours > 23 || arrMinutes < 0 || arrMinutes > 59) {
        continue;
      }
      
      let busArrivalTime = new Date(busDepartureTime);
      busArrivalTime.setHours(arrHours, arrMinutes, 0, 0);
      
      if (isNaN(busArrivalTime.getTime())) {
        continue;
      }
      
      if (busArrivalTime < busDepartureTime) {
        busArrivalTime = new Date(busArrivalTime.getTime() + 24 * 60 * 60 * 1000);
      }

      if (isNaN(busArrivalTime.getTime())) {
        continue;
      }

      if (!bestSchedule || busArrivalTime < bestArrivalTime) {
        bestSchedule = schedule;
        bestArrivalTime = busArrivalTime;
      }
    }

    if (!bestSchedule || !bestArrivalTime) {
      return {
        success: false,
        error: `출발지 도착 예상 시간(${departureArrivalTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}) 이후 탈 수 있는 버스를 찾을 수 없습니다.`
      };
    }

    const hours = bestArrivalTime.getHours();
    const minutes = bestArrivalTime.getMinutes();
    const formattedArrivalTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    return {
      success: true,
      walkingTimeMinutes: walkingTimeMinutes,
      arrivalTime: formattedArrivalTime,
      arrivalTimeFull: bestArrivalTime.toISOString()
    };
  } catch (error) {
    console.error('도착 시간 계산 오류:', error);
    return {
      success: false,
      error: error.message || '도착 시간 계산 실패'
    };
  }
}

module.exports = {
  calculateArrivalTime
};

