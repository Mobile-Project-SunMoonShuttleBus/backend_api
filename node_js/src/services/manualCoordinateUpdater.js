const BusStop = require('../models/BusStop');
const connectDB = require('../config/database');

/**
 * 구글 지도 URL에서 좌표 추출
 * @param {string} url - 구글 지도 URL
 * @returns {Object|null} - 좌표 정보 {latitude, longitude} 또는 null
 */
function extractCoordinatesFromGoogleMapsUrl(url) {
  // !3d위도!4d경도 형식
  const match3d = url.match(/!3d([0-9.]+)/);
  const match4d = url.match(/!4d([0-9.]+)/);
  
  if (match3d && match4d) {
    return {
      latitude: parseFloat(match3d[1]),
      longitude: parseFloat(match4d[1])
    };
  }
  
  // @위도,경도 형식
  const atMatch = url.match(/@([0-9.]+),([0-9.]+)/);
  if (atMatch) {
    return {
      latitude: parseFloat(atMatch[1]),
      longitude: parseFloat(atMatch[2])
    };
  }
  
  return null;
}

/**
 * 수동으로 좌표를 입력하여 정류장 좌표 업데이트
 * @param {Array<{name: string, latitude: number, longitude: number, address?: string}>} coordinates - 좌표 정보 배열
 * @returns {Promise<Object>} - 업데이트 결과
 */
async function updateStopCoordinatesManually(coordinates) {
  try {
    await connectDB();
  } catch (error) {
    console.error('MongoDB 연결 실패:', error.message);
    return {
      success: false,
      updated: [],
      failed: coordinates.map(c => ({ name: c.name, error: 'MongoDB 연결 실패' }))
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

  for (const coord of coordinates) {
    try {
      const { name, latitude, longitude, address } = coord;
      
      if (!name || !latitude || !longitude) {
        results.failed.push({
          name: name || '알 수 없음',
          error: '이름, 위도, 경도가 모두 필요합니다.'
        });
        continue;
      }

      const typeInfo = stopTypeMap[name] || {
        stopType: 'departure',
        requiresStudentHallBoarding: false
      };

      const updated = await BusStop.findOneAndUpdate(
        { name: name },
        {
          name: name,
          latitude: latitude,
          longitude: longitude,
          naverAddress: address || null,
          naverTitle: name,
          stopType: typeInfo.stopType,
          requiresStudentHallBoarding: typeInfo.requiresStudentHallBoarding,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );

      results.updated.push({
        name: name,
        latitude: latitude,
        longitude: longitude,
        address: address || null,
        stopType: typeInfo.stopType,
        requiresStudentHallBoarding: typeInfo.requiresStudentHallBoarding
      });

      console.log(`✅ ${name} 좌표 저장 완료:`, {
        latitude: latitude,
        longitude: longitude,
        stopType: typeInfo.stopType
      });
    } catch (error) {
      console.error(`${coord.name} 처리 중 오류:`, error.message);
      results.failed.push({
        name: coord.name || '알 수 없음',
        error: error.message
      });
    }
  }

  if (results.failed.length > 0) {
    results.success = false;
  }

  return results;
}

/**
 * 구글 지도 URL로 정류장 좌표 업데이트
 * @param {Array<{name: string, googleMapsUrl: string, address?: string}>} urlData - 구글 지도 URL 정보 배열
 * @returns {Promise<Object>} - 업데이트 결과
 */
async function updateStopCoordinatesFromGoogleMapsUrl(urlData) {
  try {
    await connectDB();
  } catch (error) {
    console.error('MongoDB 연결 실패:', error.message);
    return {
      success: false,
      updated: [],
      failed: urlData.map(d => ({ name: d.name, error: 'MongoDB 연결 실패' }))
    };
  }

  const results = {
    success: true,
    updated: [],
    failed: []
  };

  // 정류장 타입 정의
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

  for (const data of urlData) {
    try {
      const { name, googleMapsUrl, address } = data;
      
      if (!name || !googleMapsUrl) {
        results.failed.push({
          name: name || '알 수 없음',
          error: '이름과 구글 지도 URL이 필요합니다.'
        });
        continue;
      }

      // 구글 지도 URL에서 좌표 추출
      const coords = extractCoordinatesFromGoogleMapsUrl(googleMapsUrl);
      
      if (!coords || !coords.latitude || !coords.longitude) {
        results.failed.push({
          name: name,
          error: '구글 지도 URL에서 좌표를 추출할 수 없습니다.'
        });
        continue;
      }

      // 정류장 타입 정보 가져오기
      const typeInfo = stopTypeMap[name] || {
        stopType: 'departure',
        requiresStudentHallBoarding: false
      };

      const updated = await BusStop.findOneAndUpdate(
        { name: name },
        {
          name: name,
          latitude: coords.latitude,
          longitude: coords.longitude,
          naverAddress: address || null,
          naverTitle: name,
          stopType: typeInfo.stopType,
          requiresStudentHallBoarding: typeInfo.requiresStudentHallBoarding,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );

      results.updated.push({
        name: name,
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: address || null,
        stopType: typeInfo.stopType,
        requiresStudentHallBoarding: typeInfo.requiresStudentHallBoarding
      });

      console.log(`✅ ${name} 좌표 저장 완료:`, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        stopType: typeInfo.stopType
      });
    } catch (error) {
      console.error(`${data.name} 처리 중 오류:`, error.message);
      results.failed.push({
        name: data.name || '알 수 없음',
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
  updateStopCoordinatesManually,
  updateStopCoordinatesFromGoogleMapsUrl,
  extractCoordinatesFromGoogleMapsUrl
};

