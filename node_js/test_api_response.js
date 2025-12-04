const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');

async function testAPIResponse() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    // 실제 DB에서 데이터 조회
    const schedules = await ShuttleBus.find({
      departure: '아산캠퍼스',
      arrival: '천안역',
      dayType: '평일'
    }).limit(5).lean();
    
    console.log('DB에서 직접 조회한 데이터:');
    schedules.forEach((s, i) => {
      console.log(`${i + 1}. 출발: ${s.departureTime}, 도착: ${s.arrivalTime} (타입: ${typeof s.arrivalTime}, 값: ${JSON.stringify(s.arrivalTime)})`);
    });
    
    // 컨트롤러 로직 시뮬레이션
    console.log('\n컨트롤러 변환 후:');
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

testAPIResponse();

