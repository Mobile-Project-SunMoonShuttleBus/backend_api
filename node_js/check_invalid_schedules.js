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

async function main() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    const schedules = await ShuttleBus.find({}).lean();
    console.log(`전체 시간표: ${schedules.length}개\n`);
    
    const invalidSchedules = [];
    const invalidByRoute = {};
    
    for (const schedule of schedules) {
      const result = checkSchedule(schedule);
      if (!result.valid) {
        invalidSchedules.push(schedule);
        const routeKey = `${schedule.departure} -> ${schedule.arrival}`;
        if (!invalidByRoute[routeKey]) {
          invalidByRoute[routeKey] = [];
        }
        invalidByRoute[routeKey].push(schedule);
      }
    }
    
    console.log(`검증 실패: ${invalidSchedules.length}개\n`);
    
    console.log('노선별 검증 실패 통계:');
    for (const [route, schedules] of Object.entries(invalidByRoute)) {
      console.log(`  ${route}: ${schedules.length}개`);
    }
    console.log('');
    
    console.log('검증 실패한 시간표 상세 (최대 20개):');
    invalidSchedules.slice(0, 20).forEach((s, idx) => {
      console.log(`${idx + 1}. ${s.departure} -> ${s.arrival} | ${s.departureTime} -> ${s.arrivalTime} | ${s.dayType}`);
    });
    if (invalidSchedules.length > 20) {
      console.log(`... 외 ${invalidSchedules.length - 20}개`);
    }
    console.log('');
    
    // 노선별로 그룹화하여 출력
    console.log('노선별 상세:');
    for (const [route, schedules] of Object.entries(invalidByRoute)) {
      console.log(`\n${route} (${schedules.length}개):`);
      schedules.slice(0, 5).forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.departureTime} -> ${s.arrivalTime} (${s.dayType})`);
      });
      if (schedules.length > 5) {
        console.log(`  ... 외 ${schedules.length - 5}개`);
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

main();

