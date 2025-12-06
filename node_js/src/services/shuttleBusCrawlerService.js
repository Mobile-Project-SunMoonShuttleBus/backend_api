const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const ShuttleBus = require('../models/ShuttleBus');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // puppeteer가 설치되지 않은 경우 무시
}

// Docker 환경 SSL 인증서 에러 무시
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

// 크롤링할 URL 목록
const CRAWL_URLS = {
  평일: {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_01.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx',
    '천안 터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_02.aspx',
    '온양역/아산터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_03.aspx'
  },
  '토요일/공휴일': {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_02_01.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_02_03.aspx',
    '천안 터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_02_02.aspx'
  },
  '일요일': {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_03_01.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_03_03.aspx',
    '천안 터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_03_02.aspx'
  }
};

// JS 실행 후 크롤링
async function fetchHtml(url) {
  // axios 먼저 시도
  try {
    console.log(`[fetchHtml] axios로 시도: ${url}`);
    const response = await axios.get(url, {
      timeout: 15000,
      httpsAgent: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    // JS 실행 여부 확인
    const html = response.data;
    const timeMatches = html.match(/\d{1,2}[:;]\d{2}/g);
    if (timeMatches && timeMatches.length >= 3) {
      console.log(`[fetchHtml] axios 성공: ${html.length}자 (시간 형식 ${timeMatches.length}개 발견)`);
      return html;
    } else {
      console.log(`[fetchHtml] axios로 가져온 HTML에 시간 형식이 부족 (${timeMatches ? timeMatches.length : 0}개), puppeteer로 재시도`);
    }
  } catch (error) {
    console.warn(`[fetchHtml] axios 실패:`, error.message);
  }
  
  // puppeteer로 폴백
  if (puppeteer !== null && process.env.USE_PUPPETEER !== 'false') {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 8000
      });
      
      // JS 실행 완료까지 대기 (테이블이 완전히 로드될 때까지)
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          const timeMatches = text.match(/\d{1,2}[:;]\d{2}/g);
          return timeMatches && timeMatches.length >= 3;
        },
        { timeout: 5000 }
      ).catch(() => {});
      
      // 테이블이 완전히 렌더링될 때까지 추가 대기
      await page.waitForSelector('table', { timeout: 3000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const html = await page.evaluate(() => {
        return document.documentElement.outerHTML;
      });
      
      await browser.close();
      console.log(`[fetchHtml] Puppeteer 성공: ${html.length}자`);
      return html;
    } catch (error) {
      console.warn(`[fetchHtml] Puppeteer로 HTML 가져오기 실패 (${url}):`, error.message);
    }
  }
  
  console.error(`[fetchHtml] 모든 방법 실패: ${url}`);
  return null;
}

// 출발지 정의
function normalizeDeparture(departure) {
  const normalized = {
    '아산캠퍼스': '아산캠퍼스',
    '천안 아산역': '천안 아산역',
    '천안아산역': '천안 아산역',
    '천안역': '천안역',
    '천안터미널': '천안 터미널',
    '천안 터미널': '천안 터미널',
    '터미널': '천안 터미널',
    '선문대': '아산캠퍼스',
    '선문대학교': '아산캠퍼스',
    '선문대(도착)': '아산캠퍼스',
    '선문대(출발)': '아산캠퍼스',
    '온양역/아산터미널': '온양역/아산터미널',
    '온양역/터미널': '온양역/아산터미널',
    '온양온천역': '온양온천역',
    '온양 온천역': '온양온천역',
    '주은아파트': '주은아파트 버스정류장',
    '주은아파트 버스정류장': '주은아파트 버스정류장',
    '권곡초 버스정류장': '권곡초 버스정류장',
    '권곡초': '권곡초 버스정류장',
    '아산터미널': '아산터미널',
    '하이렉스파 건너편': '하이렉스파 건너편',
    '하이렉스파건너편': '하이렉스파 건너편',
    '용암마을': '용암마을',
    '탕정역': '탕정역',
    '탕정 역': '탕정역',
    '두정동 맥도날드': '두정동 맥도날드',
    '맥도날드': '두정동 맥도날드',
    '홈마트 에브리데이': '홈마트 에브리데이',
    '홈마트': '홈마트 에브리데이',
    '에브리데이': '홈마트 에브리데이',
    '서울대정병원': '서울대정병원',
    '서울대 정병원': '서울대정병원'
  };
  return normalized[departure] || departure;
}

// 도착지 정의
function normalizeArrival(arrival) {
  const normalized = {
    '아산캠퍼스': '아산캠퍼스',
    '천안 아산역': '천안 아산역',
    '천안아산역': '천안 아산역',
    '천안역': '천안역',
    '천안터미널': '천안 터미널',
    '천안 터미널': '천안 터미널',
    '터미널': '천안 터미널',
    '온양역/아산터미널': '아산터미널', // 온양역/아산터미널 → 아산터미널로 정규화
    '온양역/터미널': '아산터미널', // 온양역/터미널 → 아산터미널로 정규화
    '온양온천역': '아산터미널', // 온양온천역 → 아산터미널로 정규화 (경유지이므로 최종 목적지는 아산터미널)
    '온양 온천역': '아산터미널', // 온양온천역 → 아산터미널로 정규화
    '온양역': '아산터미널', // 온양역 → 아산터미널로 정규화
    '아산터미널': '아산터미널', // 아산터미널은 그대로 유지
    '주은아파트': '주은아파트 버스정류장',
    '주은아파트 버스정류장': '주은아파트 버스정류장',
    '권곡초 버스정류장': '권곡초 버스정류장',
    '권곡초': '권곡초 버스정류장',
    '하이렉스파 건너편': '하이렉스파 건너편',
    '하이렉스파건너편': '하이렉스파 건너편',
    '용암마을': '용암마을',
    '탕정역': '탕정역',
    '탕정 역': '탕정역',
    '두정동 맥도날드': '두정동 맥도날드',
    '맥도날드': '두정동 맥도날드',
    '홈마트 에브리데이': '홈마트 에브리데이',
    '홈마트': '홈마트 에브리데이',
    '에브리데이': '홈마트 에브리데이',
    '서울대정병원': '서울대정병원',
    '서울대 정병원': '서울대정병원'
  };
  return normalized[arrival] || arrival;
}

// 시간표 파싱
function parseScheduleTable(html, dayType, expectedDeparture) {
  if (process.env.DEBUG_CRAWLER) {
    console.log(`[parseScheduleTable] 시작: dayType=${dayType}, expectedDeparture=${expectedDeparture}`);
  }
  const schedules = [];
  if (!html) {
    if (process.env.DEBUG_CRAWLER) {
      console.log('[parseScheduleTable] HTML이 null입니다');
    }
    return schedules;
  }
  const $ = cheerio.load(html);
  const extractTimeValue = (cellText) => {
    if (!cellText) return null;
    const cleaned = cellText.replace(/\s+/g, ' ').trim();
    if (!cleaned || /^[XΧ]+$/i.test(cleaned)) {
      return null;
    }
    const match = cleaned.match(/(\d{1,2})[:;](\d{2})/);
    if (!match) {
      return null;
    }
    const hour = match[1].padStart(2, '0');
    const minute = match[2];
    return `${hour}:${minute}`;
  };

  const hasHighlight = (cell) => {
    if (!cell || cell.length === 0) {
      return false;
    }
    const styleAttr = cell.attr('style') || '';
    if (styleAttr && /background/i.test(styleAttr)) {
      return true;
    }
    let highlighted = false;
    cell.find('[style]').each((_, el) => {
      const childStyle = $(el).attr('style') || '';
      if (childStyle && /background/i.test(childStyle)) {
        highlighted = true;
        return false;
      }
    });
    return highlighted;
  };

  const extractViaStopsFromText = (text) => {
    if (!text) return [];
    const cleaned = text.replace(/\s+/g, ' ').replace(/\//g, ',').trim();
    if (!cleaned) return [];
    const results = [];
      const viaRegex = /([가-힣0-9·\s]+?)(?:경유|정차)/g;
      
      // 탕정역은 제외 (테이블에 컬럼이 없음)
    let match;
    while ((match = viaRegex.exec(cleaned)) !== null) {
      let name = match[1].trim();
      if (!name) continue;
      name = name.replace(/^(하교시|등교시|추가|시간변경|1대만운영|2대운영|1대만 운영|2대 운영|금\(X\)|금요일|월~수|월~화|월~금|주중)\s*/g, '').trim();
      name = name.replace(/[,·]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
      if (!name) continue;
      const tokens = name.split(' ').filter(Boolean);
      let candidate = '';
      for (let i = tokens.length - 1; i >= 0; i--) {
        const token = tokens[i];
        if (/[역|터미널|정류장|캠퍼스|마을|건너편|아파트|초]$/.test(token)) {
          candidate = tokens.slice(Math.max(0, i - 1)).join(' ').trim();
          break;
        }
        candidate = token + (candidate ? ` ${candidate}` : '');
      }
      const normalized =
        normalizeArrival(candidate) ||
        normalizeDeparture(candidate) ||
        candidate;
      if (!normalized) continue;
      
      // 탕정역 제외
      if (normalized === '탕정역' || normalized.includes('탕정역')) {
        continue;
      }
      
      results.push({
        name: normalized,
        time: null,
        rawText: null,
        source: 'note'
      });
    }
    return results;
  };

  // "5분~20분 소요예상" 같은 텍스트를 파싱하여 실제 시간으로 변환
  const parseDurationText = (text, baseTime) => {
    if (!text || !baseTime) return null;
    
    // "5분~20분 소요예상", "5~20분 소요", "5-20분", "5분~20분" 등의 패턴 매칭
    // 첫 번째 숫자 뒤에 "분"이 올 수도 있고, 두 번째 숫자 뒤에만 "분"이 올 수도 있음
    const durationMatch = text.match(/(\d+)\s*분?\s*[~-]\s*(\d+)\s*분/);
    if (!durationMatch) return null;
    
    const minMinutes = parseInt(durationMatch[1], 10);
    const maxMinutes = parseInt(durationMatch[2], 10);
    
    // baseTime을 분으로 변환
    const [baseHour, baseMin] = baseTime.split(':').map(Number);
    const baseMinutes = baseHour * 60 + baseMin;
    
    // 최소 시간과 최대 시간 계산
    const minTimeMinutes = baseMinutes + minMinutes;
    const maxTimeMinutes = baseMinutes + maxMinutes;
    
    const minHour = Math.floor(minTimeMinutes / 60) % 24; // 24시간 형식으로 변환
    const minMin = minTimeMinutes % 60;
    const maxHour = Math.floor(maxTimeMinutes / 60) % 24; // 24시간 형식으로 변환
    const maxMin = maxTimeMinutes % 60;
    
    return `${String(minHour).padStart(2, '0')}:${String(minMin).padStart(2, '0')}~${String(maxHour).padStart(2, '0')}:${String(maxMin).padStart(2, '0')}`;
  };
  
  // 이전 경유지 시간 범위를 기준으로 다음 경유지 시간 계산
  // 이전 경유지가 "09:05~09:20"이면, 다음 경유지는 "(09:05 + 5분) ~ (09:20 + 20분)" = "09:10~09:40"
  const parseDurationTextForNextViaStop = (text, previousTimeRange) => {
    if (!text || !previousTimeRange) return null;
    
    // "5분~20분 소요예상" 패턴 매칭
    const durationMatch = text.match(/(\d+)\s*분?\s*[~-]\s*(\d+)\s*분/);
    if (!durationMatch) return null;
    
    const minMinutes = parseInt(durationMatch[1], 10);
    const maxMinutes = parseInt(durationMatch[2], 10);
    
    // 이전 경유지 시간 범위 파싱 (예: "09:05~09:20")
    if (!previousTimeRange.includes('~')) return null;
    const [prevMinTime, prevMaxTime] = previousTimeRange.split('~').map(t => t.trim());
    
    // 이전 경유지의 최소 시간과 최대 시간을 분으로 변환
    const [prevMinHour, prevMinMin] = prevMinTime.split(':').map(Number);
    const [prevMaxHour, prevMaxMin] = prevMaxTime.split(':').map(Number);
    const prevMinMinutes = prevMinHour * 60 + prevMinMin;
    const prevMaxMinutes = prevMaxHour * 60 + prevMaxMin;
    
    // 다음 경유지 시간 계산: (이전 최소 시간 + 5분) ~ (이전 최대 시간 + 20분)
    const nextMinMinutes = prevMinMinutes + minMinutes;
    const nextMaxMinutes = prevMaxMinutes + maxMinutes;
    
    const nextMinHour = Math.floor(nextMinMinutes / 60) % 24;
    const nextMinMin = nextMinMinutes % 60;
    const nextMaxHour = Math.floor(nextMaxMinutes / 60) % 24;
    const nextMaxMin = nextMaxMinutes % 60;
    
    return `${String(nextMinHour).padStart(2, '0')}:${String(nextMinMin).padStart(2, '0')}~${String(nextMaxHour).padStart(2, '0')}:${String(nextMaxMin).padStart(2, '0')}`;
  };

  // 경유지 시간 추정
  const estimateViaStopTime = (viaStopName, departureTime, arrivalTime, allViaStops, rawText = '') => {
    if (!departureTime || departureTime === 'X') {
      // 출발시간이 없으면 rawText를 그대로 반환
      if (rawText && rawText.trim() && !/^[XΧ]+$/i.test(rawText)) {
        return rawText.trim();
      }
      return null;
    }
    
    // 이미 시간이 있으면 그대로 사용
    const existingVia = allViaStops.find(v => v.name === viaStopName && v.time);
    if (existingVia && existingVia.time && !existingVia.time.includes('~')) {
      return existingVia.time;
    }
    
    // "5분~20분 소요예상" 같은 텍스트를 실제 시간으로 변환
    if (rawText && rawText.trim() && !/^[XΧ]+$/i.test(rawText)) {
      const parsedTime = parseDurationText(rawText, departureTime);
      if (parsedTime) {
        return parsedTime;
      }
    }
    
    // arrivalTime이 없으면 parseDurationText로만 처리
    if (!arrivalTime || arrivalTime === 'X') {
      // "5분~20분 소요예상" 같은 텍스트를 실제 시간으로 변환 시도
      if (rawText && rawText.trim() && !/^[XΧ]+$/i.test(rawText)) {
        const parsedTime = parseDurationText(rawText, departureTime);
        if (parsedTime) {
          return parsedTime;
        }
        // parseDurationText가 실패하면 null 반환 (rawText를 그대로 반환하지 않음)
      }
      return null;
    }
    
    // 분으로 변환
    const [depHour, depMin] = departureTime.split(':').map(Number);
    const [arrHour, arrMin] = arrivalTime.split(':').map(Number);
    const depMinutes = depHour * 60 + depMin;
    const arrMinutes = arrHour * 60 + arrMin;
    
    if (arrMinutes <= depMinutes) {
      // "5분~20분 소요예상" 같은 텍스트를 실제 시간으로 변환 시도
      if (rawText && rawText.trim() && !/^[XΧ]+$/i.test(rawText)) {
        const parsedTime = parseDurationText(rawText, departureTime);
        if (parsedTime) {
          return parsedTime;
        }
        // parseDurationText가 실패하면 null 반환 (rawText를 그대로 반환하지 않음)
      }
      return null;
    }
    
    // 중간 지점 기준으로 시간 범위 계산
    const totalDuration = arrMinutes - depMinutes;
    const estimatedMinutes = depMinutes + Math.floor(totalDuration * 0.5);
    
    // 앞뒤 범위 계산
    const rangeMinutes = Math.max(1, Math.floor(totalDuration * 0.2));
    const startMinutes = Math.max(depMinutes, estimatedMinutes - Math.floor(rangeMinutes / 2));
    const endMinutes = Math.min(arrMinutes, estimatedMinutes + Math.floor(rangeMinutes / 2));
    
    const startHour = Math.floor(startMinutes / 60);
    const startMin = startMinutes % 60;
    const endHour = Math.floor(endMinutes / 60);
    const endMin = endMinutes % 60;
    
    const timeRange = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}~${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
    
    // 텍스트가 있으면 시간 범위와 함께 저장
    if (rawText && rawText.trim() && !/^[XΧ]+$/i.test(rawText) && !rawText.match(/\d{1,2}:\d{2}/)) {
      return `${timeRange} (${rawText.trim()})`;
    }
    
    return timeRange;
  };

  const mergeViaStops = (base, additions, departureTime = null, arrivalTime = null, rawTextMap = {}) => {
    const exists = new Set(base.map((item) => `${item.name}|${item.time || ''}|${item.source || ''}`));
    
    // 경유지를 순서대로 처리하기 위해 정렬 (departureTime 기준)
    const sortedAdditions = [...additions].sort((a, b) => {
      // 시간이 있는 항목을 우선 처리
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return 0;
    });
    
    sortedAdditions.forEach((item) => {
      if (!item || !item.name) return;
      
      // 탕정역은 제외 (테이블에 컬럼이 없음)
      if (item.name === '탕정역' || item.name.includes('탕정역')) {
        return;
      }
      
      const key = `${item.name}|${item.time || ''}|${item.source || ''}`;
      if (!exists.has(key)) {
        let viaTime = item.time;
        
        // "경유"만 있는 경우 시간 추정 시도
        if (!viaTime && item.rawText && item.rawText.trim() === '경유') {
          // 출발시간과 도착시간이 있으면 시간 추정
          if (departureTime && arrivalTime && arrivalTime !== 'X') {
            viaTime = estimateViaStopTime(item.name, departureTime, arrivalTime, base, item.rawText);
          }
          // 추정 실패하면 '경유'로 저장
          if (!viaTime) {
            viaTime = '경유';
          }
        }
        // 시간이 없고 출발시간이 있으면 추정
        else if (!viaTime && departureTime) {
          const rawText = item.rawText || rawTextMap[item.name] || '';
          
          // 이전 경유지의 도착시간을 기준으로 계산 (경유지 도착시간 = 다음 경유지 출발시간)
          let baseTimeForEstimation = departureTime;
          if (base.length > 0) {
            const lastVia = base[base.length - 1];
            if (lastVia.time) {
              // 마지막 경유지의 시간이 범위인 경우 (예: "09:05~09:20")
              // 경유지 도착시간의 끝 시간을 기준으로 다음 경유지 출발시간 계산
              if (lastVia.time.includes('~')) {
                const [, endTime] = lastVia.time.split('~');
                baseTimeForEstimation = endTime.trim();
              } else {
                baseTimeForEstimation = lastVia.time;
              }
            }
          }
          
          // "5분~20분 소요예상" 같은 텍스트를 실제 시간으로 변환
          if (rawText && rawText.trim() && !/^[XΧ]+$/i.test(rawText)) {
            // 먼저 parseDurationText 시도 (baseTimeForEstimation 사용)
            let parsedTime = parseDurationText(rawText, baseTimeForEstimation);
            
            // baseTimeForEstimation으로 실패하면 departureTime으로 재시도
            if (!parsedTime && baseTimeForEstimation !== departureTime && departureTime) {
              parsedTime = parseDurationText(rawText, departureTime);
            }
            
            if (parsedTime) {
              // 파싱된 시간은 경유지 도착시간 범위
              // 예: baseTimeForEstimation="07:30" + "5분~20분 소요예상" → "07:35~07:50"
              viaTime = parsedTime;
            } else if (arrivalTime && arrivalTime !== 'X') {
              // 파싱 실패 시 기존 추정 로직 사용
              viaTime = estimateViaStopTime(item.name, baseTimeForEstimation, arrivalTime, base, rawText);
            }
            // parseDurationText가 실패하고 arrivalTime도 없으면 viaTime은 null로 유지
            // (아래 조건문에서 처리하지 않음 - rawText는 그대로 저장하지 않음)
          } else if (arrivalTime && arrivalTime !== 'X') {
            // rawText가 없으면 기존 추정 로직 사용
            viaTime = estimateViaStopTime(item.name, baseTimeForEstimation, arrivalTime, base, rawText);
          }
        }
        // 시간이 아직 설정되지 않았고 rawText가 있는 경우
        // parseDurationText가 위에서 실패했을 수 있으므로 departureTime으로 다시 시도
        if (!viaTime && item.rawText && item.rawText.trim() && !/^[XΧ]+$/i.test(item.rawText)) {
          // departureTime이 있으면 parseDurationText 재시도
          if (departureTime) {
            const retryParsedTime = parseDurationText(item.rawText, departureTime);
            if (retryParsedTime) {
              viaTime = retryParsedTime;
            }
          }
          // parseDurationText가 실패하고 arrivalTime이 있으면 estimateViaStopTime 시도
          if (!viaTime && arrivalTime && arrivalTime !== 'X' && departureTime) {
            viaTime = estimateViaStopTime(item.name, departureTime, arrivalTime, base, item.rawText);
          }
          // 여전히 실패하면 이전 경유지 시간 기준으로 추정 시도
          if (!viaTime && departureTime && base.length > 0) {
            const lastVia = base[base.length - 1];
            if (lastVia.time) {
              let baseTime = departureTime;
              if (lastVia.time.includes('~')) {
                const [, endTime] = lastVia.time.split('~');
                baseTime = endTime.trim();
              } else {
                baseTime = lastVia.time;
              }
              const estimatedTime = parseDurationText(item.rawText, baseTime);
              if (estimatedTime) {
                viaTime = estimatedTime;
              } else if (arrivalTime && arrivalTime !== 'X') {
                viaTime = estimateViaStopTime(item.name, baseTime, arrivalTime, base, item.rawText);
              }
            }
          }
        }
        
        base.push({
          name: item.name,
          time: viaTime || null,
          rawText: item.rawText || null,
          source: item.source || 'table'
        });
        exists.add(key);
      }
    });
    return base;
  };
  
  const normalizedDeparture = normalizeDeparture(expectedDeparture);
  
  // 출발지별 기본 도착지 설정
  let defaultArrival = '아산캠퍼스';
  const pageText = $('body').text();
  
  if (normalizedDeparture === '아산캠퍼스') {
    // 아산캠퍼스 페이지는 문구로 도착지 판단
    if (pageText.includes('천안 아산역') || pageText.includes('천안아산역') || pageText.includes('아산역')) {
      defaultArrival = '천안 아산역';
    } else if (pageText.includes('천안역')) {
      defaultArrival = '천안역';
    } else if (pageText.includes('천안터미널') || pageText.includes('천안 터미널') || pageText.includes('터미널')) {
      defaultArrival = '천안 터미널';
    } else {
      defaultArrival = null;
    }
  } else {
    defaultArrival = '아산캠퍼스';
  }
  
  // 아산캠퍼스 왕복 제외
  if (normalizedDeparture === '아산캠퍼스' && defaultArrival === '아산캠퍼스') {
    return schedules;
  }
  
  if (!defaultArrival) {
    return schedules;
  }
  
  // 테이블 순회
  $('table').each((tableIdx, table) => {
    const $table = $(table);
    const tableText = $table.text();
    
    // 시간표 여부 확인
    if (!tableText.includes('순') && !tableText.match(/\d{1,2}:\d{2}/)) {
      return;
    }
    
    const rows = $table.find('tr');
    let headerRowIdx = -1;
    const columnMap = {};
    
    // 헤더 행 탐색
    rows.each((rowIdx, row) => {
      const $row = $(row);
      const cells = $row.find('td, th');
      const rowText = $row.text().trim();
      
      // 헤더 조건
      if (rowText.includes('순') && (rowText.includes('출발') || rowText.includes('도착') || 
          rowText.match(/\d{1,2}:\d{2}/) || rowText.includes('시간'))) {
        headerRowIdx = rowIdx;
        
        // 컬럼 역할 파악
        cells.each((cellIdx, cell) => {
          const cellText = $(cell).text().trim();
          if (cellText.includes('순') || cellText === '순번') {
            columnMap.order = cellIdx;
          } else if (cellText.includes('출발') || cellText.includes('출발지')) {
            columnMap.departure = cellIdx;
          } else if (cellText.includes('도착') || cellText.includes('도착지')) {
            columnMap.arrival = cellIdx;
          } else if (cellText.includes('시간') || cellText.match(/\d{1,2}:\d{2}/)) {
            if (!columnMap.times) columnMap.times = [];
            columnMap.times.push(cellIdx);
          } else if (cellText.includes('비고') || cellText.includes('특이사항') || 
                     cellText.includes('운행') || cellText.includes('금')) {
            columnMap.note = cellIdx;
          }
        });
        
        return false;
      }
    });
    
    // 데이터 행 파싱
    if (headerRowIdx >= 0) {
      // 헤더 이전 행에서도 출발·도착 정보 확인
      let tableDepartureStops = [];
      let tableArrivalStop = null;
      
      // 헤더에서 출발·도착 추출
      const $headerRow = $(rows[headerRowIdx]);
      const headerCells = $headerRow.find('td, th');
      
      headerCells.each((cellIdx, cell) => {
        const cellText = $(cell).text().trim();
        // 출발지 후보 수집
        if (cellText.includes('출발') && (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널'))) {
          // 아산캠퍼스 페이지는 아산캠퍼스 컬럼만 사용
          if (normalizedDeparture === '아산캠퍼스') {
            const normalizedCellText = cellText.replace(/\s+/g, '');
            if (normalizedCellText.includes('아산캠퍼스') && normalizedCellText.includes('출발') && 
                !normalizedCellText.includes('천안') && !normalizedCellText.includes('천안아산역')) {
              if (!tableDepartureStops.includes(normalizedDeparture)) {
                tableDepartureStops.push(normalizedDeparture);
              }
            }
          } else {
            // 기타 출발지
            const matches = cellText.match(/([가-힣\s]+(?:캠퍼스|역|터미널))/g);
            if (matches) {
              matches.forEach(match => {
                const normalized = normalizeDeparture(match.replace(/출발|\(출발\)/g, '').trim());
                // 현재 페이지의 출발지와 일치할 때만 추가
                if (normalized && normalized === normalizedDeparture && !tableDepartureStops.includes(normalized)) {
                  tableDepartureStops.push(normalized);
                }
              });
            }
          }
        }
        // 도착지 후보 수집
        if (cellText.includes('도착') && (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널'))) {
          const matches = cellText.match(/([가-힣\s]+(?:캠퍼스|역|터미널))/g);
          if (matches) {
            matches.forEach(match => {
              const normalized = normalizeArrival(match.replace(/도착|\(도착\)/g, '').trim());
              if (normalized && !tableArrivalStop) {
                tableArrivalStop = normalized;
              }
            });
          }
        }
      });
      
      // 헤더 위쪽 행 확인
      for (let i = headerRowIdx - 1; i >= Math.max(0, headerRowIdx - 5); i--) {
        const $prevRow = $(rows[i]);
        const prevRowText = $prevRow.text().trim();
        const prevCells = $prevRow.find('td, th');
        
        // 출발지 후보 보강
        if (prevRowText.includes('출발')) {
          prevCells.each((idx, cell) => {
            const cellText = $(cell).text().trim();
            if (cellText && (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널'))) {
              // 아산캠퍼스 페이지는 아산캠퍼스만
              if (normalizedDeparture === '아산캠퍼스') {
                const normalizedCellText = cellText.replace(/\s+/g, '');
                if (normalizedCellText.includes('아산캠퍼스') && normalizedCellText.includes('출발') && 
                    !normalizedCellText.includes('천안') && !normalizedCellText.includes('천안아산역')) {
                  if (!tableDepartureStops.includes(normalizedDeparture)) {
                    tableDepartureStops.push(normalizedDeparture);
                  }
                }
              } else {
                const normalized = normalizeDeparture(cellText.replace(/출발|\(출발\)/g, '').trim());
                // 현재 출발지와 동일한 경우만 저장
                if (normalized && normalized === normalizedDeparture && !tableDepartureStops.includes(normalized)) {
                  tableDepartureStops.push(normalized);
                }
              }
            }
          });
        }
        
        // 도착지 후보 보강
        if (prevRowText.includes('도착')) {
          prevCells.each((idx, cell) => {
            const cellText = $(cell).text().trim();
            if (cellText && (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널'))) {
              const normalized = normalizeArrival(cellText.replace(/도착|\(도착\)/g, '').trim());
              if (normalized && !tableArrivalStop) {
                tableArrivalStop = normalized;
              }
            }
          });
        }
      }
      
      // 헤더에서 출발 컬럼 인덱스 찾기
      const $headerRowForColIdx = $(rows[headerRowIdx]);
      const headerCellsForColIdx = $headerRowForColIdx.find('td, th');
      
      // 출발지 컬럼 인덱스 맵
      const departureColIndices = {};
      
      // 헤더 셀 순회
      headerCellsForColIdx.each((cellIdx, cell) => {
        const cellText = $(cell).text().trim();
        const normalizedCellText = cellText.replace(/\s+/g, '');
        
        
        // 출발 컬럼 후보
        const hasDepartureKeyword = normalizedCellText.includes('출발');
        const hasArrivalKeyword = normalizedCellText.includes('도착');
        const hasLocationName = normalizedCellText.includes('캠퍼스') || 
                               normalizedCellText.includes('역') || 
                               normalizedCellText.includes('터미널') ||
                               normalizedCellText.includes('건너편') ||
                               normalizedCellText.includes('마을') ||
                               normalizedCellText.includes('맥도날드') ||
                               normalizedCellText.includes('홈마트') ||
                               normalizedCellText.includes('에브리데이') ||
                               normalizedCellText.includes('서울대정병원') ||
                               normalizedCellText.includes('병원') ||
                               normalizedCellText.includes('아파트') ||
                               normalizedCellText.includes('버스정류장') ||
                               normalizedCellText.includes('초등학교') ||
                               normalizedCellText.includes('권곡') ||
                               normalizedCellText.includes('아산'); // 아산터미널 인식용
        
        // 출발 컬럼 조건: "출발" 키워드가 있고 "도착" 키워드가 없어야 함
        const isDepartureColumn = hasDepartureKeyword && !hasArrivalKeyword;
        
        // 중간 정류장 컬럼: "출발" 키워드가 없어도 위치 이름이 있으면 저장 (예: "용암마을", "홈마트 에브리데이")
        const isIntermediateStopColumn = !hasDepartureKeyword && !hasArrivalKeyword && hasLocationName;
        
        // 도착 컬럼도 별도로 저장 (도착시간 파싱용)
        const isArrivalColumn = hasArrivalKeyword && !hasDepartureKeyword;
        
        
        if (isDepartureColumn || isIntermediateStopColumn) {
          // 천안 아산역
          if (normalizedCellText.includes('천안아산역')) {
            departureColIndices['천안 아산역'] = cellIdx;
          }
          // 천안역 (천안역과 천안 아산역은 다른 역이므로 구분)
          else if (normalizedCellText.includes('천안역') && !normalizedCellText.includes('아산역')) {
            departureColIndices['천안역'] = cellIdx;
          }
          // 아산캠퍼스 (출발 컬럼만 저장, 도착 컬럼은 제외)
          else if ((normalizedCellText.includes('아산캠퍼스') || normalizedCellText.includes('선문대')) && 
              !normalizedCellText.includes('천안') && 
              !normalizedCellText.includes('천안아산역') &&
              !normalizedCellText.includes('도착')) {
            // 이미 저장되어 있지 않을 때만 저장 (출발 컬럼이 우선)
            if (departureColIndices['아산캠퍼스'] === undefined) {
              departureColIndices['아산캠퍼스'] = cellIdx;
            }
          }
          // 아산터미널 (천안 터미널보다 먼저 확인해야 함 - "아산"과 "터미널"이 모두 포함된 경우)
          else if (normalizedCellText.includes('아산터미널') || (normalizedCellText.includes('아산') && normalizedCellText.includes('터미널') && !normalizedCellText.includes('천안'))) {
            departureColIndices['아산터미널'] = cellIdx;
            if (normalizedDeparture === '온양역/아산터미널') {
            }
          }
          // 천안 터미널
          else if (normalizedCellText.includes('천안터미널') || (normalizedCellText.includes('터미널') && !normalizedCellText.includes('천안역') && !normalizedCellText.includes('아산'))) {
            departureColIndices['천안 터미널'] = cellIdx;
          }
          // 온양온천역
          else if (normalizedCellText.includes('온천역') || normalizedCellText.includes('온양온천역')) {
            departureColIndices['온양온천역'] = cellIdx;
          }
          // 주은아파트
          else if (normalizedCellText.includes('주은아파트')) {
            departureColIndices['주은아파트 버스정류장'] = cellIdx;
          }
          // 권곡초
          else if (normalizedCellText.includes('권곡초')) {
            departureColIndices['권곡초 버스정류장'] = cellIdx;
          }
          // 하이렉스파 건너편
          else if (normalizedCellText.includes('하이렉스파')) {
            departureColIndices['하이렉스파 건너편'] = cellIdx;
          }
          // 용암마을
          else if (normalizedCellText.includes('용암마을')) {
            departureColIndices['용암마을'] = cellIdx;
          }
          // 두정동 맥도날드
          else if (normalizedCellText.includes('두정동') && normalizedCellText.includes('맥도날드')) {
            departureColIndices['두정동 맥도날드'] = cellIdx;
          }
          // 홈마트 에브리데이
          else if (normalizedCellText.includes('홈마트') || normalizedCellText.includes('에브리데이')) {
            departureColIndices['홈마트 에브리데이'] = cellIdx;
          }
          // 서울대정병원
          else if (normalizedCellText.includes('서울대정병원') || (normalizedCellText.includes('서울대') && normalizedCellText.includes('병원'))) {
            departureColIndices['서울대정병원'] = cellIdx;
          }
          // 기타 패턴 대비 (추가 확장 용도)
        }
        
        // 도착 컬럼 저장 (도착시간 파싱용)
        if (isArrivalColumn) {
          if (normalizedCellText.includes('아산캠퍼스') || normalizedCellText.includes('선문대')) {
            departureColIndices['아산캠퍼스_도착'] = cellIdx;
          } else if (normalizedCellText.includes('천안아산역')) {
            departureColIndices['천안 아산역_도착'] = cellIdx;
          } else if (normalizedCellText.includes('천안역') && !normalizedCellText.includes('아산역')) {
            departureColIndices['천안역_도착'] = cellIdx;
          } else if (normalizedCellText.includes('천안터미널') || (normalizedCellText.includes('터미널') && !normalizedCellText.includes('천안역'))) {
            departureColIndices['천안 터미널_도착'] = cellIdx;
          }
        }
      });
      
      // 출발지별 처리 목록 구성
      const departureKeysToProcess = [];
      
      // 도착 컬럼은 출발지로 사용하지 않음 (예: "아산캠퍼스_도착", "천안 아산역_도착" 등)
      const isArrivalColumn = (key) => key.includes('_도착');
      
      // 특수 처리 페이지는 일반 파싱 로직을 사용하지 않음
      // 천안역, 천안 터미널, 온양역/아산터미널, 천안 아산역 페이지는 특수 처리 로직에서 처리
      const isSpecialPage = normalizedDeparture === '천안역' || 
                           normalizedDeparture === '천안 터미널' || 
                           normalizedDeparture === '온양역/아산터미널' ||
                           normalizedDeparture === '천안 아산역';
      
      if (!isSpecialPage) {
        // 현재 페이지 출발지 우선
        if (departureColIndices[normalizedDeparture] !== undefined && !isArrivalColumn(normalizedDeparture)) {
          departureKeysToProcess.push(normalizedDeparture);
        }
        
        // 아산캠퍼스 페이지는 천안 아산역/천안 터미널 컬럼만 함께 사용
        if (normalizedDeparture === '아산캠퍼스') {
          // 천안 아산역 출발 컬럼이 있으면 함께 처리
          if (departureColIndices['천안 아산역'] !== undefined) {
            departureKeysToProcess.push('천안 아산역');
          }
          if (departureColIndices['천안 터미널'] !== undefined) {
            departureKeysToProcess.push('천안 터미널');
          }
        }
      }

      // 온양역/아산터미널 특수 처리
      if (normalizedDeparture === '온양역/아산터미널') {
        const campusDepartureIdx = departureColIndices['아산캠퍼스'];
        const campusArrivalIdx = columnMap.arrival;

        // 테이블에서 정류장 컬럼 찾기 (도착 컬럼 제외)
        const stopColumns = Object.entries(departureColIndices)
          .filter(([stopName, idx]) => {
            if (stopName === '아산캠퍼스') return false;
            if (isArrivalColumn(stopName)) return false; // 도착 컬럼 제외
            return idx !== undefined;
          })
          .map(([stopName, idx]) => ({
            idx,
            name: stopName
          }))
          .sort((a, b) => a.idx - b.idx);
        
        const asanTerminalCol = stopColumns.find(col => col.name === '아산터미널');

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const $row = $(rows[i]);
          const cells = $row.find('td, th');
          if (cells.length === 0) continue;

          const firstCell = $(cells[0]).text().trim();
          if (!/^[0-9]+$/.test(firstCell)) continue;

          let noteText = '';
          if (columnMap.note !== undefined && columnMap.note < cells.length) {
            noteText = $(cells[columnMap.note]).text().trim();
          }
          if (!noteText) {
            const collected = [];
            cells.each((idx, cell) => {
              const value = $(cell).text().trim();
              if (value.includes('금(X)') || value.includes('경유') || value.includes('추가') || value.includes('운행')) {
                collected.push(value);
              }
            });
            if (collected.length > 0) {
              noteText = collected.join(', ');
            }
          }

          const rowText = $row.text();
          const fridayOperates = !(rowText.includes('금(X)') || noteText.includes('금(X)'));

        const validStopColumns = stopColumns.filter(col => col.idx !== undefined && col.idx < cells.length);

          // note에서 경유지 추출
          const viaStopsFromNote = extractViaStopsFromText(noteText);
          
          // note 경유지에 시간 매핑
          viaStopsFromNote.forEach(viaStop => {
            const viaColIdx = departureColIndices[viaStop.name];
            if (viaColIdx !== undefined && viaColIdx < cells.length) {
              const viaCell = cells.eq(viaColIdx);
              const viaTime = extractTimeValue(viaCell.text());
              if (viaTime) {
                viaStop.time = viaTime;
              }
            }
          });
          
          let arrivalTime = campusArrivalIdx !== undefined && campusArrivalIdx < cells.length
            ? (extractTimeValue($(cells[campusArrivalIdx]).text()) || 'X')
            : 'X';

          // 하교 방향: 정류장 → 아산캠퍼스 (도착)
          // 아산캠퍼스 도착 컬럼이 있을 때만 하교 방향 처리
          if (campusArrivalIdx !== undefined && campusArrivalIdx < cells.length) {
            for (const { idx, name } of validStopColumns) {
              const timeText = $(cells[idx]).text();
              const departureTime = extractTimeValue(timeText);
              if (!departureTime) continue;

              // 권곡초 버스정류장은 출발지로 사용하지 않음 (아산터미널 이후 정류장)
              if (name === '권곡초 버스정류장' || name.includes('권곡')) {
                continue;
              }

            // 온양온천역과 아산터미널 모두 출발지로 사용 가능
            let normalizedStopName = name;
            if (name === '온양온천역') {
              normalizedStopName = '온양온천역';
            } else if (name === '아산터미널') {
              normalizedStopName = '아산터미널';
            }

            // 다른 정류장들을 경유지로 추가 (출발지와 목적지 사이의 모든 정류장)
            const viaStopsForRoute = [];
            
            // 출발지와 목적지 사이의 정류장들을 순서대로 찾기
            const depTime = departureTime.split(':').map(Number);
            const depMinutes = depTime[0] * 60 + depTime[1];
            
            // 도착시간 확인
            let arrMinutes = null;
            if (arrivalTime && arrivalTime !== 'X') {
              const arrTime = arrivalTime.split(':').map(Number);
              arrMinutes = arrTime[0] * 60 + arrTime[1];
            }
            
            // 하교 방향: 출발지 → 아산캠퍼스
            // 출발지와 목적지(아산캠퍼스 도착) 사이의 정류장만 경유지로 포함 (컬럼 인덱스 범위로 판단)
            const intermediateStops = [];
            const campusArrivalColumnIdx = campusArrivalIdx;
            
            for (const { idx: otherIdx, name: otherName } of validStopColumns) {
              if (otherIdx === idx) continue; // 출발지 제외
              
              // 하교 방향: 출발지와 목적지(아산캠퍼스 도착) 사이에 있는 정류장만 포함
              // idx < otherIdx < campusArrivalColumnIdx
              if (otherIdx <= idx) {
                continue; // 출발지 이전 또는 출발지와 같은 정류장 제외
              }
              if (campusArrivalColumnIdx !== undefined && otherIdx >= campusArrivalColumnIdx) {
                continue; // 목적지 이후 또는 목적지와 같은 정류장 제외
              }
              
              const otherCell = cells.eq(otherIdx);
              const otherTimeText = otherCell.text().trim();
              const otherTime = extractTimeValue(otherTimeText);
              const isX = /^[XΧ]+$/i.test(otherTimeText);
              
              if (otherTime) {
                // 시간이 있으면 경유지로 추가
                intermediateStops.push({
                  name: otherName,
                  time: otherTime,
                  minutes: otherTime.split(':').map(Number).reduce((h, m) => h * 60 + m),
                  source: 'table',
                  columnIdx: otherIdx
                });
              } else if (isX) {
                // X로 표시된 경우도 경유지로 추가
                intermediateStops.push({
                  name: otherName,
                  time: 'X',
                  minutes: 0,
                  rawText: otherTimeText,
                  source: 'table',
                  columnIdx: otherIdx
                });
              } else if (otherTimeText && (otherTimeText.includes('경유') || otherTimeText.trim())) {
                // "경유" 텍스트가 있으면 경유지로 추가 (시간은 나중에 추정)
                intermediateStops.push({
                  name: otherName,
                  time: null,
                  minutes: 0,
                  rawText: otherTimeText,
                  source: 'table',
                  columnIdx: otherIdx
                });
              }
            }
            
            // 컬럼 인덱스 순서로 정렬 (하교 방향이므로 출발지에서 목적지 순서)
            intermediateStops.sort((a, b) => (a.columnIdx || 999) - (b.columnIdx || 999));
            
            // 경유지 추가
            intermediateStops.forEach(stop => {
              viaStopsForRoute.push({
                name: stop.name,
                time: stop.time,
                rawText: stop.rawText || null,
                source: stop.source
              });
            });
            // 도착시간 먼저 찾기
            let finalArrivalTime = arrivalTime;
            if (!finalArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['아산캠퍼스_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }

            // 경유지 시간 추정 (mergeViaStops 사용)
            mergeViaStops(viaStopsForRoute, viaStopsFromNote, departureTime, finalArrivalTime || 'X');

            // 도착시간이 없으면 X로 저장
              schedules.push({
                departure: normalizedStopName,
                arrival: '아산캠퍼스',
                departureTime,
                arrivalTime: finalArrivalTime || 'X',
                fridayOperates,
                dayType,
                note: noteText || '',
                viaStops: viaStopsForRoute,
                studentHallBoardingAvailable: hasHighlight(cells.eq(idx)),
                sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
              });
            }
          }

          // 등교 방향: 아산캠퍼스 (출발) → 정류장
          if (campusDepartureIdx !== undefined && campusDepartureIdx < cells.length) {
            const campusCell = cells.eq(campusDepartureIdx);
            const campusCellText = campusCell.text().trim();
            const campusDepartureTime = extractTimeValue(campusCellText);
            const campusIsX = /^[XΧ]+$/i.test(campusCellText);
            
            // 등교 방향: 아산캠퍼스 출발 시간이 있거나 X로 표시된 경우만 처리
            if (campusDepartureTime || campusIsX) {
              // X인 경우 출발시간을 null로 설정 (나중에 "X"로 저장)
              const actualDepartureTime = campusDepartureTime || null;
              
              // 등교 방향: 아산터미널까지만 파싱 (권곡초는 아산터미널 이후이므로 제외)
              const asanTerminalCol = validStopColumns.find(col => col.name === '아산터미널');
              const asanTerminalIdx = asanTerminalCol ? asanTerminalCol.idx : undefined;
              
              // 등교 방향용 정류장 목록: 아산터미널까지만 포함 (권곡초 제외)
              const validStopColumnsForGoing = validStopColumns.filter(col => {
                // 권곡초는 등교 방향에서 제외
                if (col.name === '권곡초 버스정류장' || col.name.includes('권곡')) {
                  return false;
                }
                // 아산터미널이 있으면 아산터미널까지만 포함
                if (asanTerminalIdx !== undefined && col.idx > asanTerminalIdx) {
                  return false;
                }
                return true;
              });
              
              // 아산터미널 스케줄 생성 확인용 디버그
              const asanTerminalInValid = validStopColumnsForGoing.find(col => col.name === '아산터미널');
              if (asanTerminalInValid) {
                const testCell = cells.eq(asanTerminalInValid.idx);
                const testValue = testCell.text();
                const testTime = extractTimeValue(testValue);
              }
              
              for (const { idx, name } of validStopColumnsForGoing) {
                const stopCell = cells.eq(idx);
                const stopValue = stopCell.text().trim();
                const stopTime = extractTimeValue(stopValue);
                const stopIsX = /^[XΧ]+$/i.test(stopValue);
                
                // 목적지 시간이 없으면 스킵 (X도 아니고 시간도 없으면)
                // 단, 아산캠퍼스 출발이 X인 경우는 목적지 시간이 있으면 무조건 스케줄 생성
                // 목적지 시간이 없고 X도 아니면 스킵 (단, 아산캠퍼스 출발이 X이고 목적지가 X인 경우는 생성)
                if (!stopTime && !stopIsX) {
                  // 아산캠퍼스 출발이 X이고 목적지도 X인 경우만 생성
                  if (!campusIsX) continue;
                }

                // 온양온천역은 목적지로 저장하지 않음 (경유지로만 처리)
                // 아산터미널만 최종 목적지로 저장
                if (name === '온양온천역') {
                  // 온양온천역은 경유지로만 사용하므로 목적지로 저장하지 않음
                  continue;
                }
                
                let normalizedStopName = name;
                if (name === '아산터미널') {
                  normalizedStopName = '아산터미널';
                } else {
                  // 다른 정류장 이름은 그대로 사용
                  normalizedStopName = name;
                }

                // 등교 방향: 아산캠퍼스 → 아산터미널
                // 출발지와 목적지 사이의 정류장만 경유지로 포함 (컬럼 인덱스 범위로 판단)
                const viaStopsForRoute = [];
                const arrivalColumnIdx = idx;
                
                // 등교 방향: 출발지(아산캠퍼스)와 목적지 사이의 정류장만 경유지
                const intermediateStops = [];
                for (const { idx: otherIdx, name: otherName } of validStopColumnsForGoing) {
                  if (otherIdx === idx) continue; // 목적지 제외
                  
                  // 등교 방향: 출발지(아산캠퍼스)와 목적지 사이에 있는 정류장만 포함
                  // campusDepartureIdx < otherIdx < arrivalColumnIdx
                  if (campusDepartureIdx !== undefined && otherIdx <= campusDepartureIdx) {
                    continue; // 출발지 이전 또는 출발지와 같은 정류장 제외
                  }
                  if (otherIdx >= arrivalColumnIdx) {
                    continue; // 목적지 이후 또는 목적지와 같은 정류장 제외
                  }
                  
                  // 등교 방향: 출발지와 목적지 사이의 정류장만 경유지로 추가
                  const otherCell = cells.eq(otherIdx);
                  const otherTimeText = otherCell.text().trim();
                  const otherTime = extractTimeValue(otherTimeText);
                  const isX = /^[XΧ]+$/i.test(otherTimeText);
                  
                  if (otherTime) {
                    // 시간이 있으면 경유지로 추가
                    intermediateStops.push({
                      name: otherName,
                      time: otherTime,
                      minutes: otherTime.split(':').map(Number).reduce((h, m) => h * 60 + m),
                      source: 'table',
                      columnIdx: otherIdx
                    });
                  } else if (isX) {
                    // X로 표시된 경우도 경유지로 추가
                    intermediateStops.push({
                      name: otherName,
                      time: 'X',
                      minutes: 0, // 정렬을 위한 임시 값
                      rawText: otherTimeText,
                      source: 'table',
                      columnIdx: otherIdx
                    });
                  } else if (otherTimeText && (otherTimeText.includes('경유') || otherTimeText.trim())) {
                    // "경유" 텍스트가 있으면 경유지로 추가 (시간은 나중에 추정)
                    intermediateStops.push({
                      name: otherName,
                      time: null,
                      minutes: 0,
                      rawText: otherTimeText,
                      source: 'table',
                      columnIdx: otherIdx
                    });
                  }
                }
                
                // 컬럼 인덱스 순서로 정렬 (등교 방향이므로 출발지에서 목적지 순서)
                intermediateStops.sort((a, b) => (a.columnIdx || 999) - (b.columnIdx || 999));
                
                // 경유지 추가
                intermediateStops.forEach(stop => {
                  viaStopsForRoute.push({
                    name: stop.name,
                    time: stop.time,
                    rawText: stop.rawText || null,
                    source: stop.source
                  });
                });
                
                // mergeViaStops로 경유지 시간 추정 및 정리
                const finalDepartureTime = actualDepartureTime || 'X';
                const finalArrivalTime = stopTime || (stopIsX ? 'X' : 'X');
                mergeViaStops(viaStopsForRoute, viaStopsFromNote, finalDepartureTime, finalArrivalTime);

                // 권곡초 버스정류장은 도착지로 저장하지 않음
                if (normalizedStopName === '권곡초 버스정류장' || normalizedStopName.includes('권곡')) {
                  continue;
                }
                
                // 도착시간이 없으면 X로 저장
                schedules.push({
                  departure: '아산캠퍼스',
                  arrival: normalizedStopName,
                  departureTime: finalDepartureTime,
                  arrivalTime: finalArrivalTime,
                  fridayOperates,
                  dayType,
                  note: noteText || '',
                  viaStops: viaStopsForRoute,
                  studentHallBoardingAvailable: hasHighlight(campusCell),
                  sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
                });
              }
            }
          }
        }

        return;
      }

    // 천안 아산역 특수 처리 (천안 아산역 페이지 또는 아산캠퍼스 페이지에서 천안 아산역 컬럼이 있을 때)
    // 주의: 천안역 페이지는 제외 (천안역 특수 처리 로직에서 처리)
    if ((normalizedDeparture === '천안 아산역' || 
        (normalizedDeparture === '아산캠퍼스' && departureColIndices['천안 아산역'] !== undefined)) &&
        normalizedDeparture !== '천안역') {
      const campusColIdx = departureColIndices['아산캠퍼스'];
      const stationColIdx = departureColIndices['천안 아산역'];
      if (campusColIdx === undefined && stationColIdx === undefined) {
        return;
      }

      const arrivalColIdx = columnMap.arrival;
      const intermediateEntries = Object.entries(departureColIndices).filter(([stopName, idx]) => {
        if (stopName === '천안 아산역' || stopName === '아산캠퍼스') return false;
        if (isArrivalColumn(stopName)) return false; // 도착 컬럼 제외
        return idx !== undefined;
      });

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th');
        if (cells.length === 0) continue;

        const firstCell = $(cells[0]).text().trim();
        if (!/^[0-9]+$/.test(firstCell)) continue;

        let noteText = '';
        if (columnMap.note !== undefined && columnMap.note < cells.length) {
          noteText = $(cells[columnMap.note]).text().trim();
        }
        if (!noteText) {
          const collected = [];
          cells.each((idx, cell) => {
            const value = $(cell).text().trim();
            if (
              value.includes('금(X)') ||
              value.includes('경유') ||
              value.includes('추가') ||
              value.includes('운행') ||
              value.includes('운영') ||
              value.includes('시간변경')
            ) {
              collected.push(value);
            }
          });
          if (collected.length > 0) {
            noteText = collected.join(', ');
          }
        }

        const rowText = $row.text();
        const fridayOperates = !(rowText.includes('금(X)') || noteText.includes('금(X)'));

        const arrivalTime =
          arrivalColIdx !== undefined && arrivalColIdx < cells.length
            ? (extractTimeValue($(cells[arrivalColIdx]).text()) || 'X')
            : 'X';

        const viaStopsFromColumns = [];
        for (const [stopName, idx] of intermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
          // 도착 컬럼 제외
          if (stopName.includes('_도착')) continue;
          const cell = cells.eq(idx);
          const rawValue = cell.text().trim();
          
          // 시간 추출 시도 (여러 패턴 시도)
          let timeValue = extractTimeValue(rawValue);
          
          // 시간이 없으면 다른 패턴 시도 (예: "09:30", "9:30", "0930" 등)
          if (!timeValue && rawValue) {
            // "09:30~09:45" 같은 범위 형식에서 첫 번째 시간 추출
            const rangeMatch = rawValue.match(/(\d{1,2})[:;](\d{2})\s*[~-]\s*(\d{1,2})[:;](\d{2})/);
            if (rangeMatch) {
              const hour = parseInt(rangeMatch[1]);
              const minute = parseInt(rangeMatch[2]);
              if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
              }
            }
            // "0930" 같은 형식 시도
            if (!timeValue) {
              const noColonMatch = rawValue.match(/(\d{2})(\d{2})/);
              if (noColonMatch) {
                const hour = parseInt(noColonMatch[1]);
                const minute = parseInt(noColonMatch[2]);
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                  timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                }
              }
            }
          }
          
          if (timeValue) {
            viaStopsFromColumns.push({
              name: stopName,
              time: timeValue,
              source: 'table'
            });
          } else if (rawValue && !/^[XΧ]+$/i.test(rawValue)) {
            // "경유"라고만 표시된 경우나 "5분~10분 소요예상" 같은 텍스트만 있는 경우
            // 출발시간과 도착시간 사이의 시간 범위를 추정 (나중에 mergeViaStops에서 처리)
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              rawText: rawValue,
              source: 'table'
            });
          } else if (!rawValue || /^[XΧ]+$/i.test(rawValue)) {
            // 빈 값이거나 X만 있는 경우에도 경유지로 추가 (시간 추정 필요)
            // intermediateEntries에 포함되어 있다는 것은 해당 정류장이 경유지임을 의미
            // 단, 실제로 "경유"라고 써져있지 않으면 rawText를 null로 설정
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              rawText: null,
              source: 'table'
            });
          } else {
            const viaFromCell = extractViaStopsFromText(rawValue);
            // viaFromCell은 출발시간/도착시간 정보가 없으므로 시간 추정 불가
            mergeViaStops(viaStopsFromColumns, viaFromCell);
          }
        }

        const viaStopsFromNote = extractViaStopsFromText(noteText);
        
        // note에서 추출한 경유지에 시간 매핑 (테이블 컬럼에서 찾기)
        viaStopsFromNote.forEach(viaStop => {
          const viaColIdx = departureColIndices[viaStop.name];
          if (viaColIdx !== undefined && viaColIdx < cells.length) {
            const viaCell = cells.eq(viaColIdx);
            const viaTime = extractTimeValue(viaCell.text());
            if (viaTime) {
              viaStop.time = viaTime;
            }
          }
        });

        // 아산캠퍼스 출발 컬럼 확인 (컬럼 1: "아산캠퍼스     출발")
        // 아산캠퍼스 컬럼은 출발 컬럼만 사용
        const campusDepartureColIdx = departureColIndices['아산캠퍼스'];
        if (campusDepartureColIdx !== undefined && campusDepartureColIdx < cells.length) {
          const campusCell = cells.eq(campusDepartureColIdx);
          const campusTime = extractTimeValue(campusCell.text());
          if (campusTime) {
            const campusViaStops = [];
            
            // 도착시간 먼저 찾기
            let finalArrivalTime = null;
            // stationColIdx가 정의되어 있으면 우선 사용 (천안 아산역 특수 처리에서)
            if (stationColIdx !== undefined && stationColIdx < cells.length) {
              const stationCell = cells.eq(stationColIdx);
              const stationTime = extractTimeValue(stationCell.text());
              // 천안아산역 출발 시간이 있고, 출발 시간보다 늦으면 도착 시간으로 사용
              if (stationTime) {
                const depMinutes = parseInt(campusTime.split(':')[0]) * 60 + parseInt(campusTime.split(':')[1]);
                const arrMinutes = parseInt(stationTime.split(':')[0]) * 60 + parseInt(stationTime.split(':')[1]);
                if (arrMinutes > depMinutes) {
                  finalArrivalTime = stationTime;
                }
              }
            }
            // stationColIdx가 없으면 departureColIndices에서 직접 찾기 (아산캠퍼스 페이지에서)
            if (!finalArrivalTime && departureColIndices['천안 아산역'] !== undefined) {
              const stationColIdx2 = departureColIndices['천안 아산역'];
              if (stationColIdx2 !== undefined && stationColIdx2 < cells.length) {
                const stationCell = cells.eq(stationColIdx2);
                const stationTime = extractTimeValue(stationCell.text());
                // 천안아산역 출발 시간이 있고, 출발 시간보다 늦으면 도착 시간으로 사용
                if (stationTime) {
                  const depMinutes = parseInt(campusTime.split(':')[0]) * 60 + parseInt(campusTime.split(':')[1]);
                  const arrMinutes = parseInt(stationTime.split(':')[0]) * 60 + parseInt(stationTime.split(':')[1]);
                  if (arrMinutes > depMinutes) {
                    finalArrivalTime = stationTime;
                  }
                }
              }
            }
            // 천안 아산역_도착 컬럼은 사용하지 않음 (그건 역방향용)
            
            // 경유지 시간 추정
            mergeViaStops(campusViaStops, viaStopsFromNote, campusTime, finalArrivalTime || 'X');
            mergeViaStops(campusViaStops, viaStopsFromColumns, campusTime, finalArrivalTime || 'X');
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '아산캠퍼스',
              arrival: '천안 아산역',
              departureTime: campusTime,
              arrivalTime: finalArrivalTime || 'X',
              fridayOperates,
              dayType,
              note: noteText || '',
              viaStops: campusViaStops,
              studentHallBoardingAvailable: hasHighlight(campusCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
          }
        }
        
        // 아산캠퍼스 도착 컬럼 확인 (컬럼 3: "아산캠퍼스     도착") - 역방향 처리용
        // 주의: "아산캠퍼스_도착"은 출발지가 아니라 도착 컬럼이므로, 별도로 처리
        const campusArrivalColIdx = departureColIndices['아산캠퍼스_도착'];
        if (campusArrivalColIdx !== undefined && stationColIdx !== undefined && stationColIdx < cells.length) {
          const stationCell = cells.eq(stationColIdx);
          const stationTime = extractTimeValue(stationCell.text());
          if (stationTime && campusArrivalColIdx < cells.length) {
            const campusArrivalCell = cells.eq(campusArrivalColIdx);
            const campusArrivalTime = extractTimeValue(campusArrivalCell.text());
            if (campusArrivalTime) {
              const stationViaStops = [];
              mergeViaStops(stationViaStops, viaStopsFromColumns, stationTime, campusArrivalTime);
              mergeViaStops(stationViaStops, viaStopsFromNote, stationTime, campusArrivalTime);
              
              // 천안 아산역 → 아산캠퍼스: 출발은 천안 아산역 출발 컬럼, 도착은 아산캠퍼스 도착 컬럼
              schedules.push({
                departure: '천안 아산역',
                arrival: '아산캠퍼스',
                departureTime: stationTime,
                arrivalTime: campusArrivalTime,
                fridayOperates,
                dayType,
                note: noteText || '',
                viaStops: stationViaStops,
                studentHallBoardingAvailable: hasHighlight(stationCell),
                sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
              });
            }
          }
        }

        if (stationColIdx !== undefined && stationColIdx < cells.length) {
          const stationCell = cells.eq(stationColIdx);
          const stationTime = extractTimeValue(stationCell.text());
          if (stationTime) {
            // 도착 시간 찾기:
            // 1. columnMap.arrival이 있으면 사용
            // 2. 없으면 campusColIdx(아산캠퍼스 출발 컬럼)의 시간 사용
            // 3. 없으면 "아산캠퍼스_도착" 컬럼 확인
            let finalArrivalTime = arrivalTime;
            if (!finalArrivalTime && campusColIdx !== undefined && campusColIdx < cells.length) {
              const campusCell = cells.eq(campusColIdx);
              finalArrivalTime = extractTimeValue(campusCell.text());
            }
            if (!finalArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['아산캠퍼스_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }
            
            const campusArrivalTime = finalArrivalTime || 'X';
            const stationViaStops = [];
            // viaStopsFromColumns와 viaStopsFromNote는 이미 위에서 정의됨 (for 루프 내부)
            mergeViaStops(stationViaStops, viaStopsFromColumns, stationTime, campusArrivalTime);
            mergeViaStops(stationViaStops, viaStopsFromNote, stationTime, campusArrivalTime);
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '천안 아산역',
              arrival: '아산캠퍼스',
              departureTime: stationTime,
              arrivalTime: campusArrivalTime,
              fridayOperates,
              dayType,
              note: noteText || '',
              viaStops: stationViaStops,
              studentHallBoardingAvailable: hasHighlight(stationCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
          }
        }
      }

      return;
    }

      // 천안역 특수 처리
      if (normalizedDeparture === '천안역') {
        const asanColIdx = departureColIndices['아산캠퍼스'];
        const cheonanColIdx = departureColIndices['천안역'];

      if (asanColIdx === undefined && cheonanColIdx === undefined) {
          return;
        }

      const arrivalColIdx = columnMap.arrival;
      const intermediateEntries = Object.entries(departureColIndices).filter(([stopName, idx]) => {
        if (stopName === '천안역' || stopName === '아산캠퍼스') return false;
        if (isArrivalColumn(stopName)) return false; // 도착 컬럼 제외
        return idx !== undefined;
      });

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const $row = $(rows[i]);
          const cells = $row.find('td, th');
          if (cells.length === 0) continue;

          const firstCell = $(cells[0]).text().trim();
          if (!/^[0-9]+$/.test(firstCell)) continue;

        let noteText = '';
        if (columnMap.note !== undefined && columnMap.note < cells.length) {
          noteText = $(cells[columnMap.note]).text().trim();
        }
        if (!noteText) {
          const collected = [];
          cells.each((idx, cell) => {
            const value = $(cell).text().trim();
            if (
              value.includes('금(X)') ||
              value.includes('중간노선') ||
              value.includes('추가') ||
              value.includes('운영') ||
              value.includes('경유') ||
              value.includes('시간변경')
            ) {
              collected.push(value);
            }
          });
          if (collected.length > 0) {
            noteText = collected.join(', ');
          }
        }

        const rowText = $row.text();
        const fridayOperates = !(rowText.includes('금(X)') || noteText.includes('금(X)'));

        const arrivalTime =
          arrivalColIdx !== undefined && arrivalColIdx < cells.length
            ? (extractTimeValue($(cells[arrivalColIdx]).text()) || 'X')
            : 'X';

        const viaStopsFromColumns = [];
        // 컬럼 인덱스 순서로 정렬하여 경유지 순서 보장
        const sortedIntermediateEntries = [...intermediateEntries].sort((a, b) => {
          const idxA = a[1] || 999;
          const idxB = b[1] || 999;
          return idxA - idxB;
        });
        
        for (const [stopName, idx] of sortedIntermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
          // 도착 컬럼 제외
          if (stopName.includes('_도착')) continue;
          const cell = cells.eq(idx);
          const rawValue = cell.text().trim();
          
          // 시간 추출 시도 (여러 패턴 시도)
          let timeValue = extractTimeValue(rawValue);
          
          // 시간이 없으면 다른 패턴 시도 (예: "09:30", "9:30", "0930" 등)
          if (!timeValue && rawValue) {
            // "09:30~09:45" 같은 범위 형식에서 첫 번째 시간 추출
            const rangeMatch = rawValue.match(/(\d{1,2})[:;](\d{2})\s*[~-]\s*(\d{1,2})[:;](\d{2})/);
            if (rangeMatch) {
              const hour = parseInt(rangeMatch[1]);
              const minute = parseInt(rangeMatch[2]);
              if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
              }
            }
            // "0930" 같은 형식 시도
            if (!timeValue) {
              const noColonMatch = rawValue.match(/(\d{2})(\d{2})/);
              if (noColonMatch) {
                const hour = parseInt(noColonMatch[1]);
                const minute = parseInt(noColonMatch[2]);
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                  timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                }
              }
            }
          }
          
          if (timeValue) {
            viaStopsFromColumns.push({
              name: stopName,
              time: timeValue,
              source: 'table',
              columnIdx: idx // 컬럼 인덱스 저장 (정렬용)
            });
          } else if (rawValue && !/^[XΧ]+$/i.test(rawValue)) {
            // "경유"라고만 표시된 경우나 "5분~10분 소요예상" 같은 텍스트만 있는 경우
            // 출발시간과 도착시간 사이의 시간 범위를 추정 (나중에 mergeViaStops에서 처리)
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              rawText: rawValue,
              source: 'table',
              columnIdx: idx // 컬럼 인덱스 저장 (정렬용)
            });
          } else if (!rawValue || /^[XΧ]+$/i.test(rawValue)) {
            // 빈 값이거나 X만 있는 경우에도 경유지로 추가 (시간 추정 필요)
            // intermediateEntries에 포함되어 있다는 것은 해당 정류장이 경유지임을 의미
            // 단, 실제로 "경유"라고 써져있지 않으면 rawText를 null로 설정
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              rawText: null,
              source: 'table',
              columnIdx: idx // 컬럼 인덱스 저장 (정렬용)
            });
          } else {
            const viaFromCell = extractViaStopsFromText(rawValue);
            // viaFromCell은 출발시간/도착시간 정보가 없으므로 시간 추정 불가
            mergeViaStops(viaStopsFromColumns, viaFromCell);
          }
        }
        
        // 경유지를 시간 순서로 정렬 (시간이 같거나 없으면 컬럼 인덱스 순서로 정렬)
        viaStopsFromColumns.sort((a, b) => {
          if (a.time && b.time) {
            const timeA = a.time.split(':').map(Number).reduce((h, m) => h * 60 + m);
            const timeB = b.time.split(':').map(Number).reduce((h, m) => h * 60 + m);
            if (timeA !== timeB) return timeA - timeB;
          }
          if (a.time && !b.time) return -1;
          if (!a.time && b.time) return 1;
          // 시간이 같거나 둘 다 없으면 컬럼 인덱스 순서로 정렬
          return (a.columnIdx || 999) - (b.columnIdx || 999);
        });

        const viaStopsFromNote = extractViaStopsFromText(noteText);
        
        // note에서 추출한 경유지에 시간 매핑 (테이블 컬럼에서 찾기)
        viaStopsFromNote.forEach(viaStop => {
          const viaColIdx = departureColIndices[viaStop.name];
          if (viaColIdx !== undefined && viaColIdx < cells.length) {
            const viaCell = cells.eq(viaColIdx);
            const viaTime = extractTimeValue(viaCell.text());
            if (viaTime) {
              viaStop.time = viaTime;
            }
          }
        });

        if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanTime = extractTimeValue(asanCell.text());
          if (asanTime) {
            // 아산캠퍼스 → 천안역 방향: 경유지 없음 (직접 노선)
            const campusViaStops = [];
            
            // 도착시간 찾기
            let finalArrivalTime = null;
            
            // 천안역 도착 컬럼 확인 (우선순위)
            if (departureColIndices['천안역_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['천안역_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                const arrivalCellText = arrivalCell.text().trim();
                const arrivalIsX = /^[XΧ]+$/i.test(arrivalCellText);
                if (!arrivalIsX) {
                  finalArrivalTime = extractTimeValue(arrivalCellText);
                } else {
                  finalArrivalTime = 'X';
                }
              }
            }
            
            // 천안역 출발 컬럼 확인 (도착 컬럼이 없거나 X인 경우)
            if (!finalArrivalTime && cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
              const cheonanCell = cells.eq(cheonanColIdx);
              const cheonanCellText = cheonanCell.text().trim();
              const cheonanIsX = /^[XΧ]+$/i.test(cheonanCellText);
              if (cheonanIsX) {
                finalArrivalTime = 'X';
              } else {
                const cheonanTime = extractTimeValue(cheonanCellText);
                if (cheonanTime) {
                  const depMinutes = parseInt(asanTime.split(':')[0]) * 60 + parseInt(asanTime.split(':')[1]);
                  const arrMinutes = parseInt(cheonanTime.split(':')[0]) * 60 + parseInt(cheonanTime.split(':')[1]);
                  if (arrMinutes > depMinutes) {
                    finalArrivalTime = cheonanTime;
                  } else {
                    finalArrivalTime = 'X';
                  }
                }
              }
            }
            
            // columnMap.arrival 확인
            if (!finalArrivalTime && columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
              const arrivalCell = cells.eq(columnMap.arrival);
              const arrivalCellText = arrivalCell.text().trim();
              const arrivalIsX = /^[XΧ]+$/i.test(arrivalCellText);
              if (arrivalIsX) {
                finalArrivalTime = 'X';
              } else {
                finalArrivalTime = extractTimeValue(arrivalCellText);
              }
            }
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '아산캠퍼스',
              arrival: '천안역',
              departureTime: asanTime,
              arrivalTime: finalArrivalTime || 'X',
              fridayOperates,
              dayType,
              note: noteText || '',
              viaStops: [], // 아산캠퍼스 → 천안역: 경유지 없음
              studentHallBoardingAvailable: hasHighlight(asanCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
          }
        }

        if (cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
          const cheonanCell = cells.eq(cheonanColIdx);
          const cheonanCellText = cheonanCell.text().trim();
          const cheonanIsX = /^[XΧ]+$/i.test(cheonanCellText);
          // "X"인 경우에는 시간을 추출하지 않음
          const cheonanTime = cheonanIsX ? null : extractTimeValue(cheonanCellText);
          
          // 천안역 출발 시간이 있거나 "X"인 경우 처리
          // "X"인 경우에도 중간 경유지에 시간이 있거나 도착 시간이 있으면 스케줄 생성
          // 도착 시간 확인 (용암마을, 하이렉스파 건너편, 아산캠퍼스_도착 등)
          let hasArrivalTime = false;
          if (departureColIndices['용암마을'] !== undefined) {
            const yongamIdx = departureColIndices['용암마을'];
            if (yongamIdx < cells.length) {
              const yongamCell = cells.eq(yongamIdx);
              const yongamTime = extractTimeValue(yongamCell.text());
              if (yongamTime) hasArrivalTime = true;
            }
          }
          if (!hasArrivalTime && departureColIndices['하이렉스파 건너편'] !== undefined) {
            const hairexIdx = departureColIndices['하이렉스파 건너편'];
            if (hairexIdx < cells.length) {
              const hairexCell = cells.eq(hairexIdx);
              const hairexTime = extractTimeValue(hairexCell.text());
              if (hairexTime) hasArrivalTime = true;
            }
          }
          if (!hasArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
            const campusArrivalIdx = departureColIndices['아산캠퍼스_도착'];
            if (campusArrivalIdx < cells.length) {
              const campusArrivalCell = cells.eq(campusArrivalIdx);
              const campusArrivalTime = extractTimeValue(campusArrivalCell.text());
              if (campusArrivalTime) hasArrivalTime = true;
            }
          }
          
          if (cheonanTime || cheonanIsX || (cheonanIsX && hasArrivalTime)) {
            // 천안역 출발이 "X"인 경우, "X"로 저장 (추정하지 않음)
            let actualDepartureTime = cheonanTime || (cheonanIsX ? 'X' : null);
            
            // baseTime을 설정 (천안역 출발이 "X"인 경우 첫 번째 경유지 시간 사용)
            let baseTimeForCheonan = cheonanTime;
            
            // 천안역 출발이 "X"이고 중간 경유지에 시간이 있는 경우
            if (cheonanIsX && !cheonanTime && intermediateEntries.length > 0) {
              // 경유지 순서: 용암마을이 첫 번째 경유지
              const sortedViaEntries = intermediateEntries.sort((a, b) => a[1] - b[1]);
              
              // 용암마을이 첫 번째 경유지인지 확인
              const yongamEntry = sortedViaEntries.find(([name]) => name === '용암마을');
              if (yongamEntry && yongamEntry[1] < cells.length) {
                const yongamCell = cells.eq(yongamEntry[1]);
                const yongamText = yongamCell.text().trim();
                const yongamTime = extractTimeValue(yongamText);
                
                // 용암마을 시간이 있으면 baseTime으로 사용
                if (yongamTime) {
                  baseTimeForCheonan = yongamTime;
                } else {
                  // 용암마을 시간이 없으면 첫 번째 경유지 시간 사용
                  const firstViaEntry = sortedViaEntries[0];
                  if (firstViaEntry && firstViaEntry[1] < cells.length) {
                    const firstViaCell = cells.eq(firstViaEntry[1]);
                    const firstViaText = firstViaCell.text().trim();
                    const firstViaTime = extractTimeValue(firstViaText);
                    
                    if (firstViaTime) {
                      baseTimeForCheonan = firstViaTime;
                    }
                  }
                }
              } else {
                // 용암마을이 없으면 첫 번째 경유지 시간 사용
                const firstViaEntry = sortedViaEntries[0];
                if (firstViaEntry && firstViaEntry[1] < cells.length) {
                  const firstViaCell = cells.eq(firstViaEntry[1]);
                  const firstViaText = firstViaCell.text().trim();
                  const firstViaTime = extractTimeValue(firstViaText);
                  
                  if (firstViaTime) {
                    baseTimeForCheonan = firstViaTime;
                  }
                }
              }
            }
            
            // 도착 시간 찾기 (천안역 → 아산캠퍼스)
            let finalArrivalTime = null;
            
            // 천안역 → 아산캠퍼스 방향 경유지 순서 정의 (명시적 순서)
            // 용암마을이 첫 번째 경유지
            const cheonanToCampusRouteOrder = ['용암마을', '하이렉스파 건너편'];
            
            // 경유지를 명시적 순서대로 정렬
            const sortedIntermediateEntries = [];
            for (const orderedStopName of cheonanToCampusRouteOrder) {
              const found = intermediateEntries.find(([name]) => name === orderedStopName);
              if (found) {
                sortedIntermediateEntries.push(found);
              }
            }
            // 명시적 순서에 없는 경유지는 컬럼 인덱스 기준으로 추가
            for (const entry of intermediateEntries) {
              if (!cheonanToCampusRouteOrder.includes(entry[0])) {
                sortedIntermediateEntries.push(entry);
              }
            }
            
            // 천안역 출발 시 경유지 시간 계산
            const cheonanViaStops = [];
            let previousTimeRange = null; // 이전 경유지의 시간 범위 저장
            
            for (const [stopName, idx] of sortedIntermediateEntries) {
              if (idx === undefined || idx >= cells.length) continue;
              const cell = cells.eq(idx);
              const rawValue = cell.text().trim();
              
              // "5분~10분 소요예상" 같은 텍스트가 있으면 우선적으로 파싱
              let timeValue = null;
              
              // 첫 번째 경유지(용암마을)이고 출발시간이 "X"인 경우, 실제 시간을 먼저 추출
              if (!previousTimeRange && stopName === '용암마을' && cheonanIsX && !cheonanTime && rawValue && !/^[XΧ]+$/i.test(rawValue)) {
                // 먼저 실제 시간이 있는지 확인 (예: "08:55")
                const directTime = extractTimeValue(rawValue);
                if (directTime) {
                  // 실제 시간이 있으면 그대로 사용
                  timeValue = directTime;
                  // 단일 시간이므로 범위 형식으로 변환하지 않음
                }
              }
              
              // "소요예상" 또는 "분~" 패턴이 있으면 무조건 범위 형식으로 파싱 (단일 시간 추출 전에 체크)
              if (!timeValue && rawValue && !/^[XΧ]+$/i.test(rawValue)) {
                const hasDurationPattern = rawValue.includes('소요예상') || rawValue.match(/\d+\s*분?\s*[~-]\s*\d+\s*분/);
                
                if (hasDurationPattern) {
                  // rawValue에서 시간 부분을 제거하고 "5분~10분 소요예상" 부분만 추출
                  let durationText = rawValue;
                  durationText = durationText.replace(/\d{1,2}[:;]\d{2}/g, '').replace(/\d{4}/g, '').trim();
                  
                  // "5분~10분 소요예상" 패턴 찾기
                  const durationMatch = durationText.match(/(\d+)\s*분?\s*[~-]\s*(\d+)\s*분/);
                  if (durationMatch) {
                    if (previousTimeRange) {
                      // 이전 경유지가 있으면 이전 경유지 시간 범위 기준으로 계산
                      const parsedTime = parseDurationTextForNextViaStop(durationText, previousTimeRange);
                      if (parsedTime) {
                        timeValue = parsedTime;
                        previousTimeRange = parsedTime;
                      }
                    } else {
                      // 첫 번째 경유지는 baseTime 기준으로 계산
                      const baseTime = baseTimeForCheonan || cheonanTime;
                      if (baseTime) {
                        const parsedTime = parseDurationText(durationText, baseTime);
                        if (parsedTime) {
                          timeValue = parsedTime;
                          previousTimeRange = parsedTime;
                        }
                      }
                    }
                  }
                }
              }
              
              // 첫 번째 경유지(용암마을)이고 "소요예상" 패턴이 없으면 기본 "5분~10분 소요예상" 가정
              if (!timeValue && !previousTimeRange && stopName === '용암마을' && rawValue && !/^[XΧ]+$/i.test(rawValue)) {
                // 용암마을은 첫 번째 경유지이므로 기본 "5분~10분 소요예상" 적용
                const baseTime = baseTimeForCheonan || cheonanTime;
                if (baseTime) {
                  const parsedTime = parseDurationText('5분~10분 소요예상', baseTime);
                  if (parsedTime) {
                    timeValue = parsedTime;
                    previousTimeRange = parsedTime;
                  }
                }
              }
              
              // parseDurationText로 파싱되지 않았고, "소요예상"이 없으면 extractTimeValue 시도
              // 단, "소요예상"이 있으면 절대 extractTimeValue를 사용하지 않음
              if (!timeValue && rawValue && !/^[XΧ]+$/i.test(rawValue) && !rawValue.includes('소요예상') && !rawValue.match(/\d+\s*분?\s*[~-]\s*\d+\s*분/)) {
                timeValue = extractTimeValue(rawValue);
                // 단일 시간이 추출되었지만, 다음 경유지 계산에는 사용할 수 없음 (범위 형식이 아니므로)
              }
              
              if (timeValue) {
                cheonanViaStops.push({
                  name: stopName,
                  time: timeValue,
                  source: 'table'
                });
              } else {
                // timeValue가 없으면 이전 경유지 시간 범위를 기준으로 계산 시도
                if (previousTimeRange) {
                  // 이전 경유지 시간 범위 기준으로 "5분~10분 소요예상" 계산
                  const estimatedTime = parseDurationTextForNextViaStop('5분~10분 소요예상', previousTimeRange);
                  if (estimatedTime) {
                    cheonanViaStops.push({
                      name: stopName,
                      time: estimatedTime,
                      source: 'table'
                    });
                    previousTimeRange = estimatedTime;
                  } else {
                    // 계산 실패 시 "X"로 저장
                    cheonanViaStops.push({
                      name: stopName,
                      time: 'X',
                      rawText: rawValue || null,
                      source: 'table'
                    });
                  }
                } else {
                  // 이전 경유지 시간 범위가 없으면 "X"로 저장
                  cheonanViaStops.push({
                    name: stopName,
                    time: 'X',
                    rawText: rawValue || null,
                    source: 'table'
                  });
                }
              }
            }
            
            // note에서 추출한 경유지도 추가 (시간 매핑)
            viaStopsFromNote.forEach(viaStop => {
              const viaColIdx = departureColIndices[viaStop.name];
              if (viaColIdx !== undefined && viaColIdx < cells.length) {
                const viaCell = cells.eq(viaColIdx);
                const rawValue = viaCell.text().trim();
                
                // "소요예상" 또는 "분~" 패턴이 있으면 무조건 범위 형식으로 파싱
                if (rawValue && !/^[XΧ]+$/i.test(rawValue) && (rawValue.includes('소요예상') || rawValue.match(/\d+\s*분?\s*[~-]\s*\d+\s*분/))) {
                  let durationText = rawValue;
                  durationText = durationText.replace(/\d{1,2}[:;]\d{2}/g, '').replace(/\d{4}/g, '').trim();
                  
                  const durationMatch = durationText.match(/(\d+)\s*분?\s*[~-]\s*(\d+)\s*분/);
                  if (durationMatch) {
                    if (previousTimeRange) {
                      const parsedTime = parseDurationTextForNextViaStop(durationText, previousTimeRange);
                      if (parsedTime) {
                        viaStop.time = parsedTime;
                        previousTimeRange = parsedTime;
                      }
                    } else {
                      const parsedTime = parseDurationText(durationText, cheonanTime);
                      if (parsedTime) {
                        viaStop.time = parsedTime;
                        previousTimeRange = parsedTime;
                      }
                    }
                  }
                } else {
                  // "소요예상"이 없으면 extractTimeValue 시도
                  const viaTime = extractTimeValue(rawValue);
                  if (viaTime) {
                    viaStop.time = viaTime;
                  }
                }
              }
              // 중복 체크 후 추가
              if (!cheonanViaStops.find(v => v.name === viaStop.name)) {
                cheonanViaStops.push(viaStop);
              }
            });
            
            // viaStopsFromNote에서 추가한 경유지도 포함하여 다시 정렬
            // 경유지를 시간 순서대로 정렬하는 함수
            const parseTimeForSort = (timeStr) => {
              if (!timeStr || timeStr === 'X') return Infinity; // X는 가장 뒤로
              if (timeStr.includes('~')) {
                // 범위 형식: "08:15~08:30" -> 첫 번째 시간 사용
                const firstTime = timeStr.split('~')[0].trim();
                const [hour, min] = firstTime.split(':').map(Number);
                return hour * 60 + min;
              } else {
                // 단일 시간: "08:50"
                const [hour, min] = timeStr.split(':').map(Number);
                return hour * 60 + min;
              }
            };
            
            // 경유지를 명시적 순서대로 정렬 (명시적 순서가 항상 우선)
            cheonanViaStops.sort((a, b) => {
              // 명시적 순서가 있으면 우선 적용
              const orderA = cheonanToCampusRouteOrder.indexOf(a.name);
              const orderB = cheonanToCampusRouteOrder.indexOf(b.name);
              
              // 둘 다 명시적 순서에 있으면 명시적 순서대로
              if (orderA !== -1 && orderB !== -1) {
                return orderA - orderB;
              }
              
              // 하나만 명시적 순서에 있으면 그게 먼저
              if (orderA !== -1) return -1;
              if (orderB !== -1) return 1;
              
              // 둘 다 명시적 순서에 없으면 시간 순서로 정렬
              const timeA = parseTimeForSort(a.time);
              const timeB = parseTimeForSort(b.time);
              if (timeA !== timeB) {
                return timeA - timeB;
              }
              
              // 시간이 같으면 컬럼 인덱스로 정렬
              const idxA = departureColIndices[a.name];
              const idxB = departureColIndices[b.name];
              if (idxA === undefined && idxB === undefined) return 0;
              if (idxA === undefined) return 1;
              if (idxB === undefined) return -1;
              return idxA - idxB;
            });
            
            // 용암마을 컬럼 확인 (도착시간이 없을 경우 용암마을 시간을 도착시간으로 사용)
            if (!finalArrivalTime && departureColIndices['용암마을'] !== undefined) {
              const yongamIdx = departureColIndices['용암마을'];
              if (yongamIdx < cells.length) {
                const yongamCell = cells.eq(yongamIdx);
                const yongamTime = extractTimeValue(yongamCell.text());
                if (yongamTime) {
                  finalArrivalTime = yongamTime;
                }
              }
            }
            // 하이렉스파 건너편 컬럼 확인 (도착시간이 없을 경우 하이렉스파 건너편 시간을 도착시간으로 사용)
            if (!finalArrivalTime && departureColIndices['하이렉스파 건너편'] !== undefined) {
              const hairexIdx = departureColIndices['하이렉스파 건너편'];
              if (hairexIdx < cells.length) {
                const hairexCell = cells.eq(hairexIdx);
                const hairexTime = extractTimeValue(hairexCell.text());
                if (hairexTime) {
                  finalArrivalTime = hairexTime;
                }
              }
            }
            // 2. "아산캠퍼스_도착" 컬럼 확인
            if (!finalArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['아산캠퍼스_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }
            // 3. columnMap.arrival 확인 (다른 페이지용)
            if (!finalArrivalTime && columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
              const arrivalCell = cells.eq(columnMap.arrival);
              finalArrivalTime = extractTimeValue(arrivalCell.text());
            }
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '천안역',
              arrival: '아산캠퍼스',
              departureTime: actualDepartureTime,
              arrivalTime: finalArrivalTime || 'X',
              fridayOperates,
              dayType,
              note: noteText || '',
              viaStops: cheonanViaStops,
              studentHallBoardingAvailable: hasHighlight(cheonanCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
          }
        }
        }

        return;
      }

      // 천안 터미널 페이지 특수 처리: 아산캠퍼스 ↔ 천안 터미널 구간만 저장
      if (normalizedDeparture === '천안 터미널') {
        const asanColIdx = departureColIndices['아산캠퍼스'];
        const terminalColIdx = departureColIndices['천안 터미널'];

        if (asanColIdx === undefined && terminalColIdx === undefined) {
          return;
        }

      const arrivalColIdx = columnMap.arrival;
      const intermediateEntries = Object.entries(departureColIndices).filter(([stopName, idx]) => {
        if (stopName === '천안 터미널' || stopName === '아산캠퍼스') return false;
        if (isArrivalColumn(stopName)) return false; // 도착 컬럼 제외
        return idx !== undefined;
      });

        for (let i = headerRowIdx + 1; i < rows.length; i++) {
          const $row = $(rows[i]);
          const cells = $row.find('td, th');
          if (cells.length === 0) continue;

          const firstCell = $(cells[0]).text().trim();
          if (!/^[0-9]+$/.test(firstCell)) continue;

          let noteText = '';
          if (columnMap.note !== undefined && columnMap.note < cells.length) {
            noteText = $(cells[columnMap.note]).text().trim();
          }
          if (!noteText) {
            const collected = [];
            cells.each((idx, cell) => {
              const value = $(cell).text().trim();
              if (value.includes('금(X)') || value.includes('중간노선') || value.includes('추가') || value.includes('운영') || value.includes('경유')) {
                collected.push(value);
              }
            });
            if (collected.length > 0) {
              noteText = collected.join(', ');
            }
          }

          const rowText = $row.text();
          const fridayOperates = !(rowText.includes('금(X)') || noteText.includes('금(X)'));

        const arrivalTime =
          arrivalColIdx !== undefined && arrivalColIdx < cells.length
            ? (extractTimeValue($(cells[arrivalColIdx]).text()) || 'X')
            : 'X';

        // 경유지 순서를 컬럼 인덱스 기준으로 정렬
        const sortedIntermediateEntries = [...intermediateEntries].sort((a, b) => a[1] - b[1]);
        
        // 아산캠퍼스 → 천안 터미널 방향 경유지 시간 계산 (순차적으로 이전 경유지 도착 시간 기준)
        // baseTimeForNext는 아산캠퍼스 출발 시간이 확인된 후 설정됨
        // 이 루프는 아산캠퍼스 출발 시간 확인 전에 실행되므로, 경유지 시간은 나중에 다시 파싱됨
        const viaStopsFromColumns = [];
        let baseTimeForNext = null;
        
        for (const [stopName, idx] of sortedIntermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
          const cell = cells.eq(idx);
          const rawValue = cell.text().trim();
          
          // 시간 추출 시도 (baseTimeForNext가 없어도 단일 시간은 추출 가능)
          let timeValue = extractTimeValue(rawValue);
          
          if (timeValue) {
            viaStopsFromColumns.push({
              name: stopName,
              time: timeValue,
              source: 'table'
            });
          } else if (/^[XΧ]+$/i.test(rawValue)) {
            viaStopsFromColumns.push({
              name: stopName,
              time: 'X',
              source: 'table'
            });
          } else {
            // 시간이 없으면 나중에 다시 파싱
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              rawText: rawValue,
              source: 'table'
            });
          }
        }

        const viaStopsFromNote = extractViaStopsFromText(noteText);
        
        // note에서 추출한 경유지에 시간 매핑 (테이블 컬럼에서 찾기)
        viaStopsFromNote.forEach(viaStop => {
          const viaColIdx = departureColIndices[viaStop.name];
          if (viaColIdx !== undefined && viaColIdx < cells.length) {
            const viaCell = cells.eq(viaColIdx);
            const viaTime = extractTimeValue(viaCell.text());
            if (viaTime) {
              viaStop.time = viaTime;
            }
          }
        });

          if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanCellText = asanCell.text().trim();
          const asanTime = extractTimeValue(asanCellText);
          const asanIsX = /^[XΧ]+$/i.test(asanCellText);
          
          // 아산캠퍼스 출발 시간이 있거나 "X"인 경우 처리
          // "X"인 경우에도 중간 경유지에 시간이 있으면 스케줄 생성
          if (asanTime || asanIsX) {
            // 아산캠퍼스 출발이 "X"인 경우, 첫 번째 경유지 시간을 기준으로 출발 시간 추정 시도
            let actualDepartureTime = asanTime || 'X';
            let baseTimeForViaStops = asanTime;
            
            // 아산캠퍼스 출발이 "X"이고 중간 경유지에 시간이 있는 경우
            if (asanIsX && !asanTime && intermediateEntries.length > 0) {
              // 첫 번째 경유지 시간을 찾아서 출발 시간 추정
              const sortedViaEntries = intermediateEntries.sort((a, b) => a[1] - b[1]);
              const firstViaStopEntry = sortedViaEntries[0];
              
              if (firstViaStopEntry && firstViaStopEntry[1] < cells.length) {
                const firstViaCell = cells.eq(firstViaStopEntry[1]);
                const firstViaText = firstViaCell.text().trim();
                const firstViaTime = extractTimeValue(firstViaText);
                
                // 첫 번째 경유지 시간이 있으면, 그 시간에서 5분을 뺀 값을 출발 시간으로 추정
                if (firstViaTime) {
                  const [viaHour, viaMin] = firstViaTime.split(':').map(Number);
                  const viaMinutes = viaHour * 60 + viaMin;
                  const estimatedDepMinutes = Math.max(0, viaMinutes - 5); // 최소 5분 전 출발 추정
                  const estimatedDepHour = Math.floor(estimatedDepMinutes / 60) % 24;
                  const estimatedDepMin = estimatedDepMinutes % 60;
                  actualDepartureTime = `${String(estimatedDepHour).padStart(2, '0')}:${String(estimatedDepMin).padStart(2, '0')}`;
                  baseTimeForViaStops = actualDepartureTime;
                } else {
                  // 첫 번째 경유지 시간이 없으면, 두 번째 경유지나 도착 시간을 확인
                  // 마지막 경유지나 도착 시간을 기준으로 역산
                  let foundTime = null;
                  
                  // 경유지들을 순회하면서 시간이 있는 첫 번째 경유지 찾기
                  for (const [stopName, idx] of sortedViaEntries) {
                    if (idx < cells.length) {
                      const cell = cells.eq(idx);
                      const cellText = cell.text().trim();
                      const cellTime = extractTimeValue(cellText);
                      if (cellTime && !/^[XΧ]+$/i.test(cellText)) {
                        foundTime = cellTime;
                        break;
                      }
                    }
                  }
                  
                  // 경유지에서 시간을 찾지 못했으면 도착 시간 확인
                  if (!foundTime && terminalColIdx !== undefined && terminalColIdx < cells.length) {
                    const terminalCell = cells.eq(terminalColIdx);
                    const terminalCellText = terminalCell.text().trim();
                    const terminalTime = extractTimeValue(terminalCellText);
                    if (terminalTime && !/^[XΧ]+$/i.test(terminalCellText)) {
                      foundTime = terminalTime;
                    }
                  }
                  
                  // 찾은 시간에서 5분을 뺀 값을 출발 시간으로 추정
                  if (foundTime) {
                    const [foundHour, foundMin] = foundTime.split(':').map(Number);
                    const foundMinutes = foundHour * 60 + foundMin;
                    const estimatedDepMinutes = Math.max(0, foundMinutes - 5);
                    const estimatedDepHour = Math.floor(estimatedDepMinutes / 60) % 24;
                    const estimatedDepMin = estimatedDepMinutes % 60;
                    actualDepartureTime = `${String(estimatedDepHour).padStart(2, '0')}:${String(estimatedDepMin).padStart(2, '0')}`;
                    baseTimeForViaStops = actualDepartureTime;
                  }
                }
              }
            }
            
            // 아산캠퍼스 → 천안 터미널 방향 경유지 순서 정의 (명시적 순서)
            const terminalRouteOrder = ['홈마트 에브리데이', '두정동 맥도날드', '서울대정병원'];
            
            // 경유지를 명시적 순서대로 정렬
            const sortedIntermediateEntriesForCampus = [];
            for (const orderedStopName of terminalRouteOrder) {
              const found = intermediateEntries.find(([name]) => name === orderedStopName);
              if (found) {
                sortedIntermediateEntriesForCampus.push(found);
              }
            }
            // 명시적 순서에 없는 경유지는 컬럼 인덱스 기준으로 추가
            for (const entry of intermediateEntries) {
              if (!terminalRouteOrder.includes(entry[0])) {
                sortedIntermediateEntriesForCampus.push(entry);
              }
            }
            // 나머지는 컬럼 인덱스 기준으로 정렬
            sortedIntermediateEntriesForCampus.sort((a, b) => {
              const orderA = terminalRouteOrder.indexOf(a[0]);
              const orderB = terminalRouteOrder.indexOf(b[0]);
              if (orderA !== -1 && orderB !== -1) return orderA - orderB;
              if (orderA !== -1) return -1;
              if (orderB !== -1) return 1;
              return a[1] - b[1];
            });
            
            // 아산캠퍼스 → 천안 터미널 방향: 경유지 시간 계산
            // 출발 시간이 정상인 경우에도 경유지 시간을 제대로 파싱해야 함
            const campusViaStops = [];
            
            // baseTimeForNext를 아산캠퍼스 출발 시간으로 설정 (경유지 시간 계산용)
            if (actualDepartureTime && actualDepartureTime !== 'X') {
              baseTimeForNext = actualDepartureTime;
            } else if (baseTimeForViaStops) {
              baseTimeForNext = baseTimeForViaStops;
            }
            
            // sortedIntermediateEntriesForCampus는 이미 위에서 정의됨
            // baseTimeForNext가 설정된 경우, 경유지 시간을 다시 파싱
            let previousTimeRange = null;
            for (const [stopName, idx] of sortedIntermediateEntriesForCampus) {
              if (idx === undefined || idx >= cells.length) continue;
              const cell = cells.eq(idx);
              const rawValue = cell.text().trim();
              
              let timeValue = null;
              
              // "소요예상" 또는 "분~" 패턴이 있으면 parseDurationText 우선 사용
              if (rawValue && !/^[XΧ]+$/i.test(rawValue)) {
                const hasDurationPattern = rawValue.includes('소요예상') || rawValue.match(/\d+\s*분?\s*[~-]\s*\d+\s*분/);
                
                if (hasDurationPattern) {
                  let durationText = rawValue;
                  durationText = durationText.replace(/\d{1,2}[:;]\d{2}/g, '').replace(/\d{4}/g, '').trim();
                  
                  if (previousTimeRange) {
                    timeValue = parseDurationTextForNextViaStop(durationText, previousTimeRange);
                    if (timeValue) previousTimeRange = timeValue;
                  } else if (baseTimeForNext) {
                    timeValue = parseDurationText(durationText, baseTimeForNext);
                    if (timeValue) previousTimeRange = timeValue;
                  }
                }
              }
              
              // parseDurationText로 파싱되지 않았으면 extractTimeValue 시도
              if (!timeValue) {
                timeValue = extractTimeValue(rawValue);
                if (timeValue) {
                  previousTimeRange = timeValue;
                }
              }
              
              if (timeValue) {
                campusViaStops.push({
                  name: stopName,
                  time: timeValue,
                  source: 'table'
                });
              } else if (/^[XΧ]+$/i.test(rawValue)) {
                campusViaStops.push({
                  name: stopName,
                  time: 'X',
                  source: 'table'
                });
              }
            }
            
            // 도착시간 먼저 찾기 (아산캠퍼스 → 천안 터미널)
            let finalArrivalTime = arrivalTime;
            
            // 1. 터미널 컬럼 확인 (아산캠퍼스 출발 시 터미널 도착 시간)
            if (terminalColIdx !== undefined && terminalColIdx < cells.length) {
              const terminalCell = cells.eq(terminalColIdx);
              const terminalCellText = terminalCell.text().trim();
              
              // "X"로 표시된 경우 "X"로 저장
              if (/^[XΧ]+$/i.test(terminalCellText)) {
                finalArrivalTime = 'X';
              } else {
                // 시간이 있는 경우 파싱
                const terminalTime = extractTimeValue(terminalCellText);
                if (terminalTime) {
                  // 출발 시간이 "X"인 경우도 처리
                  if (actualDepartureTime === 'X') {
                    finalArrivalTime = terminalTime;
                  } else {
                    const depMinutes = parseInt(actualDepartureTime.split(':')[0]) * 60 + parseInt(actualDepartureTime.split(':')[1]);
                    const arrMinutes = parseInt(terminalTime.split(':')[0]) * 60 + parseInt(terminalTime.split(':')[1]);
                    // 같은 날 내에서 시간 비교 (자정 넘어가는 경우 고려)
                    if (arrMinutes >= depMinutes || arrMinutes < depMinutes - 720) {
                      finalArrivalTime = terminalTime;
                    } else {
                      // 출발 시간보다 이전이면 "X"로 저장
                      finalArrivalTime = 'X';
                    }
                  }
                } else {
                  // 시간을 파싱할 수 없으면 "X"로 저장
                  finalArrivalTime = 'X';
                }
              }
            }
            
            // 2. 천안 터미널_도착 컬럼 확인
            if (!finalArrivalTime && departureColIndices['천안 터미널_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['천안 터미널_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                const arrivalTime = extractTimeValue(arrivalCell.text());
                if (arrivalTime && !/^[XΧ]+$/i.test(arrivalCell.text().trim())) {
                  finalArrivalTime = arrivalTime;
                }
              }
            }
            
            // 3. columnMap.arrival 확인
            if (!finalArrivalTime && columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
              const arrivalCell = cells.eq(columnMap.arrival);
              const arrivalTime = extractTimeValue(arrivalCell.text());
              if (arrivalTime && !/^[XΧ]+$/i.test(arrivalCell.text().trim())) {
                finalArrivalTime = arrivalTime;
              }
            }
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '아산캠퍼스',
              arrival: '천안 터미널',
              departureTime: actualDepartureTime,
              arrivalTime: finalArrivalTime || 'X',
              fridayOperates,
              dayType,
              note: noteText || '',
              viaStops: campusViaStops,
              studentHallBoardingAvailable: hasHighlight(asanCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
            }
          }

          if (terminalColIdx !== undefined && terminalColIdx < cells.length) {
          const terminalCell = cells.eq(terminalColIdx);
          const terminalCellText = terminalCell.text().trim();
          const terminalIsX = /^[XΧ]+$/i.test(terminalCellText);
          // "X"인 경우에는 시간을 추출하지 않음
          const terminalTime = terminalIsX ? null : extractTimeValue(terminalCellText);
          
          // 천안 터미널 출발 시간이 있거나 "X"인 경우 처리
          // "X"인 경우에도 중간 경유지에 시간이 있거나 도착 시간이 있으면 스케줄 생성
          // 도착 시간 확인 (홈마트 에브리데이, 서울대정병원, 아산캠퍼스_도착 등)
          let hasArrivalTime = false;
          if (departureColIndices['홈마트 에브리데이'] !== undefined) {
            const homeMartIdx = departureColIndices['홈마트 에브리데이'];
            if (homeMartIdx < cells.length) {
              const homeMartCell = cells.eq(homeMartIdx);
              const homeMartTime = extractTimeValue(homeMartCell.text());
              if (homeMartTime) hasArrivalTime = true;
            }
          }
          if (!hasArrivalTime && departureColIndices['서울대정병원'] !== undefined) {
            const seoulHospitalIdx = departureColIndices['서울대정병원'];
            if (seoulHospitalIdx < cells.length) {
              const seoulHospitalCell = cells.eq(seoulHospitalIdx);
              const seoulHospitalTime = extractTimeValue(seoulHospitalCell.text());
              if (seoulHospitalTime) hasArrivalTime = true;
            }
          }
          if (!hasArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
            const campusArrivalIdx = departureColIndices['아산캠퍼스_도착'];
            if (campusArrivalIdx < cells.length) {
              const campusArrivalCell = cells.eq(campusArrivalIdx);
              const campusArrivalTime = extractTimeValue(campusArrivalCell.text());
              if (campusArrivalTime) hasArrivalTime = true;
            }
          }
          
          if (terminalTime || terminalIsX || (terminalIsX && hasArrivalTime)) {
            // 천안 터미널 출발이 "X"인 경우, "X"로 저장 (추정하지 않음)
            let actualDepartureTime = terminalTime || (terminalIsX ? 'X' : null);
            
            // baseTime을 설정 (천안 터미널 출발이 "X"인 경우 첫 번째 경유지 시간 사용)
            let baseTimeForTerminal = terminalTime;
            
            // 천안 터미널 출발이 "X"이고 중간 경유지에 시간이 있는 경우
            if (terminalIsX && !terminalTime && intermediateEntries.length > 0) {
              // 경유지 순서: 두정동 맥도날드가 첫 번째 경유지
              const sortedViaEntries = intermediateEntries.sort((a, b) => a[1] - b[1]);
              
              // 두정동 맥도날드가 첫 번째 경유지인지 확인
              const mcdonaldEntry = sortedViaEntries.find(([name]) => name === '두정동 맥도날드');
              if (mcdonaldEntry && mcdonaldEntry[1] < cells.length) {
                const mcdonaldCell = cells.eq(mcdonaldEntry[1]);
                const mcdonaldText = mcdonaldCell.text().trim();
                const mcdonaldTime = extractTimeValue(mcdonaldText);
                
                // 두정동 맥도날드 시간이 있으면 baseTime으로 사용
                if (mcdonaldTime) {
                  baseTimeForTerminal = mcdonaldTime;
                } else {
                  // 두정동 맥도날드 시간이 없으면 첫 번째 경유지 시간 사용
                  const firstViaEntry = sortedViaEntries[0];
                  if (firstViaEntry && firstViaEntry[1] < cells.length) {
                    const firstViaCell = cells.eq(firstViaEntry[1]);
                    const firstViaText = firstViaCell.text().trim();
                    const firstViaTime = extractTimeValue(firstViaText);
                    
                    if (firstViaTime) {
                      baseTimeForTerminal = firstViaTime;
                    }
                  }
                }
              } else {
                // 두정동 맥도날드가 없으면 첫 번째 경유지 시간 사용
                const firstViaEntry = sortedViaEntries[0];
                if (firstViaEntry && firstViaEntry[1] < cells.length) {
                  const firstViaCell = cells.eq(firstViaEntry[1]);
                  const firstViaText = firstViaCell.text().trim();
                  const firstViaTime = extractTimeValue(firstViaText);
                  
                  if (firstViaTime) {
                    baseTimeForTerminal = firstViaTime;
                  }
                }
              }
            }
            // 도착 시간 찾기 (천안 터미널 → 아산캠퍼스)
            let finalArrivalTime = null;
            
            // 천안 터미널 → 아산캠퍼스 방향 경유지 순서 정의 (명시적 순서)
            // 두정동 맥도날드가 첫 번째 경유지
            const terminalToCampusRouteOrder = ['두정동 맥도날드', '홈마트 에브리데이', '서울대정병원'];
            
            // 경유지를 명시적 순서대로 정렬
            const sortedIntermediateEntries = [];
            for (const orderedStopName of terminalToCampusRouteOrder) {
              const found = intermediateEntries.find(([name]) => name === orderedStopName);
              if (found) {
                sortedIntermediateEntries.push(found);
              }
            }
            // 명시적 순서에 없는 경유지는 컬럼 인덱스 기준으로 추가
            for (const entry of intermediateEntries) {
              if (!terminalToCampusRouteOrder.includes(entry[0])) {
                sortedIntermediateEntries.push(entry);
              }
            }
            
            // 천안 터미널 출발 시 경유지 시간 계산
            // 첫 번째 경유지: baseTime + 5분 ~ baseTime + 20분
            // 두 번째 경유지: (첫 번째 최소 시간) + 5분 ~ (첫 번째 최대 시간) + 20분
            const terminalViaStops = [];
            let previousTimeRange = null; // 이전 경유지의 시간 범위 저장
            
            for (const [stopName, idx] of sortedIntermediateEntries) {
              if (idx === undefined || idx >= cells.length) continue;
              const cell = cells.eq(idx);
              const rawValue = cell.text().trim();
              
              // "5분~20분 소요예상" 같은 텍스트가 있으면 우선적으로 파싱
              let timeValue = null;
              
              // 첫 번째 경유지(두정동 맥도날드)이고 출발시간이 "X"인 경우, 실제 시간을 먼저 추출
              if (!previousTimeRange && stopName === '두정동 맥도날드' && terminalIsX && !terminalTime && rawValue && !/^[XΧ]+$/i.test(rawValue)) {
                // 먼저 실제 시간이 있는지 확인 (예: "08:55")
                const directTime = extractTimeValue(rawValue);
                if (directTime) {
                  // 실제 시간이 있으면 그대로 사용
                  timeValue = directTime;
                  // 단일 시간이므로 범위 형식으로 변환하지 않음
                }
              }
              
              // "소요예상" 또는 "분~" 패턴이 있으면 무조건 범위 형식으로 파싱 (단일 시간 추출 전에 체크)
              if (!timeValue && rawValue && !/^[XΧ]+$/i.test(rawValue)) {
                const hasDurationPattern = rawValue.includes('소요예상') || rawValue.match(/\d+\s*분?\s*[~-]\s*\d+\s*분/);
                
                if (hasDurationPattern) {
                  // rawValue에서 시간 부분을 제거하고 "5분~20분 소요예상" 부분만 추출
                  let durationText = rawValue;
                  durationText = durationText.replace(/\d{1,2}[:;]\d{2}/g, '').replace(/\d{4}/g, '').trim();
                  
                  // "5분~20분 소요예상" 패턴 찾기
                  const durationMatch = durationText.match(/(\d+)\s*분?\s*[~-]\s*(\d+)\s*분/);
                  if (durationMatch) {
                    if (previousTimeRange) {
                      // 이전 경유지가 있으면 이전 경유지 시간 범위 기준으로 계산
                      const parsedTime = parseDurationTextForNextViaStop(durationText, previousTimeRange);
                      if (parsedTime) {
                        timeValue = parsedTime;
                        previousTimeRange = parsedTime;
                      }
                    } else {
                      // 첫 번째 경유지는 baseTime 기준으로 계산
                      const baseTime = baseTimeForTerminal || terminalTime;
                      if (baseTime) {
                        const parsedTime = parseDurationText(durationText, baseTime);
                        if (parsedTime) {
                          timeValue = parsedTime;
                          previousTimeRange = parsedTime;
                        }
                      }
                    }
                  }
                }
              }
              
              // 첫 번째 경유지(두정동 맥도날드)이고 "소요예상" 패턴이 없으면 기본 "5분~20분 소요예상" 가정
              if (!timeValue && !previousTimeRange && stopName === '두정동 맥도날드' && rawValue && !/^[XΧ]+$/i.test(rawValue)) {
                // 두정동 맥도날드는 첫 번째 경유지이므로 기본 "5분~20분 소요예상" 적용
                const baseTime = baseTimeForTerminal || terminalTime;
                if (baseTime) {
                  const parsedTime = parseDurationText('5분~20분 소요예상', baseTime);
                  if (parsedTime) {
                    timeValue = parsedTime;
                    previousTimeRange = parsedTime;
                  }
                }
              }
              
              // parseDurationText로 파싱되지 않았고, "소요예상"이 없으면 extractTimeValue 시도
              // 단, "소요예상"이 있으면 절대 extractTimeValue를 사용하지 않음
              if (!timeValue && rawValue && !/^[XΧ]+$/i.test(rawValue) && !rawValue.includes('소요예상') && !rawValue.match(/\d+\s*분?\s*[~-]\s*\d+\s*분/)) {
                timeValue = extractTimeValue(rawValue);
                // 단일 시간이 추출되었지만, 다음 경유지 계산에는 사용할 수 없음 (범위 형식이 아니므로)
              }
              
              if (timeValue) {
                terminalViaStops.push({
                  name: stopName,
                  time: timeValue,
                  source: 'table'
                });
              } else {
                // timeValue가 없으면 이전 경유지 시간 범위를 기준으로 계산 시도
                if (previousTimeRange) {
                  // 이전 경유지 시간 범위 기준으로 "5분~20분 소요예상" 계산
                  const estimatedTime = parseDurationTextForNextViaStop('5분~20분 소요예상', previousTimeRange);
                  if (estimatedTime) {
                    terminalViaStops.push({
                      name: stopName,
                      time: estimatedTime,
                      source: 'table'
                    });
                    previousTimeRange = estimatedTime;
                  } else {
                    // 계산 실패 시 "X"로 저장
                    terminalViaStops.push({
                      name: stopName,
                      time: 'X',
                      rawText: rawValue || null,
                      source: 'table'
                    });
                  }
                } else {
                  // 이전 경유지 시간 범위가 없으면 "X"로 저장
                  terminalViaStops.push({
                    name: stopName,
                    time: 'X',
                    rawText: rawValue || null,
                    source: 'table'
                  });
                }
              }
            }
            
            // note에서 추출한 경유지도 추가 (시간 매핑)
            viaStopsFromNote.forEach(viaStop => {
              const viaColIdx = departureColIndices[viaStop.name];
              if (viaColIdx !== undefined && viaColIdx < cells.length) {
                const viaCell = cells.eq(viaColIdx);
                const rawValue = viaCell.text().trim();
                
                // "소요예상" 또는 "분~" 패턴이 있으면 무조건 범위 형식으로 파싱
                if (rawValue && !/^[XΧ]+$/i.test(rawValue) && (rawValue.includes('소요예상') || rawValue.match(/\d+\s*분?\s*[~-]\s*\d+\s*분/))) {
                  let durationText = rawValue;
                  durationText = durationText.replace(/\d{1,2}[:;]\d{2}/g, '').replace(/\d{4}/g, '').trim();
                  
                  const durationMatch = durationText.match(/(\d+)\s*분?\s*[~-]\s*(\d+)\s*분/);
                  if (durationMatch) {
                    if (previousTimeRange) {
                      const parsedTime = parseDurationTextForNextViaStop(durationText, previousTimeRange);
                      if (parsedTime) {
                        viaStop.time = parsedTime;
                        previousTimeRange = parsedTime;
                      }
                    } else {
                      const parsedTime = parseDurationText(durationText, terminalTime);
                      if (parsedTime) {
                        viaStop.time = parsedTime;
                        previousTimeRange = parsedTime;
                      }
                    }
                  }
                } else {
                  // "소요예상"이 없으면 extractTimeValue 시도
                  const viaTime = extractTimeValue(rawValue);
                  if (viaTime) {
                    viaStop.time = viaTime;
                  }
                }
              }
              // 중복 체크 후 추가
              if (!terminalViaStops.find(v => v.name === viaStop.name)) {
                terminalViaStops.push(viaStop);
              }
            });
            
            // viaStopsFromNote에서 추가한 경유지도 포함하여 다시 정렬
            // 경유지를 시간 순서대로 정렬하는 함수
            const parseTimeForSort = (timeStr) => {
              if (!timeStr || timeStr === 'X') return Infinity; // X는 가장 뒤로
              if (timeStr.includes('~')) {
                // 범위 형식: "08:15~08:30" -> 첫 번째 시간 사용
                const firstTime = timeStr.split('~')[0].trim();
                const [hour, min] = firstTime.split(':').map(Number);
                return hour * 60 + min;
              } else {
                // 단일 시간: "08:50"
                const [hour, min] = timeStr.split(':').map(Number);
                return hour * 60 + min;
              }
            };
            
            // 경유지를 명시적 순서대로 정렬 (명시적 순서가 항상 우선)
            terminalViaStops.sort((a, b) => {
              // 명시적 순서가 있으면 우선 적용
              const orderA = terminalToCampusRouteOrder.indexOf(a.name);
              const orderB = terminalToCampusRouteOrder.indexOf(b.name);
              
              // 둘 다 명시적 순서에 있으면 명시적 순서대로
              if (orderA !== -1 && orderB !== -1) {
                return orderA - orderB;
              }
              
              // 하나만 명시적 순서에 있으면 그게 먼저
              if (orderA !== -1) return -1;
              if (orderB !== -1) return 1;
              
              // 둘 다 명시적 순서에 없으면 시간 순서로 정렬
              const timeA = parseTimeForSort(a.time);
              const timeB = parseTimeForSort(b.time);
              if (timeA !== timeB) {
                return timeA - timeB;
              }
              
              // 시간이 같으면 컬럼 인덱스로 정렬
              const idxA = departureColIndices[a.name];
              const idxB = departureColIndices[b.name];
              if (idxA === undefined && idxB === undefined) return 0;
              if (idxA === undefined) return 1;
              if (idxB === undefined) return -1;
              return idxA - idxB;
            });
            
            // 홈마트 에브리데이 컬럼 확인 (도착시간이 없을 경우 홈마트 에브리데이 시간을 도착시간으로 사용)
            if (!finalArrivalTime && departureColIndices['홈마트 에브리데이'] !== undefined) {
              const homeMartIdx = departureColIndices['홈마트 에브리데이'];
              if (homeMartIdx < cells.length) {
                const homeMartCell = cells.eq(homeMartIdx);
                const homeMartTime = extractTimeValue(homeMartCell.text());
                if (homeMartTime) {
                  finalArrivalTime = homeMartTime;
                }
              }
            }
            // 서울대정병원 컬럼 확인 (도착시간이 없을 경우 서울대정병원 시간을 도착시간으로 사용)
            if (!finalArrivalTime && departureColIndices['서울대정병원'] !== undefined) {
              const seoulHospitalIdx = departureColIndices['서울대정병원'];
              if (seoulHospitalIdx < cells.length) {
                const seoulHospitalCell = cells.eq(seoulHospitalIdx);
                const seoulHospitalTime = extractTimeValue(seoulHospitalCell.text());
                if (seoulHospitalTime) {
                  finalArrivalTime = seoulHospitalTime;
                }
              }
            }
            // 2. "아산캠퍼스_도착" 컬럼 확인
            if (!finalArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['아산캠퍼스_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }
            // 3. columnMap.arrival 확인 (다른 페이지용)
            if (!finalArrivalTime && columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
              const arrivalCell = cells.eq(columnMap.arrival);
              finalArrivalTime = extractTimeValue(arrivalCell.text());
            }
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '천안 터미널',
              arrival: '아산캠퍼스',
              departureTime: actualDepartureTime,
              arrivalTime: finalArrivalTime || 'X',
              fridayOperates,
              dayType,
              note: noteText || '',
              viaStops: terminalViaStops,
              studentHallBoardingAvailable: hasHighlight(terminalCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
            }
          }
        }

        return;
      }
      
      // 처리할 출발지가 없으면 다음 테이블로
      if (departureKeysToProcess.length === 0) {
        return; // 다음 테이블로
      }
      
      // 각 출발지별로 데이터 행 파싱
      for (const departureKey of departureKeysToProcess) {
        // 도착 컬럼은 건너뜀
        if (isArrivalColumn(departureKey)) {
          continue;
        }
        
        const currentDepartureColIdx = departureColIndices[departureKey];
        const currentNormalizedDeparture = normalizeDeparture(departureKey);
        
        // 디버깅: 찾은 컬럼 인덱스 확인
        if (process.env.DEBUG_CRAWLER) {
          console.log(`[${departureKey}] 처리 시작, 컬럼 인덱스: ${currentDepartureColIdx}`);
        }
        
        // 현재 출발지의 도착지 결정
        let currentDefaultArrival = '아산캠퍼스';
        if (currentNormalizedDeparture === '아산캠퍼스') {
          currentDefaultArrival = defaultArrival; // 페이지에서 찾은 도착지
        } else {
          currentDefaultArrival = '아산캠퍼스'; // 천안 아산역 등에서 출발하면 도착지는 아산캠퍼스
        }
        
        // 데이터 행 파싱
        for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th');
        
        if (cells.length === 0) continue;
        
        // 첫 번째 셀이 순번인지 확인
        const firstCell = $(cells[0]).text().trim();
        if (!/^\d+$/.test(firstCell)) {
          continue;
        }
        
        // 행 전체 텍스트
        const rowText = $row.text();
        
        // 특이사항 추출
        let note = '';
        let fridayOperates = true;
        
        if (columnMap.note !== undefined) {
          note = $(cells[columnMap.note]).text().trim();
        } else {
          // 특이사항 컬럼이 없으면 행 전체에서 찾기
          cells.each((cellIdx, cell) => {
            const cellText = $(cell).text().trim();
            if (cellText.includes('금(X)') || cellText.includes('시간변경') || 
                cellText.includes('경유') || cellText.includes('운행') ||
                cellText.includes('하교시') || cellText.includes('탕정역')) {
              if (note.length === 0) {
                note = cellText;
              } else {
                note += ', ' + cellText;
              }
            }
          });
        }
        
        // 행 전체에서 특이사항 확인
        if (rowText.includes('금(X)') || rowText.includes('금요일')) {
          note = rowText.includes('금(X)') ? '금(X)' : '금요일 미운행';
          fridayOperates = false;
        } else if (note.includes('금(X)')) {
          fridayOperates = false;
        }
        
        // 해당 출발지 컬럼에서만 시간 추출
        if (currentDepartureColIdx >= cells.length || currentDepartureColIdx < 0) {
          continue;
        }
        
        // 컬럼 인덱스로 셀 가져오기
        const departureCell = cells.eq(currentDepartureColIdx);
        if (!departureCell || departureCell.length === 0) {
          if (process.env.DEBUG_CRAWLER) {
            console.log(`[${normalizedDeparture}] 행 ${i}: 셀을 찾을 수 없음 (컬럼 인덱스: ${currentDepartureColIdx}, cells.length: ${cells.length})`);
          }
          continue;
        }
        
        const departureCellText = departureCell.text().trim();
        
        if (process.env.DEBUG_CRAWLER && i < headerRowIdx + 5) {
          console.log(`[${normalizedDeparture}] 행 ${i}: 컬럼 ${currentDepartureColIdx} = '${departureCellText}'`);
        }
        
        // X만 있는 경우 (시간 없음) - 저장하지 않음
        const isOnlyX = departureCellText === 'X' || departureCellText === 'Χ' || 
                        departureCellText.trim() === 'X' || departureCellText.trim() === 'Χ' ||
                        /^[XΧ\s\u00A0]+$/.test(departureCellText);
        
        if (isOnlyX) {
          continue; // 해당 출발지에서 운행하지 않음
        }
        
        // 출발 시간 추출
        const departureTimeMatch = departureCellText.match(/(\d{1,2})[:;](\d{2})/);
        
        // 시간이 없는 경우 저장하지 않음
        if (!departureTimeMatch) {
          continue;
        }
        
        // 시간 형식 정규화: HH:MM 형식으로 통일 (시는 2자리, 분은 2자리)
        // 예: "8:10" -> "08:10", "19;45" -> "19:45"
        const hour = departureTimeMatch[1].padStart(2, '0');
        const minute = departureTimeMatch[2];
        const departureTime = `${hour}:${minute}`;
        
        // X가 포함되어 있는지 확인
        const hasX = departureCellText.includes('X') || departureCellText.includes('Χ');
        
        // 금(X)인 경우는 금요일만 운행 안 하므로 저장
        if (hasX && !(note.includes('금(X)') || rowText.includes('금(X)'))) {
          continue; // X가 있지만 금(X)가 아닌 경우 저장하지 않음
        }
        
        // 금요일 운행 여부 확인
        if (hasX && (note.includes('금(X)') || rowText.includes('금(X)'))) {
          fridayOperates = false;
        }
        
        // 최종 출발지와 도착지 결정
        // tableArrivalStop이 출발지와 같으면 (아산캠퍼스 -> 아산캠퍼스) defaultArrival 사용
        let finalDeparture = currentNormalizedDeparture;
        let finalArrival;
        
        // 도착지 결정: tableArrivalStop이 출발지와 같으면 currentDefaultArrival 사용
        if (tableArrivalStop && tableArrivalStop !== currentNormalizedDeparture) {
          finalArrival = normalizeArrival(tableArrivalStop);
        } else {
          finalArrival = normalizeArrival(currentDefaultArrival);
        }
        
        // 디버깅: 저장 전 확인
        if (process.env.DEBUG_CRAWLER && schedules.length < 5) {
          console.log(`[${departureKey}] 저장 예정: ${finalDeparture} -> ${finalArrival}, 시간: ${departureTime}`);
        }
        
        // 아산캠퍼스 -> 아산캠퍼스는 저장하지 않음
        if (finalDeparture === '아산캠퍼스' && finalArrival === '아산캠퍼스') {
          if (process.env.DEBUG_CRAWLER) {
            console.log(`[${departureKey}] 아산캠퍼스 -> 아산캠퍼스는 저장하지 않음`);
          }
          continue;
        }
        
        // 도착지가 없으면 저장하지 않음
        if (!finalArrival) {
          if (process.env.DEBUG_CRAWLER) {
            console.log(`[${departureKey}] 도착지가 없어서 저장하지 않음`);
          }
          continue;
        }
        
        if (finalDeparture !== finalArrival) {
          // 도착시간 찾기
          let finalArrivalTime = null;
          
          // 1. columnMap.arrival이 있으면 사용
          if (columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
            const arrivalCell = cells.eq(columnMap.arrival);
            finalArrivalTime = extractTimeValue(arrivalCell.text());
          }
          
          // 2. 아산캠퍼스 → 천안 아산역 방향: 천안 아산역 출발 컬럼의 시간이 도착 시간
          // 예: 아산캠퍼스 8:10 출발 → 천안아산역 8:25 도착 (천안아산역 출발 컬럼의 시간)
          if (!finalArrivalTime && finalDeparture === '아산캠퍼스' && finalArrival === '천안 아산역') {
            const stationColIdx = departureColIndices['천안 아산역'];
            if (stationColIdx !== undefined && stationColIdx < cells.length) {
              const stationCell = cells.eq(stationColIdx);
              const stationTime = extractTimeValue(stationCell.text());
              // 천안아산역 출발 시간이 있고, 출발 시간보다 늦으면 도착 시간으로 사용
              if (stationTime) {
                const depMinutes = parseInt(departureTime.split(':')[0]) * 60 + parseInt(departureTime.split(':')[1]);
                const arrMinutes = parseInt(stationTime.split(':')[0]) * 60 + parseInt(stationTime.split(':')[1]);
                if (arrMinutes > depMinutes) {
                  finalArrivalTime = stationTime;
                }
              }
            }
          }
          
          // 3. 아산캠퍼스 → 천안역 방향: 천안역 출발 컬럼의 시간이 도착 시간
          if (!finalArrivalTime && finalDeparture === '아산캠퍼스' && finalArrival === '천안역') {
            const cheonanColIdx = departureColIndices['천안역'];
            if (cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
              const cheonanCell = cells.eq(cheonanColIdx);
              finalArrivalTime = extractTimeValue(cheonanCell.text());
            }
          }
          
          // 4. 아산캠퍼스 → 천안 터미널 방향: 천안 터미널 출발 컬럼의 시간이 도착 시간
          if (!finalArrivalTime && finalDeparture === '아산캠퍼스' && finalArrival === '천안 터미널') {
            const terminalColIdx = departureColIndices['천안 터미널'];
            if (terminalColIdx !== undefined && terminalColIdx < cells.length) {
              const terminalCell = cells.eq(terminalColIdx);
              finalArrivalTime = extractTimeValue(terminalCell.text());
            }
          }
          
          // 5. 역방향: 천안 아산역 → 아산캠퍼스: 아산캠퍼스 도착 컬럼 확인
          if (!finalArrivalTime && finalDeparture === '천안 아산역' && finalArrival === '아산캠퍼스') {
            const campusArrivalColIdx = departureColIndices['아산캠퍼스_도착'];
            if (campusArrivalColIdx !== undefined && campusArrivalColIdx < cells.length) {
              const arrivalCell = cells.eq(campusArrivalColIdx);
              finalArrivalTime = extractTimeValue(arrivalCell.text());
            }
          }
          
          // 6. 역방향: 천안역 → 아산캠퍼스: 아산캠퍼스 도착 컬럼 확인
          if (!finalArrivalTime && finalDeparture === '천안역' && finalArrival === '아산캠퍼스') {
            const campusArrivalColIdx = departureColIndices['아산캠퍼스_도착'];
            if (campusArrivalColIdx !== undefined && campusArrivalColIdx < cells.length) {
              const arrivalCell = cells.eq(campusArrivalColIdx);
              finalArrivalTime = extractTimeValue(arrivalCell.text());
            }
          }
          
          // 7. 역방향: 천안 터미널 → 아산캠퍼스: 아산캠퍼스 도착 컬럼 확인
          if (!finalArrivalTime && finalDeparture === '천안 터미널' && finalArrival === '아산캠퍼스') {
            const campusArrivalColIdx = departureColIndices['아산캠퍼스_도착'];
            if (campusArrivalColIdx !== undefined && campusArrivalColIdx < cells.length) {
              const arrivalCell = cells.eq(campusArrivalColIdx);
              finalArrivalTime = extractTimeValue(arrivalCell.text());
            }
          }
          
          // 도착시간이 없으면 X로 저장
          schedules.push({
            departure: finalDeparture,
            arrival: finalArrival,
            departureTime: departureTime,
            arrivalTime: finalArrivalTime || 'X',
            fridayOperates: fridayOperates,
            dayType: dayType,
            note: note || '',
            viaStops: [],
            studentHallBoardingAvailable: false,
            sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
          });
          
          if (process.env.DEBUG_CRAWLER && schedules.length <= 5) {
            console.log(`[${departureKey}] 저장됨: ${schedules.length}번째`);
          }
        }
        } // for (let i = headerRowIdx + 1; i < rows.length; i++)
      } // for (const departureKey of departureKeysToProcess)
    }
  });
  
  return schedules;
}

// 단일 URL 크롤링
async function crawlSingleUrl(dayType, departure, url) {
  const startTime = Date.now();
  const MAX_TIME = 20000;
  
  try {
    console.log(`[crawlSingleUrl] 시작: ${dayType} - ${departure} - ${url}`);
    
    // HTML 가져오기
    const html = await Promise.race([
      fetchHtml(url),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`타임아웃: ${departure}`)), MAX_TIME)
      )
    ]);
    
    if (!html) {
      console.log(`[crawlSingleUrl] HTML이 null입니다: ${departure}`);
      return [];
    }
    
    console.log(`[crawlSingleUrl] HTML 가져오기 완료: ${html.length}자`);
    
    // 타임아웃 체크
    if (Date.now() - startTime > MAX_TIME) {
      console.log(`[crawlSingleUrl] 타임아웃: ${departure}`);
      return [];
    }
    
    const schedules = parseScheduleTable(html, dayType, departure);
    
    console.log(`[crawlSingleUrl] 파싱 완료: ${schedules.length}개 시간표`);
    
    return schedules;
  } catch (error) {
    console.error(`[crawlSingleUrl] 에러: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    // 타임아웃이면 빈 배열 반환
    return [];
  }
}

// 모든 시간표 크롤링 (병렬 처리로 빠른 크롤링, 강제 타임아웃)
async function crawlAllSchedules(maxTime = 90000) {
  console.log('=== 셔틀버스 시간표 전체 크롤링 시작 ===');
  
  const startTime = Date.now();
  
  // 강제 타임아웃: 절대 maxTime을 넘지 않도록
  const forceTimeout = new Promise((_, reject) => {
    setTimeout(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      reject(new Error(`강제 타임아웃: ${elapsed}초 경과 (${maxTime/1000}초 초과)`));
    }, maxTime);
  });
  
  // 모든 URL을 배열로 수집
  const allUrls = [];
  for (const [dayType, urls] of Object.entries(CRAWL_URLS)) {
    for (const [departure, url] of Object.entries(urls)) {
      allUrls.push({ dayType, departure, url });
    }
  }
  
  const totalPages = allUrls.length;
  console.log(`총 ${totalPages}개 페이지 크롤링 예정 (병렬 처리, 최대 ${maxTime/1000}초)`);
  
  // 병렬 처리: 5개씩 동시에 크롤링
  const CONCURRENT_LIMIT = 5;
  const allSchedules = [];
  let completedCount = 0;
  
  try {
    for (let i = 0; i < allUrls.length; i += CONCURRENT_LIMIT) {
      // 타임아웃 체크
      const elapsed = Date.now() - startTime;
      if (elapsed > maxTime) {
        console.warn(`\n⚠️ 크롤링 타임아웃 (${(elapsed/1000).toFixed(1)}초 경과, ${completedCount}/${totalPages} 페이지 완료), 즉시 중단합니다.`);
        throw new Error(`크롤링 타임아웃: ${(elapsed/1000).toFixed(1)}초 경과`);
      }
      
      // 현재 배치
      const batch = allUrls.slice(i, i + CONCURRENT_LIMIT);
      const batchNum = Math.floor(i/CONCURRENT_LIMIT) + 1;
      console.log(`배치 ${batchNum} 시작: ${batch.map(b => b.departure).join(', ')}`);
      
      // 배치 타임아웃
      const batchStartTime = Date.now();
      const remainingTime = maxTime - (batchStartTime - startTime);
      
      // 남은 시간이 없으면 중단
      if (remainingTime <= 0) {
        console.warn(`\n⚠️ 크롤링 타임아웃 (남은 시간 없음), 즉시 중단합니다.`);
        throw new Error(`크롤링 타임아웃: 남은 시간 없음`);
      }
      
      // 병렬 크롤링
      const batchPromises = batch.map(async ({ dayType, departure, url }) => {
        try {
          const schedules = await Promise.race([
            crawlSingleUrl(dayType, departure, url),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('URL 타임아웃')), 20000)
            ),
            forceTimeout
          ]);
          completedCount++;
          console.log(`${completedCount}/${totalPages}: ${dayType} - ${departure} (${schedules.length}개)`);
          return schedules;
        } catch (error) {
          completedCount++;
          console.log(`${completedCount}/${totalPages}: ${dayType} - ${departure} (실패)`);
          return [];
        }
      });
      
      // 배치 완료 대기
      const batchResults = await Promise.race([
        Promise.all(batchPromises),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('배치 타임아웃')), Math.min(remainingTime, 30000))
        ),
        forceTimeout
      ]);
      
      batchResults.forEach(schedules => {
        allSchedules.push(...schedules);
      });
      
      // 타임아웃 체크
      const elapsedAfterBatch = Date.now() - startTime;
      if (elapsedAfterBatch > maxTime) {
        console.warn(`\n⚠️ 크롤링 타임아웃 (${(elapsedAfterBatch/1000).toFixed(1)}초 경과), 즉시 중단합니다.`);
        throw new Error(`크롤링 타임아웃: ${(elapsedAfterBatch/1000).toFixed(1)}초 경과`);
      }
    }
  } catch (error) {
    // 타임아웃이면 중단
    if (error.message.includes('타임아웃')) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.warn(`\n⚠️ 크롤링 중단 (${elapsed}초 경과, ${completedCount}/${totalPages} 페이지 완료)`);
      throw error;
    }
    throw error;
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== 크롤링 완료: 총 ${allSchedules.length}개 시간표 발견 (소요시간: ${elapsed}초) ===`);
  
  return allSchedules;
}

// DB 시간표 저장 (타임아웃 적용)
async function saveSchedulesToDB(schedules, maxTime = 30000) {
  // 권곡초 버스정류장을 도착지로 가진 스케줄 필터링
  const filteredSchedules = schedules.filter(schedule => {
    if (schedule.arrival === '권곡초 버스정류장' || (schedule.arrival && schedule.arrival.includes('권곡'))) {
      return false;
    }
    return true;
  });
  
  // 메모리에서 중복 제거 (departure, arrival, departureTime, arrivalTime, dayType 기준)
  const uniqueSchedules = [];
  const seenKeys = new Set();
  for (const schedule of filteredSchedules) {
    const key = `${schedule.departure}|${schedule.arrival}|${schedule.departureTime}|${schedule.arrivalTime}|${schedule.dayType}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSchedules.push(schedule);
    }
  }
  
  console.log(`\nDB 저장 시작: ${uniqueSchedules.length}개 시간표 (${schedules.length - filteredSchedules.length}개 필터링됨: 권곡초 도착지 제외, ${filteredSchedules.length - uniqueSchedules.length}개 중복 제거)...`);
  
  // 기존 DB에서 권곡초 도착지 스케줄 삭제
  try {
    const deletedCount = await ShuttleBus.deleteMany({
      arrival: { $in: ['권곡초 버스정류장', /권곡/] }
    });
    if (deletedCount > 0) {
      console.log(`기존 권곡초 도착지 스케줄 ${deletedCount}개 삭제됨`);
    }
  } catch (error) {
    console.warn('권곡초 도착지 스케줄 삭제 중 오류:', error.message);
  }
  
  const startTime = Date.now();
  let savedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  // 강제 타임아웃
  const forceTimeout = new Promise((_, reject) => {
    setTimeout(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      reject(new Error(`DB 저장 강제 타임아웃: ${elapsed}초 경과`));
    }, maxTime);
  });
  
  // 배치 저장
  const BATCH_SIZE = 100; // 배치 크기 증가로 속도 향상
  try {
    for (let i = 0; i < schedules.length; i += BATCH_SIZE) {
      // 타임아웃 체크
      const elapsed = Date.now() - startTime;
      if (elapsed > maxTime) {
        console.warn(`\n⚠️ DB 저장 타임아웃 (${(elapsed/1000).toFixed(1)}초 경과), 중단합니다.`);
        break;
      }
      
      const batch = uniqueSchedules.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (schedule) => {
        try {
          // 먼저 정확히 일치하는 레코드 찾기 (arrivalTime도 포함)
          let existing = await ShuttleBus.findOne({
            departure: schedule.departure,
            arrival: schedule.arrival,
            departureTime: schedule.departureTime,
            arrivalTime: schedule.arrivalTime,
            dayType: schedule.dayType
          });
          
          // 정확히 일치하는 레코드가 없으면, 출발지/출발시간/요일이 같고 같은 sourceUrl인 잘못된 레코드 찾기
          // (예: "천안 아산역" → "천안역"으로 수정된 경우)
          if (!existing && schedule.sourceUrl) {
            existing = await ShuttleBus.findOne({
              departure: schedule.departure,
              departureTime: schedule.departureTime,
              dayType: schedule.dayType,
              sourceUrl: schedule.sourceUrl,
              arrival: { $ne: schedule.arrival } // arrival이 다른 것
            });
            
            // 잘못된 레코드를 찾았으면 삭제하고 새로 생성
            if (existing) {
              await ShuttleBus.deleteOne({ _id: existing._id });
              existing = null; // 새로 생성하도록
            }
          }
          
          if (existing) {
            await ShuttleBus.findOneAndUpdate(
              {
                departure: schedule.departure,
                arrival: schedule.arrival,
                departureTime: schedule.departureTime,
                arrivalTime: schedule.arrivalTime,
                dayType: schedule.dayType
              },
              {
                ...schedule,
                crawledAt: new Date(),
                updatedAt: new Date()
              }
            );
            updatedCount++;
          } else {
            await ShuttleBus.create({
              ...schedule,
              crawledAt: new Date()
            });
            savedCount++;
          }
        } catch (error) {
          failedCount++;
        }
      });
      
      await Promise.race([
        Promise.all(promises),
        forceTimeout
      ]);
    }
  } catch (error) {
    if (error.message.includes('타임아웃')) {
      console.warn(`DB 저장 타임아웃 발생, 부분 저장됨`);
    } else {
      throw error;
    }
  }
  
  console.log(`DB 저장 완료: 신규 ${savedCount}개, 업데이트 ${updatedCount}개, 건너뜀 ${skippedCount}개, 실패 ${failedCount}개`);
  
  return {
    saved: savedCount,
    updated: updatedCount,
    skipped: skippedCount,
    failed: failedCount,
    total: schedules.length
  };
}

async function saveRoutePaths(schedules) {
  const { checkAndUpdateRoutes } = require('./shuttleRoutePathService');
  
  try {
    console.log('\n경로 좌표 계산 및 저장 시작...');
    
    // 권곡초 버스정류장을 도착지로 가진 스케줄 필터링
    const filteredSchedules = schedules.filter(schedule => {
      if (schedule.arrival === '권곡초 버스정류장' || (schedule.arrival && schedule.arrival.includes('권곡'))) {
        return false;
      }
      return true;
    });
    
    const routeMap = new Map();
    
    for (const schedule of filteredSchedules) {
      const departure = schedule.departure;
      const arrival = schedule.arrival;
      const viaStops = schedule.viaStops || [];
      
      if (departure === '아산캠퍼스') {
        const direction = '하교';
        const dayType = schedule.dayType;
        const routeKey = `${departure}-${arrival}-${direction}-${dayType}`;
        
        if (!routeMap.has(routeKey)) {
          routeMap.set(routeKey, {
            departure,
            arrival,
            direction,
            dayType,
            viaStops
          });
        }
      } else {
        const direction = '등교';
        const dayType = schedule.dayType;
        const routeKey = `${departure}-${arrival}-${direction}-${dayType}`;
        
        if (!routeMap.has(routeKey)) {
          routeMap.set(routeKey, {
            departure,
            arrival,
            direction,
            dayType,
            viaStops
          });
        }
      }
    }
    
    let savedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    
    for (const route of routeMap.values()) {
      try {
        const result = await checkAndUpdateRoutes(
          route.departure,
          route.arrival,
          route.direction,
          route.dayType,
          route.viaStops
        );
        
        if (result.success) {
          if (result.isNew) {
            savedCount++;
          } else {
            updatedCount++;
          }
        } else {
          console.error(`경로 저장 실패: ${route.departure} -> ${route.arrival}`, result.error);
          failedCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`경로 저장 오류: ${route.departure} -> ${route.arrival}`, error.message);
        failedCount++;
      }
    }
    
    console.log(`경로 좌표 저장 완료: 신규 ${savedCount}개, 업데이트 ${updatedCount}개, 실패 ${failedCount}개`);
    
    return {
      saved: savedCount,
      updated: updatedCount,
      failed: failedCount,
      total: routeMap.size
    };
  } catch (error) {
    console.error('경로 좌표 저장 실패:', error);
    return {
      saved: 0,
      updated: 0,
      failed: 0,
      total: 0,
      error: error.message
    };
  }
}

async function crawlAndSaveAll() {
  const TOTAL_TIMEOUT = 100000; // 전체 최대 100초
  const startTime = Date.now();
  
  // 강제 타임아웃: 절대 100초를 넘지 않도록
  const forceTimeout = new Promise((_, reject) => {
    setTimeout(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      reject(new Error(`강제 타임아웃: ${elapsed}초 경과 (${TOTAL_TIMEOUT/1000}초 초과)`));
    }, TOTAL_TIMEOUT);
  });
  
  try {
    // 크롤링에 타임아웃 적용 (최대 90초)
    const CRAWL_TIMEOUT = 90000;
    const crawlStart = Date.now();
    console.log(`[타임 측정] 크롤링 시작 (최대 ${CRAWL_TIMEOUT/1000}초)...`);
    
    const schedules = await Promise.race([
      crawlAllSchedules(CRAWL_TIMEOUT),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('크롤링 타임아웃 (90초 초과)')), CRAWL_TIMEOUT)
      ),
      forceTimeout
    ]);
    
    const crawlElapsed = ((Date.now() - crawlStart) / 1000).toFixed(1);
    console.log(`[타임 측정] 크롤링 완료 (${crawlElapsed}초, ${schedules.length}개 발견)`);
    
    // 남은 시간 체크
    const elapsed = Date.now() - startTime;
    const remainingTime = TOTAL_TIMEOUT - elapsed;
    
    if (remainingTime < 2000) {
      console.warn(`⚠️ 시간 부족 (${(elapsed/1000).toFixed(1)}초 경과), DB 저장 건너뜀`);
      return {
        success: false,
        error: '타임아웃으로 인해 DB 저장을 건너뜀',
        schedulesFound: schedules.length
      };
    }
    
    // DB 저장에 타임아웃 적용 (남은 시간 사용)
    const dbSaveStart = Date.now();
    console.log(`[타임 측정] DB 저장 시작 (남은 시간: ${(remainingTime/1000).toFixed(1)}초)...`);
    
    const result = await Promise.race([
      saveSchedulesToDB(schedules, remainingTime),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('DB 저장 타임아웃')), remainingTime)
      ),
      forceTimeout
    ]);
    
    const dbSaveElapsed = ((Date.now() - dbSaveStart) / 1000).toFixed(1);
    console.log(`[타임 측정] DB 저장 완료 (${dbSaveElapsed}초)`);
    
    // 경로 저장은 비동기로 처리 (타임아웃에 영향 없음)
    saveRoutePaths(schedules).catch(err => {
      console.error('경로 저장 실패:', err.message);
    });
    
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[타임 측정] crawlAndSaveAll 전체 소요시간: ${totalElapsed}초`);
    
    return {
      success: true,
      schedulesFound: schedules.length,
      ...result
    };
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`크롤링 및 저장 실패 (소요시간: ${elapsed}초):`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  crawlAllSchedules,
  crawlAndSaveAll,
  crawlSingleUrl,
  saveSchedulesToDB,
  saveRoutePaths,
  CRAWL_URLS,
  normalizeDeparture,
  normalizeArrival
};

