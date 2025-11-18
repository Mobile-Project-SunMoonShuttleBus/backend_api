// 정류장 이름 변환 서비스
// 나중에 LLM 모델로 교체 가능하도록 구조화

/**
 * 정류장 이름을 검색 가능한 형태로 변환
 * @param {string} stopName - 원본 정류장 이름
 * @returns {string[]} - 변환된 정류장 이름 목록 (우선순위 순)
 */
function transformStopName(stopName) {
  if (!stopName) return [stopName];

  const transformations = [];

  // 원본 이름을 첫 번째로 유지
  transformations.push(stopName);

  // 규칙 1: 특정 정류장의 우선 변환 (다른 규칙보다 먼저)
  // "용암마을" → "아산시 용암동" 우선 (청주시 용암동과 구분)
  if (stopName.includes('용암마을')) {
    transformations.push('아산시 용암동');
    transformations.push('충청남도 아산시 용암동');
    transformations.push('아산 용암동');
  }

  // 규칙 2: 특정 패턴 변환 (공백 제거보다 먼저)
  // "천안 아산역" → 주소 기반 검색 (지도에서는 나오지만 Geocoding API는 주소 기반)
  if (stopName.includes('천안 아산역') || stopName === '천안 아산역') {
    // 지도에서 "아산 배방읍"에 위치함
    transformations.push('아산시 배방읍');
    transformations.push('아산 배방읍');
    transformations.push('충청남도 아산시 배방읍');
    // 역 이름도 시도
    transformations.push('천안아산역');
    transformations.push('아산역');
    transformations.push('천안아산역 KTX');
  }

  // "천안 터미널" → 주소 기반 검색 (지도에서 "천안 동남구 신부동"에 위치)
  if (stopName.includes('천안 터미널') || stopName === '천안 터미널') {
    // 지도에서 "천안 동남구 신부동"에 위치함
    transformations.push('천안시 동남구 신부동');
    transformations.push('천안 동남구 신부동');
    transformations.push('충청남도 천안시 동남구 신부동');
    // 터미널 이름도 시도
    transformations.push('천안종합터미널');
    transformations.push('천안시외버스터미널');
    transformations.push('천안터미널');
  }

  // "온양온천역" → 주소 기반 검색 (지도에서 "아산 온천동"에 위치)
  if (stopName.includes('온양온천역')) {
    // 지도에서 "아산 온천동"에 위치함
    transformations.push('아산시 온천동');
    transformations.push('아산 온천동');
    transformations.push('충청남도 아산시 온천동');
    // 역 이름도 시도
    transformations.push('온양온천역');
    transformations.push('온양역');
  }

  // 규칙 3: "캠퍼스" 키워드가 있으면 "선문대학교" 추가
  if (stopName.includes('캠퍼스')) {
    const transformed = stopName.replace(/캠퍼스/g, '선문대학교 캠퍼스');
    if (transformed !== stopName) {
      transformations.push(transformed);
    }
    // "아산캠퍼스" → "선문대학교 아산캠퍼스"
    if (stopName.includes('아산캠퍼스')) {
      transformations.push('선문대학교 아산캠퍼스');
    }
  }

  // 규칙 4: 공백 제거 (예: "천안 아산역" → "천안아산역")
  if (stopName.includes(' ')) {
    const noSpace = stopName.replace(/\s+/g, '');
    if (noSpace !== stopName) {
      transformations.push(noSpace);
    }
  }

  // "천안역" → "천안역", "천안역역", "충청남도 천안시"
  if (stopName === '천안역') {
    transformations.push('천안역');
    transformations.push('천안역역');
    transformations.push('충청남도 천안시');
    transformations.push('천안시');
  }

  // "용암마을" → 이미 규칙 2에서 처리됨, 여기서는 추가 변형만
  if (stopName.includes('용암마을')) {
    transformations.push('용암마을');
    transformations.push('용암');
    transformations.push('용암동');
  }

  // "야탑역 하나은행 앞" → "야탑역 하나은행", "야탑역", "야탑"
  if (stopName.includes('야탑역')) {
    if (stopName.includes('하나은행')) {
      transformations.push('야탑역 하나은행');
      transformations.push('야탑역하나은행');
    }
    transformations.push('야탑역');
    transformations.push('야탑');
  }

  // "아산캠퍼스" → "선문대학교 아산캠퍼스", "선문대 아산캠퍼스", "아산"
  if (stopName.includes('아산캠퍼스')) {
    transformations.push('선문대학교 아산캠퍼스');
    transformations.push('선문대 아산캠퍼스');
    transformations.push('선문대학교');
    transformations.push('아산');
  }

  // 긴 정류장 이름에서 핵심 키워드 추출
  // "서현역에서 수내역방향 공항버스 정류장 전방 10m 지점 경부고속도로 죽전간이 정류장"
  // → "서현역", "수내역", "죽전", "경부고속도로"
  if (stopName.includes('서현역') || stopName.includes('수내역') || stopName.includes('죽전')) {
    if (stopName.includes('서현역')) {
      transformations.push('서현역');
      transformations.push('서현');
    }
    if (stopName.includes('수내역')) {
      transformations.push('수내역');
      transformations.push('수내');
    }
    if (stopName.includes('죽전')) {
      transformations.push('죽전');
      transformations.push('죽전동');
    }
    if (stopName.includes('경부고속도로')) {
      transformations.push('경부고속도로');
    }
  }

  // 중복 제거 및 원본 우선순위 유지
  const unique = [];
  const seen = new Set();
  
  for (const name of transformations) {
    if (name && !seen.has(name)) {
      seen.add(name);
      unique.push(name);
    }
  }

  return unique;
}

/**
 * LLM 모델을 사용한 정류장 이름 변환 (향후 구현)
 * @param {string} stopName - 원본 정류장 이름
 * @returns {Promise<string[]>} - 변환된 정류장 이름 목록
 */
async function transformStopNameWithLLM(stopName) {
  // TODO: 나중에 LLM 모델로 교체
  // 예시:
  // const llmResult = await callLLMModel(stopName);
  // return llmResult.transformedNames;
  
  // 현재는 하드코딩된 규칙 사용
  return transformStopName(stopName);
}

module.exports = {
  transformStopName,
  transformStopNameWithLLM
};

