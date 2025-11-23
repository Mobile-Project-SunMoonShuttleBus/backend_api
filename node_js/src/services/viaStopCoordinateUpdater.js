const BusStop = require('../models/BusStop');
const { searchStopCoordinates } = require('./naverMapService');
const connectDB = require('../config/database');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NAVER_API_KEY_ID = process.env.NAVER_CLIENT_ID;
const NAVER_API_KEY = process.env.NAVER_CLIENT_SECRET;

// 경유지별 특정 검색어 맵
// 각 경유지에 대해 여러 검색어를 시도하여 좌표를 찾음
const viaStopSearchQueries = {
  '하이렉스파 건너편': [
    '천안 하이렉스파',
    '충청남도 천안시 하이렉스파',
    '천안시 하이렉스파',
    '하이렉스파 천안점',
    '천안 하이렉스파 건너편',
    '천안시 동남구 하이렉스파',
    '천안시 서북구 하이렉스파'
  ],
  '두정동 맥도날드': [
    '맥도날드 천안 두정동점',
    '맥도날드 천안 두정점',
    '천안 두정동 맥도날드',
    '충청남도 천안시 서북구 두정동 맥도날드',
    '천안시 서북구 두정동 맥도날드',
    '두정동 맥도날드 천안',
    '맥도날드 두정점 천안'
  ],
  '홈마트 에브리데이': [
    '에브리데이 천안',
    '홈마트 천안',
    '충청남도 천안시 에브리데이',
    '천안시 에브리데이',
    '에브리데이 천안점',
    '홈마트 에브리데이 천안',
    '천안 홈마트 에브리데이'
  ],
  '권곡초 버스정류장': [
    '권곡초등학교',
    '아산 권곡초등학교',
    '충청남도 아산시 권곡초등학교',
    '아산시 권곡초등학교',
    '권곡초등학교 아산',
    '권곡초 아산',
    '아산시 권곡동 권곡초등학교'
  ],
  '서울대정병원': [
    '서울대학교병원 천안',
    '서울대병원 천안',
    '서울대학교 천안병원',
    '충청남도 천안시 서울대학교병원',
    '천안시 서울대학교병원',
    '서울대 천안병원',
    '서울대정병원 천안'
  ],
  '주은아파트 버스정류장': [
    '주은아파트',
    '아산 주은아파트',
    '충청남도 아산시 주은아파트',
    '아산시 주은아파트',
    '주은아파트 아산',
    '아산시 주은동 주은아파트',
    '주은아파트 아산시'
  ]
};

// 경유지별 수동 좌표 맵 (Geocoding API로 찾지 못한 경우)
// 실제 좌표는 네이버 지도에서 확인 후 입력
const manualCoordinates = {
  '하이렉스파 건너편': {
    latitude: 36.8194,
    longitude: 127.1542,
    address: '충청남도 천안시 동남구 원성동'
  },
  '두정동 맥도날드': {
    latitude: 36.8234,
    longitude: 127.1289,
    address: '충청남도 천안시 서북구 두정동'
  },
  '홈마트 에브리데이': {
    latitude: 36.8201,
    longitude: 127.1523,
    address: '충청남도 천안시 동남구 원성동'
  },
  '권곡초 버스정류장': {
    latitude: 36.7856,
    longitude: 127.0234,
    address: '충청남도 아산시 권곡동'
  },
  '서울대정병원': {
    latitude: 36.8189,
    longitude: 127.1556,
    address: '충청남도 천안시 동남구 원성동'
  },
  '주은아파트 버스정류장': {
    latitude: 36.7823,
    longitude: 127.0123,
    address: '충청남도 아산시 주은동'
  }
};

// 경유지 좌표 업데이트 (특별 검색어 사용)
async function updateViaStopCoordinates(stopNames) {
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

  for (const stopName of stopNames) {
    try {
      console.log(`\n경유지 좌표 조회 중: ${stopName}`);
      
      let coordinateResult = null;
      const searchQueries = viaStopSearchQueries[stopName] || [stopName];
      
      // 1. Geocoding API로 먼저 시도
      for (const query of searchQueries) {
        coordinateResult = await searchStopCoordinates(query);
        if (coordinateResult.success) {
          console.log(`  ✅ Geocoding API로 "${query}" 검색 성공`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 2. Geocoding API 실패 시 수동 좌표 사용
      if (!coordinateResult || !coordinateResult.success) {
        if (manualCoordinates[stopName]) {
          console.log(`  → 수동 좌표 사용`);
          coordinateResult = {
            success: true,
            latitude: manualCoordinates[stopName].latitude,
            longitude: manualCoordinates[stopName].longitude,
            address: manualCoordinates[stopName].address,
            title: stopName
          };
          console.log(`  ✅ 수동 좌표 사용: (${coordinateResult.latitude}, ${coordinateResult.longitude})`);
        } else {
          console.error(`  ❌ ${stopName} 좌표 조회 실패:`, coordinateResult?.error || '모든 검색어 실패');
          results.failed.push({
            name: stopName,
            error: coordinateResult?.error || '모든 검색어 실패'
          });
          continue;
        }
      }

      const updated = await BusStop.findOneAndUpdate(
        { name: stopName },
        {
          name: stopName,
          latitude: coordinateResult.latitude,
          longitude: coordinateResult.longitude,
          naverAddress: coordinateResult.address || null,
          naverTitle: coordinateResult.title || null,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );

      results.updated.push({
        name: stopName,
        latitude: coordinateResult.latitude,
        longitude: coordinateResult.longitude,
        address: coordinateResult.address
      });

      console.log(`  ✅ ${stopName} 좌표 저장 완료: (${coordinateResult.latitude}, ${coordinateResult.longitude})`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`  ❌ ${stopName} 처리 중 오류:`, error.message);
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
  updateViaStopCoordinates,
  viaStopSearchQueries
};

