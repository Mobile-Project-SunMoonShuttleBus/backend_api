const { crawlAllSchedules } = require('./src/services/shuttleBusCrawlerService');

(async () => {
  try {
    console.log('크롤링 시작...');
    const schedules = await crawlAllSchedules();
    
    // 아산캠퍼스 -> 천안 아산역 중 9시 30분 데이터 확인
    const targetSchedules = schedules.filter(s => 
      s.departure === '아산캠퍼스' && 
      s.arrival === '천안 아산역' && 
      s.departureTime === '09:30' &&
      s.dayType === '평일'
    );
    
    console.log('\n=== 9시 30분 데이터 확인 ===');
    if (targetSchedules.length > 0) {
      console.log('발견된 9시 30분 데이터:');
      targetSchedules.forEach(s => {
        console.log(JSON.stringify(s, null, 2));
      });
    } else {
      console.log('9시 30분 데이터가 없습니다.');
    }
    
    // 전체 아산캠퍼스 -> 천안 아산역 시간표 확인
    const allSchedules = schedules.filter(s => 
      s.departure === '아산캠퍼스' && 
      s.arrival === '천안 아산역' &&
      s.dayType === '평일'
    );
    
    console.log('\n=== 전체 아산캠퍼스 -> 천안 아산역 시간표 ===');
    const times = allSchedules.map(s => s.departureTime).sort();
    console.log('출발 시간:', times.join(', '));
    console.log(`총 ${times.length}개`);
    
    process.exit(0);
  } catch (error) {
    console.error('에러:', error);
    process.exit(1);
  }
})();

