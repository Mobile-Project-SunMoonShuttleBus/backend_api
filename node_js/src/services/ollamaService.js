/**
 * Ollama LLM 서비스
 * 셔틀 공지 분류 및 요약 생성을 위한 Ollama API 연동
 */
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
// 기본값: llama3.2:3b (약 2GB) - 8GB 서버에 적합
// llama3:8b는 약 4.7GB 사용하므로 8GB 서버에서는 부담될 수 있음
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

/**
 * 셔틀 관련 공지인지 분류
 * @param {string} title - 공지 제목
 * @param {string} content - 공지 내용
 * @returns {Promise<boolean>} 셔틀 관련 여부 (true: 셔틀 관련, false: 무관)
 */
async function isShuttleRelatedNotice(title, content) {
  // 입력 검증 및 정제 (프롬프트 인젝션 방지)
  const sanitizedTitle = (title || '').trim().substring(0, 500); // 최대 500자
  const sanitizedContent = (content || '').trim().substring(0, 5000); // 최대 5000자
  
  const prompt = `
다음 공지가 "셔틀버스/통학버스/학교 셔틀 운행"과 관련된 공지인지 판별해라.
YES 또는 NO 중 하나만 출력해라.

[공지 제목]
${sanitizedTitle}

[공지 내용]
${sanitizedContent}

답:
`.trim();

  const res = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
  });

  const answer = (res.data.response || '').trim().toUpperCase();
  return answer.startsWith('Y'); // YES, Yes 등
}

/**
 * 공지 상세 내용 요약 생성
 * @param {string} title - 공지 제목
 * @param {string} content - 공지 내용
 * @returns {Promise<string>} 한글 요약 (3~5줄)
 */
async function summarizeNotice(title, content) {
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

  const res = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
  });

  return (res.data.response || '').trim();
}

module.exports = {
  isShuttleRelatedNotice,
  summarizeNotice,
};

