// 하드코딩된 정류장 좌표 설정
// 이 파일에서 좌표를 직접 수정할 수 있습니다.

const hardcodedStops = {
  // 충남 아산시 선문대 정류소
  '충남 아산시 선문대 정류소': {
    latitude: 36.790013,  // TODO: 정확한 좌표로 수정 필요
    longitude: 127.002474, // TODO: 정확한 좌표로 수정 필요
    address: '충청남도 아산시 배방읍',
    title: '충남 아산시 선문대 정류소',
    isHardcoded: true
  },
  
  // 선문대학생회관 앞
  '선문대학생회관 앞': {
    latitude: 36.790013,  // TODO: 정확한 좌표로 수정 필요
    longitude: 127.002474, // TODO: 정확한 좌표로 수정 필요
    address: '충청남도 아산시 배방읍',
    title: '선문대학생회관 앞',
    isHardcoded: true,
    // 학생회관 앞 정류장은 특정 시간대에만 사용 가능
    // studentHallBoardingAvailable: true인 스케줄에서만 사용
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

