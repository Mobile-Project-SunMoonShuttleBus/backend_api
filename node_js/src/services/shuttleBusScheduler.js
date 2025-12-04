const cron = require('node-cron');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const shuttleBusCrawler = require('./shuttleBusCrawlerService');
const connectDB = require('../config/database');

// 셔틀버스 시간표 자동 크롤링
let schedulerTask = null;

// DB 연결 확인 및 연결 (타임아웃 적용)
async function ensureDBConnection(maxTime = 2000) {
  if (mongoose.connection.readyState === 1) {
    return; // 이미 연결됨
  }
  
  const startTime = Date.now();
  
  // DB 연결 시도 (타임아웃 적용)
  try {
    await Promise.race([
      connectDB(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DB 연결 타임아웃')), maxTime)
      )
    ]);
  } catch (error) {
    // 타임아웃이면 즉시 throw
    if (error.message.includes('타임아웃')) {
      throw error;
    }
    // 다른 에러는 무시하고 연결 상태만 확인
  }
  
  // 연결 확인 대기 (타임아웃 적용)
  let retries = 0;
  while (mongoose.connection.readyState !== 1 && retries < 3) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxTime) {
      throw new Error('MongoDB 연결 확인 타임아웃');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  
  if (mongoose.connection.readyState !== 1) {
    throw new Error('MongoDB 연결 실패: 타임아웃');
  }
}

function startScheduler() {
  if (schedulerTask) {
    console.log('스케줄러가 이미 실행 중입니다.');
    return;
  }
  
  // 매일 실행
  schedulerTask = cron.schedule('0 9 * * *', async () => {
    console.log('스케줄러 실행: 셔틀버스 시간표 크롤링 시작');
    console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
    
    try {
      // DB 연결 확인
      await ensureDBConnection();
      
      const result = await shuttleBusCrawler.crawlAndSaveAll();
      
      if (result.success) {
        console.log('스케줄러 실행 완료');
        console.log(`발견된 시간표: ${result.schedulesFound}개`);
        console.log(`신규 저장: ${result.saved}개`);
        console.log(`업데이트: ${result.updated}개`);
      } else {
        console.error('스케줄러 실행 실패:', result.error);
      }
    } catch (error) {
      console.error('스케줄러 실행 중 오류:', error);
    }
    
    console.log('스케줄러 실행 완료\n');
  }, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });
  
  console.log('셔틀버스 시간표 자동 크롤링 스케줄러 시작');
  console.log('스케줄: 매일 (Asia/Seoul)');
}


function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('스케줄러 중지됨');
  } else {
    console.log('실행 중인 스케줄러가 없습니다.');
  }
}

// 스케줄러 수동 실행 (강제 타임아웃 적용)
async function runManually() {
  console.log('수동 실행: 셔틀버스 시간표 크롤링 시작');
  console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
  
  const TOTAL_TIMEOUT = 25000; // 전체 최대 25초
  const startTime = Date.now();
  
  // 강제 타임아웃: 절대 25초를 넘지 않도록
  const forceTimeout = new Promise((_, reject) => {
    setTimeout(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      reject(new Error(`강제 타임아웃: ${elapsed}초 경과 (${TOTAL_TIMEOUT/1000}초 초과)`));
    }, TOTAL_TIMEOUT);
  });
  
  try {
    // DB 연결 확인 (최대 2초)
    const dbStart = Date.now();
    console.log('[타임 측정] DB 연결 시작...');
    
    await Promise.race([
      ensureDBConnection(2000),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DB 연결 타임아웃')), 2000)
      ),
      forceTimeout
    ]);
    
    const dbElapsed = ((Date.now() - dbStart) / 1000).toFixed(1);
    console.log(`[타임 측정] MongoDB 연결 완료 (${dbElapsed}초)`);
    
    // 남은 시간 체크
    const elapsed = Date.now() - startTime;
    const remainingTime = TOTAL_TIMEOUT - elapsed;
    
    if (remainingTime < 3000) {
      throw new Error(`타임아웃: DB 연결에 시간이 너무 오래 걸림 (${(elapsed/1000).toFixed(1)}초 경과)`);
    }
    
    // 크롤링 실행 (남은 시간과 전체 타임아웃 모두 체크)
    const crawlStart = Date.now();
    console.log(`[타임 측정] 크롤링 시작 (남은 시간: ${(remainingTime/1000).toFixed(1)}초)...`);
    
    const result = await Promise.race([
      shuttleBusCrawler.crawlAndSaveAll(),
      new Promise((_, reject) => {
        setTimeout(() => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          reject(new Error(`크롤링 타임아웃 (${elapsed}초 경과)`));
        }, remainingTime);
      }),
      forceTimeout
    ]);
    
    const crawlElapsed = ((Date.now() - crawlStart) / 1000).toFixed(1);
    console.log(`[타임 측정] 크롤링 완료 (${crawlElapsed}초)`);
    
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    if (result.success) {
      console.log(`수동 실행 완료 (전체 소요시간: ${totalElapsed}초)`);
      console.log(`발견된 시간표: ${result.schedulesFound}개`);
      console.log(`신규 저장: ${result.saved}개`);
      console.log(`업데이트: ${result.updated}개`);
    } else {
      console.error(`수동 실행 실패 (전체 소요시간: ${totalElapsed}초):`, result.error);
    }
    
    return result;
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`수동 실행 중 오류 (전체 소요시간: ${elapsed}초):`, error.message);
    throw error;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runManually
};

