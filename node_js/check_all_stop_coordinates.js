// 모든 정류장 좌표 확인 및 검증 스크립트
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = require('./src/config/database');
const BusStop = require('./src/models/BusStop');
const ShuttleBus = require('./src/models/ShuttleBus');
const CampusBus = require('./src/models/CampusBus');
const { extractAllStopNames } = require('./src/services/busStopCoordinateService');
const { validateCoordinates } = require('./src/services/coordinateValidator');
const { getHardcodedStop } = require('./src/config/hardcodedStops');
const mongoose = require('mongoose');

async function checkAllStopCoordinates() {
  try {
    await connectDB();
    console.log('MongoDB 연결 성공\n');

    // 모든 정류장 이름 추출
    const allStopNames = await extractAllStopNames();
    console.log(`총 ${allStopNames.length}개 정류장 발견\n`);

    // DB에서 좌표 조회
    const dbStops = await BusStop.find({ name: { $in: allStopNames } });
    const dbStopMap = new Map(dbStops.map(stop => [stop.name, stop]));

    const results = {
      total: allStopNames.length,
      hasCoordinates: 0,
      missingCoordinates: [],
      invalidCoordinates: [],
      hardcodedOnly: []
    };

    console.log('=== 정류장 좌표 확인 결과 ===\n');

    for (const stopName of allStopNames) {
      const dbStop = dbStopMap.get(stopName);
      const hardcodedStop = getHardcodedStop(stopName);

      if (dbStop) {
        // DB에 좌표가 있는 경우 검증
        const validation = validateCoordinates(stopName, dbStop.latitude, dbStop.longitude);
        
        if (validation.isValid) {
          results.hasCoordinates++;
          console.log(`✓ ${stopName}: 좌표 있음 (${dbStop.latitude}, ${dbStop.longitude})`);
        } else {
          results.invalidCoordinates.push({
            name: stopName,
            latitude: dbStop.latitude,
            longitude: dbStop.longitude,
            errors: validation.errors
          });
          console.log(`✗ ${stopName}: 잘못된 좌표 (${dbStop.latitude}, ${dbStop.longitude})`);
          console.log(`  오류: ${validation.errors.join(', ')}`);
        }
      } else if (hardcodedStop) {
        // 하드코딩된 좌표만 있는 경우
        results.hardcodedOnly.push({
          name: stopName,
          latitude: hardcodedStop.latitude,
          longitude: hardcodedStop.longitude,
          source: 'hardcoded'
        });
        console.log(`⚠ ${stopName}: 하드코딩된 좌표만 있음 (${hardcodedStop.latitude}, ${hardcodedStop.longitude})`);
      } else {
        // 좌표가 전혀 없는 경우
        results.missingCoordinates.push(stopName);
        console.log(`✗ ${stopName}: 좌표 없음`);
      }
    }

    console.log('\n=== 요약 ===');
    console.log(`총 정류장: ${results.total}개`);
    console.log(`좌표 있음 (DB): ${results.hasCoordinates}개`);
    console.log(`하드코딩만 있음: ${results.hardcodedOnly.length}개`);
    console.log(`좌표 없음: ${results.missingCoordinates.length}개`);
    console.log(`잘못된 좌표: ${results.invalidCoordinates.length}개`);

    if (results.missingCoordinates.length > 0) {
      console.log('\n=== 좌표가 없는 정류장 ===');
      results.missingCoordinates.forEach(name => console.log(`  - ${name}`));
    }

    if (results.invalidCoordinates.length > 0) {
      console.log('\n=== 잘못된 좌표를 가진 정류장 ===');
      results.invalidCoordinates.forEach(item => {
        console.log(`  - ${item.name}: (${item.latitude}, ${item.longitude})`);
        console.log(`    오류: ${item.errors.join(', ')}`);
      });
    }

    if (results.hardcodedOnly.length > 0) {
      console.log('\n=== 하드코딩된 좌표만 있는 정류장 ===');
      results.hardcodedOnly.forEach(item => {
        console.log(`  - ${item.name}: (${item.latitude}, ${item.longitude})`);
      });
    }

    await mongoose.disconnect();
    return results;
  } catch (error) {
    console.error('오류 발생:', error);
    await mongoose.disconnect();
    throw error;
  }
}

if (require.main === module) {
  checkAllStopCoordinates()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { checkAllStopCoordinates };

