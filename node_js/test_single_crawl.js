const { crawlSingleUrl } = require('./src/services/shuttleBusCrawlerService');

(async () => {
  try {
    console.log('단일 URL 크롤링 테스트...');
    const schedules = await crawlSingleUrl('평일', '아산캠퍼스', 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_01.aspx');
    console.log('\n결과:', schedules.length);
    if (schedules.length > 0) {
      console.log('첫 3개:');
      schedules.slice(0, 3).forEach(s => {
        console.log(`  ${s.departure} -> ${s.arrival}: ${s.departureTime} -> ${s.arrivalTime}`);
        if (s.viaStops && s.viaStops.length > 0) {
          console.log(`    경유지: ${s.viaStops.map(v => `${v.name}(${v.time || v.rawText || 'null'})`).join(', ')}`);
        }
      });
    } else {
      console.log('시간표가 없습니다.');
    }
  } catch (e) {
    console.error('에러:', e.message);
    if (e.stack) console.error(e.stack);
  }
  process.exit(0);
})();

