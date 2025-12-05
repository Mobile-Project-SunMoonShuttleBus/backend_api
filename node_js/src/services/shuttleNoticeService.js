/**
 * 셔틀 공지 서비스 (필터링 적용 완성본)
 * - SSL 무시 (Docker 호환)
 * - 키워드 필터링 (셔틀/통학/버스 관련만 수집)
 * - 1~10페이지 탐색
 */
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const ShuttleNotice = require('../models/ShuttleNotice');

// 동시 실행 방지
let isSyncInProgress = false;
let syncPromise = null;

const NOTICE_LIST_URL = 'https://lily.sunmoon.ac.kr/Page2/Story/Notice.aspx';

// Docker 환경 SSL 인증서 에러 무시
const httpsAgent = new https.Agent({  
  rejectUnauthorized: false
});

/**
 * 셔틀 관련 공지인지 키워드로 확인
 */
function isShuttleNotice(title) {
  const text = title.toLowerCase().replace(/\s/g, ''); // 공백 제거 후 비교
  
  // 필수 포함 키워드 (하나라도 있으면 합격)
  const keywords = [
    '셔틀', '통학', '버스', '노선', '운행', 
    '등하교', '정류장', '시간표', '차량'
  ];

  // 제외 키워드 (이게 있으면 셔틀 아님)
  const excludeKeywords = [
    '굿네이버스', '근로장학생', '모집', '채용', '특강', 
    '장학금', '대회', '봉사', '이벤트'
  ];

  // 1. 제외 키워드 체크
  for (const ex of excludeKeywords) {
    if (text.includes(ex)) return false;
  }

  // 2. 필수 키워드 체크
  for (const key of keywords) {
    if (text.includes(key)) return true;
  }

  return false;
}

/**
 * HTML 다운로드
 */
async function fetchHtml(url) {
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      httpsAgent: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Connection': 'keep-alive'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`HTML 다운로드 실패: ${error.message}`);
    throw error;
  }
}

function parseDate(dateStr) {
  if (!dateStr) return new Date();
  const cleaned = dateStr.trim().replace(/\./g, '-');
  return new Date(cleaned);
}

/**
 * 포털 크롤링 (필터 적용)
 */
async function fetchPortalNoticesFiltered() {
  console.log('🚀 [스마트 수집 모드] 셔틀버스 관련 공지만 탐색합니다.');
  
  const allNotices = [];
  const MAX_PAGES = 10; // 1~10페이지까지 탐색 (공지가 뒤로 밀렸을 수 있음)
  const TARGET_YEARS = ['2024', '2025']; // 수집할 연도

  for (let page = 1; page <= MAX_PAGES; page++) {
    const listUrl = `${NOTICE_LIST_URL}?cp=${page}`;
    console.log(`📡 페이지 ${page} 탐색 중...`);

    try {
      const html = await fetchHtml(listUrl);
      const $ = cheerio.load(html);
      let pageCount = 0;

      $('a[href*="Notice_view.aspx"]').each((i, el) => {
        const $a = $(el);
        const title = $a.text().trim();
        
        if (!title) return;

        // [핵심 1] 날짜 추출 및 필터
        const $row = $a.closest('tr');
        const $tds = $row.find('td');
        let date = '';
        if ($tds.length >= 2) {
          date = $tds.eq($tds.length - 2).text().trim();
        }

        // 연도 체크 (2024, 2025 아니면 스킵)
        if (!TARGET_YEARS.some(y => date.startsWith(y))) return;

        // [핵심 2] 키워드 필터 (셔틀 관련만 통과)
        if (!isShuttleNotice(title)) {
            // console.log(`   (스킵: ${title})`); // 너무 많으면 주석 처리
            return;
        }

        // 통과한 공지사항
        console.log(`   ✅ [셔틀공지 발견] ${title} (${date})`);
        
        let url = $a.attr('href') || '';
        if (!url.startsWith('http')) {
          url = new URL(url, NOTICE_LIST_URL).href;
        }

        allNotices.push({
          portalNoticeId: `shuttle_${page}_${i}_${Date.now()}`,
          title: title,
          content: title, // 내용은 제목으로 대체
          url: url,
          postedAt: parseDate(date)
        });
        pageCount++;
      });

      if (pageCount === 0) {
          console.log(`   -> 페이지 ${page}에는 셔틀 공지가 없습니다.`);
      }

    } catch (e) {
      console.error(`페이지 ${page} 에러:`, e.message);
    }
  }

  console.log(`📊 최종 수집 결과: 총 ${allNotices.length}개의 셔틀 공지를 찾았습니다.`);
  return allNotices;
}

/**
 * 동기화 메인 함수
 */
async function syncShuttleNotices() {
  if (isSyncInProgress) return { message: "이미 진행중" };
  isSyncInProgress = true;

  try {
    // 1. 크롤링
    const rawList = await fetchPortalNoticesFiltered();

    // 2. DB 저장
    let savedCount = 0;
    for (const notice of rawList) {
      await ShuttleNotice.findOneAndUpdate(
        { url: notice.url }, 
        { 
          $set: {
            title: notice.title,
            content: notice.content,
            postedAt: notice.postedAt,
            isShuttle: true,
            portalNoticeId: notice.portalNoticeId,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true, new: true }
      );
      savedCount++;
    }

    return { 
      message: "셔틀 공지 동기화 완료", 
      processed: rawList.length, 
      shuttleRelated: savedCount 
    };

  } catch (e) {
    console.error(e);
    throw e;
  } finally {
    isSyncInProgress = false;
  }
}

async function getShuttleNoticeList() {
  return ShuttleNotice.find({ isShuttle: true }).sort({ postedAt: -1 });
}

async function getShuttleNoticeDetail(id) {
  return ShuttleNotice.findById(id);
}

module.exports = {
  syncShuttleNotices,
  getShuttleNoticeList,
  getShuttleNoticeDetail
};