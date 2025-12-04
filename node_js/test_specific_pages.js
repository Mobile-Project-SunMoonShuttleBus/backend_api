const { crawlSingleUrl, CRAWL_URLS } = require('./src/services/shuttleBusCrawlerService');

(async () => {
  try {
    console.log('=== 천안역 페이지 크롤링 테스트 ===\n');
    const cheonanSchedules = await crawlSingleUrl('평일', '천안역', CRAWL_URLS.평일['천안역']);
    
    console.log(`총 ${cheonanSchedules.length}개 발견\n`);
    
    const cheonanToCampus = cheonanSchedules.filter(s => 
      s.departure === '천안역' && s.arrival === '아산캠퍼스'
    );
    console.log('천안역 → 아산캠퍼스:');
    cheonanToCampus.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });
    
    const campusToCheonan = cheonanSchedules.filter(s => 
      s.departure === '아산캠퍼스' && s.arrival === '천안역'
    );
    console.log('\n아산캠퍼스 → 천안역:');
    campusToCheonan.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });

    console.log('\n\n=== 온양역/아산터미널 페이지 크롤링 테스트 ===\n');
    const onyangSchedules = await crawlSingleUrl('평일', '온양역/아산터미널', CRAWL_URLS.평일['온양역/아산터미널']);
    
    console.log(`총 ${onyangSchedules.length}개 발견\n`);
    
    if (onyangSchedules.length > 0) {
      onyangSchedules.slice(0, 10).forEach(s => {
        console.log(`  ${s.departure} → ${s.arrival}, ${s.departureTime} → ${s.arrivalTime}`);
      });
    } else {
      console.log('  데이터가 없습니다!');
    }

    console.log('\n\n=== 천안 터미널 페이지 크롤링 테스트 ===\n');
    const terminalSchedules = await crawlSingleUrl('평일', '천안 터미널', CRAWL_URLS.평일['천안 터미널']);
    
    console.log(`총 ${terminalSchedules.length}개 발견\n`);
    
    const terminalToCampus = terminalSchedules.filter(s => 
      s.departure === '천안 터미널' && s.arrival === '아산캠퍼스'
    );
    console.log('천안 터미널 → 아산캠퍼스:');
    terminalToCampus.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });
    
    const campusToTerminal = terminalSchedules.filter(s => 
      s.departure === '아산캠퍼스' && s.arrival === '천안 터미널'
    );
    console.log('\n아산캠퍼스 → 천안 터미널:');
    campusToTerminal.slice(0, 5).forEach(s => {
      console.log(`  ${s.departureTime} → ${s.arrivalTime}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('에러:', error);
    process.exit(1);
  }
})();

