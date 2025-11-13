const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const connectDB = require('../config/database');
const { runManually: runShuttleManually } = require('./shuttleBusScheduler');
const campusBusCrawler = require('./campusBusCrawlerService');

let hasRun = false;

async function runInitialCrawlers() {
  if (hasRun) {
    return;
  }
  hasRun = true;

  try {
    await connectDB();

    console.log('초기 크롤링 실행: 셔틀·통학 버스 데이터 동기화 시작');

    // 셔틀버스 데이터 크롤링
    try {
      const shuttleResult = await runShuttleManually();
      if (shuttleResult?.success) {
        console.log(
          `초기 셔틀 크롤링 완료: 총 ${shuttleResult.schedulesFound}개, 신규 ${shuttleResult.saved}개, 업데이트 ${shuttleResult.updated}개`
        );
      } else if (shuttleResult) {
        console.warn('초기 셔틀 크롤링 실패:', shuttleResult.error);
      }
    } catch (error) {
      console.error('초기 셔틀 크롤링 실행 중 오류:', error);
    }

    // 통학버스 데이터 크롤링
    try {
      const campusResult = await campusBusCrawler.crawlAndSave();
      if (campusResult?.success) {
        console.log(
          `초기 통학 크롤링 완료: 총 ${campusResult.schedulesFound}개, 신규 ${campusResult.saved}개, 업데이트 ${campusResult.updated}개`
        );
      } else if (campusResult) {
        console.warn('초기 통학 크롤링 실패:', campusResult.error);
      }
    } catch (error) {
      console.error('초기 통학 크롤링 실행 중 오류:', error);
    }

    console.log('초기 크롤링 실행: 완료');
  } catch (error) {
    console.error('초기 크롤링 실행 준비 중 오류:', error);
  }
}

module.exports = {
  runInitialCrawlers
};


