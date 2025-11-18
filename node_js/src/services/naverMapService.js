const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 네이버 클라우드 플랫폼 Geocoding API 키
const NAVER_API_KEY_ID = process.env.NAVER_CLIENT_ID; // x-ncp-apigw-api-key-id
const NAVER_API_KEY = process.env.NAVER_CLIENT_SECRET; // x-ncp-apigw-api-key


// 네이버 좌표계(KATEC)를 WGS84로 변환
// 네이버 검색 API는 mapx, mapy를 제공하며 이를 WGS84로 변환해야 함
// mapx, mapy는 KATEC 좌표계 (한국 측지계) 값
function convertNaverToWGS84(mapx, mapy) {
  // KATEC 좌표계를 WGS84로 변환하는 공식
  const RE = 6371.00877; // 지구 반경(km)
  const GRID = 5.0; // 격자 간격(km)
  const SLAT1 = 30.0; // 투영 위도1(degree)
  const SLAT2 = 60.0; // 투영 위도2(degree)
  const OLON = 126.0; // 기준점 경도(degree)
  const OLAT = 38.0; // 기준점 위도(degree)
  const XO = 43; // 기준점 X좌표(GRID)
  const YO = 136; // 기준점 Y좌표(GRID)

  const DEGRAD = Math.PI / 180.0;
  const RADDEG = 180.0 / Math.PI;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);

  const x = mapx;
  const y = mapy;
  let ra = Math.tan(Math.PI * 0.25 + (y) * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = x * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const lat = (ra * Math.sin(theta) + YO) * DEGRAD;
  const lng = (ra * Math.cos(theta) + XO) * DEGRAD;

  return {
    lat: lat * RADDEG,
    lng: lng * RADDEG
  };
}

// 네이버 클라우드 플랫폼 Geocoding API로 정류장 좌표 조회
async function searchStopCoordinatesV2(stopName) {
  if (!NAVER_API_KEY_ID || !NAVER_API_KEY) {
    throw new Error('네이버 API 키가 설정되지 않았습니다.');
  }

  try {
    const response = await axios.get('https://maps.apigw.ntruss.com/map-geocode/v2/geocode', {
      params: {
        query: stopName,
        count: 1
      },
      headers: {
        'x-ncp-apigw-api-key-id': NAVER_API_KEY_ID,
        'x-ncp-apigw-api-key': NAVER_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 5000
    });

    if (response.data.status === 'OK' && response.data.addresses && response.data.addresses.length > 0) {
      // 가장 관련성 높은 결과 선택 (첫 번째 결과)
      const address = response.data.addresses[0];
      
      // Geocoding API는 이미 WGS84 좌표계로 x(경도), y(위도)를 제공
      const longitude = parseFloat(address.x);
      const latitude = parseFloat(address.y);
      
      return {
        success: true,
        latitude: latitude,
        longitude: longitude,
        naverPlaceId: null, // Geocoding API는 place ID를 제공하지 않음
        address: address.roadAddress || address.jibunAddress || null,
        title: address.roadAddress || address.jibunAddress || stopName
      };
    }

    return {
      success: false,
      error: '검색 결과가 없습니다.'
    };
  } catch (error) {
    if (error.response) {
      console.error(`네이버 Geocoding API 오류 (${error.response.status}):`, error.response.data);
      return {
        success: false,
        error: `네이버 Geocoding API 오류: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      };
    } else if (error.request) {
      console.error('네이버 Geocoding API 요청 실패:', error.message);
      return {
        success: false,
        error: '네이버 Geocoding API 요청 실패'
      };
    } else {
      console.error('네이버 Geocoding API 오류:', error.message);
      return {
        success: false,
        error: error.message || '네이버 Geocoding API 요청 실패'
      };
    }
  }
}

module.exports = {
  searchStopCoordinates: searchStopCoordinatesV2,
  convertNaverToWGS84
};

