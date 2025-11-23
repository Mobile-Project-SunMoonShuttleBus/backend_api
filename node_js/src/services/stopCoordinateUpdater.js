const BusStop = require('../models/BusStop');
const { searchStopCoordinates } = require('./naverMapService');
const connectDB = require('../config/database');

/**
 * 정류장별 정확한 좌표 조회 및 저장
 * @param {Array<string>} stopNames - 정류장 이름 배열
 * @returns {Promise<Object>} - 업데이트 결과
 */
async function updateStopCoordinatesWithType(stopNames) {
  try {
    await connectDB();
  } catch (error) {
    console.error('MongoDB 연결 실패:', error.message);
    return {
      success: false,
      updated: [],
      failed: stopNames.map(name => ({ name, error: 'MongoDB 연결 실패' }))
    };
  }

  const results = {
    success: true,
    updated: [],
    failed: []
  };

  const stopTypeMap = {
    '충남 아산시 선문대 정류소': {
      stopType: 'departure',
      requiresStudentHallBoarding: false
    },
    '선문대학생회관 앞': {
      stopType: 'conditional',
      requiresStudentHallBoarding: true
    }
  };

  const searchQueryMap = {
    '충남 아산시 선문대 정류소': [
      '선문대정류소',
      '선문대학교 정류소',
      '충남 아산시 탕정면 선문로221번길 70 선문대학교 정류소',
      '아산시 탕정면 선문대 정류소',
      '선문대학교 아산캠퍼스 정류소',
      '충남 아산시 탕정면 선문로221번길 70 선문대학교',
      '충청남도 아산시 탕정면 선문로221번길 70',
      '아산시 탕정면 갈산리 100'
    ],
    '선문대학생회관 앞': [
      '충남 아산시 탕정면 선문로221번길 70',
      '충청남도 아산시 탕정면 선문로221번길 70 선문대학교',
      '아산시 탕정면 선문로221번길 70',
      '선문대학교 학생회관'
    ]
  };

  for (const stopName of stopNames) {
    try {
      console.log(`정류장 좌표 조회 중: ${stopName}`);
      
      // 여러 검색어로 시도
      const searchQueries = searchQueryMap[stopName] || [stopName];
      let coordinateResult = null;
      
      for (const query of searchQueries) {
        coordinateResult = await searchStopCoordinates(query);
        if (coordinateResult.success) {
          console.log(`  ✅ 검색어 "${query}"로 좌표 조회 성공`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      if (!coordinateResult || !coordinateResult.success) {
        console.error(`${stopName} 좌표 조회 실패:`, coordinateResult?.error || '모든 검색어 실패');
        results.failed.push({
          name: stopName,
          error: coordinateResult?.error || '모든 검색어 실패'
        });
        continue;
      }

      const typeInfo = stopTypeMap[stopName] || {
        stopType: 'departure',
        requiresStudentHallBoarding: false
      };

      const updated = await BusStop.findOneAndUpdate(
        { name: stopName },
        {
          name: stopName,
          latitude: coordinateResult.latitude,
          longitude: coordinateResult.longitude,
          naverAddress: coordinateResult.address || null,
          naverTitle: coordinateResult.title || null,
          stopType: typeInfo.stopType,
          requiresStudentHallBoarding: typeInfo.requiresStudentHallBoarding,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );

      results.updated.push({
        name: stopName,
        latitude: coordinateResult.latitude,
        longitude: coordinateResult.longitude,
        address: coordinateResult.address,
        stopType: typeInfo.stopType,
        requiresStudentHallBoarding: typeInfo.requiresStudentHallBoarding
      });

      console.log(`✅ ${stopName} 좌표 저장 완료:`, {
        latitude: coordinateResult.latitude,
        longitude: coordinateResult.longitude,
        stopType: typeInfo.stopType
      });

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`${stopName} 처리 중 오류:`, error.message);
      results.failed.push({
        name: stopName,
        error: error.message
      });
    }
  }

  if (results.failed.length > 0) {
    results.success = false;
  }

  return results;
}

module.exports = {
  updateStopCoordinatesWithType
};

