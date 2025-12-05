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

    // 셔틀버스 데이터 크롤링 (임시 비활성화: 공지사항 크롤링 테스트 우선)
    // TODO: 시간표 크롤링이 특정 페이지에서 멈추는 문제 해결 후 재활성화 필요
    console.log('[초기화] 셔틀 시간표 자동 크롤링은 일시적으로 비활성화했습니다. (공지사항 크롤링 테스트 우선)');
    /*
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
    */

    // 통학버스 데이터 크롤링 (임시 비활성화: 공지사항 크롤링 테스트 우선)
    console.log('[초기화] 통학버스 자동 크롤링은 일시적으로 비활성화했습니다. (공지사항 크롤링 테스트 우선)');
    /*
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
    */

    // 정류장 좌표 자동 조회 및 저장 (비활성화: 공지사항 크롤링 우선)
    // 환경 변수 ENABLE_STOP_COORDINATE_UPDATE=true로 활성화 가능
    if (process.env.ENABLE_STOP_COORDINATE_UPDATE === 'true') {
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
    } else {
      console.log('정류장 좌표 업데이트 건너뜀 (ENABLE_STOP_COORDINATE_UPDATE=false 또는 미설정)');
    }

    console.log('초기 크롤링 실행: 완료');
  } catch (error) {
    console.error('초기 크롤링 실행 준비 중 오류:', error);
  }
}

module.exports = {
  runInitialCrawlers
};


