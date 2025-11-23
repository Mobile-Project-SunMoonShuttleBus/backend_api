const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 네이버 클라우드 플랫폼 Maps API 키
const NAVER_API_KEY_ID = process.env.NAVER_CLIENT_ID; // x-ncp-apigw-api-key-id
const NAVER_API_KEY = process.env.NAVER_CLIENT_SECRET; // x-ncp-apigw-api-key

const axiosInstance = axios.create({
  timeout: 10000
});

/**
 * 네이버 Directions 5 API로 경로 계산
 * @param {Object} params - 경로 계산 파라미터
 * @param {string} params.start - 출발지 좌표 (경도,위도)
 * @param {string} params.goal - 목적지 좌표 (경도,위도) 또는 여러 목적지 (경도,위도:경도,위도)
 * @param {Array<{lat: number, lng: number}>} params.waypoints - 경유지 좌표 배열 (최대 5개)
 * @param {string} params.option - 경로 옵션 (trafast: 최단시간, tracomfort: 최적경로, traavoidtoll: 무료도로우선)
 * @returns {Promise<Object>} - 경로 정보
 */
async function getDirections(params) {
  if (!NAVER_API_KEY_ID || !NAVER_API_KEY) {
    throw new Error('네이버 API 키가 설정되지 않았습니다.');
  }

  try {
    const { start, goal, waypoints = [], option = 'trafast' } = params;

    // 출발지 좌표 형식 변환
    const startCoord = typeof start === 'string' ? start : `${start.lng},${start.lat}`;
    
    // 목적지 좌표 형식 변환
    let goalCoord;
    if (Array.isArray(goal)) {
      goalCoord = goal.map(g => typeof g === 'string' ? g : `${g.lng},${g.lat}`).join(':');
    } else {
      goalCoord = typeof goal === 'string' ? goal : `${goal.lng},${goal.lat}`;
    }

    // 경유지가 있으면 waypoints 파라미터 추가
    const queryParams = {
      start: startCoord,
      goal: goalCoord,
      option: option
    };

    if (waypoints.length > 0 && waypoints.length <= 5) {
      const waypointsStr = waypoints.map(wp => 
        typeof wp === 'string' ? wp : `${wp.lng},${wp.lat}`
      ).join(':');
      queryParams.waypoints = waypointsStr;
    }

    const response = await axiosInstance.get('https://maps.apigw.ntruss.com/maps/v5/driving', {
      params: queryParams,
      headers: {
        'x-ncp-apigw-api-key-id': NAVER_API_KEY_ID,
        'x-ncp-apigw-api-key': NAVER_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && response.data.route && response.data.route.traoptimal) {
      const route = response.data.route.traoptimal[0];
      
      return {
        success: true,
        distance: route.summary.distance, // 미터 단위
        duration: route.summary.duration, // 밀리초 단위
        path: route.path, // 경로 좌표 배열 [[lng, lat], ...]
        guide: route.guide, // 경로 안내 정보
        section: route.section, // 구간별 정보
        summary: route.summary
      };
    }

    return {
      success: false,
      error: '경로를 찾을 수 없습니다.'
    };
  } catch (error) {
    if (error.response) {
      console.error(`네이버 Directions API 오류 (${error.response.status}):`, error.response.data);
      return {
        success: false,
        error: `네이버 Directions API 오류: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      };
    } else if (error.request) {
      console.error('네이버 Directions API 요청 실패:', error.message);
      return {
        success: false,
        error: '네이버 Directions API 요청 실패'
      };
    } else {
      console.error('네이버 Directions API 오류:', error.message);
      return {
        success: false,
        error: error.message || '네이버 Directions API 요청 실패'
      };
    }
  }
}

/**
 * 네이버 Directions 15 API로 경로 계산 (경유지 15개까지)
 * @param {Object} params - 경로 계산 파라미터
 * @param {string} params.start - 출발지 좌표 (경도,위도)
 * @param {string} params.goal - 목적지 좌표 (경도,위도)
 * @param {Array<{lat: number, lng: number}>} params.waypoints - 경유지 좌표 배열 (최대 15개)
 * @param {string} params.option - 경로 옵션
 * @returns {Promise<Object>} - 경로 정보
 */
async function getDirections15(params) {
  if (!NAVER_API_KEY_ID || !NAVER_API_KEY) {
    throw new Error('네이버 API 키가 설정되지 않았습니다.');
  }

  try {
    const { start, goal, waypoints = [], option = 'trafast' } = params;

    const startCoord = typeof start === 'string' ? start : `${start.lng},${start.lat}`;
    const goalCoord = typeof goal === 'string' ? goal : `${goal.lng},${goal.lat}`;

    const queryParams = {
      start: startCoord,
      goal: goalCoord,
      option: option
    };

    if (waypoints.length > 0 && waypoints.length <= 15) {
      const waypointsStr = waypoints.map(wp => 
        typeof wp === 'string' ? wp : `${wp.lng},${wp.lat}`
      ).join(':');
      queryParams.waypoints = waypointsStr;
    }

    const response = await axiosInstance.get('https://maps.apigw.ntruss.com/maps/v5/driving', {
      params: queryParams,
      headers: {
        'x-ncp-apigw-api-key-id': NAVER_API_KEY_ID,
        'x-ncp-apigw-api-key': NAVER_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && response.data.route && response.data.route.traoptimal) {
      const route = response.data.route.traoptimal[0];
      
      return {
        success: true,
        distance: route.summary.distance,
        duration: route.summary.duration,
        path: route.path,
        guide: route.guide,
        section: route.section,
        summary: route.summary
      };
    }

    return {
      success: false,
      error: '경로를 찾을 수 없습니다.'
    };
  } catch (error) {
    if (error.response) {
      console.error(`네이버 Directions 15 API 오류 (${error.response.status}):`, error.response.data);
      return {
        success: false,
        error: `네이버 Directions 15 API 오류: ${error.response.status} - ${JSON.stringify(error.response.data)}`
      };
    } else {
      console.error('네이버 Directions 15 API 오류:', error.message);
      return {
        success: false,
        error: error.message || '네이버 Directions 15 API 요청 실패'
      };
    }
  }
}

/**
 * Reverse Geocoding API로 좌표에서 주소 조회
 * @param {number} longitude - 경도
 * @param {number} latitude - 위도
 * @returns {Promise<Object>} - 주소 정보
 */
async function reverseGeocode(longitude, latitude) {
  if (!NAVER_API_KEY_ID || !NAVER_API_KEY) {
    throw new Error('네이버 API 키가 설정되지 않았습니다.');
  }

  try {
    const response = await axiosInstance.get('https://maps.apigw.ntruss.com/map-geocode/v2/geocode', {
      params: {
        coords: `${longitude},${latitude}`,
        output: 'json'
      },
      headers: {
        'x-ncp-apigw-api-key-id': NAVER_API_KEY_ID,
        'x-ncp-apigw-api-key': NAVER_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 5000
    });

    if (response.data.status === 'OK' && response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      return {
        success: true,
        address: result.region.area1.name + ' ' + result.region.area2.name + ' ' + result.region.area3.name,
        roadAddress: result.land?.name || null,
        jibunAddress: result.region.area1.name + ' ' + result.region.area2.name + ' ' + result.region.area3.name
      };
    }

    return {
      success: false,
      error: '주소를 찾을 수 없습니다.'
    };
  } catch (error) {
    if (error.response) {
      console.error(`네이버 Reverse Geocoding API 오류 (${error.response.status}):`, error.response.data);
      return {
        success: false,
        error: `네이버 Reverse Geocoding API 오류: ${error.response.status}`
      };
    } else {
      console.error('네이버 Reverse Geocoding API 오류:', error.message);
      return {
        success: false,
        error: error.message || '네이버 Reverse Geocoding API 요청 실패'
      };
    }
  }
}

module.exports = {
  getDirections,
  getDirections15,
  reverseGeocode
};

