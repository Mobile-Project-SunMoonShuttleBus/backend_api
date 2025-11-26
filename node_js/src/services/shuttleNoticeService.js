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

// 선문대 포털 공지사항 URL
const NOTICE_LIST_URL = 'https://lily.sunmoon.ac.kr/Page2/Story/Notice.aspx';
const NOTICE_BASE_URL = 'https://lily.sunmoon.ac.kr/Page2/Story/';

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
 * @param {number} maxNotices - 최대 수집할 공지 개수 (기본값: 50)
 * @returns {Promise<Array>} 포털 공지 리스트
 */
async function fetchPortalNoticesFromPortal(maxNotices = 50) {
  try {
    console.log(`공지사항 목록 페이지 접속: ${NOTICE_LIST_URL}`);
    const html = await fetchHtml(NOTICE_LIST_URL);
    const $ = cheerio.load(html);
    
    const notices = [];
    
    // 공지 목록 테이블 찾기 (Notice_view.aspx 링크가 있는 테이블)
    const noticeLinks = $('a[href*="Notice_view.aspx"], a[href*="Notice%5Fview.aspx"]');
    
    if (noticeLinks.length === 0) {
      console.warn('공지 링크를 찾을 수 없습니다.');
      return [];
    }
    
    console.log(`발견된 공지 링크 개수: ${noticeLinks.length}`);
    
    // 각 공지 처리 (최대 maxNotices개)
    const processCount = Math.min(noticeLinks.length, maxNotices);
    
    for (let i = 0; i < processCount; i++) {
      const link = noticeLinks.eq(i);
      let href = link.attr('href');
      const title = link.text().trim();
      
      if (!href || !title) continue;
      
      // URL 디코딩 처리 (Notice%5Fview.aspx -> Notice_view.aspx)
      try {
        href = decodeURIComponent(href);
      } catch (e) {
        // 이미 디코딩된 경우 그대로 사용
        console.warn(`URL 디코딩 실패, 원본 사용: ${href}`);
      }
      
      // 상대 경로를 절대 경로로 변환
      let noticeUrl = href;
      if (!href.startsWith('http')) {
        // 상대 경로 처리
        if (href.startsWith('/')) {
          // 절대 경로 (루트 기준)
          noticeUrl = 'https://lily.sunmoon.ac.kr' + href;
        } else if (href.startsWith('../')) {
          // 상위 디렉토리
          noticeUrl = NOTICE_BASE_URL + href.replace(/^\.\.\//, '');
        } else {
          // 현재 디렉토리 기준
          noticeUrl = NOTICE_BASE_URL + href;
        }
      }
      
      // URL에서 공지 ID 추출 (no 파라미터)
      const noMatch = noticeUrl.match(/no=(\d+)/);
      const portalNoticeId = noMatch ? noMatch[1] : `notice_${i}`;
      
      // 같은 행(tr)에서 날짜와 작성자 정보 찾기
      let postedAt = new Date();
      const row = link.closest('tr');
      if (row.length > 0) {
        const cells = row.find('td');
        
        // 테이블 구조: 아이콘 | 분류 | 제목(링크) | 작성자 | 입력일자 | 조회수
        // 입력일자는 보통 마지막에서 두 번째 또는 세 번째 셀
        for (let idx = 0; idx < cells.length; idx++) {
          const text = $(cells[idx]).text().trim();
          // 날짜 형식 찾기 (YYYY-MM-DD 형식)
          const dateMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
          if (dateMatch) {
            postedAt = parseDate(text);
            break;
          }
        }
      }
      
      // 공지 상세 페이지에서 본문 가져오기
      console.log(`공지 상세 페이지 접속: ${noticeUrl} (${i + 1}/${processCount}) - ${title.substring(0, 30)}...`);
      const content = await fetchNoticeContent(noticeUrl);
      
      // 제목과 내용이 모두 있어야만 추가
      if (title && title.trim() && content && content.trim() && content !== '내용을 가져올 수 없습니다.') {
        notices.push({
          portalNoticeId,
          title: title.trim(),
          content: content.trim(),
          url: noticeUrl,
          postedAt
        });
      } else {
        console.warn(`공지 스킵 (제목 또는 내용 없음): ${title.substring(0, 30)}...`);
      }
      
      // 서버 부하 방지를 위한 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`총 ${notices.length}개의 공지를 수집했습니다.`);
    return notices;
    
  } catch (error) {
    console.error('포털 공지 크롤링 오류:', error);
    throw error;
  }
}

/**
 * 포털 공지 동기화
 * 1. 포털에서 공지 리스트 수집
 * 2. 각 공지에 대해 LLM으로 셔틀 관련 여부 분류
 * 3. 셔틀 관련 공지만 DB에 upsert
 * @returns {Promise<Object>} 동기화 결과
 */
async function syncShuttleNotices() {
  try {
    console.log('셔틀 공지 동기화 시작...');
    
    // 실제 포털 크롤링 사용 (환경 변수로 Mock/실제 전환 가능)
    const useMock = process.env.USE_NOTICE_MOCK === 'true';
    console.log(`크롤링 모드: ${useMock ? 'Mock' : '실제 포털'}`);
    
    const rawList = useMock 
      ? await fetchPortalNoticesMock() 
      : await fetchPortalNoticesFromPortal();

    console.log(`수집된 공지 개수: ${rawList.length}개`);

    let processedCount = 0;
    let shuttleCount = 0;
    let errorCount = 0;

    for (const notice of rawList) {
      try {
        processedCount++;
        console.log(`[${processedCount}/${rawList.length}] 공지 처리 중: ${notice.title.substring(0, 50)}...`);
        
        // LLM으로 셔틀 관련 여부 판별
        const isShuttle = await isShuttleRelatedNotice(
          notice.title,
          notice.content
        );
        
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
        // 다음 공지로 계속 진행
      }
    }

    console.log(`동기화 완료: 처리 ${processedCount}개, 셔틀 관련 ${shuttleCount}개, 오류 ${errorCount}개`);
    return { 
      message: '셔틀 공지 동기화 완료',
      processed: processedCount,
      shuttleRelated: shuttleCount,
      errors: errorCount
    };
  } catch (error) {
    console.error('셔틀 공지 동기화 중 오류 발생:', error);
    throw error;
  }
}

/**
 * 셔틀 공지 리스트 조회 (앱 메인에서 사용)
 * @returns {Promise<Array>} 공지 리스트 (_id, title, postedAt 포함)
 */
async function getShuttleNoticeList() {
  return ShuttleNotice.find({}, '_id title postedAt').sort({ postedAt: -1 });
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
    const summary = await summarizeNotice(notice.title, notice.content);
    notice.summary = summary;
    await notice.save();
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

