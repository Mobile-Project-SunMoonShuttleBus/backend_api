const cron = require('node-cron');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { crawlAndSaveTimetable } = require('./timetableCrawlerService');
const SchoolAccount = require('../models/SchoolAccount');
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
    console.log('시간표 스케줄러가 이미 실행 중입니다.');
    return;
  }
  
  schedulerTask = cron.schedule('0 2 * * *', async () => {
    console.log('스케줄러 실행: 시간표 자동 크롤링 시작');
    console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
    
    try {
      await ensureDBConnection();
      
      const schoolAccounts = await SchoolAccount.find({}).populate('userId', 'userId');
      console.log(`포털 계정 정보가 있는 사용자: ${schoolAccounts.length}명`);
      
      let successCount = 0;
      let failCount = 0;
      
      for (const account of schoolAccounts) {
        try {
          console.log(`\n사용자 ${account.schoolId} 시간표 크롤링 중...`);
          const result = await crawlAndSaveTimetable(account.userId);
          
          if (result.success) {
            console.log(`${account.schoolId}: ${result.count}개 시간표 저장 완료`);
            successCount++;
          } else {
            console.error(`${account.schoolId}: 크롤링 실패 - ${result.error}`);
            failCount++;
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`${account.schoolId}: 크롤링 오류 - ${error.message}`);
          failCount++;
        }
      }
      
      console.log(`\n스케줄러 실행 완료: 성공 ${successCount}명, 실패 ${failCount}명`);
    } catch (error) {
      console.error('스케줄러 실행 중 오류:', error);
    }
    
    console.log('시간표 자동 크롤링 스케줄러 실행 완료\n');
  }, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });
  
  console.log('시간표 자동 크롤링 스케줄러 시작');
  console.log('스케줄: 매일 오전 2시 (Asia/Seoul)');
}

function stopScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('시간표 스케줄러 중지됨');
  } else {
    console.log('실행 중인 시간표 스케줄러가 없습니다.');
  }
}

async function runManually() {
  console.log('수동 실행: 시간표 자동 크롤링 시작');
  console.log(`실행 시간: ${new Date().toLocaleString('ko-KR')}`);
  
  try {
    await ensureDBConnection();
    
    const schoolAccounts = await SchoolAccount.find({}).populate('userId', 'userId');
    console.log(`포털 계정 정보가 있는 사용자: ${schoolAccounts.length}명`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const account of schoolAccounts) {
      try {
        console.log(`\n사용자 ${account.schoolId} 시간표 크롤링 중...`);
        const result = await crawlAndSaveTimetable(account.userId);
        
        if (result.success) {
          console.log(`${account.schoolId}: ${result.count}개 시간표 저장 완료`);
          successCount++;
        } else {
          console.error(`${account.schoolId}: 크롤링 실패 - ${result.error}`);
          failCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`${account.schoolId}: 크롤링 오류 - ${error.message}`);
        failCount++;
      }
    }
    
    console.log(`\n수동 실행 완료: 성공 ${successCount}명, 실패 ${failCount}명`);
    
    return {
      success: true,
      total: schoolAccounts.length,
      successCount,
      failCount
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

