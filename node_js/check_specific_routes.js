const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');

async function checkRoutes() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    // 천안역 -> 아산캠퍼스 확인
    console.log('=== 천안역 -> 아산캠퍼스 ===');
    const cheonanToCampus = await ShuttleBus.find({
      departure: '천안역',
      arrival: '아산캠퍼스',
      dayType: '평일'
    }).limit(5).lean();
    
    console.log(`총 ${cheonanToCampus.length}개`);
    cheonanToCampus.forEach((s, i) => {
      console.log(`${i + 1}. 출발: ${s.departureTime}, 도착: ${s.arrivalTime}, 출처: ${s.sourceUrl}`);
    });
    console.log('');
    
    // 천안 터미널 -> 아산캠퍼스 확인
    console.log('=== 천안 터미널 -> 아산캠퍼스 ===');
    const terminalToCampus = await ShuttleBus.find({
      departure: '천안 터미널',
      arrival: '아산캠퍼스',
      dayType: '평일'
    }).limit(10).lean();
    
    console.log(`총 ${terminalToCampus.length}개`);
    terminalToCampus.forEach((s, i) => {
      console.log(`${i + 1}. 출발: ${s.departureTime}, 도착: ${s.arrivalTime}, 출처: ${s.sourceUrl}`);
    });
    console.log('');
    
    // 잘못된 출발지 확인
    console.log('=== 잘못된 출발지 (아산캠퍼스_도착) ===');
    const wrongDeparture = await ShuttleBus.find({
      departure: { $regex: /_도착/ }
    }).lean();
    
    console.log(`총 ${wrongDeparture.length}개`);
    wrongDeparture.forEach((s, i) => {
      console.log(`${i + 1}. ${s.departure} -> ${s.arrival} | ${s.departureTime} -> ${s.arrivalTime}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

checkRoutes();

