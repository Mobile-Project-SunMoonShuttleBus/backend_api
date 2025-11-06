const cron = require('node-cron');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const shuttleBusCrawler = require('./shuttleBusCrawlerService');
const connectDB = require('../config/database');

// 셔틀버스 시간표 자동 크롤링
let schedulerTask = null;

// DB 연결 확인 및 연결
async function ensureDBConnection() {
  if (mongoose.connection.readyState === 1) {
    return; // 이미 연결됨
  }
  
  // DB 연결 시도
  await connectDB();
  
  // 연결 확인 대기
  let retries = 0;
  while (mongoose.connection.readyState !== 1 && retries < 10) {
    await new Promise(resolve => setTimeout(resolve, 1000));
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

// 스케줄러 수동 실행
async function runManually() {
  console.log('수동 실행: 셔틀버스 시간표 크롤링 시작');
  console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
  
  try {
    // DB 연결 확인
    await ensureDBConnection();
    console.log('MongoDB 연결 확인 완료');
    
    const result = await shuttleBusCrawler.crawlAndSaveAll();
    
    if (result.success) {
      console.log('수동 실행 완료');
      console.log(`발견된 시간표: ${result.schedulesFound}개`);
      console.log(`신규 저장: ${result.saved}개`);
      console.log(`업데이트: ${result.updated}개`);
    } else {
      console.error('수동 실행 실패:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('수동 실행 중 오류:', error);
    throw error;
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  runManually
};

