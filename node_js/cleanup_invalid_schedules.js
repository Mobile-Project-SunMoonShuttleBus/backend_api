const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');

async function cleanup() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    // "아산캠퍼스_도착"을 출발지로 하는 잘못된 데이터 삭제
    const result = await ShuttleBus.deleteMany({
      departure: '아산캠퍼스_도착'
    });
    
    console.log(`삭제된 잘못된 시간표: ${result.deletedCount}개\n`);
    
    // 도착시간 = 출발시간인 잘못된 데이터 확인
    const invalid = await ShuttleBus.find({
      $expr: {
        $eq: ['$departureTime', '$arrivalTime']
      }
    }).lean();
    
    console.log(`도착시간 = 출발시간인 시간표: ${invalid.length}개`);
    if (invalid.length > 0) {
      console.log('예시:');
      invalid.slice(0, 5).forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.departure} -> ${s.arrival} | ${s.departureTime} -> ${s.arrivalTime}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

cleanup();

