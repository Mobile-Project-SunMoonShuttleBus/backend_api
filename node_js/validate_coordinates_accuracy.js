// 정류장 좌표의 정확성 검증 스크립트
// 네이버 API로 정류장 이름을 검색하여 실제 좌표와 DB 좌표를 비교
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = require('./src/config/database');
const BusStop = require('./src/models/BusStop');
const { extractAllStopNames } = require('./src/services/busStopCoordinateService');
const { searchStopCoordinates } = require('./src/services/naverMapService');
const { transformStopName } = require('./src/services/stopNameTransformer');
const { updateViaStopCoordinates, viaStopSearchQueries } = require('./src/services/viaStopCoordinateUpdater');
const mongoose = require('mongoose');

// 수동 좌표 맵 (viaStopCoordinateUpdater에서 가져옴)
// 이 정류장들은 이미 정확한 좌표로 확인되어 검증 스킵
const manualCoordinates = {
  '하이렉스파 건너편': { latitude: 36.8194, longitude: 127.1542 },
  '두정동 맥도날드': { latitude: 36.832976, longitude: 127.1384923 },
  '홈마트 에브리데이': { latitude: 36.8201, longitude: 127.1523 },
  '권곡초 버스정류장': { latitude: 36.7914, longitude: 127.0144 },
  '서울대정병원': { latitude: 36.8189, longitude: 127.1556 },
  '주은아파트 버스정류장': { latitude: 36.7823, longitude: 127.0123 },
  '용암마을': { latitude: 36.8200, longitude: 127.1500 },
  '죽전': { latitude: 37.331005, longitude: 127.113871 },
  '온양역/아산터미널': { latitude: 36.7844, longitude: 127.0036 },
  '성남(분당)': { latitude: 37.4135, longitude: 127.0963 },
  '안산': { latitude: 37.3178, longitude: 126.8358 }
};

// 정류장별 예상 지역 정의
const expectedRegions = {
  // 천안시 정류장
  '천안역': ['천안시', '천안'],
  '천안 터미널': ['천안시', '천안'],
  '두정동 맥도날드': ['천안시', '천안', '서북구', '두정동'],
  '하이렉스파 건너편': ['천안시', '천안', '동남구'],
  '서울대정병원': ['천안시', '천안', '동남구'],
  '홈마트 에브리데이': ['천안시', '천안', '동남구'],
  '용암마을': ['천안시', '천안', '용암동'],
  
  // 아산시 정류장
  '아산캠퍼스': ['아산시', '아산', '탕정면', '선문대'],
  '천안 아산역': ['아산시', '아산', '배방읍'],
  '온양역/아산터미널': ['아산시', '아산', '온양온천역', '온양온천'],
  '주은아파트 버스정류장': ['아산시', '아산', '주은동'],
  '권곡초 버스정류장': ['아산시', '아산', '권곡동'],
  '충남 아산시 선문대 정류소': ['아산시', '아산'],
  '선문대학생회관 앞': ['아산시', '아산', '탕정면', '선문대'],
  
  // 경기도 정류장
  '성남(분당)': ['성남시', '분당구', '성남'],
  '야탑역 하나은행 앞': ['성남시', '분당구', '야탑동', '야탑'],
  '서현역에서 수내역방향 공항버스 정류장 전방 10m 지점 경부고속도로 죽전간이 정류장': ['성남시', '분당구', '서현동', '서현'],
  '안산': ['안산시', '안산'],
  '죽전': ['용인시', '용인', '죽전동', '수지구'],
  '신갈': ['용인시', '용인', '신갈동', '기흥구']
};

// 주소가 예상 지역과 일치하는지 확인
function isAddressInExpectedRegion(stopName, address) {
  if (!address) return false;
  
  const expected = expectedRegions[stopName];
  if (!expected) return true; // 예상 지역이 정의되지 않으면 통과
  
  const addressLower = address.toLowerCase();
  
  // 주요 지역명(시/도, 시/군/구)이 일치하는지 확인
  // 예: "천안시"가 예상이면 "광주광역시"는 거부되어야 함
  const mainRegions = {
    '천안역': ['천안시', '천안'],
    '천안 터미널': ['천안시', '천안'],
    '두정동 맥도날드': ['천안시', '천안'],
    '하이렉스파 건너편': ['천안시', '천안'],
    '서울대정병원': ['천안시', '천안'],
    '홈마트 에브리데이': ['천안시', '천안'],
    '용암마을': ['천안시', '천안'],
    '아산캠퍼스': ['아산시', '아산'],
    '천안 아산역': ['아산시', '아산'],
    '온양역/아산터미널': ['아산시', '아산'],
    '주은아파트 버스정류장': ['아산시', '아산'],
    '권곡초 버스정류장': ['아산시', '아산'],
    '충남 아산시 선문대 정류소': ['아산시', '아산'],
    '선문대학생회관 앞': ['아산시', '아산'],
    '성남(분당)': ['성남시', '성남', '분당'],
    '야탑역 하나은행 앞': ['성남시', '성남', '분당'],
    '서현역에서 수내역방향 공항버스 정류장 전방 10m 지점 경부고속도로 죽전간이 정류장': ['성남시', '성남', '분당'],
    '안산': ['안산시', '안산'],
    '죽전': ['용인시', '용인'],
    '신갈': ['용인시', '용인']
  };
  
  const mainRegion = mainRegions[stopName];
  if (mainRegion) {
    // 주요 지역명이 주소에 포함되어 있는지 확인
    const hasMainRegion = mainRegion.some(region => addressLower.includes(region.toLowerCase()));
    if (!hasMainRegion) {
      return false; // 주요 지역명이 없으면 거부
    }
    
    // 잘못된 지역명이 포함되어 있는지 확인
    const wrongRegions = {
      '천안시': ['광주', '대구', '부산', '인천', '서울'],
      '아산시': ['광주', '대구', '부산', '인천', '서울', '천안'],
      '성남시': ['광주', '대구', '부산', '천안', '아산'],
      '안산시': ['광주', '대구', '부산', '천안', '아산'],
      '용인시': ['광주', '대구', '부산', '천안', '아산']
    };
    
    // 예상 지역의 주요 시/도 확인
    let expectedCity = null;
    if (mainRegion.includes('천안시') || mainRegion.includes('천안')) {
      expectedCity = '천안시';
    } else if (mainRegion.includes('아산시') || mainRegion.includes('아산')) {
      expectedCity = '아산시';
    } else if (mainRegion.includes('성남시') || mainRegion.includes('성남')) {
      expectedCity = '성남시';
    } else if (mainRegion.includes('안산시') || mainRegion.includes('안산')) {
      expectedCity = '안산시';
    } else if (mainRegion.includes('용인시') || mainRegion.includes('용인')) {
      expectedCity = '용인시';
    }
    
    if (expectedCity && wrongRegions[expectedCity]) {
      // 주소에 예상 지역명이 명확히 포함되어 있으면 통과
      // 예: "천안 아산역"은 이름에 "천안"이 있지만 주소가 "아산시"이면 정상
      const hasExpectedCity = addressLower.includes(expectedCity.toLowerCase());
      
      if (hasExpectedCity) {
        return true; // 예상 지역명이 주소에 있으면 통과
      }
      
      // 예상 지역명이 없고 잘못된 지역명만 있으면 거부
      const hasWrongRegion = wrongRegions[expectedCity].some(wrong => 
        addressLower.includes(wrong.toLowerCase())
      );
      if (hasWrongRegion) {
        return false; // 잘못된 지역명이 포함되어 있으면 거부
      }
    }
  }
  
  return true;
}

// 두 좌표 간 거리 계산 (미터 단위)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 지구 반경 (미터)
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function validateCoordinatesAccuracy() {
  try {
    await connectDB();
    console.log('MongoDB 연결 성공\n');

    // 네이버 API 키 확인
    const NAVER_API_KEY_ID = process.env.NAVER_CLIENT_ID;
    const NAVER_API_KEY = process.env.NAVER_CLIENT_SECRET;
    
    if (!NAVER_API_KEY_ID || !NAVER_API_KEY) {
      console.error('네이버 API 키가 설정되지 않았습니다.');
      process.exit(1);
    }

    // 모든 정류장 이름 추출
    const allStopNames = await extractAllStopNames();
    console.log(`총 ${allStopNames.length}개 정류장 좌표 검증 시작...\n`);

    // DB에서 좌표 조회
    const dbStops = await BusStop.find({ name: { $in: allStopNames } });
    const dbStopMap = new Map(dbStops.map(stop => [stop.name, stop]));

    const results = {
      total: allStopNames.length,
      validated: 0,
      accurate: 0,
      inaccurate: [],
      notFound: [],
      apiFailed: []
    };

    for (const stopName of allStopNames) {
      const dbStop = dbStopMap.get(stopName);
      
      if (!dbStop) {
        results.notFound.push({
          name: stopName,
          reason: 'DB에 좌표 없음'
        });
        continue;
      }

      console.log(`\n[${results.validated + 1}/${allStopNames.length}] ${stopName} 검증 중...`);
      console.log(`  DB 좌표: (${dbStop.latitude}, ${dbStop.longitude})`);

      // 수동 좌표가 있는 경우 검증 스킵 (수동 좌표는 이미 정확한 좌표로 확인됨)
      const hasManualCoordinates = manualCoordinates[stopName];
      if (hasManualCoordinates) {
        const manual = manualCoordinates[stopName];
        const distance = calculateDistance(dbStop.latitude, dbStop.longitude, manual.latitude, manual.longitude);
        if (distance <= 10) { // 10m 이내면 수동 좌표와 일치
          results.accurate++;
          console.log(`  ✓ 수동 좌표 사용 (정확한 좌표)`);
          results.validated++;
          continue;
        }
      }

      let apiResult = null;
      let searchQueries = [stopName];

      // 경유지 특별 검색어가 있는 경우 사용
      if (viaStopSearchQueries[stopName]) {
        searchQueries = viaStopSearchQueries[stopName];
      }

      // 변환된 이름도 추가
      const transformedNames = transformStopName(stopName);
      searchQueries = [...new Set([...searchQueries, ...transformedNames])];

      // 특정 정류장에 대한 더 정확한 검색어 추가
      const specificQueries = {
        '두정동 맥도날드': ['천안 두정동 맥도날드', '맥도날드 천안 두정점', '충청남도 천안시 서북구 두정동 맥도날드'],
        '죽전': ['용인 죽전', '경기도 용인시 죽전동', '용인시 기흥구 죽전동'],
        '온양역/아산터미널': ['온양온천역', '아산 온양온천역', '충청남도 아산시 온양온천역']
      };
      
      if (specificQueries[stopName]) {
        searchQueries = [...specificQueries[stopName], ...searchQueries];
      }

      // 네이버 API로 좌표 조회 시도
      for (const query of searchQueries) {
        try {
          apiResult = await searchStopCoordinates(query);
          if (apiResult.success) {
            console.log(`  API 검색어 "${query}"로 좌표 조회 성공`);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.log(`  API 검색어 "${query}" 실패: ${error.message}`);
        }
      }

      if (!apiResult || !apiResult.success) {
        results.apiFailed.push({
          name: stopName,
          dbCoordinates: { lat: dbStop.latitude, lng: dbStop.longitude },
          error: apiResult?.error || '모든 검색어 실패'
        });
        console.log(`  ⚠ API로 좌표를 찾을 수 없음 (DB 좌표 유지)`);
        results.validated++;
        continue;
      }

      const apiLat = apiResult.latitude;
      const apiLng = apiResult.longitude;
      const dbLat = dbStop.latitude;
      const dbLng = dbStop.longitude;

      console.log(`  API 좌표: (${apiLat}, ${apiLng})`);
      if (apiResult.address) {
        console.log(`  API 주소: ${apiResult.address}`);
      }

      // 지역 일치 확인
      const isCorrectRegion = isAddressInExpectedRegion(stopName, apiResult.address);
      
      if (!isCorrectRegion) {
        results.inaccurate.push({
          name: stopName,
          dbCoordinates: { lat: dbLat, lng: dbLng },
          apiCoordinates: { lat: apiLat, lng: apiLng },
          distance: null,
          apiAddress: apiResult.address || null,
          reason: '잘못된 지역 (API 검색 결과가 예상 지역과 불일치)'
        });
        console.log(`  ✗ 잘못된 지역 검색 결과`);
        console.log(`    예상 지역: ${expectedRegions[stopName]?.join(', ') || '정의되지 않음'}`);
        console.log(`    API 주소: ${apiResult.address || 'N/A'}`);
        console.log(`    → DB 좌표가 정확할 가능성이 높음 (수동 좌표 확인 필요)`);
        results.validated++;
        continue;
      }

      // 거리 계산
      const distance = calculateDistance(dbLat, dbLng, apiLat, apiLng);
      console.log(`  거리 차이: ${distance.toFixed(0)}m`);

      // 허용 오차: 500m 이내면 정확한 것으로 간주
      const ACCEPTABLE_DISTANCE = 500; // 500미터

      if (distance <= ACCEPTABLE_DISTANCE) {
        results.accurate++;
        console.log(`  ✓ 좌표 정확 (차이: ${distance.toFixed(0)}m, 지역 일치)`);
      } else {
        results.inaccurate.push({
          name: stopName,
          dbCoordinates: { lat: dbLat, lng: dbLng },
          apiCoordinates: { lat: apiLat, lng: apiLng },
          distance: distance,
          apiAddress: apiResult.address || null,
          reason: `거리 차이 ${distance.toFixed(0)}m (허용: ${ACCEPTABLE_DISTANCE}m)`
        });
        console.log(`  ✗ 좌표 부정확 (차이: ${distance.toFixed(0)}m, 허용: ${ACCEPTABLE_DISTANCE}m)`);
        console.log(`    → API 좌표로 업데이트 권장`);
      }

      results.validated++;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('\n=== 검증 결과 요약 ===');
    console.log(`총 정류장: ${results.total}개`);
    console.log(`검증 완료: ${results.validated}개`);
    console.log(`정확한 좌표: ${results.accurate}개`);
    console.log(`부정확한 좌표: ${results.inaccurate.length}개`);
    console.log(`API 조회 실패: ${results.apiFailed.length}개`);
    console.log(`DB에 좌표 없음: ${results.notFound.length}개`);

    if (results.inaccurate.length > 0) {
      console.log('\n=== 부정확한 좌표 목록 ===');
      results.inaccurate.forEach(item => {
        console.log(`\n${item.name}:`);
        console.log(`  DB 좌표: (${item.dbCoordinates.lat}, ${item.dbCoordinates.lng})`);
        if (item.apiCoordinates) {
          console.log(`  API 좌표: (${item.apiCoordinates.lat}, ${item.apiCoordinates.lng})`);
        }
        if (item.distance !== null) {
          console.log(`  거리 차이: ${item.distance.toFixed(0)}m`);
        }
        if (item.apiAddress) {
          console.log(`  API 주소: ${item.apiAddress}`);
        }
        if (item.reason) {
          console.log(`  사유: ${item.reason}`);
        }
      });
    }

    if (results.apiFailed.length > 0) {
      console.log('\n=== API 조회 실패 목록 ===');
      results.apiFailed.forEach(item => {
        console.log(`  - ${item.name}: ${item.error}`);
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
  validateCoordinatesAccuracy()
    .then(results => {
      if (results.inaccurate.length > 0) {
        console.log(`\n⚠️  ${results.inaccurate.length}개 정류장의 좌표가 부정확합니다.`);
        console.log('업데이트하려면 update_missing_coordinates.js --force-all을 실행하세요.');
        process.exit(1);
      } else {
        console.log('\n✅ 모든 정류장의 좌표가 정확합니다.');
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { validateCoordinatesAccuracy };

