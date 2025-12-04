const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');

async function checkSchedule() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    // 아산캠퍼스 -> 천안 아산역 시간표 확인
    const schedules = await ShuttleBus.find({
      departure: '아산캠퍼스',
      arrival: '천안 아산역',
      dayType: '평일'
    }).limit(10).lean();
    
    console.log(`아산캠퍼스 -> 천안 아산역 시간표: ${schedules.length}개\n`);
    
    schedules.forEach((s, i) => {
      console.log(`${i + 1}. 출발: ${s.departureTime}, 도착: ${s.arrivalTime} (타입: ${typeof s.arrivalTime}, 값: ${JSON.stringify(s.arrivalTime)})`);
      console.log(`   출처: ${s.sourceUrl}`);
      console.log(`   크롤링 시간: ${s.crawledAt}`);
      console.log('');
    });
    
    // 컨트롤러 변환 로직 테스트
    console.log('컨트롤러 변환 후:');
    schedules.forEach((s, i) => {
      const arrivalTime = s.arrivalTime;
      let formatted;
      if (arrivalTime && arrivalTime !== 'X' && arrivalTime !== null && arrivalTime !== undefined && String(arrivalTime).trim() !== '') {
        formatted = arrivalTime;
      } else {
        formatted = 'X';
      }
      console.log(`${i + 1}. 출발: ${s.departureTime}, 도착: ${formatted}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

checkSchedule();

