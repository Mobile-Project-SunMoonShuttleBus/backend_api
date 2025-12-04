/**
 * 셔틀 공지 서비스
 * 포털 공지 수집, LLM 분류, DB 저장 및 조회 기능
 */
const axios = require('axios');
const cheerio = require('cheerio');
const ShuttleNotice = require('../models/ShuttleNotice');
const { isShuttleRelatedNotice, summarizeNotice } = require('./ollamaService');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // puppeteer가 설치되지 않은 경우 무시
}

// 동시 실행 방지: 현재 실행 중인 동기화 작업 추적
let isSyncInProgress = false;
let syncPromise = null;

// 선문대 포털 공지사항 URL
const NOTICE_LIST_URL = 'https://lily.sunmoon.ac.kr/Page2/Story/Notice.aspx';
const NOTICE_BASE_URL = 'https://lily.sunmoon.ac.kr/Page2/Story/';

/**
 * 키워드 기반 셔틀 관련 공지 판정 (LLM 실패 시 fallback)
 * @param {string} title - 공지 제목
 * @param {string} content - 공지 내용
 * @returns {boolean} 셔틀 관련 여부
 */
function checkShuttleKeywords(title, content) {
  const text = `${title || ''} ${content || ''}`.toLowerCase();
  
  // 셔틀/버스 관련 키워드 (실제 운행 관련 표현만) - server.js와 동일한 패턴
  const shuttleKeywords = [
    '셔틀버스',
    '셔틀 버스',
    '통학버스',
    '통학 버스',
    '스쿨버스',
    '스쿨 버스',
    '심야버스',  // server.js에 있던 키워드 추가
    '셔틀',
    '정류장',
    '노선',
    '운행',
    '통학 셔틀',
    '셔틀 운행',
    '셔틀노선',
    '셔틀 노선',
    '셔틀정류장',
    '셔틀 정류장',
    '셔틀 시간',
    '셔틀시간표',
    '셔틀 시간표',
    '천안역 셔틀',
    '아산역 셔틀',
    '천안아산역 셔틀',
    '등하교 셔틀',
    '등하교셔틀',
    '통학차량',
    '통학 차량',
    '셔틀차량',
    '셔틀 차량'
  ];
  
  // 제외 키워드 (교통 무관 공지 필터링)
  const excludeKeywords = [
    '굿네이버스',
    '굿 네이버스',
    'good neighbors',
    '글로벌 fly',
    'fly',
    'rise',
    '모집',
    '서류 합격',
    '면접 안내',
    '채용',
    '인턴십',
    '취업',
    '장학금',
    '행사',
    '프로그램',
    '챌린지',
    '진단',
    '설문',
    '공모전',
    '특강',
    '비교과',
    '인성역량',
    '자격증 과정'
  ];
  
  // 제외 키워드가 포함되어 있으면 무조건 false
  for (const excludeKeyword of excludeKeywords) {
    if (text.includes(excludeKeyword.toLowerCase())) {
      return false;
    }
  }
  
  // 셔틀 키워드가 포함되어 있으면 true
  for (const keyword of shuttleKeywords) {
    if (text.includes(keyword.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * URL 화이트리스트 검증 (SSRF 방지)
 * @param {string} url - 검증할 URL
 * @returns {boolean} 허용된 도메인인지 여부
 */
function isAllowedUrl(url) {
  try {
    const urlObj = new URL(url);
    // 선문대 포털 도메인만 허용
    const allowedDomains = ['lily.sunmoon.ac.kr', 'sunmoon.ac.kr'];
    return allowedDomains.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain));
  } catch (e) {
    return false;
  }
}

/**
 * HTML 페이지 로드 (기존 크롤링 서비스와 동일한 패턴)
 * SSRF 방지를 위해 URL 화이트리스트 검증 포함
 * @param {string} url - 크롤링할 URL
 * @returns {Promise<string>} HTML 문자열
 */
async function fetchHtml(url) {
  // SSRF 방지: 허용된 도메인만 접근 가능
  if (!isAllowedUrl(url)) {
    throw new Error(`허용되지 않은 도메인입니다: ${url}`);
  }
  const usePuppeteer = process.env.USE_PUPPETEER !== 'false' && puppeteer !== null;
  
  if (usePuppeteer) {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      await page.waitForSelector('body', { timeout: 10000 }).catch(() => {});
      
      const html = await page.evaluate(() => {
        return document.documentElement.outerHTML;
      });
      
      await browser.close();
      return html;
    } catch (error) {
      console.warn(`Puppeteer로 HTML 가져오기 실패 (${url}), axios로 폴백:`, error.message);
    }
  }
  
  // axios로 기본 요청
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`HTML 가져오기 실패 (${url}):`, error.message);
    throw error;
  }
}

/**
 * 날짜 문자열을 Date 객체로 변환
 * @param {string} dateStr - 날짜 문자열 (예: "2025-11-22", "2025.11.22")
 * @returns {Date} Date 객체
 */
function parseDate(dateStr) {
  if (!dateStr) return new Date();
  
  // 다양한 날짜 형식 처리
  const cleaned = dateStr.trim().replace(/\./g, '-');
  const dateMatch = cleaned.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  
  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  return new Date(dateStr);
}

/**
 * 공지 상세 페이지에서 본문 내용 추출
 * @param {string} noticeUrl - 공지 상세 페이지 URL
 * @returns {Promise<string>} 공지 본문 내용
 */
async function fetchNoticeContent(noticeUrl) {
  try {
    const html = await fetchHtml(noticeUrl);
    const $ = cheerio.load(html);
    
    // 공지 본문 영역 찾기 (일반적인 패턴들 시도)
    let content = '';
    
    // 방법 1: id나 class에 content, body, article 등이 포함된 요소
    const contentSelectors = [
      '#content',
      '.content',
      '#noticeContent',
      '.noticeContent',
      '#articleContent',
      '.articleContent',
      '#mainContent',
      '.mainContent',
      'div[id*="content"]',
      'div[class*="content"]',
      'div[id*="Content"]',
      'div[class*="Content"]'
    ];
    
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().trim();
        if (content.length > 50) break; // 충분한 내용이 있으면 사용
      }
    }
    
    // 방법 2: table 내부의 td 요소들
    if (!content || content.length < 50) {
      let tableContent = '';
      $('table td').each((i, elem) => {
        const text = $(elem).text().trim();
        if (text.length > 50 && !text.includes('첨부파일') && !text.includes('이전글') && !text.includes('다음글')) {
          tableContent += text + '\n';
        }
      });
      if (tableContent.length > 50) {
        content = tableContent.trim();
      }
    }
    
    // 방법 3: body에서 스크립트, 스타일, 헤더, 푸터 제외한 텍스트
    if (!content || content.length < 50) {
      $('script, style, header, footer, nav').remove();
      content = $('body').text().trim();
      
      // 제목과 불필요한 텍스트 제거
      const lines = content.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 10 && 
               !trimmed.includes('홈') && 
               !trimmed.includes('로그인') &&
               !trimmed.includes('메뉴');
      });
      content = lines.join('\n');
    }
    
    return content || '내용을 가져올 수 없습니다.';
  } catch (error) {
    console.error(`공지 본문 가져오기 실패 (${noticeUrl}):`, error.message);
    return '내용을 가져올 수 없습니다.';
  }
}

/**
 * 선문대 포털에서 공지사항 목록 및 상세 내용 수집
 * 실제 HTML 구조: 테이블 형태, 각 행에 아이콘|분류|제목(링크)|작성자|입력일자|조회수
 * 페이지네이션 지원: ?cp= 형식으로 페이지네이션 처리 (올해 공지가 없는 페이지가 나올 때까지, 제한 없음)
 * @returns {Promise<Array>} 포털 공지 리스트
 */
async function fetchPortalNoticesFromPortal() {
  try {
    
    // Puppeteer 사용 여부 확인 (현재는 Puppeteer 없이도 ?cp= 형식으로 페이지네이션 가능)
    const usePuppeteer = puppeteer !== null && process.env.USE_PUPPETEER !== 'false';
    
    if (usePuppeteer) {
      console.log('Puppeteer를 사용하여 크롤링합니다.');
      return await fetchPortalNoticesWithPuppeteer();
    } else {
      console.log('Puppeteer 없이 ?cp= 형식으로 페이지네이션합니다.');
    }
    
    // Puppeteer 없이 ?cp=1, ?cp=2 형식으로 페이지네이션 처리
    const targetYear = new Date().getFullYear();
    const yearStr = String(targetYear);
    const allNotices = [];
    
    // 안전장치: 페이지 상한선 (무한루프 방지)
    const MAX_PAGES = 300;
    
    console.log(`올해(${targetYear}) 공지만 수집합니다. (Puppeteer 없이)`);
    
    for (let page = 1; page <= MAX_PAGES; page++) {
      const listUrl = `${NOTICE_LIST_URL}?cp=${page}`;
      console.log(`\n📄 페이지 ${page} 크롤링 시작: ${listUrl}`);
      console.log(`   현재까지 수집된 공지: ${allNotices.length}개`);
      
      try {
        const html = await fetchHtml(listUrl);
        const $ = cheerio.load(html);
        
        const pageNotices = [];
        
        // 공지 제목 a 태그는 Notice_view.aspx로 링크됨 (crawler.js와 동일한 로직)
        $('a[href*="Notice_view.aspx"]').each((i, el) => {
          const $a = $(el);
          const title = $a.text().trim();
          if (!title) return;
          
          // 상세 페이지 URL (상대경로 → 절대경로) - crawler.js와 동일
          let url = $a.attr('href') || '';
          url = new URL(url, NOTICE_LIST_URL).href;
          
          const $row = $a.closest('tr');
          const $tds = $row.find('td');
          
          // 번호 / 구분 / 제목 / 작성자 / 입력일자 / 조회
          // 보통 "입력일자"가 끝에서 두 번째 td라고 가정 (crawler.js와 동일)
          let date = '';
          if ($tds.length >= 2) {
            date = $tds.eq($tds.length - 2).text().trim();
          }
          
          pageNotices.push({ title, url, date });
        });
        
        // 이 페이지에서 공지 자체가 없으면 → 더 이상 페이지 없다고 보고 종료
        if (pageNotices.length === 0) {
          console.log(`❌ 페이지 ${page}에서 공지가 없습니다. 크롤링 종료.`);
          break;
        }
        
        console.log(`   페이지 ${page}에서 발견된 공지 링크 개수: ${pageNotices.length}개`);
        
        // 이번 페이지에서 targetYear(예: "2025") 공지만 필터링
        const currentYearNotices = pageNotices.filter(
          (n) => n.date && n.date.startsWith(yearStr)
        );
        
        console.log(`   페이지 ${page}에서 올해(${targetYear}) 공지: ${currentYearNotices.length}개`);
        
        // 올해 공지들 처리 (상세 내용 가져오기)
        for (const noticeInfo of currentYearNotices) {
          // 공지 ID 추출
          const noMatch = noticeInfo.url.match(/no=(\d+)/);
          const portalNoticeId = noMatch ? noMatch[1] : `notice_${allNotices.length}`;
          
          // 날짜 파싱
          const postedAt = noticeInfo.date ? parseDate(noticeInfo.date) : new Date();
          
          // 공지 상세 페이지에서 본문 가져오기
          const globalIndex = allNotices.length + 1;
          console.log(`   [${globalIndex}] 공지 상세 페이지 접속: ${noticeInfo.title.substring(0, 40)}...`);
          
          let content = '';
          try {
            content = await fetchNoticeContent(noticeInfo.url);
          } catch (contentError) {
            console.error(`   ⚠️ 공지 본문 가져오기 실패: ${contentError.message}`);
            content = '';
          }
          
          // 공지 추가
          if (noticeInfo.title && noticeInfo.title.trim()) {
            if (content && content.trim() && content !== '내용을 가져올 수 없습니다.') {
              allNotices.push({
                portalNoticeId,
                title: noticeInfo.title.trim(),
                content: content.trim(),
                url: noticeInfo.url,
                postedAt
              });
            } else {
              allNotices.push({
                portalNoticeId,
                title: noticeInfo.title.trim(),
                content: noticeInfo.title.trim(), // 제목을 내용으로 사용
                url: noticeInfo.url,
                postedAt
              });
            }
          }
          
          // 서버 부하 방지를 위한 대기
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        console.log(`   페이지 ${page} 처리 완료. 현재까지 수집: ${allNotices.length}개`);
        
        // 이 페이지에 올해 공지가 하나도 없다면 → 이후는 더 오래된 공지라고 보고 종료
        if (currentYearNotices.length === 0) {
          console.log(`❌ 페이지 ${page}에 올해(${targetYear}) 공지가 없습니다. 크롤링 종료.`);
          break;
        }
        
        // 다음 페이지로 계속 진행
        console.log(`   → 다음 페이지(${page + 1})로 진행합니다.`);
        
      } catch (error) {
        console.error(`페이지 ${page} 크롤링 중 오류:`, error.message);
        // 오류가 발생해도 다음 페이지 시도 (단, 연속 오류는 방지)
        if (page > 1) {
          console.log(`페이지 ${page} 오류로 인해 크롤링 종료.`);
          break;
        }
      }
    }
    
    console.log(`총 ${allNotices.length}개의 올해(${targetYear}) 공지를 수집했습니다. (Puppeteer 없이)`);
    return allNotices;
    
  } catch (error) {
    console.error('포털 공지 크롤링 오류:', error);
    throw error;
  }
}

/**
 * ?cp=1, ?cp=2 형식으로 페이지네이션 처리하며 올해 공지만 수집
 * 올해 공지가 없는 페이지가 나오면 종료 (제한 없음)
 * @returns {Promise<Array>} 포털 공지 리스트
 */
async function fetchPortalNoticesWithPuppeteer() {
  const targetYear = new Date().getFullYear();
  const yearStr = String(targetYear);
  const allNotices = [];
  
  // 안전장치: 페이지 상한선 (무한루프 방지)
  const MAX_PAGES = 300;
  
  console.log(`올해(${targetYear}) 공지만 수집합니다.`);
  
  for (let page = 1; page <= MAX_PAGES; page++) {
    const listUrl = `${NOTICE_LIST_URL}?cp=${page}`;
    console.log(`공지사항 목록 페이지 접속 (페이지 ${page}): ${listUrl}`);
    
    try {
      const html = await fetchHtml(listUrl);
      const $ = cheerio.load(html);
      
      const pageNotices = [];
      
      // 공지 제목 a 태그는 Notice_view.aspx로 링크됨 (crawler.js와 동일한 로직)
      $('a[href*="Notice_view.aspx"]').each((i, el) => {
        const $a = $(el);
        const title = $a.text().trim();
        if (!title) return;
        
        // 상세 페이지 URL (상대경로 → 절대경로) - crawler.js와 동일
        let url = $a.attr('href') || '';
        url = new URL(url, NOTICE_LIST_URL).href;
        
        const $row = $a.closest('tr');
        const $tds = $row.find('td');
        
        // 번호 / 구분 / 제목 / 작성자 / 입력일자 / 조회
        // 보통 "입력일자"가 끝에서 두 번째 td라고 가정 (crawler.js와 동일)
        let date = '';
        if ($tds.length >= 2) {
          date = $tds.eq($tds.length - 2).text().trim();
        }
        
        pageNotices.push({ title, url, date });
      });
      
      // 이 페이지에서 공지 자체가 없으면 → 더 이상 페이지 없다고 보고 종료
      if (pageNotices.length === 0) {
        console.log(`페이지 ${page}에서 공지가 없습니다. 크롤링 종료.`);
        break;
      }
      
      console.log(`페이지 ${page}에서 발견된 공지 링크 개수: ${pageNotices.length}`);
      
      // 이번 페이지에서 targetYear(예: "2025") 공지만 필터링
      const currentYearNotices = pageNotices.filter(
        (n) => n.date && n.date.startsWith(yearStr)
      );
      
      console.log(`페이지 ${page}에서 올해(${targetYear}) 공지: ${currentYearNotices.length}개`);
      
      // 올해 공지들 처리 (상세 내용 가져오기)
      for (const noticeInfo of currentYearNotices) {
        // 공지 ID 추출
        const noMatch = noticeInfo.url.match(/no=(\d+)/);
        const portalNoticeId = noMatch ? noMatch[1] : `notice_${allNotices.length}`;
        
        // 날짜 파싱
        const postedAt = noticeInfo.date ? parseDate(noticeInfo.date) : new Date();
        
        // 공지 상세 페이지에서 본문 가져오기
        const globalIndex = allNotices.length + 1;
        console.log(`공지 상세 페이지 접속: ${noticeInfo.url} (${globalIndex}, 페이지 ${page}) - ${noticeInfo.title.substring(0, 30)}...`);
        
        let content = '';
        try {
          content = await fetchNoticeContent(noticeInfo.url);
        } catch (contentError) {
          console.error(`공지 본문 가져오기 실패 (${noticeInfo.title.substring(0, 30)}...):`, contentError.message);
          content = '';
        }
        
        // 공지 추가
        if (noticeInfo.title && noticeInfo.title.trim()) {
          if (content && content.trim() && content !== '내용을 가져올 수 없습니다.') {
            allNotices.push({
              portalNoticeId,
              title: noticeInfo.title.trim(),
              content: content.trim(),
              url: noticeInfo.url,
              postedAt
            });
          } else {
            allNotices.push({
              portalNoticeId,
              title: noticeInfo.title.trim(),
              content: noticeInfo.title.trim(), // 제목을 내용으로 사용
              url: noticeInfo.url,
              postedAt
            });
            console.warn(`공지 본문 없음, 제목만 사용: ${noticeInfo.title.substring(0, 30)}...`);
          }
        }
        
        // 서버 부하 방지를 위한 대기
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // 이 페이지에 올해 공지가 하나도 없다면 → 이후는 더 오래된 공지라고 보고 종료
      if (currentYearNotices.length === 0) {
        console.log(`페이지 ${page}에 올해(${targetYear}) 공지가 없습니다. 크롤링 종료.`);
        break;
      }
      
    } catch (error) {
      console.error(`페이지 ${page} 크롤링 중 오류:`, error.message);
      // 오류가 발생해도 다음 페이지 시도 (단, 연속 오류는 방지)
      if (page > 1) {
        console.log(`페이지 ${page} 오류로 인해 크롤링 종료.`);
        break;
      }
    }
  }
  
  console.log(`총 ${allNotices.length}개의 올해(${targetYear}) 공지를 수집했습니다.`);
  return allNotices;
}

/**
 * 포털 공지 동기화
 * 1. 포털에서 공지 리스트 수집
 * 2. 각 공지에 대해 LLM으로 셔틀 관련 여부 분류
 * 3. 셔틀 관련 공지만 DB에 upsert
 * @returns {Promise<Object>} 동기화 결과
 */
async function syncShuttleNotices() {
  // 동시 실행 방지: 이미 실행 중이면 기존 작업 반환
  if (isSyncInProgress && syncPromise) {
    console.log('⚠️ 동기화가 이미 진행 중입니다. 기존 작업을 기다립니다...');
    console.log('⚠️ 중복 요청을 무시하고 기존 작업 결과를 반환합니다.');
    try {
      return await syncPromise;
    } catch (error) {
      // 기존 작업이 실패한 경우, 플래그를 초기화하고 새로 시작할 수 있도록 함
      isSyncInProgress = false;
      syncPromise = null;
      throw error;
    }
  }

  // 새로운 동기화 작업 시작
  isSyncInProgress = true;
  console.log('🔄 새로운 동기화 작업 시작 (동시 실행 방지 활성화)');
  syncPromise = (async () => {
    const startTime = Date.now();
    try {
      console.log('셔틀 공지 동기화 시작...');
    
    // 실제 포털 크롤링 사용 (환경 변수로 Mock/실제 전환 가능)
    const useMock = process.env.USE_NOTICE_MOCK === 'true';
    console.log(`크롤링 모드: ${useMock ? 'Mock' : '실제 포털'}`);
    
    // 올해 모든 공지 수집 (제한 없음 - 올해 공지가 없는 페이지가 나올 때까지)
    console.log(`📋 크롤링 목표: 올해 모든 공지 수집 (제한 없음)`);
    
    const rawList = useMock 
      ? await fetchPortalNoticesMock() 
      : await fetchPortalNoticesFromPortal();

    const crawlTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`📊 전체 공지 개수: ${rawList.length}개 (크롤링 소요 시간: ${crawlTime}초)`);
    
    // 프리필터: 성능 최적화를 위해 키워드가 있는 공지만 LLM 후보로 선정
    // "버스" 단독은 제외하고 구체적인 키워드만 체크 (굿네이버스 등 오탐 방지)
    const busKeyword = /셔틀|셔틀 버스|통학 버스|심야버스|정류장|노선|운행|통학|셔틀 차량/;
    const candidates = rawList.filter((n) => {
      const title = n.title || '';
    
    console.log(`📊 셔틀 후보 개수(프리필터 후): ${candidates.length}개 (전체 ${rawList.length}개 중)`);

    let processedCount = 0;
    let shuttleCount = 0;
    let errorCount = 0;
    let llmFailureCount = 0; // LLM 연결 실패 횟수

    // 프리필터를 통과한 후보만 LLM으로 분류
    for (const notice of candidates) {
      try {
        processedCount++;
        const titlePreview = notice.title ? notice.title.substring(0, 50) : '(제목 없음)';
        console.log(`[${processedCount}/${candidates.length}] 공지 처리 중: ${titlePreview}...`);
        
        // 이미 DB에 있는 공지인지 확인 (최적화: LLM 호출 스킵)
        const existingNotice = await ShuttleNotice.findOne({ 
          portalNoticeId: notice.portalNoticeId 
        });
        
        if (existingNotice) {
          // 이미 셔틀 관련 공지로 저장되어 있음 (제목/내용 업데이트만)
          await ShuttleNotice.findOneAndUpdate(
            { portalNoticeId: notice.portalNoticeId },
            {
              $set: {
                title: notice.title,
                content: notice.content,
                url: notice.url,
                postedAt: notice.postedAt,
                isShuttle: true, // 명시적으로 true 설정
              },
            }
          );
          console.log(`  → 이미 저장된 셔틀 공지, 업데이트 완료`);
          shuttleCount++;
          continue;
        }
        
        // 새 공지: LLM으로 셔틀 관련 여부 판별
        let isShuttle = false;
        let usedFallback = false;
        
        try {
          console.log(`  → LLM 호출 시작 (제목: ${notice.title?.substring(0, 50)}...)`);
          isShuttle = await isShuttleRelatedNotice(
            notice.title,
            notice.content
          );
          console.log(`  → LLM 판별 결과: ${isShuttle ? '✅ 셔틀 관련' : '❌ 셔틀 무관'} (제목: ${notice.title?.substring(0, 40)}...)`);
        } catch (llmError) {
          // LLM 호출 실패 시 키워드 기반 fallback 로직 사용
          llmFailureCount++;
          const errorMsg = llmError.message || String(llmError);
          console.error(`  → ❌ LLM 호출 실패 [${processedCount}/${candidates.length}]`);
          console.error(`     제목: ${notice.title?.substring(0, 50)}...`);
          console.error(`     에러: ${errorMsg}`);
          console.log(`  → 🔄 LLM 실패로 키워드 기반 fallback 판정 시도...`);
          
          // 첫 번째 LLM 실패 시 상세 진단 정보 출력
          if (llmFailureCount === 1) {
            console.error(`\n🔍 Ollama 서버 진단 정보:`);
            console.error(`   - 환경 변수 OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL || '설정되지 않음 (기본값: http://localhost:11434)'}`);
            console.error(`   - 환경 변수 OLLAMA_MODEL: ${process.env.OLLAMA_MODEL || '설정되지 않음 (기본값: orca-mini:3b)'}`);
            console.error(`   - 확인 명령어: docker ps | grep ollama`);
            console.error(`   - 로그 확인: docker logs ollama`);
            console.error(`   - Ollama 시작: docker-compose up -d ollama`);
            console.error(`   - 모델 다운로드: docker exec ollama ollama pull ${process.env.OLLAMA_MODEL || 'orca-mini:3b'}\n`);
          }
          
          // 키워드 기반 fallback 판정
          isShuttle = checkShuttleKeywords(notice.title, notice.content);
          usedFallback = true;
          
          if (isShuttle) {
            console.log(`  → ✅ 키워드 기반 판정: 셔틀 관련 (fallback)`);
          } else {
            console.log(`  → ❌ 키워드 기반 판정: 셔틀 무관 (fallback)`);
            // 키워드로도 판정되지 않으면 스킵
            continue;
          }
        }
        
        if (!isShuttle) {
          console.log(`  → 셔틀 관련 아님, 스킵`);
          continue; // 셔틀 관련이 아니면 스킵
        }

        console.log(`  → 셔틀 관련 공지 확인, DB 저장 중...`);

        // 셔틀 관련 공지만 DB에 저장 (portalNoticeId 기준으로 upsert)
        await ShuttleNotice.findOneAndUpdate(
          { portalNoticeId: notice.portalNoticeId },
          {
            $set: {
              title: notice.title,
              content: notice.content,
              url: notice.url,
              postedAt: notice.postedAt,
              isShuttle: true, // 명시적으로 true 설정
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true, new: true }
        );
        
        shuttleCount++;
        console.log(`  → DB 저장 완료 (총 ${shuttleCount}개)`);
      } catch (error) {
        // 개별 공지 처리 실패 시에도 계속 진행
        errorCount++;
        console.error(`공지 처리 실패 (${notice.title?.substring(0, 30)}...):`, error.message);
        if (error.stack) {
          console.error(`스택 트레이스:`, error.stack);
        }
        // 다음 공지로 계속 진행
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`동기화 완료: 처리 ${processedCount}개, 셔틀 관련 ${shuttleCount}개, 오류 ${errorCount}개 (LLM 실패: ${llmFailureCount}개) (총 소요 시간: ${totalTime}초)`);
    
    // LLM 실패가 많으면 경고 메시지 추가
    let message = '셔틀 공지 동기화 완료';
    if (llmFailureCount > 0) {
      message += ` (주의: LLM 연결 실패 ${llmFailureCount}건 - Ollama 서버 상태 확인 필요)`;
    }
    
      return { 
        message,
        processed: processedCount,
        shuttleRelated: shuttleCount,
        errors: errorCount,
        llmFailures: llmFailureCount // LLM 실패 횟수 추가
      };
    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`셔틀 공지 동기화 중 오류 발생 (소요 시간: ${totalTime}초):`, error);
      throw error;
    } finally {
      // 작업 완료 후 플래그 초기화
      isSyncInProgress = false;
      syncPromise = null;
    }
  })();

  return await syncPromise;
}

/**
 * 셔틀 공지 리스트 조회 (앱 메인에서 사용)
 * @returns {Promise<Array>} 공지 리스트 (_id, title, postedAt 포함)
 */
async function getShuttleNoticeList() {
  // isShuttle=true인 공지만 반환 (안전장치)
  return ShuttleNotice.find({ isShuttle: true }, '_id title postedAt').sort({ postedAt: -1 });
}

/**
 * MongoDB ObjectId 형식 검증
 * @param {string} id - 검증할 ID
 * @returns {boolean} 유효한 ObjectId 형식인지 여부
 */
function isValidObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * 셔틀 공지 상세 조회 + 요약 생성/캐싱
 * summary가 없으면 LLM으로 요약 생성 후 저장
 * @param {string} id - 공지 ID (MongoDB ObjectId)
 * @returns {Promise<Object>} 공지 상세 정보 (title, content, summary, url, postedAt 등)
 * @throws {Error} 공지가 없으면 NOT_FOUND 에러
 */
async function getShuttleNoticeDetail(id) {
  // NoSQL Injection 방지: ObjectId 형식 검증
  if (!id || !isValidObjectId(id)) {
    const err = new Error('INVALID_ID');
    err.code = 'INVALID_ID';
    throw err;
  }
  
  const notice = await ShuttleNotice.findById(id);
  if (!notice) {
    const err = new Error('NOT_FOUND');
    err.code = 'NOT_FOUND';
    throw err;
  }

  // summary가 없으면 LLM으로 요약 생성 후 저장 (캐싱)
  if (!notice.summary || !notice.summary.trim()) {
    try {
      const summary = await summarizeNotice(notice.title, notice.content);
      if (summary && summary.trim() && summary !== '요약을 생성할 수 없습니다.') {
        notice.summary = summary;
        await notice.save();
      } else {
        console.warn(`공지 요약 생성 실패 (ID: ${id}): LLM이 요약을 생성하지 못했습니다.`);
      }
    } catch (error) {
      console.error(`공지 요약 생성 중 오류 발생 (ID: ${id}):`, error.message);
      // 요약 생성 실패해도 공지 정보는 반환
    }
  }

  return notice;
}

/**
 * 포털 공지 Mock 데이터 수집 (테스트용)
 * USE_NOTICE_MOCK=true일 때 사용
 * @returns {Promise<Array>} 포털 공지 리스트
 */
async function fetchPortalNoticesMock() {
  return [
    {
      portalNoticeId: 'N1',
      title: '셔틀버스 운행 시간 변경 안내',
      content:
        '11월 25일부터 셔틀버스 운행 시간이 변경됩니다. 천안역, 아산역 노선 시간표를 확인해주세요.',
      url: 'https://lily.sunmoon.ac.kr/Page2/Story/Notice_view.aspx?no=48177',
      postedAt: new Date('2025-11-22T10:00:00'),
    },
    {
      portalNoticeId: 'N2',
      title: '2학기 기말고사 일정 안내',
      content: '2학기 기말고사 일정 및 유의사항을 안내드립니다.',
      url: 'https://lily.sunmoon.ac.kr/Page2/Story/Notice_view.aspx?no=48180',
      postedAt: new Date('2025-11-21T09:00:00'),
    },
  ];
}

module.exports = {
  syncShuttleNotices,
  getShuttleNoticeList,
  getShuttleNoticeDetail,
  fetchPortalNoticesFromPortal, // 테스트용으로 export
};

