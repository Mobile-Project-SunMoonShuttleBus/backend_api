const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const { crawlAllSchedules } = require('./src/services/shuttleBusCrawlerService');
const ShuttleBus = require('./src/models/ShuttleBus');

(async () => {
  try {
    await connectDB();
    console.log('=== 크롤링 시작 ===\n');
    
    const schedules = await crawlAllSchedules();
    console.log(`\n총 ${schedules.length}개 시간표 발견\n`);
    
    // 천안역 → 아산캠퍼스 확인
    console.log('=== 천안역 → 아산캠퍼스 (평일) ===');
    const cheonanToCampus = schedules.filter(s => 
      s.departure === '천안역' && s.arrival === '아산캠퍼스' && s.dayType === '평일'
    );
    console.log(`총 ${cheonanToCampus.length}개`);
    cheonanToCampus.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });
    
    // 아산캠퍼스 → 천안역 확인
    console.log('\n=== 아산캠퍼스 → 천안역 (평일) ===');
    const campusToCheonan = schedules.filter(s => 
      s.departure === '아산캠퍼스' && s.arrival === '천안역' && s.dayType === '평일'
    );
    console.log(`총 ${campusToCheonan.length}개`);
    campusToCheonan.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });
    
    // 온양역/아산터미널 확인
    console.log('\n=== 온양역/아산터미널 데이터 ===');
    const onyang = schedules.filter(s => 
      s.departure === '온양역/아산터미널' || 
      s.arrival === '온양역/아산터미널' ||
      s.departure === '온양온천역' ||
      s.arrival === '온양온천역'
    );
    console.log(`총 ${onyang.length}개`);
    onyang.slice(0, 10).forEach(s => {
      console.log(`  ${s.departure} → ${s.arrival}, ${s.departureTime} → ${s.arrivalTime}`);
    });
    
    // 천안 터미널 → 아산캠퍼스 확인
    console.log('\n=== 천안 터미널 → 아산캠퍼스 (평일) ===');
    const terminalToCampus = schedules.filter(s => 
      s.departure === '천안 터미널' && s.arrival === '아산캠퍼스' && s.dayType === '평일'
    );
    console.log(`총 ${terminalToCampus.length}개`);
    terminalToCampus.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });
    
    // 아산캠퍼스 → 천안 터미널 확인
    console.log('\n=== 아산캠퍼스 → 천안 터미널 (평일) ===');
    const campusToTerminal = schedules.filter(s => 
      s.departure === '아산캠퍼스' && s.arrival === '천안 터미널' && s.dayType === '평일'
    );
    console.log(`총 ${campusToTerminal.length}개`);
    campusToTerminal.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });
    
    await connectDB().then(mongoose => mongoose.connection.close());
    process.exit(0);
  } catch (error) {
    console.error('에러:', error);
    process.exit(1);
  }
})();

