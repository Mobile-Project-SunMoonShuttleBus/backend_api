const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');
const CampusBus = require('./src/models/CampusBus');
const CommuterBus = require('./src/models/CommuterBus');

// 시간 문자열을 분 단위로 변환
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

// 시간표 검증
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

async function checkShuttleBus() {
  console.log('\n=== 셔틀버스 크롤링 결과 확인 ===\n');
  
  const schedules = await ShuttleBus.find({}).lean();
  console.log(`전체 시간표: ${schedules.length}개\n`);
  
  let withArrivalTime = 0;
  let withoutArrivalTime = 0;
  let invalid = 0;
  const invalidSchedules = [];
  
  for (const schedule of schedules) {
    const result = checkSchedule(schedule);
    if (!result.valid) {
      invalid++;
      invalidSchedules.push({
        ...schedule,
        error: result.error
      });
    } else if (result.hasArrivalTime) {
      withArrivalTime++;
    } else {
      withoutArrivalTime++;
    }
  }
  
  console.log(`도착시간 있음: ${withArrivalTime}개`);
  console.log(`도착시간 없음 (X): ${withoutArrivalTime}개`);
  console.log(`검증 실패: ${invalid}개\n`);
  
  if (invalid > 0) {
    console.log('검증 실패한 시간표 (최대 10개):');
    invalidSchedules.slice(0, 10).forEach((s, idx) => {
      console.log(`${idx + 1}. ${s.departure} -> ${s.arrival} | ${s.departureTime} -> ${s.arrivalTime} | ${s.error}`);
    });
    if (invalidSchedules.length > 10) {
      console.log(`... 외 ${invalidSchedules.length - 10}개`);
    }
    console.log('');
  }
  
  // 주요 노선별 확인
  const mainRoutes = [
    { departure: '아산캠퍼스', arrival: '천안 아산역' },
    { departure: '아산캠퍼스', arrival: '천안역' },
    { departure: '아산캠퍼스', arrival: '천안 터미널' }
  ];
  
  console.log('주요 노선별 도착시간 확인:');
  for (const route of mainRoutes) {
    const routeSchedules = schedules.filter(s => 
      s.departure === route.departure && s.arrival === route.arrival
    );
    const withTime = routeSchedules.filter(s => 
      s.arrivalTime && s.arrivalTime !== 'X' && s.arrivalTime !== null
    ).length;
    console.log(`  ${route.departure} -> ${route.arrival}: ${withTime}/${routeSchedules.length}개에 도착시간 있음`);
  }
  console.log('');
  
  return {
    total: schedules.length,
    withArrivalTime,
    withoutArrivalTime,
    invalid,
    invalidSchedules
  };
}

async function checkCampusBus() {
  console.log('\n=== 통학버스 크롤링 결과 확인 ===\n');
  
  const schedules = await CampusBus.find({}).lean();
  console.log(`전체 시간표: ${schedules.length}개\n`);
  
  let withArrivalTime = 0;
  let withoutArrivalTime = 0;
  let invalid = 0;
  const invalidSchedules = [];
  
  for (const schedule of schedules) {
    const result = checkSchedule(schedule);
    if (!result.valid) {
      invalid++;
      invalidSchedules.push({
        ...schedule,
        error: result.error
      });
    } else if (result.hasArrivalTime) {
      withArrivalTime++;
    } else {
      withoutArrivalTime++;
    }
  }
  
  console.log(`도착시간 있음: ${withArrivalTime}개`);
  console.log(`도착시간 없음 (X): ${withoutArrivalTime}개`);
  console.log(`검증 실패: ${invalid}개\n`);
  
  if (invalid > 0) {
    console.log('검증 실패한 시간표 (최대 10개):');
    invalidSchedules.slice(0, 10).forEach((s, idx) => {
      console.log(`${idx + 1}. ${s.departure} -> ${s.arrival} | ${s.departureTime} -> ${s.arrivalTime} | ${s.error}`);
    });
    if (invalidSchedules.length > 10) {
      console.log(`... 외 ${invalidSchedules.length - 10}개`);
    }
    console.log('');
  }
  
  return {
    total: schedules.length,
    withArrivalTime,
    withoutArrivalTime,
    invalid,
    invalidSchedules
  };
}

async function checkCommuterBus() {
  console.log('\n=== 통근버스 크롤링 결과 확인 ===\n');
  
  const schedules = await CommuterBus.find({}).lean();
  console.log(`전체 시간표: ${schedules.length}개\n`);
  
  let withArrivalTime = 0;
  let withoutArrivalTime = 0;
  let invalid = 0;
  const invalidSchedules = [];
  
  for (const schedule of schedules) {
    const result = checkSchedule(schedule);
    if (!result.valid) {
      invalid++;
      invalidSchedules.push({
        ...schedule,
        error: result.error
      });
    } else if (result.hasArrivalTime) {
      withArrivalTime++;
    } else {
      withoutArrivalTime++;
    }
  }
  
  console.log(`도착시간 있음: ${withArrivalTime}개`);
  console.log(`도착시간 없음 (X): ${withoutArrivalTime}개`);
  console.log(`검증 실패: ${invalid}개\n`);
  
  if (invalid > 0) {
    console.log('검증 실패한 시간표 (최대 10개):');
    invalidSchedules.slice(0, 10).forEach((s, idx) => {
      console.log(`${idx + 1}. ${s.departure} -> ${s.arrival} | ${s.departureTime} -> ${s.arrivalTime} | ${s.error}`);
    });
    if (invalidSchedules.length > 10) {
      console.log(`... 외 ${invalidSchedules.length - 10}개`);
    }
    console.log('');
  }
  
  return {
    total: schedules.length,
    withArrivalTime,
    withoutArrivalTime,
    invalid,
    invalidSchedules
  };
}

async function main() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    const shuttleResult = await checkShuttleBus();
    const campusResult = await checkCampusBus();
    const commuterResult = await checkCommuterBus();
    
    console.log('\n=== 전체 요약 ===');
    console.log(`셔틀버스: 총 ${shuttleResult.total}개, 도착시간 있음 ${shuttleResult.withArrivalTime}개, 검증 실패 ${shuttleResult.invalid}개`);
    console.log(`통학버스: 총 ${campusResult.total}개, 도착시간 있음 ${campusResult.withArrivalTime}개, 검증 실패 ${campusResult.invalid}개`);
    console.log(`통근버스: 총 ${commuterResult.total}개, 도착시간 있음 ${commuterResult.withArrivalTime}개, 검증 실패 ${commuterResult.invalid}개`);
    
    const totalInvalid = shuttleResult.invalid + campusResult.invalid + commuterResult.invalid;
    if (totalInvalid > 0) {
      console.log(`\n⚠️  총 ${totalInvalid}개의 검증 실패 항목이 있습니다.`);
    } else {
      console.log('\n✅ 모든 시간표가 검증을 통과했습니다.');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

main();

