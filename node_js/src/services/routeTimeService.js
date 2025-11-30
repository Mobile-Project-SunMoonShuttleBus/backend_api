const { getMultipleStopCoordinates } = require('./busStopCoordinateService');
const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');
const { calculateDistance } = require('./nearestStopService');

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

async function calculateRouteTime(currentLat, currentLng, arrival, options = {}) {
  try {
    const { busType, dayType, direction, currentTime } = options;
    const now = currentTime ? new Date(currentTime) : new Date();
    
    const dateInfo = getDayTypeFromDate(now);

    if (!currentLat || !currentLng || !arrival) {
      return {
        success: false,
        error: '현재 좌표와 도착지를 입력해주세요.'
      };
    }

    let coordinatesMap;
    try {
      coordinatesMap = await getMultipleStopCoordinates([arrival]);
    } catch (error) {
      console.error('정류장 좌표 조회 중 오류:', error);
      return {
        success: false,
        error: `도착지 좌표 조회 중 오류가 발생했습니다: ${error.message}`
      };
    }
    
    if (!coordinatesMap || !coordinatesMap[arrival]) {
      return {
        success: false,
        error: `도착지 "${arrival}"의 좌표를 찾을 수 없습니다. 정류장 이름을 확인해주세요.`
      };
    }

    const arrivalCoord = {
      lat: coordinatesMap[arrival].latitude,
      lng: coordinatesMap[arrival].longitude
    };

    let schedules = [];
    let allDepartureStops = new Set();

    if (!busType || busType === 'shuttle') {
      const shuttleFilter = { arrival };
      if (dayType) {
        shuttleFilter.dayType = dayType;
      } else {
        shuttleFilter.dayType = { $in: dateInfo.shuttleDayTypes };
      }
      const shuttleSchedules = await ShuttleBus.find(shuttleFilter);
      schedules.push(...shuttleSchedules.map(s => ({ ...s.toObject(), busType: 'shuttle' })));
      shuttleSchedules.forEach(s => allDepartureStops.add(s.departure));
    }

    if (!busType || busType === 'campus') {
      const campusFilter = { arrival };
      if (dayType) {
        campusFilter.dayType = dayType;
      } else {
        campusFilter.dayType = { $in: dateInfo.campusDayTypes };
      }
      if (direction) {
        campusFilter.direction = direction;
      }
      const campusSchedules = await CampusBus.find(campusFilter);
      schedules.push(...campusSchedules.map(s => ({ ...s.toObject(), busType: 'campus' })));
      campusSchedules.forEach(s => allDepartureStops.add(s.departure));
    }

    if (schedules.length === 0) {
      return {
        success: false,
        error: `"${arrival}"로 가는 버스 시간표를 찾을 수 없습니다. 버스 타입(${busType || 'all'}), 요일(${dayType || 'auto'}), 방향(${direction || 'all'}) 필터를 확인해주세요.`
      };
    }

        const departureStops = Array.from(allDepartureStops);
        let stopCoordinatesMap;
        try {
          stopCoordinatesMap = await getMultipleStopCoordinates(departureStops);
        } catch (error) {
          console.error('출발 정류장 좌표 조회 중 오류:', error);
          return {
            success: false,
            error: `정류장 좌표 조회 중 오류가 발생했습니다: ${error.message}. 데이터베이스 연결을 확인해주세요.`
          };
        }

    const routes = [];

    for (const departure of departureStops) {
      if (!stopCoordinatesMap[departure]) {
        continue;
      }

      const stopCoord = {
        lat: stopCoordinatesMap[departure].latitude,
        lng: stopCoordinatesMap[departure].longitude
      };

      const distance = calculateDistance(currentLat, currentLng, stopCoord.lat, stopCoord.lng);
      const walkingSpeed = 4.5;
      const walkingTime = Math.round((distance / walkingSpeed) * 3600 * 1000);
      const stopArrivalTime = new Date(now.getTime() + walkingTime);
      
      if (isNaN(stopArrivalTime.getTime())) {
        continue;
      }

      const relevantSchedules = schedules.filter(s => s.departure === departure);
      
      relevantSchedules.sort((a, b) => {
        const [aHours, aMinutes] = a.departureTime.split(':').map(Number);
        const [bHours, bMinutes] = b.departureTime.split(':').map(Number);
        return (aHours * 60 + aMinutes) - (bHours * 60 + bMinutes);
      });

      for (const schedule of relevantSchedules) {
        const [hours, minutes] = schedule.departureTime.split(':').map(Number);
        
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
          continue;
        }
        
        let busDepartureTime = new Date(now);
        busDepartureTime.setHours(hours, minutes, 0, 0);

        if (isNaN(busDepartureTime.getTime())) {
          continue;
        }

        if (busDepartureTime < stopArrivalTime) {
          busDepartureTime = new Date(busDepartureTime.getTime() + 24 * 60 * 60 * 1000);
        }

        if (isNaN(busDepartureTime.getTime()) || busDepartureTime < stopArrivalTime) {
          continue;
        }

        const waitTime = busDepartureTime.getTime() - stopArrivalTime.getTime();
        
        if (waitTime < 0) {
          continue;
        }
        
        const busArrivalTime = schedule.arrivalTime 
          ? (() => {
              const [arrHours, arrMinutes] = schedule.arrivalTime.split(':').map(Number);
              
              if (isNaN(arrHours) || isNaN(arrMinutes) || arrHours < 0 || arrHours > 23 || arrMinutes < 0 || arrMinutes > 59) {
                return null;
              }
              
              const arrTime = new Date(busDepartureTime);
              arrTime.setHours(arrHours, arrMinutes, 0, 0);
              
              if (isNaN(arrTime.getTime())) {
                return null;
              }
              
              if (arrTime < busDepartureTime) {
                const nextDayArrTime = new Date(arrTime.getTime() + 24 * 60 * 60 * 1000);
                if (!isNaN(nextDayArrTime.getTime())) {
                  return nextDayArrTime;
                }
                return null;
              }
              
              return arrTime;
            })()
          : null;

        routes.push({
            departureStop: {
              name: departure,
              latitude: stopCoord.lat,
              longitude: stopCoord.lng
            },
            arrivalStop: {
              name: arrival,
              latitude: arrivalCoord.lat,
              longitude: arrivalCoord.lng
            },
            busType: schedule.busType,
            direction: schedule.direction || null,
            dayType: schedule.dayType,
            departureTime: schedule.departureTime,
            arrivalTime: schedule.arrivalTime || null,
            walkingTime: walkingTime,
            walkingDistance: distance,
            stopArrivalTime: stopArrivalTime.toISOString(),
            busDepartureTime: busDepartureTime.toISOString(),
            waitTime: waitTime,
            busArrivalTime: busArrivalTime ? busArrivalTime.toISOString() : null,
            totalTime: busArrivalTime 
              ? busArrivalTime.getTime() - now.getTime()
              : null,
            schedule: {
              _id: schedule._id,
              viaStops: schedule.viaStops || []
            }
          });
      }
    }

    if (routes.length === 0) {
      return {
        success: false,
        error: '현재 시간 기준으로 탈 수 있는 버스를 찾을 수 없습니다.'
      };
    }

    routes.sort((a, b) => {
      const aTime = a.busArrivalTime ? new Date(a.busArrivalTime).getTime() : Infinity;
      const bTime = b.busArrivalTime ? new Date(b.busArrivalTime).getTime() : Infinity;
      return aTime - bTime;
    });

    const bestRoute = routes[0];

    return {
      success: true,
      currentLocation: {
        latitude: currentLat,
        longitude: currentLng
      },
      arrival: {
        name: arrival,
        latitude: arrivalCoord.lat,
        longitude: arrivalCoord.lng
      },
      bestRoute: {
        departureStop: bestRoute.departureStop,
        arrivalStop: bestRoute.arrivalStop,
        busType: bestRoute.busType,
        direction: bestRoute.direction,
        dayType: bestRoute.dayType,
        walkingTime: bestRoute.walkingTime,
        walkingDistance: bestRoute.walkingDistance,
        walkingTimeMinutes: Math.round(bestRoute.walkingTime / 60000),
        stopArrivalTime: bestRoute.stopArrivalTime,
        busDepartureTime: bestRoute.busDepartureTime,
        waitTime: bestRoute.waitTime,
        waitTimeMinutes: Math.round(bestRoute.waitTime / 60000),
        busArrivalTime: bestRoute.busArrivalTime,
        totalTime: bestRoute.totalTime,
        totalTimeMinutes: bestRoute.totalTime ? Math.round(bestRoute.totalTime / 60000) : null
      },
      allRoutes: routes.map(r => ({
        departureStop: r.departureStop,
        busType: r.busType,
        direction: r.direction,
        walkingTimeMinutes: Math.round(r.walkingTime / 60000),
        waitTimeMinutes: Math.round(r.waitTime / 60000),
        busDepartureTime: r.busDepartureTime,
        busArrivalTime: r.busArrivalTime,
        totalTimeMinutes: r.totalTime ? Math.round(r.totalTime / 60000) : null
      }))
    };
  } catch (error) {
    console.error('경로 시간 계산 오류:', error);
    return {
      success: false,
      error: error.message || '경로 시간 계산 실패'
    };
  }
}

module.exports = {
  calculateRouteTime
};

