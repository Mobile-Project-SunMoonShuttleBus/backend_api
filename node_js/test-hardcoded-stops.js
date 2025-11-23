// 하드코딩된 정류장 좌표 업데이트 테스트 스크립트
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./src/config/database');
const { updateStopCoordinates } = require('./src/services/busStopCoordinateService');
const { getAllHardcodedStopNames } = require('./src/config/hardcodedStops');

async function main() {
  try {
    console.log('=== 하드코딩된 정류장 좌표 업데이트 테스트 ===\n');
    
    // MongoDB 연결
    console.log('MongoDB 연결 중...');
    await connectDB();
    console.log('MongoDB 연결 완료\n');
    
    // 하드코딩된 정류장 목록 확인
    console.log('하드코딩된 정류장 목록:');
    const hardcodedNames = getAllHardcodedStopNames();
    hardcodedNames.forEach(name => console.log('  -', name));
    console.log(`총 ${hardcodedNames.length}개\n`);
    
    // 네이버 API 키 확인
    const hasNaverApi = !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
    console.log('네이버 API 키:', hasNaverApi ? '설정됨' : '없음 (하드코딩된 정류장만 처리)');
    console.log('');
    
    // 정류장 좌표 업데이트
    console.log('정류장 좌표 업데이트 시작...\n');
    const result = await updateStopCoordinates();
    
    console.log('\n=== 결과 ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ 정류장 좌표 업데이트 완료');
    } else {
      console.log('\n❌ 정류장 좌표 업데이트 실패');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  }
}

main();

