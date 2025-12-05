const axios = require('axios');
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NAVER_API_KEY_ID = process.env.NAVER_CLIENT_ID;
const NAVER_API_KEY = process.env.NAVER_CLIENT_SECRET;

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const axiosInstance = axios.create({
  timeout: 5000,
  httpsAgent: httpsAgent
});

// 네이버 좌표계를 WGS84로 변환
function convertNaverToWGS84(mapx, mapy) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;

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

// 검색어와 결과 주소 관련성 확인
function isRelevantResult(searchQuery, resultAddress) {
  if (!resultAddress) return false;
  
  const query = searchQuery.toLowerCase().replace(/\s+/g, '');
  const address = resultAddress.toLowerCase().replace(/\s+/g, '');
  
  const keywords = [];
  if (query.includes('천안아산역') || query.includes('천안아산')) {
    keywords.push('천안아산역', '천안아산', '아산역');
  }
  if (query.includes('천안역')) {
    keywords.push('천안역');
  }
  if (query.includes('온양온천역') || query.includes('온양온천')) {
    keywords.push('온양온천역', '온양온천', '온양역');
  }
  if (query.includes('터미널')) {
    keywords.push('터미널', '종합터미널', '시외버스터미널');
  }
  if (query.includes('아산캠퍼스') || query.includes('선문대')) {
    keywords.push('선문대', '아산캠퍼스', '선문대학교');
  }
  
  if (keywords.length > 0) {
    return keywords.some(keyword => address.includes(keyword.toLowerCase()));
  }
  
  return address.includes(query);
}

function calculateMatchScore(searchText, addressText = '', titleText = '') {
  const search = (searchText || '').toLowerCase();
  const address = (addressText || '').toLowerCase();
  const title = (titleText || '').toLowerCase();
  let score = 0;

  const normalizedSearch = search.replace(/\s+/g, '');
  if (address.includes(normalizedSearch) || title.includes(normalizedSearch)) {
    score += 20;
  }

  const keywordChecks = [
    { keyword: '천안아산역', targets: ['천안아산역', '천안아산', '아산역'] },
    { keyword: '천안역', targets: ['천안역'] },
    { keyword: '온양온천역', targets: ['온양온천역', '온양온천', '온양역'] },
    { keyword: '터미널', targets: ['터미널', '종합터미널', '시외버스터미널'] },
    { keyword: '아산캠퍼스', targets: ['선문대', '선문대학교', '아산캠퍼스'] },
    { keyword: '선문대', targets: ['선문대', '선문대학교'] }
  ];

  keywordChecks.forEach(({ keyword, targets }) => {
    if (search.includes(keyword)) {
      targets.forEach(target => {
        if (address.includes(target) || title.includes(target)) {
          score += 20;
        }
      });
    }
  });

  if ((address.includes('읍') || address.includes('동') || address.includes('리')) &&
      !address.includes('역') && !address.includes('터미널') && !address.includes('캠퍼스') &&
      !title.includes('역') && !title.includes('터미널') && !title.includes('캠퍼스')) {
    score -= 5;
  }

  return score;
}

async function searchViaGeocoding(stopName) {
  if (!NAVER_API_KEY_ID || !NAVER_API_KEY) {
    throw new Error('네이버 API 키가 설정되지 않았습니다.');
  }

  try {
    const url = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
    const params = {
      query: stopName,
      count: 5
    };
    const headers = {
      'x-ncp-apigw-api-key-id': NAVER_API_KEY_ID,
      'x-ncp-apigw-api-key': NAVER_API_KEY,
      'Accept': 'application/json'
    };
    
    const response = await axiosInstance.get(url, {
      params: params,
      headers: headers,
      timeout: 5000
    });

    if (response.data.status === 'OK' && response.data.addresses && response.data.addresses.length > 0) {
      let bestMatch = null;
      let bestScore = -Infinity;

      for (const address of response.data.addresses) {
        const addressText = address.roadAddress || address.jibunAddress || '';
        const score = calculateMatchScore(stopName, addressText);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = address;
        }
      }

      if (bestMatch) {
        const longitude = parseFloat(bestMatch.x);
        const latitude = parseFloat(bestMatch.y);
        const resultAddress = bestMatch.roadAddress || bestMatch.jibunAddress || null;

        return {
          success: true,
          latitude,
          longitude,
          naverPlaceId: null,
          address: resultAddress,
          title: resultAddress || stopName,
          score: bestScore
        };
      }

      const firstAddress = response.data.addresses[0];
      const longitude = parseFloat(firstAddress.x);
      const latitude = parseFloat(firstAddress.y);
      const resultAddress = firstAddress.roadAddress || firstAddress.jibunAddress || null;

      return {
        success: true,
        latitude,
        longitude,
        naverPlaceId: null,
        address: resultAddress,
        title: resultAddress || stopName,
        score: 0
      };
    }

    console.warn(`Geocoding API 응답: status=${response.data.status}, addresses=${response.data.addresses?.length || 0}`);
    return {
      success: false,
      error: `검색 결과가 없습니다. (status: ${response.data.status}, count: ${response.data.addresses?.length || 0})`
    };
  } catch (error) {
    if (error.response) {
      console.error(`네이버 Geocoding API 오류 (${error.response.status}):`, JSON.stringify(error.response.data, null, 2));
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

// 정류장 좌표 조회
async function searchStopCoordinatesV2(stopName) {
  const geocodeResult = await searchViaGeocoding(stopName);
  if (geocodeResult.success) {
    return geocodeResult;
  }

  return geocodeResult;
}

module.exports = {
  searchStopCoordinates: searchStopCoordinatesV2,
  convertNaverToWGS84
};

