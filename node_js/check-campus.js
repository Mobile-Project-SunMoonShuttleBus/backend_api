#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const connectDB = require('./src/config/database');
const CampusBus = require('./src/models/CampusBus');
const campusBusCrawler = require('./src/services/campusBusCrawlerService');

async function main() {
  try {
    await connectDB();
    
    console.log('기존 통학버스 데이터 삭제 중...');
    const deleteResult = await CampusBus.deleteMany({});
    console.log(`삭제 완료: ${deleteResult.deletedCount}개\n`);
    
    console.log('크롤링 시작...\n');
    const result = await campusBusCrawler.crawlAndSave();
    
    if (!result.success) {
      console.error('크롤링 실패:', result.error);
      process.exit(1);
    }
    
    console.log(`\n크롤링 완료: ${result.schedulesFound}개 발견, 신규 ${result.saved}개, 업데이트 ${result.updated}개\n`);
    
    // DB 저장 예시 출력 (샘플 5개)
    console.log('\n' + '='.repeat(60));
    console.log('DB 저장 예시 (샘플 5개)');
    console.log('='.repeat(60));
    const sampleSchedules = await CampusBus.find({}).limit(5).sort({ createdAt: -1 });
    sampleSchedules.forEach((schedule, idx) => {
      console.log(`\n[샘플 ${idx + 1}]`);
      console.log(JSON.stringify({
        departure: schedule.departure,
        arrival: schedule.arrival,
        departureTime: schedule.departureTime,
        arrivalTime: schedule.arrivalTime,
        direction: schedule.direction,
        dayType: schedule.dayType,
        note: schedule.note,
        viaStops: schedule.viaStops
      }, null, 2));
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('저장된 데이터 확인 (전체)');
    console.log('='.repeat(60));
    
    const dayTypes = ['월~목', '금요일'];
    const directions = ['등교', '하교'];
    
    for (const direction of directions) {
      for (const dayType of dayTypes) {
        const count = await CampusBus.countDocuments({ direction, dayType });
        if (count > 0) {
          console.log(`\n[${direction} - ${dayType}] 총 ${count}개`);
          
          const schedules = await CampusBus.find({ direction, dayType })
            .sort({ departure: 1, departureTime: 1 })
            .limit(10);
          
          schedules.forEach((schedule) => {
            const viaInfo = schedule.viaStops && schedule.viaStops.length > 0
              ? ` / 경유: ${schedule.viaStops.map(v => v.name).join(', ')}`
              : '';
            const note = schedule.note ? ` / ${schedule.note}` : '';
            console.log(`    ${schedule.departure} → ${schedule.arrival} / ${schedule.departureTime}${viaInfo}${note}`);
          });
          
          if (count > 10) {
            console.log(`    ... 외 ${count - 10}개 더 있음`);
          }
        }
      }
    }
    
    // 출발지별 통계
    console.log('\n' + '='.repeat(60));
    console.log('출발지별 통계');
    console.log('='.repeat(60));
    const departureStats = await CampusBus.aggregate([
      {
        $group: {
          _id: '$departure',
          count: { $sum: 1 },
          directions: { $addToSet: '$direction' },
          dayTypes: { $addToSet: '$dayType' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    departureStats.forEach(({ _id, count, directions, dayTypes }) => {
      console.log(`\n${_id}: ${count}개`);
      console.log(`  방향: ${directions.join(', ')}`);
      console.log(`  요일: ${dayTypes.join(', ')}`);
    });
    
    // 도착지별 통계
    console.log('\n' + '='.repeat(60));
    console.log('도착지별 통계');
    console.log('='.repeat(60));
    const arrivalStats = await CampusBus.aggregate([
      {
        $group: {
          _id: '$arrival',
          count: { $sum: 1 },
          directions: { $addToSet: '$direction' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    arrivalStats.forEach(({ _id, count, directions }) => {
      console.log(`${_id}: ${count}개 (${directions.join(', ')})`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('테스트 완료!');
    console.log('='.repeat(60));
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('오류 발생:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

main();

