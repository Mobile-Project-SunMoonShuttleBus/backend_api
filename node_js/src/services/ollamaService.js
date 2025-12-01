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

/**
 * 셔틀 관련 공지인지 분류
 * @param {string} title - 공지 제목
 * @param {string} content - 공지 내용
 * @returns {Promise<boolean>} 셔틀 관련 여부 (true: 셔틀 관련, false: 무관)
 */
async function isShuttleRelatedNotice(title, content) {
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

반드시 YES 또는 NO 중 하나만 출력해라. 다른 설명 없이 YES 또는 NO만 출력하라.

[공지 제목]
${sanitizedTitle}

[공지 내용]
${sanitizedContent}

답:
`.trim();

    const res = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
      },
      {
        timeout: 20000, // 20초 타임아웃 (LLM 처리 시간 여유 확보)
      }
    );

    const answer = (res.data.response || '').trim().toUpperCase();
    
    // LLM 응답 파싱: YES/NO 판별 (더 정확한 파싱)
    // "YES", "Yes", "Y" 등으로 시작하거나 포함하는 경우
    const isYes = /^YES\b|^Y\b|^YES\s|^Y\s/.test(answer) || answer.includes('YES');
    // "NO", "No", "N" 등으로 시작하거나 포함하는 경우
    const isNo = /^NO\b|^N\b|^NO\s|^N\s/.test(answer) || (answer.includes('NO') && !answer.includes('YES'));
    
    // 명확한 YES/NO가 없으면 로그 경고 후 안전하게 false 반환
    let result = false;
    if (isYes && !isNo) {
      result = true;
    } else if (isNo && !isYes) {
      result = false;
    } else {
      // 애매한 응답인 경우 로그 경고
      console.warn(`[LLM 응답 파싱 경고] 애매한 응답: "${answer.substring(0, 100)}" → NO로 처리`);
      result = false; // 안전하게 false 반환
    }
    
    console.log(`[LLM 응답] ${answer.substring(0, 100)}... → ${result ? 'YES' : 'NO'}`);
    return result;
  } catch (error) {
    // Ollama 서버가 꺼져 있거나 연결 실패 시 에러 로깅 후 예외 던지기
    console.error(`Ollama 호출 실패 (isShuttleRelatedNotice):`, error.message);
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.error(`❌ Ollama 서버에 연결할 수 없습니다 (${OLLAMA_BASE_URL}). 서버가 실행 중인지 확인하세요.`);
    }
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
        timeout: 20000, // 20초 타임아웃 (LLM 처리 시간 여유 확보)
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
};

