const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');

async function checkSchedule() {
  try {
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    // 19:05 시간대의 천안 터미널 -> 아산캠퍼스 시간표 찾기
    const schedule = await ShuttleBus.findOne({
      departure: '천안 터미널',
      arrival: '아산캠퍼스',
      departureTime: '19:05',
      dayType: '평일'
    }).lean();
    
    if (schedule) {
      console.log('찾은 시간표:');
      console.log(JSON.stringify(schedule, null, 2));
      console.log(`\n출발시간: ${schedule.departureTime}`);
      console.log(`도착시간: ${schedule.arrivalTime}`);
      console.log(`출발지: ${schedule.departure}`);
      console.log(`도착지: ${schedule.arrival}`);
      console.log(`요일: ${schedule.dayType}`);
      console.log(`출처 URL: ${schedule.sourceUrl}`);
    } else {
      console.log('19:05 시간대 시간표를 찾을 수 없습니다.');
    }
    
    // 비슷한 시간대도 확인
    const similar = await ShuttleBus.find({
      departure: '천안 터미널',
      arrival: '아산캠퍼스',
      departureTime: { $regex: /^19:/ },
      dayType: '평일'
    }).lean();
    
    console.log(`\n19시대 천안 터미널 -> 아산캠퍼스 시간표: ${similar.length}개`);
    similar.forEach((s, idx) => {
      console.log(`${idx + 1}. ${s.departureTime} -> ${s.arrivalTime}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('오류:', error);
    process.exit(1);
  }
}

checkSchedule();

