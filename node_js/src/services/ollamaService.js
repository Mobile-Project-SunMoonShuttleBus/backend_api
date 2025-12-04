/**
 * Ollama LLM 서비스
 * 셔틀 공지 분류 및 요약 생성을 위한 Ollama API 연동
 */
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
// 기본값: orca-mini:3b (약 1.9GB) - 경량 모델, 빠른 응답
// llama3.2:3b는 약 2GB, llama3:8b는 약 4.7GB 사용
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'orca-mini:3b';

// Ollama 연결 상태 확인 (최초 1회만)
let ollamaHealthChecked = false;

/**
 * Ollama 서버 연결 상태 확인
 * @returns {Promise<boolean>} 연결 가능 여부
 */
async function checkOllamaHealth() {
  try {
    const res = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, {
      timeout: 5000,
    });
    return res.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * 셔틀 관련 공지인지 분류
 * @param {string} title - 공지 제목
 * @param {string} content - 공지 내용
 * @returns {Promise<boolean>} 셔틀 관련 여부 (true: 셔틀 관련, false: 무관)
 */
async function isShuttleRelatedNotice(title, content) {
  // 최초 1회만 Ollama 상태 확인 (성능 최적화)
  if (!ollamaHealthChecked) {
    ollamaHealthChecked = true;
    const isHealthy = await checkOllamaHealth();
    if (!isHealthy) {
      console.error(`❌ Ollama 서버 연결 실패: ${OLLAMA_BASE_URL}`);
      console.error(`   - 서버가 실행 중인지 확인: docker ps | grep ollama`);
      console.error(`   - 서버 로그 확인: docker logs ollama`);
      console.error(`   - Ollama 시작: docker-compose up -d ollama`);
      throw new Error(`Ollama 서버에 연결할 수 없습니다 (${OLLAMA_BASE_URL}). 서버가 실행 중인지 확인하세요.`);
    }
    // 모델 확인
    try {
      const modelRes = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
      const models = modelRes.data?.models || [];
      const hasModel = models.some(m => m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL.split(':')[0]));
      if (!hasModel) {
        console.warn(`⚠️ 모델 ${OLLAMA_MODEL}이 다운로드되지 않았습니다.`);
        console.warn(`   모델 다운로드: docker exec ollama ollama pull ${OLLAMA_MODEL}`);
      } else {
        console.log(`✅ Ollama 서버 연결 성공: ${OLLAMA_BASE_URL}, 모델: ${OLLAMA_MODEL}`);
      }
    } catch (modelError) {
      console.warn(`⚠️ 모델 목록 확인 실패:`, modelError.message);
    }
  }
  
  try {
    // 입력 검증 및 정제 (프롬프트 인젝션 방지)
    const sanitizedTitle = (title || '').trim().substring(0, 500); // 최대 500자
    const sanitizedContent = (content || '').trim().substring(0, 5000); // 최대 5000자
    
    const prompt = `
다음 공지가 "셔틀버스/통학버스/학교 셔틀 운행"과 관련된 공지인지 판별해라.

셔틀 관련 공지의 예시:
- 셔틀버스 운행 시간 변경
- 통학버스 노선 변경
- 셔틀 운행 중단/재개
- 셔틀 정류장 변경
- 셔틀 요금/이용 안내
- 천안역/아산역 셔틀 관련
- 등하교 셔틀 관련

셔틀 무관 공지의 예시:
- 수강신청, 기말고사, 학사일정
- 장학금, 취업, 행사 안내
- 기숙사, 도서관, 식당 관련
- 일반 행정 공지

[공지 제목]
${sanitizedTitle}

[공지 내용]
${sanitizedContent}

반드시 다음 JSON 형식으로만 응답해라. 다른 텍스트 없이 JSON만 출력하라:
{
  "isShuttle": true,
  "reason": "셔틀버스 운행 시간 변경 관련 공지"
}

또는

{
  "isShuttle": false,
  "reason": "기말고사 일정 관련 공지"
}

JSON:
`.trim();

    const res = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      },
      {
        timeout: 60000, // 60초 타임아웃 (LLM 처리 시간 여유 확보 - orca-mini:3b는 느릴 수 있음)
      }
    );

    // LLM raw 응답 로깅 (디버깅용 - 전체 응답 확인)
    const rawResponse = (res.data.response || '').trim();
    console.log(`[LLM RAW] ${JSON.stringify(rawResponse)}`);
    console.log(`[LLM RAW Preview] ${rawResponse.substring(0, 500)}${rawResponse.length > 500 ? '...' : ''}`);
    
    // JSON 파싱 시도
    let parsed = null;
    let result = false;
    
    try {
      // JSON 블록 추출 (마크다운 코드 블록 제거)
      let jsonStr = rawResponse;
      
      // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      // JSON 객체만 추출 (중괄호로 시작하고 끝나는 부분)
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      
      parsed = JSON.parse(jsonStr);
      console.log(`[LLM PARSED JSON]`, JSON.stringify(parsed, null, 2));
      
      // isShuttle 필드 확인 (다양한 형태 지원)
      if (parsed.isShuttle === true || parsed.isShuttle === 'true' || 
          parsed.is_shuttle === true || parsed.is_shuttle === 'true') {
        result = true;
      } else if (parsed.isShuttle === false || parsed.isShuttle === 'false' ||
                 parsed.is_shuttle === false || parsed.is_shuttle === 'false') {
        result = false;
      } else {
        // isShuttle 필드가 없거나 예상치 못한 값인 경우
        console.warn(`[LLM 응답 파싱 경고] isShuttle 필드가 없거나 예상치 못한 값:`, parsed);
        result = false;
      }
      
      console.log(`[LLM PARSED] isShuttle=${result}, reason="${parsed.reason || 'N/A'}"`);
    } catch (parseError) {
      // JSON 파싱 실패 시 텍스트 기반 파싱 (하위 호환성)
      console.warn(`[LLM 응답 파싱 경고] JSON 파싱 실패, 텍스트 기반 파싱 시도:`, parseError.message);
      
      const answerRaw = rawResponse;
      const answer = answerRaw.trim().toUpperCase();
      
      console.log(`[LLM FALLBACK] 원본 응답: "${answerRaw}"`);
      console.log(`[LLM FALLBACK] 대문자 변환: "${answer}"`);
      
      // server.js와 동일한 방식: A-Z만 남기고 YES/NO 추출
      const cleaned = answer.replace(/[^A-Z]/g, '');
      console.log(`[LLM FALLBACK] cleaned (A-Z만): "${cleaned}"`);
      
      if (cleaned === 'YES') {
        result = true;
        console.log(`[LLM FALLBACK] YES 매칭 → TRUE`);
      } else if (cleaned === 'NO') {
        result = false;
        console.log(`[LLM FALLBACK] NO 매칭 → FALSE`);
      } else {
        // 애매한 경우: YES가 포함되어 있으면 TRUE로 처리 (더 관대하게)
        if (answer.includes('YES')) {
          result = true;
          console.log(`[LLM FALLBACK] 애매한 응답이지만 "YES" 포함 → TRUE로 처리`);
        } else {
          result = false;
          console.warn(`[LLM FALLBACK] 애매한 응답: "${answer.substring(0, 100)}" → NO로 처리`);
        }
      }
      
      console.log(`[LLM FALLBACK] 최종 결과: ${result ? 'YES' : 'NO'}`);
    }
    
    return result;
  } catch (error) {
    // Ollama 서버가 꺼져 있거나 연결 실패 시 에러 로깅 후 예외 던지기
    console.error(`❌ Ollama 호출 실패 (isShuttleRelatedNotice):`, error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error(`   - 연결 거부됨: Ollama 서버가 실행 중이지 않을 수 있습니다.`);
      console.error(`   - 확인: docker ps | grep ollama`);
      console.error(`   - 시작: docker-compose up -d ollama`);
    } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      console.error(`   - 타임아웃: Ollama 서버 응답이 너무 느립니다.`);
      console.error(`   - 서버 로그 확인: docker logs ollama`);
    } else if (error.response) {
      console.error(`   - HTTP ${error.response.status}: ${error.response.statusText}`);
      console.error(`   - 응답: ${JSON.stringify(error.response.data)}`);
    }
    console.error(`   - Ollama URL: ${OLLAMA_BASE_URL}`);
    console.error(`   - 모델: ${OLLAMA_MODEL}`);
    // Ollama 실패 시 예외를 던져서 호출자가 실패를 인지할 수 있도록 함
    throw new Error(`Ollama 연결 실패: ${error.message}`);
  }
}

/**
 * 공지 상세 내용 요약 생성
 * @param {string} title - 공지 제목
 * @param {string} content - 공지 내용
 * @returns {Promise<string>} 한글 요약 (3~5줄)
 */
async function summarizeNotice(title, content) {
  try {
    // 입력 검증 및 정제 (프롬프트 인젝션 방지)
    const sanitizedTitle = (title || '').trim().substring(0, 500); // 최대 500자
    const sanitizedContent = (content || '').trim().substring(0, 5000); // 최대 5000자
    
    const prompt = `
다음은 대학교 셔틀버스 관련 공지사항이다.
학생들이 핵심 정보만 빠르게 볼 수 있도록 요약해라.

요약 규칙:
- 한글로 작성
- 3~5줄 정도
- 운행 날짜, 노선, 시간 변경, 주의사항 중심으로 작성
- 인사말/불필요한 문장은 제거

[공지 제목]
${sanitizedTitle}

[공지 내용]
${sanitizedContent}

요약:
`.trim();

    const res = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      },
      {
        timeout: 60000, // 60초 타임아웃 (LLM 처리 시간 여유 확보 - orca-mini:3b는 느릴 수 있음)
      }
    );

    return (res.data.response || '').trim();
  } catch (error) {
    // Ollama 서버가 꺼져 있거나 연결 실패 시 에러 로깅 후 기본 메시지 반환
    console.error(`Ollama 호출 실패 (summarizeNotice):`, error.message);
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.warn(`Ollama 서버에 연결할 수 없습니다 (${OLLAMA_BASE_URL}). 기본 요약 반환.`);
    }
    // Ollama 실패 시 기본 요약 반환
    return '요약을 생성할 수 없습니다.';
  }
}

module.exports = {
  isShuttleRelatedNotice,
  summarizeNotice,
  checkOllamaHealth, // 진단용으로 export
};

