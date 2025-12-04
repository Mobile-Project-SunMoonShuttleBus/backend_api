const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');

function timeToMinutes(timeStr) {
  if (!timeStr || timeStr === 'X' || timeStr === null || timeStr === undefined) {
    return null;
  }
  
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  
  return hours * 60 + minutes;
}

function checkSchedule(schedule) {
  const { departureTime, arrivalTime } = schedule;
  
  if (!departureTime) {
    return { valid: false, error: '출발시간 없음' };
  }
  
  if (!arrivalTime || arrivalTime === 'X' || arrivalTime === null) {
    return { valid: true, hasArrivalTime: false, error: null };
  }
  
  const depMinutes = timeToMinutes(departureTime);
  const arrMinutes = timeToMinutes(arrivalTime);
  
  if (depMinutes === null) {
    return { valid: false, error: `출발시간 형식 오류: ${departureTime}` };
  }
  
  if (arrMinutes === null) {
    return { valid: false, error: `도착시간 형식 오류: ${arrivalTime}` };
  }
  
  if (depMinutes >= arrMinutes) {
    return { valid: false, error: `도착시간(${arrivalTime})이 출발시간(${departureTime})보다 이르거나 같음` };
  }
  
  return { valid: true, hasArrivalTime: true, error: null };
}

async function checkAllRoutes() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    const schedules = await ShuttleBus.find({ dayType: '평일' }).lean();
    console.log(`평일 시간표: ${schedules.length}개\n`);
    
    // 노선별로 그룹화
    const routes = {};
    schedules.forEach(schedule => {
      const routeKey = `${schedule.departure} -> ${schedule.arrival}`;
      if (!routes[routeKey]) {
        routes[routeKey] = [];
      }
      routes[routeKey].push(schedule);
    });
    
    console.log('=== 노선별 도착시간 확인 ===\n');
    
    for (const [route, routeSchedules] of Object.entries(routes)) {
      const withTime = routeSchedules.filter(s => 
        s.arrivalTime && s.arrivalTime !== 'X' && s.arrivalTime !== null
      );
      const withoutTime = routeSchedules.length - withTime.length;
      const invalid = routeSchedules.filter(s => {
        const result = checkSchedule(s);
        return !result.valid;
      });
      
      console.log(`${route}:`);
      console.log(`  전체: ${routeSchedules.length}개, 도착시간 있음: ${withTime.length}개, 도착시간 없음: ${withoutTime}개, 검증 실패: ${invalid.length}개`);
      
      // 도착시간이 있는 샘플 3개 출력
      if (withTime.length > 0) {
        console.log(`  도착시간 있는 샘플:`);
        withTime.slice(0, 3).forEach((s, idx) => {
          console.log(`    ${idx + 1}. ${s.departureTime} -> ${s.arrivalTime}`);
        });
      }
      
      // 검증 실패 샘플 출력
      if (invalid.length > 0) {
        console.log(`  검증 실패 샘플:`);
        invalid.slice(0, 3).forEach((s, idx) => {
          const result = checkSchedule(s);
          console.log(`    ${idx + 1}. ${s.departureTime} -> ${s.arrivalTime} (${result.error})`);
        });
      }
      
      console.log('');
    }
    
    // 전체 통계
    let totalWithTime = 0;
    let totalWithoutTime = 0;
    let totalInvalid = 0;
    
    schedules.forEach(schedule => {
      const result = checkSchedule(schedule);
      if (!result.valid) {
        totalInvalid++;
      } else if (result.hasArrivalTime) {
        totalWithTime++;
      } else {
        totalWithoutTime++;
      }
    });
    
    console.log('=== 전체 통계 ===');
    console.log(`도착시간 있음: ${totalWithTime}개`);
    console.log(`도착시간 없음: ${totalWithoutTime}개`);
    console.log(`검증 실패: ${totalInvalid}개`);
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

checkAllRoutes();

