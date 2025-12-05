// 주소에 맞는 정확한 좌표로 업데이트하는 스크립트
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const connectDB = require('./src/config/database');
const BusStop = require('./src/models/BusStop');
const { searchStopCoordinates } = require('./src/services/naverMapService');
const { extractAllStopNames } = require('./src/services/busStopCoordinateService');
const mongoose = require('mongoose');

// 두 좌표 간 거리 계산 (미터 단위)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 주소에서 검색어 추출
function extractSearchQuery(address) {
  if (!address) return [];
  
  const queries = [];
  
  // 역명 추출
  if (address.includes('온양온천역')) {
    queries.push('온양온천역', '아산 온양온천역');
  }
  if (address.includes('천안역')) {
    queries.push('천안역');
  }
  if (address.includes('야탑역')) {
    queries.push('야탑역', '성남 야탑역');
  }
  if (address.includes('서현역')) {
    queries.push('서현역', '성남 서현역');
  }
  
  // 터미널명 추출
  if (address.includes('성남종합버스터미널')) {
    queries.push('성남종합버스터미널', '성남시외버스터미널');
  }
  if (address.includes('안산종합버스터미널')) {
    queries.push('안산종합버스터미널', '안산시외버스터미널');
  }
  if (address.includes('천안종합버스터미널')) {
    queries.push('천안종합버스터미널', '천안시외버스터미널');
  }
  
  // 건물명 추출
  if (address.includes('권곡초등학교')) {
    queries.push('권곡초등학교', '아산 권곡초등학교');
  }
  if (address.includes('주은아파트')) {
    queries.push('주은아파트', '아산 주은아파트');
  }
  if (address.includes('서울대학교병원')) {
    queries.push('서울대학교병원 천안', '서울대병원 천안');
  }
  if (address.includes('하이렉스파')) {
    queries.push('하이렉스파 천안', '천안 하이렉스파');
  }
  
  return queries.length > 0 ? queries : [address];
}

async function updateCoordinatesToMatchAddress() {
  try {
    await connectDB();
    console.log('MongoDB 연결 성공\n');

    const allStopNames = await extractAllStopNames();
    const dbStops = await BusStop.find({ name: { $in: allStopNames } });
    
    console.log(`총 ${dbStops.length}개 정류장 확인 중...\n`);

    let updatedCount = 0;
    const updated = [];

    for (const stop of dbStops) {
      if (!stop.naverAddress) continue;
      
      const searchQueries = extractSearchQuery(stop.naverAddress);
      if (searchQueries.length === 0) continue;

      let found = false;
      
      for (const query of searchQueries) {
        try {
          const result = await searchStopCoordinates(query);
          if (result.success) {
            const distance = calculateDistance(
              stop.latitude, 
              stop.longitude,
              result.latitude,
              result.longitude
            );
            
            // 100m 이상 차이나면 업데이트
            if (distance > 100) {
              await BusStop.findOneAndUpdate(
                { name: stop.name },
                {
                  latitude: result.latitude,
                  longitude: result.longitude,
                  naverAddress: result.address || stop.naverAddress,
                  lastUpdated: new Date()
                }
              );
              
              updated.push({
                name: stop.name,
                old: { lat: stop.latitude, lng: stop.longitude, addr: stop.naverAddress },
                new: { lat: result.latitude, lng: result.longitude, addr: result.address || stop.naverAddress },
                distance: distance
              });
              
              updatedCount++;
              found = true;
              console.log(`✅ ${stop.name}: 좌표 업데이트 (차이: ${distance.toFixed(0)}m)`);
              break;
            } else {
              found = true;
              break;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          // 에러 무시하고 다음 검색어 시도
        }
      }
    }

    console.log(`\n=== 업데이트 완료 ===`);
    console.log(`업데이트된 정류장: ${updatedCount}개`);

    if (updated.length > 0) {
      console.log('\n=== 업데이트 상세 ===');
      updated.forEach(item => {
        console.log(`\n${item.name}:`);
        console.log(`  이전: (${item.old.lat}, ${item.old.lng}) - ${item.old.addr}`);
        console.log(`  이후: (${item.new.lat}, ${item.new.lng}) - ${item.new.addr}`);
        console.log(`  거리 차이: ${item.distance.toFixed(0)}m`);
      });
    }

    await mongoose.disconnect();
    return { success: true, updated: updatedCount };
  } catch (error) {
    console.error('오류 발생:', error);
    await mongoose.disconnect();
    throw error;
  }
}

if (require.main === module) {
  updateCoordinatesToMatchAddress()
    .then(result => {
      if (result.success) {
        console.log(`\n✅ 작업 완료`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('스크립트 실행 실패:', error);
      process.exit(1);
    });
}

module.exports = { updateCoordinatesToMatchAddress };

