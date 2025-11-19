const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const connectDB = require('../config/database');
const { runManually: runShuttleManually } = require('./shuttleBusScheduler');
const campusBusCrawler = require('./campusBusCrawlerService');
const { updateStopCoordinates } = require('./busStopCoordinateService');

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

    // 정류장 좌표 자동 조회 및 저장
    // 정확한 좌표를 위해 특정 정류장은 강제 재조회
    try {
      const { updateStopCoordinates } = require('./busStopCoordinateService');
      const forceUpdateList = ['천안 아산역', '천안역', '천안 터미널', '온양온천역'];
      const coordinateResult = await updateStopCoordinates(forceUpdateList);
      if (coordinateResult?.success) {
        console.log(
          `정류장 좌표 업데이트 완료: 총 ${coordinateResult.total}개, 기존 ${coordinateResult.existing}개, 신규 ${coordinateResult.new}개, 성공 ${coordinateResult.successCount}개`
        );
      } else if (coordinateResult) {
        console.warn('정류장 좌표 업데이트 실패:', coordinateResult.error);
      }
    } catch (error) {
      console.error('정류장 좌표 업데이트 실행 중 오류:', error);
    }

    console.log('초기 크롤링 실행: 완료');
  } catch (error) {
    console.error('초기 크롤링 실행 준비 중 오류:', error);
  }
}

module.exports = {
  runInitialCrawlers
};


