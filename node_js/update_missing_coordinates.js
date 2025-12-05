// 누락된 정류장 좌표를 네이버 API로 조회하여 저장하는 스크립트
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = require('./src/config/database');
const BusStop = require('./src/models/BusStop');
const { extractAllStopNames } = require('./src/services/busStopCoordinateService');
const { searchStopCoordinates } = require('./src/services/naverMapService');
const { validateCoordinates } = require('./src/services/coordinateValidator');
const { transformStopName } = require('./src/services/stopNameTransformer');
const { updateViaStopCoordinates, viaStopSearchQueries } = require('./src/services/viaStopCoordinateUpdater');
const mongoose = require('mongoose');

async function updateMissingCoordinates(forceUpdateAll = false) {
  try {
    await connectDB();
    console.log('MongoDB 연결 성공\n');

    // 네이버 API 키 확인
    const NAVER_API_KEY_ID = process.env.NAVER_CLIENT_ID;
    const NAVER_API_KEY = process.env.NAVER_CLIENT_SECRET;
    
    if (!NAVER_API_KEY_ID || !NAVER_API_KEY) {
      console.error('네이버 API 키가 설정되지 않았습니다.');
      console.error('NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경 변수를 설정해주세요.');
      process.exit(1);
    }

    // 모든 정류장 이름 추출
    const allStopNames = await extractAllStopNames();
    console.log(`총 ${allStopNames.length}개 정류장 발견\n`);

    // DB에서 좌표 조회
    const dbStops = await BusStop.find({ name: { $in: allStopNames } });
    const dbStopMap = new Map(dbStops.map(stop => [stop.name, stop]));

    // 좌표가 없거나 잘못된 정류장 찾기
    const missingOrInvalidStops = [];
    
    for (const stopName of allStopNames) {
      const dbStop = dbStopMap.get(stopName);
      
      if (!dbStop) {
        // 좌표가 없는 경우
        missingOrInvalidStops.push({
          name: stopName,
          reason: '좌표 없음'
        });
      } else if (forceUpdateAll) {
        // 강제 업데이트 모드
        missingOrInvalidStops.push({
          name: stopName,
          reason: '강제 업데이트',
          existing: { lat: dbStop.latitude, lng: dbStop.longitude }
        });
      } else {
        // 좌표 검증
        const validation = validateCoordinates(stopName, dbStop.latitude, dbStop.longitude);
        if (!validation.isValid) {
          missingOrInvalidStops.push({
            name: stopName,
            reason: '잘못된 좌표',
            errors: validation.errors,
            existing: { lat: dbStop.latitude, lng: dbStop.longitude }
          });
        }
      }
    }

    if (missingOrInvalidStops.length === 0) {
      console.log('모든 정류장에 유효한 좌표가 있습니다.\n');
      await mongoose.disconnect();
      return { success: true, updated: 0 };
    }

    console.log(`좌표 조회가 필요한 정류장: ${missingOrInvalidStops.length}개\n`);
    missingOrInvalidStops.forEach(item => {
      console.log(`  - ${item.name}: ${item.reason}`);
      if (item.existing) {
        console.log(`    기존 좌표: (${item.existing.lat}, ${item.existing.lng})`);
      }
    });
    console.log('');

    // 네이버 API로 좌표 조회 및 저장
    let successCount = 0;
    let failCount = 0;
    const failedStops = [];

    for (const item of missingOrInvalidStops) {
      try {
        const stopName = item.name;
        console.log(`\n[${successCount + failCount + 1}/${missingOrInvalidStops.length}] ${stopName} 좌표 조회 중...`);

        // 원본 이름으로 먼저 시도
        let result = await searchStopCoordinates(stopName);

        // 검색 실패 시 변환된 이름으로 재시도
        if (!result.success) {
          const transformedNames = transformStopName(stopName);
          
          for (const transformedName of transformedNames.slice(1)) {
            console.log(`  → 변환된 이름으로 재시도: ${transformedName}`);
            result = await searchStopCoordinates(transformedName);
            
            if (result.success) {
              console.log(`  ✓ 변환된 이름 "${transformedName}"으로 좌표 조회 성공`);
              break;
            }
            
            // 네이버 API 호출 제한을 위한 딜레이
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // 경유지 특별 검색어가 있는 경우 시도
        if (!result.success && viaStopSearchQueries[stopName]) {
          console.log(`  → 경유지 특별 검색어로 재시도...`);
          const viaResult = await updateViaStopCoordinates([stopName]);
          if (viaResult.success && viaResult.updated.length > 0) {
            const updated = viaResult.updated[0];
            result = {
              success: true,
              latitude: updated.latitude,
              longitude: updated.longitude,
              address: updated.address,
              title: stopName
            };
            console.log(`  ✓ 경유지 특별 검색으로 좌표 조회 성공`);
          }
        }

        if (result.success) {
          // 좌표 검증
          const validation = validateCoordinates(stopName, result.latitude, result.longitude);
          
          if (!validation.isValid) {
            console.log(`  ✗ 조회된 좌표가 유효하지 않음: ${validation.errors.join(', ')}`);
            failCount++;
            failedStops.push({
              name: stopName,
              error: `유효하지 않은 좌표: ${validation.errors.join(', ')}`,
              coordinates: { lat: result.latitude, lng: result.longitude }
            });
            continue;
          }

          // DB에 저장 또는 업데이트
          await BusStop.findOneAndUpdate(
            { name: stopName },
            {
              name: stopName,
              latitude: result.latitude,
              longitude: result.longitude,
              naverPlaceId: result.naverPlaceId || null,
              naverAddress: result.address || null,
              naverTitle: result.title || null,
              lastUpdated: new Date()
            },
            { upsert: true, new: true }
          );

          successCount++;
          console.log(`  ✓ ${stopName} 좌표 저장 완료: (${result.latitude}, ${result.longitude})`);
          if (result.address) {
            console.log(`    주소: ${result.address}`);
          }
        } else {
          console.log(`  ✗ ${stopName} 좌표 조회 실패: ${result.error}`);
          failCount++;
          failedStops.push({
            name: stopName,
            error: result.error
          });
        }

        // 네이버 API 호출 제한을 위한 딜레이 (초당 10회 제한)
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`  ✗ ${item.name} 처리 중 오류:`, error.message);
        failCount++;
        failedStops.push({
          name: item.name,
          error: error.message
        });
      }
    }

    console.log('\n=== 업데이트 완료 ===');
    console.log(`성공: ${successCount}개`);
    console.log(`실패: ${failCount}개`);
    
    if (failedStops.length > 0) {
      console.log('\n실패한 정류장:');
      failedStops.forEach(item => {
        console.log(`  - ${item.name}: ${item.error}`);
      });
    }

    await mongoose.disconnect();
    return {
      success: true,
      total: missingOrInvalidStops.length,
      updated: successCount,
      failed: failCount,
      failedStops
    };
  } catch (error) {
    console.error('오류 발생:', error);
    await mongoose.disconnect();
    throw error;
  }
}

if (require.main === module) {
  const forceUpdateAll = process.argv.includes('--force-all');
  
  if (forceUpdateAll) {
    console.log('⚠️  강제 업데이트 모드: 모든 정류장 좌표를 재조회합니다.\n');
  }
  
  updateMissingCoordinates(forceUpdateAll)
    .then(result => {
      if (result.success && result.updated > 0) {
        console.log(`\n✅ ${result.updated}개 정류장 좌표 업데이트 완료`);
      } else if (result.success && result.updated === 0) {
        console.log('\n✅ 모든 정류장에 유효한 좌표가 있습니다.');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { updateMissingCoordinates };

