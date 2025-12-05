const BusStop = require('../models/BusStop');
const ShuttleBus = require('../models/ShuttleBus');
const CampusBus = require('../models/CampusBus');
const { searchStopCoordinates } = require('./naverMapService');
const { transformStopName } = require('./stopNameTransformer');
const { getHardcodedStop } = require('../config/hardcodedStops');

// 정류장 목록 추출
async function extractAllStopNames() {
  const stopNames = new Set();

  // 셔틀버스 정류장 추출
  const shuttleBuses = await ShuttleBus.find({}, { departure: 1, arrival: 1, viaStops: 1 });
  shuttleBuses.forEach(bus => {
    if (bus.departure) stopNames.add(bus.departure);
    if (bus.arrival) stopNames.add(bus.arrival);
    if (bus.viaStops && Array.isArray(bus.viaStops)) {
      bus.viaStops.forEach(via => {
        if (via.name) stopNames.add(via.name);
      });
    }
  });

  // 통학버스 정류장 추출
  const campusBuses = await CampusBus.find({}, { departure: 1, arrival: 1, viaStops: 1 });
  campusBuses.forEach(bus => {
    if (bus.departure) stopNames.add(bus.departure);
    if (bus.arrival) stopNames.add(bus.arrival);
    if (bus.viaStops && Array.isArray(bus.viaStops)) {
      bus.viaStops.forEach(via => {
        if (via.name) stopNames.add(via.name);
      });
    }
  });

  // 추가 정류장 (셔틀버스 정류장)
  const additionalStops = ['충남 아산시 선문대 정류소', '선문대학생회관 앞'];
  additionalStops.forEach(name => stopNames.add(name));

  return Array.from(stopNames);
}

// 정류장 좌표 조회 및 저장
async function updateStopCoordinates(forceUpdateNames = []) {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '../../.env') });
    const NAVER_API_KEY_ID = process.env.NAVER_CLIENT_ID;
    const NAVER_API_KEY = process.env.NAVER_CLIENT_SECRET;
    
    const hasNaverApi = !!(NAVER_API_KEY_ID && NAVER_API_KEY);
    if (!hasNaverApi) {
      console.warn('네이버 API 키가 설정되지 않았습니다. 하드코딩된 정류장만 처리합니다.');
    }

    console.log('정류장 좌표 업데이트 시작...');
    
    const stopNames = await extractAllStopNames();
    console.log(`총 ${stopNames.length}개 정류장 발견`);

    const existingStops = await BusStop.find({ name: { $in: stopNames } });
    const existingStopNames = new Set(existingStops.map(stop => stop.name));

    const forceUpdateSet = new Set(forceUpdateNames.map(name => name.trim()));
    if (forceUpdateSet.size > 0) {
      console.log(`강제 재조회 대상: ${Array.from(forceUpdateSet).join(', ')}`);
      await BusStop.deleteMany({ name: { $in: Array.from(forceUpdateSet) } });
      console.log(`강제 재조회 대상 좌표 삭제 완료`);
    }

    const newStopNames = stopNames.filter(name => {
      return !existingStopNames.has(name) || forceUpdateSet.has(name);
    });
    console.log(`신규 정류장 ${newStopNames.length}개 발견 (좌표 조회 필요)`);

    let successCount = 0;
    let failCount = 0;
    const failedStops = [];

    for (const stopName of newStopNames) {
      try {
        let result = null;
        let found = false;
        
        if (!hasNaverApi) {
          console.log(`네이버 API 없음, ${stopName} 건너뜀`);
          continue;
        }
        
        console.log(`좌표 조회 중: ${stopName}`);
        result = await searchStopCoordinates(stopName);

        if (!result.success) {
          const transformedNames = transformStopName(stopName);
          
          for (const transformedName of transformedNames.slice(1)) {
            console.log(`  → 변환된 이름으로 재시도: ${transformedName}`);
            result = await searchStopCoordinates(transformedName);
            
            if (result.success) {
              console.log(`  ✓ 변환된 이름 "${transformedName}"으로 좌표 조회 성공`);
              found = true;
              break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } else {
          found = true;
        }

        if (found && result.success) {
          const resultAddress = result.address || '';
          const stopNameLower = stopName.toLowerCase().replace(/\s+/g, '');
          const addressLower = resultAddress.toLowerCase().replace(/\s+/g, '');
          
          let isRelevant = false;
          if (stopName.includes('천안 아산역') || stopName.includes('천안아산역')) {
            isRelevant = addressLower.includes('천안아산역') || addressLower.includes('천안아산');
          } else if (stopName.includes('천안역')) {
            isRelevant = addressLower.includes('천안역');
          } else if (stopName.includes('온양온천역')) {
            isRelevant = addressLower.includes('온양온천역') || addressLower.includes('온양온천');
          } else if (stopName.includes('터미널')) {
            isRelevant = addressLower.includes('터미널');
          } else if (stopName.includes('캠퍼스') || stopName.includes('선문대')) {
            isRelevant = addressLower.includes('선문대') || addressLower.includes('캠퍼스');
          } else {
            isRelevant = addressLower.includes(stopNameLower) || result.score > 0;
          }
          
          if (!isRelevant && result.score === 0) {
            console.warn(`${stopName} 좌표 조회 결과가 관련성이 낮을 수 있습니다. 주소: ${resultAddress}`);
          }
          
          await BusStop.create({
            name: stopName,
            latitude: result.latitude,
            longitude: result.longitude,
            naverPlaceId: result.naverPlaceId,
            naverAddress: result.address,
            naverTitle: result.title || null,
            lastUpdated: new Date()
          });
          successCount++;
          console.log(`✓ ${stopName} 좌표 저장 완료 (${result.latitude}, ${result.longitude}) - 주소: ${resultAddress || 'N/A'}`);
        } else {
          console.warn(`✗ ${stopName} 좌표 조회 실패: ${result.error}`);
          failCount++;
          failedStops.push({ name: stopName, error: result.error });
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`${stopName} 처리 중 오류:`, error.message);
        failCount++;
        failedStops.push({ name: stopName, error: error.message });
      }
    }

    console.log(`\n정류장 좌표 업데이트 완료:`);
    console.log(`  - 성공: ${successCount}개`);
    console.log(`  - 실패: ${failCount}개`);
    if (failedStops.length > 0) {
      console.log(`  - 실패한 정류장:`, failedStops.map(s => s.name).join(', '));
    }

    return {
      success: true,
      total: stopNames.length,
      existing: existingStops.length,
      new: newStopNames.length,
      successCount,
      failCount,
      failedStops
    };
  } catch (error) {
    console.error('정류장 좌표 업데이트 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 특정 정류장 좌표 조회
async function getStopCoordinates(stopName) {
  try {
    const stop = await BusStop.findOne({ name: stopName });
    if (stop) {
      return {
        success: true,
        latitude: stop.latitude,
        longitude: stop.longitude,
        naverPlaceId: stop.naverPlaceId,
        address: stop.naverAddress,
        title: stop.naverTitle || null
      };
    }
    return {
      success: false,
      error: '정류장을 찾을 수 없습니다.'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 여러 정류장 좌표 일괄 조회
async function getMultipleStopCoordinates(stopNames) {
  try {
    const stops = await BusStop.find({ name: { $in: stopNames } });
    const coordinatesMap = {};

    stops.forEach(stop => {
      coordinatesMap[stop.name] = {
        latitude: stop.latitude,
        longitude: stop.longitude,
        naverPlaceId: stop.naverPlaceId,
        address: stop.naverAddress,
        title: stop.naverTitle || null
      };
    });

    stopNames.forEach(stopName => {
      if (!coordinatesMap[stopName]) {
        const hardcodedStop = getHardcodedStop(stopName);
        if (hardcodedStop) {
          coordinatesMap[stopName] = {
            latitude: hardcodedStop.latitude,
            longitude: hardcodedStop.longitude,
            naverPlaceId: null,
            address: hardcodedStop.address || null,
            title: hardcodedStop.title || null
          };
        }
      }
    });

    return coordinatesMap;
  } catch (error) {
    console.error('정류장 좌표 일괄 조회 실패:', error);
    return {};
  }
}

// 특정 정류장 좌표 강제 재조회
async function forceUpdateStopCoordinates(stopNames) {
  return await updateStopCoordinates(stopNames);
}

module.exports = {
  updateStopCoordinates,
  forceUpdateStopCoordinates,
  getStopCoordinates,
  getMultipleStopCoordinates,
  extractAllStopNames
};

