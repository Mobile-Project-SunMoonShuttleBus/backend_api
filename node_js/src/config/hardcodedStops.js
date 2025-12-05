// 하드코딩된 정류장 좌표 설정
// 선문대 캠퍼스 내 정류장은 하드코딩 좌표를 사용합니다.
// 이 좌표들은 사용자가 직접 지도에서 확인하여 설정한 정확한 좌표입니다.
// 
// ⚠️ 주의: 이 좌표는 수정하지 마세요!
// - 이 좌표들은 실제 현장에서 확인된 정확한 위치입니다.
// - 좌표를 변경하면 프론트엔드에서 지도 표시가 잘못될 수 있습니다.
// - 좌표 수정이 필요한 경우, 사용자와 상의 후 진행하세요.

const hardcodedStops = {
  // 충남 아산시 선문대 정류소 (공학관 옆 셔틀장)
  // ⚠️ 이 좌표는 수정하지 마세요! 사용자가 직접 확인한 정확한 위치입니다.
  '충남 아산시 선문대 정류소': {
    latitude: 36.800113,  // 공학관 옆 셔틀장 정확한 좌표
    longitude: 127.071516, // 공학관 옆 셔틀장 정확한 좌표
    address: '충청남도 아산시 탕정면 선문로',
    title: '충남 아산시 선문대 정류소',
    isHardcoded: true
  },
  
  // 선문대학생회관 앞 (보조 탑승장)
  // ⚠️ 이 좌표는 수정하지 마세요! 사용자가 직접 확인한 정확한 위치입니다.
  // 학생회관 앞 정류장은 특정 시간대에만 사용 가능
  // studentHallBoardingAvailable: true인 스케줄에서만 사용
  '선문대학생회관 앞': {
    latitude: 36.79800,  // 학생회관 앞 보조 탑승장 정확한 좌표
    longitude: 127.0774, // 학생회관 앞 보조 탑승장 정확한 좌표
    address: '충청남도 아산시 탕정면 선문로',
    title: '선문대학생회관 앞',
    isHardcoded: true,
    availableOnlyWithStudentHall: true
  },
  
  // 별칭 지원
  '선문대 학생회관 앞': {
    // '선문대학생회관 앞'과 동일한 좌표 사용
    alias: '선문대학생회관 앞'
  }
};

/**
 * 하드코딩된 정류장 좌표 조회
 * @param {string} stopName - 정류장 이름
 * @returns {Object|null} - 좌표 정보 또는 null
 */
function getHardcodedStop(stopName) {
  const stop = hardcodedStops[stopName];
  if (!stop) return null;
  
  // 별칭인 경우 원본 정류장 정보 반환
  if (stop.alias) {
    const originalStop = hardcodedStops[stop.alias];
    if (originalStop) {
      return {
        ...originalStop,
        name: stopName // 원본 이름 유지하되, 요청한 이름도 포함
      };
    }
    return null;
  }
  
  return {
    ...stop,
    name: stopName
  };
}

/**
 * 모든 하드코딩된 정류장 목록 반환
 * @returns {Array} - 정류장 이름 배열
 */
function getAllHardcodedStopNames() {
  return Object.keys(hardcodedStops).filter(name => !hardcodedStops[name].alias);
}

module.exports = {
  hardcodedStops,
  getHardcodedStop,
  getAllHardcodedStopNames
};

