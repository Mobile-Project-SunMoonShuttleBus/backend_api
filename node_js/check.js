#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const connectDB = require('./src/config/database');
const ShuttleBus = require('./src/models/ShuttleBus');
const shuttleBusCrawler = require('./src/services/shuttleBusCrawlerService');

async function main() {
  try {
    await connectDB();
    
    console.log('기존 셔틀버스 데이터 삭제 중...');
    const deleteResult = await ShuttleBus.deleteMany({});
    console.log(`삭제 완료: ${deleteResult.deletedCount}개\n`);
    
    console.log('크롤링 시작...\n');
    const result = await shuttleBusCrawler.crawlAndSaveAll();
    
    if (!result.success) {
      console.error('크롤링 실패:', result.error);
      process.exit(1);
    }
    
    console.log(`\n크롤링 완료: ${result.schedulesFound}개 발견, 신규 ${result.saved}개, 업데이트 ${result.updated}개\n`);
    
    // DB 저장 예시 출력 (샘플 5개)
    console.log('\n' + '='.repeat(60));
    console.log('DB 저장 예시 (샘플 5개)');
    console.log('='.repeat(60));
    const sampleSchedules = await ShuttleBus.find({}).limit(5).sort({ createdAt: -1 });
    sampleSchedules.forEach((schedule, idx) => {
      console.log(`\n[샘플 ${idx + 1}]`);
      console.log(JSON.stringify({
        departure: schedule.departure,
        arrival: schedule.arrival,
        departureTime: schedule.departureTime,
        arrivalTime: schedule.arrivalTime,
        fridayOperates: schedule.fridayOperates,
        dayType: schedule.dayType,
        note: schedule.note,
        viaStops: schedule.viaStops,
        studentHallBoardingAvailable: schedule.studentHallBoardingAvailable
      }, null, 2));
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('저장된 데이터 확인 (전체)');
    console.log('='.repeat(60));
    
    const dayTypes = ['평일', '토요일/공휴일', '일요일'];
    
    for (const dayType of dayTypes) {
      console.log(`\n${dayType} 시간표`);
      console.log('-'.repeat(60));
      
      const schedules = await ShuttleBus.find({ dayType }).sort({ 
        departure: 1, 
        departureTime: 1 
      });
      
      const validSchedules = schedules.filter(s => {
        const isTimeFormat = /^\d{1,2}:\d{2}$/.test(s.departure) || /^\d{1,2}:\d{2}$/.test(s.arrival);
        const hasValidChars = /[가-힣]/.test(s.departure) && /[가-힣]/.test(s.arrival);
        return !isTimeFormat && hasValidChars;
      });
      
      const byDeparture = {};
      validSchedules.forEach(schedule => {
        if (!byDeparture[schedule.departure]) {
          byDeparture[schedule.departure] = [];
        }
        byDeparture[schedule.departure].push(schedule);
      });
      
      for (const [departure, deptSchedules] of Object.entries(byDeparture)) {
        console.log(`\n출발지: ${departure}`);
        
        const byArrival = {};
        deptSchedules.forEach(schedule => {
          if (!byArrival[schedule.arrival]) {
            byArrival[schedule.arrival] = [];
          }
          byArrival[schedule.arrival].push(schedule);
        });
        
        for (const [arrival, arrSchedules] of Object.entries(byArrival)) {
          console.log(`  도착지: ${arrival}`);
          
          arrSchedules
            .sort((a, b) => {
              const timeA = a.departureTime.split(':').map(Number);
              const timeB = b.departureTime.split(':').map(Number);
              return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
            })
            .forEach(schedule => {
              const fridayStatus = schedule.fridayOperates ? 'O' : 'X';
              const note = schedule.note ? ` (${schedule.note})` : '';
              const arrivalInfo = schedule.arrivalTime ? ` -> 도착 ${schedule.arrivalTime}` : '';
              const viaInfo = schedule.viaStops && schedule.viaStops.length > 0
                ? ` / 경유: ${schedule.viaStops.map(v => v.time ? `${v.name}(${v.time})` : v.name).join(', ')}`
                : '';
              const studentHallInfo = schedule.studentHallBoardingAvailable ? ' / 학생회관 탑승 가능' : '';
              console.log(`    ${schedule.departureTime}${arrivalInfo} - 금요일 운행: ${fridayStatus}${note}${viaInfo}${studentHallInfo}`);
            });
        }
      }
      
      console.log(`\n총 ${validSchedules.length}개`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('학생회관 탑승 가능 시간 목록');
    console.log('='.repeat(60));
    const studentHallSchedules = await ShuttleBus.find({
      studentHallBoardingAvailable: true
    }).sort({ dayType: 1, departure: 1, departureTime: 1 });
    
    if (studentHallSchedules.length === 0) {
      console.log('표시할 데이터가 없습니다.');
    } else {
      studentHallSchedules.forEach(schedule => {
        const viaInfo = schedule.viaStops && schedule.viaStops.length > 0
          ? ` / 경유: ${schedule.viaStops.map(v => v.time ? `${v.name}(${v.time})` : v.name).join(', ')}`
          : '';
        console.log(
          `[${schedule.dayType}] ${schedule.departure} -> ${schedule.arrival} ${schedule.departureTime}` +
          `${schedule.arrivalTime ? ` -> ${schedule.arrivalTime}` : ''}${viaInfo}` +
          `${schedule.note ? ` / 비고: ${schedule.note}` : ''}`
        );
      });
      console.log(`\n총 ${studentHallSchedules.length}개\n`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('출발지별 통계');
    console.log('='.repeat(60));
    
    const departureStats = await ShuttleBus.aggregate([
      {
        $group: {
          _id: '$departure',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    departureStats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count}개`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('도착지별 통계');
    console.log('='.repeat(60));
    
    const arrivalStats = await ShuttleBus.aggregate([
      {
        $group: {
          _id: '$arrival',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    arrivalStats.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count}개`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('경유지 통계');
    console.log('='.repeat(60));
    
    const viaStopsStats = await ShuttleBus.aggregate([
      { $unwind: { path: '$viaStops', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$viaStops.name',
          count: { $sum: 1 },
          dayTypes: { $addToSet: '$dayType' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    if (viaStopsStats.length === 0) {
      console.log('경유지 데이터가 없습니다.');
    } else {
      viaStopsStats.forEach(stat => {
        console.log(`  ${stat._id}: ${stat.count}회 (${stat.dayTypes.sort().join(', ')})`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('경유지 포함 시간표 샘플 (5개)');
    console.log('='.repeat(60));
    
    const viaStopsSamples = await ShuttleBus.find({
      'viaStops.0': { $exists: true }
    }).limit(5).sort({ createdAt: -1 });
    
    if (viaStopsSamples.length === 0) {
      console.log('경유지가 포함된 시간표가 없습니다.');
    } else {
      viaStopsSamples.forEach((schedule, idx) => {
        console.log(`\n[샘플 ${idx + 1}]`);
        console.log(`  ${schedule.departure} -> ${schedule.arrival}`);
        console.log(`  출발: ${schedule.departureTime}${schedule.arrivalTime ? ` / 도착: ${schedule.arrivalTime}` : ''}`);
        console.log(`  경유지: ${schedule.viaStops.map(v => v.time ? `${v.name}(${v.time})` : v.name).join(', ')}`);
        console.log(`  요일: ${schedule.dayType} / 금요일 운행: ${schedule.fridayOperates ? 'O' : 'X'}`);
        if (schedule.note) console.log(`  비고: ${schedule.note}`);
      });
    }
    
    console.log('\n확인 완료\n');
    
  } catch (error) {
    console.error('실행 실패:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

main();

