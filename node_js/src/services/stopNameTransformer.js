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

  const normalized = stopName.replace(/\s+/g, '').toLowerCase();

  const SPECIFIC_HINTS = [
    {
      tokens: ['천안아산역', '천안 아산역', '천아산역'],
      addresses: [
        '충청남도 아산시 배방읍 희망로 100',
        '충청남도 아산시 배방읍 희망로',
        '충청남도 아산시 배방읍'
      ],
      keywords: ['천안아산역', '아산역']
    },
    {
      tokens: ['천안역'],
      addresses: [
        '충청남도 천안시 동남구 대흥로 239',
        '충청남도 천안시 동남구'
      ],
      keywords: ['천안역']
    },
    {
      tokens: ['천안터미널', '천안 터미널'],
      addresses: [
        '충청남도 천안시 동남구 신부동',
        '충청남도 천안시'
      ],
      keywords: ['천안종합터미널', '천안터미널', '천안시외버스터미널']
    },
    {
      tokens: ['온양온천역', '온양온천'],
      addresses: [
        '충청남도 아산시 온천동'
      ],
      keywords: ['온양온천역', '온양역']
    },
    {
      tokens: ['아산캠퍼스', '선문대'],
      addresses: [
        '충청남도 아산시 탕정면 선문로 221',
        '충청남도 아산시 탕정면'
      ],
      keywords: ['선문대학교 아산캠퍼스', '선문대학교']
    }
  ];

  SPECIFIC_HINTS.forEach(({ tokens, addresses, keywords }) => {
    if (tokens.some(token => normalized.includes(token.replace(/\s+/g, '').toLowerCase()))) {
      addresses.forEach(addr => transformations.push(addr));
      if (keywords) {
        keywords.forEach(word => transformations.push(word));
      }
      addresses.forEach(addr => transformations.push(`${addr} ${stopName}`));
    }
  });

  const REGION_HINTS = [
    {
      token: '천안',
      addresses: ['충청남도 천안시']
    },
    {
      token: '아산',
      addresses: ['충청남도 아산시']
    },
    {
      token: '배방',
      addresses: ['충청남도 아산시 배방읍']
    },
    {
      token: '온양',
      addresses: ['충청남도 아산시 온천동']
    },
    {
      token: '신부동',
      addresses: ['충청남도 천안시 동남구 신부동']
    }
  ];

  REGION_HINTS.forEach(({ token, addresses }) => {
    if (normalized.includes(token.replace(/\s+/g, ''))) {
      addresses.forEach(addr => {
        transformations.push(addr);
        transformations.push(`${addr} ${stopName}`);
      });
    }
  });

  // "천안 터미널" → 터미널 이름 기반 검색 우선
  if (stopName.includes('천안 터미널') || stopName === '천안 터미널') {
    // 터미널 이름 기반 검색 우선 (구체적인 이름을 먼저 시도)
    transformations.push('천안종합터미널');
    transformations.push('천안시외버스터미널');
    transformations.push('천안터미널');
    transformations.push('천안 버스터미널');
    // 주소 기반 검색은 마지막에 시도
    transformations.push('천안시 동남구 신부동 천안종합터미널');
    transformations.push('충청남도 천안시 동남구 신부동');
  }

  // "온양온천역" → 역 이름 기반 검색 우선
  if (stopName.includes('온양온천역')) {
    // 역 이름 기반 검색 우선 (구체적인 이름을 먼저 시도)
    transformations.push('온양온천역');
    transformations.push('온양역');
    transformations.push('온양온천역역');
    // 주소 기반 검색은 마지막에 시도
    transformations.push('아산시 온천동 온양온천역');
    transformations.push('충청남도 아산시 온천동');
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

  // "천안역" → 정확한 주소 기반 검색 우선
  if (stopName === '천안역') {
    // 정확한 주소 기반 검색 우선 (가장 정확)
    transformations.push('충청남도 천안시 동남구 대흥로 239');
    transformations.push('천안시 동남구 대흥로 239');
    transformations.push('동남구 대흥로 239');
    transformations.push('충청남도 천안시 동남구 대흥로');
    // 주소 + 역명 조합
    transformations.push('충청남도 천안시 동남구 천안역');
    transformations.push('천안시 동남구 천안역');
    // 역 이름만 검색
    transformations.push('천안역');
    transformations.push('천안역 KTX');
    transformations.push('KTX 천안역');
  }

  // "용암마을" → 이미 규칙 2에서 처리됨, 여기서는 추가 변형만
  if (stopName.includes('용암마을')) {
    transformations.push('용암마을');
    transformations.push('용암');
    transformations.push('용암동');
  }

  // "하이렉스파 건너편" → 하이렉스파 관련 검색
  if (stopName.includes('하이렉스파')) {
    transformations.push('하이렉스파');
    transformations.push('천안 하이렉스파');
    transformations.push('충청남도 천안시 하이렉스파');
    transformations.push('천안시 하이렉스파');
    transformations.push('하이렉스파 천안');
  }

  // "두정동 맥도날드" → 맥도날드 두정동점 검색
  if (stopName.includes('두정동') && stopName.includes('맥도날드')) {
    transformations.push('맥도날드 두정동점');
    transformations.push('맥도날드 천안 두정동');
    transformations.push('천안 두정동 맥도날드');
    transformations.push('충청남도 천안시 서북구 두정동 맥도날드');
    transformations.push('두정동');
    transformations.push('천안시 서북구 두정동');
  }

  // "홈마트 에브리데이" → 홈마트 에브리데이 검색
  if (stopName.includes('홈마트') || stopName.includes('에브리데이')) {
    transformations.push('홈마트 에브리데이');
    transformations.push('에브리데이 홈마트');
    transformations.push('천안 홈마트');
    transformations.push('천안 에브리데이');
    transformations.push('충청남도 천안시 홈마트');
    transformations.push('충청남도 천안시 에브리데이');
  }

  // "권곡초 버스정류장" → 권곡초등학교 검색
  if (stopName.includes('권곡초')) {
    transformations.push('권곡초등학교');
    transformations.push('권곡초');
    transformations.push('아산 권곡초등학교');
    transformations.push('충청남도 아산시 권곡초등학교');
    transformations.push('아산시 권곡초등학교');
    transformations.push('권곡초등학교 버스정류장');
  }

  // "서울대정병원" → 서울대정병원 검색
  if (stopName.includes('서울대정병원') || stopName.includes('서울대정병원')) {
    transformations.push('서울대정병원');
    transformations.push('서울대학교병원 천안');
    transformations.push('서울대병원 천안');
    transformations.push('천안 서울대정병원');
    transformations.push('충청남도 천안시 서울대정병원');
    transformations.push('천안시 서울대정병원');
    transformations.push('서울대학교 천안병원');
  }

  // "주은아파트 버스정류장" → 주은아파트 검색
  if (stopName.includes('주은아파트')) {
    transformations.push('주은아파트');
    transformations.push('아산 주은아파트');
    transformations.push('충청남도 아산시 주은아파트');
    transformations.push('아산시 주은아파트');
    transformations.push('주은아파트 아산');
    transformations.push('주은아파트 정류장');
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

