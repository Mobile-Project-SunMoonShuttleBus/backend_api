const cron = require('node-cron');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { aggregateDaySnapshots } = require('./crowdSnapshotService');
const connectDB = require('../config/database');

let schedulerTask = null;

async function ensureDBConnection() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  
  await connectDB();
  
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
    console.log('혼잡도 집계 스케줄러가 이미 실행 중입니다.');
    return;
  }
  
  // 매일 자정에 전날 데이터 집계
  schedulerTask = cron.schedule('0 0 * * *', async () => {
    console.log('스케줄러 실행: 혼잡도 집계 시작');
    console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
    
    try {
      await ensureDBConnection();
      
      // 전날 날짜 계산
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dayKey = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
      
      console.log(`[혼잡도 집계] ${dayKey} 날짜 데이터 집계 시작`);
      const result = await aggregateDaySnapshots(dayKey);
      
      console.log(`[혼잡도 집계] 완료: ${result.processed}개 그룹, ${result.snapshots.length}개 스냅샷 생성`);
      console.log('혼잡도 집계 스케줄러 실행 완료\n');
    } catch (error) {
      console.error('혼잡도 집계 스케줄러 실행 중 오류:', error);
      if (error.stack) {
        console.error('오류 스택:', error.stack);
      }
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });
  
  console.log('혼잡도 집계 스케줄러 시작');
  console.log('스케줄: 매일 자정 (00:00, Asia/Seoul)');
}

function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('혼잡도 집계 스케줄러 중지됨');
  } else {
    console.log('실행 중인 혼잡도 집계 스케줄러가 없습니다.');
  }
}

async function runManually() {
  console.log('수동 실행: 혼잡도 집계 시작');
  console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
  
  try {
    await ensureDBConnection();
    
    // 전날 날짜 계산
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dayKey = yesterday.toISOString().split('T')[0];
    
    console.log(`[혼잡도 집계] ${dayKey} 날짜 데이터 집계 시작`);
    const result = await aggregateDaySnapshots(dayKey);
    
    console.log(`[혼잡도 집계] 완료: ${result.processed}개 그룹, ${result.snapshots.length}개 스냅샷 생성`);
    
    return {
      success: true,
      dayKey,
      result
    };
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

