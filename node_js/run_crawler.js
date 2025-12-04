const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDB = require('./src/config/database');
const { runManually: runShuttleManually } = require('./src/services/shuttleBusScheduler');
const campusBusCrawler = require('./src/services/campusBusCrawlerService');

async function runCrawlers() {
  try {
    console.log('=== 크롤러 재실행 시작 ===\n');
    
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    // 셔틀버스 크롤링
    console.log('1. 셔틀버스 크롤링 시작...');
    try {
      const shuttleResult = await runShuttleManually();
      if (shuttleResult?.success) {
        console.log(`✅ 셔틀버스 크롤링 완료: 총 ${shuttleResult.schedulesFound}개, 신규 ${shuttleResult.saved}개, 업데이트 ${shuttleResult.updated}개\n`);
      } else {
        console.error(`❌ 셔틀버스 크롤링 실패: ${shuttleResult?.error}\n`);
      }
    } catch (error) {
      console.error(`❌ 셔틀버스 크롤링 오류: ${error.message}\n`);
    }
    
    // 통학버스 크롤링
    console.log('2. 통학버스 크롤링 시작...');
    try {
      const campusResult = await campusBusCrawler.crawlAndSave();
      if (campusResult?.success) {
        console.log(`✅ 통학버스 크롤링 완료: 총 ${campusResult.schedulesFound}개, 신규 ${campusResult.saved}개, 업데이트 ${campusResult.updated}개\n`);
      } else {
        console.error(`❌ 통학버스 크롤링 실패: ${campusResult?.error}\n`);
      }
    } catch (error) {
      console.error(`❌ 통학버스 크롤링 오류: ${error.message}\n`);
    }
    
    console.log('=== 크롤러 재실행 완료 ===');
    process.exit(0);
  } catch (error) {
    console.error('크롤러 실행 중 오류:', error);
    process.exit(1);
  }
}

runCrawlers();

