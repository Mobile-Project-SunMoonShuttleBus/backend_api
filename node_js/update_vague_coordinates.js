// 주소가 광범위한 정류장의 정확한 좌표를 찾아 업데이트하는 스크립트
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = require('./src/config/database');
const BusStop = require('./src/models/BusStop');
const { searchStopCoordinates } = require('./src/services/naverMapService');
const mongoose = require('mongoose');

// 정확한 검색어 맵
const specificSearchQueries = {
  '권곡초 버스정류장': [
    '권곡초등학교',
    '아산 권곡초등학교',
    '충청남도 아산시 권곡동 권곡초등학교',
    '아산시 권곡동 권곡초등학교'
  ],
  '성남(분당)': [
    '성남종합버스터미널',
    '성남시외버스터미널',
    '경기도 성남시 분당구 성남종합버스터미널',
    '성남시 분당구 성남종합버스터미널'
  ],
  '안산': [
    '안산종합버스터미널',
    '안산시외버스터미널',
    '경기도 안산시 단원구 안산종합버스터미널',
    '안산시 단원구 안산종합버스터미널'
  ],
  '온양역/아산터미널': [
    '온양온천역',
    '아산 온양온천역',
    '충청남도 아산시 온양동 온양온천역',
    '아산시 온양동 온양온천역',
    '온양온천역 아산'
  ],
  '주은아파트 버스정류장': [
    '주은아파트',
    '아산 주은아파트',
    '충청남도 아산시 주은동 주은아파트',
    '아산시 주은동 주은아파트'
  ]
};

async function updateVagueCoordinates() {
  try {
    await connectDB();
    console.log('MongoDB 연결 성공\n');

    const vagueStops = Object.keys(specificSearchQueries);
    console.log(`총 ${vagueStops.length}개 정류장의 정확한 좌표를 찾는 중...\n`);

    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (const stopName of vagueStops) {
      console.log(`\n[${stopName}] 정확한 좌표 검색 중...`);
      
      const dbStop = await BusStop.findOne({ name: stopName });
      if (!dbStop) {
        console.log(`  ✗ DB에 정류장이 없습니다.`);
        failCount++;
        continue;
      }

      console.log(`  현재 좌표: (${dbStop.latitude}, ${dbStop.longitude})`);
      console.log(`  현재 주소: ${dbStop.naverAddress || '주소 없음'}`);

      const searchQueries = specificSearchQueries[stopName];
      let found = false;

      for (const query of searchQueries) {
        try {
          const result = await searchStopCoordinates(query);
          if (result.success) {
            console.log(`  ✓ "${query}" 검색 성공`);
            console.log(`    좌표: (${result.latitude}, ${result.longitude})`);
            console.log(`    주소: ${result.address || 'N/A'}`);
            
            // 주소가 구체적인지 확인 (동/읍/면/로/길/역/터미널 포함)
            const isSpecific = result.address && (
              result.address.includes('동') || 
              result.address.includes('읍') || 
              result.address.includes('면') ||
              result.address.includes('로') ||
              result.address.includes('길') ||
              result.address.includes('역') ||
              result.address.includes('터미널')
            );

            if (isSpecific || result.address.split(' ').length >= 4) {
              await BusStop.findOneAndUpdate(
                { name: stopName },
                {
                  latitude: result.latitude,
                  longitude: result.longitude,
                  naverAddress: result.address || null,
                  naverTitle: result.title || null,
                  lastUpdated: new Date()
                }
              );
              
              results.push({
                name: stopName,
                old: { lat: dbStop.latitude, lng: dbStop.longitude, addr: dbStop.naverAddress },
                new: { lat: result.latitude, lng: result.longitude, addr: result.address }
              });
              
              successCount++;
              found = true;
              console.log(`  ✅ 좌표 업데이트 완료`);
              break;
            } else {
              console.log(`  ⚠ 주소가 여전히 광범위함: ${result.address}`);
            }
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.log(`  ✗ "${query}" 검색 실패: ${error.message}`);
        }
      }

      if (!found) {
        console.log(`  ✗ 정확한 좌표를 찾을 수 없습니다.`);
        failCount++;
      }
    }

    console.log('\n=== 업데이트 결과 ===');
    console.log(`성공: ${successCount}개`);
    console.log(`실패: ${failCount}개`);

    if (results.length > 0) {
      console.log('\n=== 업데이트된 정류장 ===');
      results.forEach(r => {
        console.log(`\n${r.name}:`);
        console.log(`  이전: (${r.old.lat}, ${r.old.lng}) - ${r.old.addr || '주소 없음'}`);
        console.log(`  이후: (${r.new.lat}, ${r.new.lng}) - ${r.new.addr || '주소 없음'}`);
      });
    }

    await mongoose.disconnect();
    return { success: true, updated: successCount, failed: failCount };
  } catch (error) {
    console.error('오류 발생:', error);
    await mongoose.disconnect();
    throw error;
  }
}

if (require.main === module) {
  updateVagueCoordinates()
    .then(result => {
      if (result.success && result.updated > 0) {
        console.log(`\n✅ ${result.updated}개 정류장 좌표 업데이트 완료`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { updateVagueCoordinates };

