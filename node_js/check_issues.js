const mongoose = require('mongoose');
const ShuttleBus = require('./src/models/ShuttleBus');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://database:27017/shuttle_bus', {
      authSource: 'admin',
      user: process.env.MONGODB_USER || 'admin',
      pass: process.env.MONGODB_PASS || 'password'
    });

    console.log('=== 천안역 → 아산캠퍼스 데이터 확인 ===');
    const cheonanToCampus = await ShuttleBus.find({
      departure: '천안역',
      arrival: '아산캠퍼스',
      dayType: '평일'
    }).limit(5).sort({ departureTime: 1 });
    
    cheonanToCampus.forEach(s => {
      console.log(`${s.departureTime} → ${s.arrivalTime}`);
    });

    console.log('\n=== 온양역/아산터미널 데이터 확인 ===');
    const onyang = await ShuttleBus.find({
      $or: [
        { departure: '온양역/아산터미널' },
        { arrival: '온양역/아산터미널' },
        { departure: '온양온천역' },
        { arrival: '온양온천역' }
      ],
      dayType: '평일'
    }).limit(10);
    
    console.log(`총 ${onyang.length}개 발견`);
    onyang.forEach(s => {
      console.log(`${s.departure} → ${s.arrival}, ${s.departureTime} → ${s.arrivalTime}`);
    });

    console.log('\n=== 천안 터미널 → 아산캠퍼스 데이터 확인 ===');
    const terminalToCampus = await ShuttleBus.find({
      departure: '천안 터미널',
      arrival: '아산캠퍼스',
      dayType: '평일'
    }).limit(5).sort({ departureTime: 1 });
    
    terminalToCampus.forEach(s => {
      console.log(`${s.departureTime} → ${s.arrivalTime}`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('에러:', error);
    process.exit(1);
  }
})();

