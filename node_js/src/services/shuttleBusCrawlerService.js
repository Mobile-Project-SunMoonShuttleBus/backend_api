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
      
      // JS 실행 완료까지 대기
      await page.waitForFunction(
        () => {
          const text = document.body.innerText;
          const timeMatches = text.match(/\d{1,2}[:;]\d{2}/g);
          return timeMatches && timeMatches.length >= 3;
        },
        { timeout: 2000 }
      ).catch(() => {});
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
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
    '온양역/아산터미널': '온양역/아산터미널',
    '온양역/터미널': '온양역/아산터미널',
    '온양온천역': '온양온천역',
    '온양 온천역': '온양온천역',
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

  // 경유지 시간 추정
  const estimateViaStopTime = (viaStopName, departureTime, arrivalTime, allViaStops, rawText = '') => {
    if (!departureTime || !arrivalTime || arrivalTime === 'X') {
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
    
    // 분으로 변환
    const [depHour, depMin] = departureTime.split(':').map(Number);
    const [arrHour, arrMin] = arrivalTime.split(':').map(Number);
    const depMinutes = depHour * 60 + depMin;
    const arrMinutes = arrHour * 60 + arrMin;
    
    if (arrMinutes <= depMinutes) {
      if (rawText && rawText.trim() && !/^[XΧ]+$/i.test(rawText)) {
        return rawText.trim();
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
    additions.forEach((item) => {
      if (!item || !item.name) return;
      
      // 탕정역은 제외 (테이블에 컬럼이 없음)
      if (item.name === '탕정역' || item.name.includes('탕정역')) {
        return;
      }
      
      const key = `${item.name}|${item.time || ''}|${item.source || ''}`;
      if (!exists.has(key)) {
        let viaTime = item.time;
        
        // "경유"만 있는 경우
        if (!viaTime && item.rawText && item.rawText.trim() === '경유') {
          viaTime = '경유';
        }
        // 시간이 없고 출발시간/도착시간이 있으면 추정
        else if (!viaTime && departureTime && arrivalTime) {
          const rawText = item.rawText || rawTextMap[item.name] || '';
          viaTime = estimateViaStopTime(item.name, departureTime, arrivalTime, base, rawText);
        }
        // 시간이 없고 텍스트만 있는 경우
        else if (!viaTime && item.rawText && item.rawText.trim() && !/^[XΧ]+$/i.test(item.rawText)) {
          viaTime = item.rawText.trim();
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
                               normalizedCellText.includes('권곡');
        
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
          // 천안 터미널
          else if (normalizedCellText.includes('천안터미널') || (normalizedCellText.includes('터미널') && !normalizedCellText.includes('천안역'))) {
            departureColIndices['천안 터미널'] = cellIdx;
          }
          // 온양온천역
          else if (normalizedCellText.includes('온천역')) {
            departureColIndices['온양온천역'] = cellIdx;
          }
          // 주은아파트
          else if (normalizedCellText.includes('주은아파트')) {
            departureColIndices['주은아파트 버스정류장'] = cellIdx;
          }
          // 아산터미널
          else if (normalizedCellText.includes('아산터미널')) {
            departureColIndices['아산터미널'] = cellIdx;
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
        if (process.env.DEBUG_CRAWLER) {
          console.log('[온양역/아산터미널] 특수 처리 시작');
          console.log('[온양역/아산터미널] departureColIndices:', Object.keys(departureColIndices));
        }
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

          // 정류장 -> 아산캠
          for (const { idx, name } of validStopColumns) {
            const timeText = $(cells[idx]).text();
            const departureTime = extractTimeValue(timeText);
            if (!departureTime) continue;

            // 정류장 이름 정규화 (온양온천역, 아산터미널 → 온양역/아산터미널)
            let normalizedStopName = name;
            if (name === '온양온천역' || name === '아산터미널') {
              normalizedStopName = '온양역/아산터미널';
            }

            // 다른 정류장들을 경유지로 추가
            const viaStopsForRoute = [];
            for (const { idx: otherIdx, name: otherName } of validStopColumns) {
              if (otherIdx === idx) continue;
              const otherCell = cells.eq(otherIdx);
              const otherTimeText = otherCell.text().trim();
              const otherTime = extractTimeValue(otherTimeText);
              if (otherTime) {
                // 출발~도착 시간 사이면 경유지
                const depTime = departureTime.split(':').map(Number);
                const depMinutes = depTime[0] * 60 + depTime[1];
                const othTime = otherTime.split(':').map(Number);
                const othMinutes = othTime[0] * 60 + othTime[1];
                
                // 도착시간 확인
                let arrMinutes = null;
                if (arrivalTime && arrivalTime !== 'X') {
                  const arrTime = arrivalTime.split(':').map(Number);
                  arrMinutes = arrTime[0] * 60 + arrTime[1];
                }
                
                // 출발 시간보다 늦고, 도착 시간이 있으면 도착 시간보다 빠른지 확인
                if (othMinutes > depMinutes && (!arrMinutes || othMinutes < arrMinutes)) {
                  // 경유지 이름도 정규화
                  let normalizedViaName = otherName;
                  if (otherName === '온양온천역' || otherName === '아산터미널') {
                    normalizedViaName = '온양역/아산터미널';
                  }
                  // 도착 컬럼은 경유지에서 제외
                  if (normalizedViaName.includes('_도착')) {
                    return;
                  }
                  viaStopsForRoute.push({
                    name: normalizedViaName,
                    time: otherTime,
                    source: 'table'
                  });
                }
              } else if (otherTimeText && (otherTimeText.includes('경유') || !/^[XΧ]+$/i.test(otherTimeText))) {
                // 경유 텍스트가 있으면 경유지로 추가
                let normalizedViaName = otherName;
                if (otherName === '온양온천역' || otherName === '아산터미널') {
                  normalizedViaName = '온양역/아산터미널';
                }
                // 도착 컬럼은 경유지에서 제외
                if (normalizedViaName.includes('_도착')) {
                  continue;
                }
                viaStopsForRoute.push({
                  name: normalizedViaName,
                  time: null,
                  rawText: otherTimeText,
                  source: 'table'
                });
              }
            }
            // 도착시간 먼저 찾기
            let finalArrivalTime = arrivalTime;
            if (!finalArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['아산캠퍼스_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }

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

          // 아산캠 -> 정류장
          if (campusDepartureIdx !== undefined && campusDepartureIdx < cells.length) {
            const campusCell = cells.eq(campusDepartureIdx);
            const campusDepartureTime = extractTimeValue(campusCell.text());
            if (campusDepartureTime) {
              for (const { idx, name } of validStopColumns) {
                const stopCell = cells.eq(idx);
                const stopValue = stopCell.text();
                const stopTime = extractTimeValue(stopValue);
                if (!stopTime) continue;

                // 정류장 이름 정규화 (온양온천역, 아산터미널 → 온양역/아산터미널)
                let normalizedStopName = name;
                if (name === '온양온천역' || name === '아산터미널') {
                  normalizedStopName = '온양역/아산터미널';
                }

                // 다른 정류장들을 경유지로 추가
                const viaStopsForRoute = [];
                for (const { idx: otherIdx, name: otherName } of validStopColumns) {
                  if (otherIdx === idx) continue;
                  const otherCell = cells.eq(otherIdx);
                  const otherTimeText = otherCell.text().trim();
                  const otherTime = extractTimeValue(otherTimeText);
                  if (otherTime) {
                    // 출발~도착 시간 사이면 경유지
                    const depTime = campusDepartureTime.split(':').map(Number);
                    const arrTime = stopTime.split(':').map(Number);
                    const othTime = otherTime.split(':').map(Number);
                    if (othTime[0] * 60 + othTime[1] > depTime[0] * 60 + depTime[1] &&
                        othTime[0] * 60 + othTime[1] < arrTime[0] * 60 + arrTime[1]) {
                      // 경유지 이름도 정규화
                      let normalizedViaName = otherName;
                      if (otherName === '온양온천역' || otherName === '아산터미널') {
                        normalizedViaName = '온양역/아산터미널';
                      }
                      viaStopsForRoute.push({
                        name: normalizedViaName,
                        time: otherTime,
                        source: 'table'
                      });
                    }
                  } else if (otherTimeText && (otherTimeText.includes('경유') || !/^[XΧ]+$/i.test(otherTimeText))) {
                    // 경유 텍스트가 있으면 경유지로 추가
                    let normalizedViaName = otherName;
                    if (otherName === '온양온천역' || otherName === '아산터미널') {
                      normalizedViaName = '온양역/아산터미널';
                    }
                    viaStopsForRoute.push({
                      name: normalizedViaName,
                      time: null,
                      rawText: otherTimeText,
                      source: 'table'
                    });
                  }
                }
                mergeViaStops(viaStopsForRoute, viaStopsFromNote, campusDepartureTime, stopTime || 'X');

                // 도착시간이 없으면 X로 저장
                schedules.push({
                  departure: '아산캠퍼스',
                  arrival: normalizedStopName,
                  departureTime: campusDepartureTime,
                  arrivalTime: stopTime || 'X',
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
          const timeValue = extractTimeValue(rawValue);
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
        // 천안역 페이지 특수 처리: 용암마을 컬럼은 도착시간으로 사용
        const excludedStops = normalizedDeparture === '천안역' ? ['용암마을'] : [];
        for (const [stopName, idx] of intermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
          // 용암마을 제외
          if (excludedStops.includes(stopName)) continue;
          // 도착 컬럼 제외
          if (stopName.includes('_도착')) continue;
          const cell = cells.eq(idx);
          const rawValue = cell.text().trim();
          const timeValue = extractTimeValue(rawValue);
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

        if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanTime = extractTimeValue(asanCell.text());
          if (asanTime) {
            const campusViaStops = [];
            // 도착시간 먼저 찾기
            let finalArrivalTime = arrivalTime;
            if (!finalArrivalTime && cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
              const cheonanCell = cells.eq(cheonanColIdx);
              const cheonanTime = extractTimeValue(cheonanCell.text());
              if (cheonanTime) {
                const depMinutes = parseInt(asanTime.split(':')[0]) * 60 + parseInt(asanTime.split(':')[1]);
                const arrMinutes = parseInt(cheonanTime.split(':')[0]) * 60 + parseInt(cheonanTime.split(':')[1]);
                if (arrMinutes > depMinutes) {
                  finalArrivalTime = cheonanTime;
                }
              }
            }
            if (finalArrivalTime === 'X' && departureColIndices['천안역_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['천안역_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }
            
            mergeViaStops(campusViaStops, viaStopsFromNote, asanTime, finalArrivalTime || 'X');
            mergeViaStops(campusViaStops, viaStopsFromColumns, asanTime, finalArrivalTime || 'X');
            if (!finalArrivalTime && cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
              const cheonanCell = cells.eq(cheonanColIdx);
              const cheonanTime = extractTimeValue(cheonanCell.text());
              // 천안역 출발 시간이 있고, 출발 시간보다 늦으면 도착 시간으로 사용
              if (cheonanTime) {
                const depMinutes = parseInt(asanTime.split(':')[0]) * 60 + parseInt(asanTime.split(':')[1]);
                const arrMinutes = parseInt(cheonanTime.split(':')[0]) * 60 + parseInt(cheonanTime.split(':')[1]);
                if (arrMinutes > depMinutes) {
                  finalArrivalTime = cheonanTime;
                }
              }
            }
            if (finalArrivalTime === 'X' && departureColIndices['천안역_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['천안역_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
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
              viaStops: campusViaStops,
              studentHallBoardingAvailable: hasHighlight(asanCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
          }
        }

        if (cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
          const cheonanCell = cells.eq(cheonanColIdx);
          const cheonanTime = extractTimeValue(cheonanCell.text());
          if (cheonanTime) {
            // 도착 시간 찾기 (천안역 → 아산캠퍼스)
            // 용암마을 컬럼이 실제 도착시간
            let finalArrivalTime = null;
            
            const cheonanViaStops = [];
            mergeViaStops(cheonanViaStops, viaStopsFromColumns, cheonanTime, finalArrivalTime || 'X');
            mergeViaStops(cheonanViaStops, viaStopsFromNote, cheonanTime, finalArrivalTime || 'X');
            // 용암마을 컬럼 확인
            if (departureColIndices['용암마을'] !== undefined) {
              const yongamIdx = departureColIndices['용암마을'];
              if (yongamIdx < cells.length) {
                const yongamCell = cells.eq(yongamIdx);
                const yongamTime = extractTimeValue(yongamCell.text());
                if (yongamTime) {
                  finalArrivalTime = yongamTime;
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
              departureTime: cheonanTime,
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

        const viaStopsFromColumns = [];
        // 천안 터미널 페이지 특수 처리: 홈마트 에브리데이 컬럼은 도착시간으로 사용
        const excludedStops = normalizedDeparture === '천안 터미널' ? ['홈마트 에브리데이'] : [];
        for (const [stopName, idx] of intermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
          // 홈마트 에브리데이 제외
          if (excludedStops.includes(stopName)) continue;
          const cell = cells.eq(idx);
          const rawValue = cell.text().trim();
          const timeValue = extractTimeValue(rawValue);
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

          if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanTime = extractTimeValue(asanCell.text());
            if (asanTime) {
            const campusViaStops = [];
            // 도착시간 먼저 찾기
            let finalArrivalTime = arrivalTime;
            if (!finalArrivalTime && terminalColIdx !== undefined && terminalColIdx < cells.length) {
              const terminalCell = cells.eq(terminalColIdx);
              const terminalTime = extractTimeValue(terminalCell.text());
              // 천안 터미널 출발 시간이 있고, 출발 시간보다 늦으면 도착 시간으로 사용
              if (terminalTime) {
                const depMinutes = parseInt(asanTime.split(':')[0]) * 60 + parseInt(asanTime.split(':')[1]);
                const arrMinutes = parseInt(terminalTime.split(':')[0]) * 60 + parseInt(terminalTime.split(':')[1]);
                if (arrMinutes > depMinutes) {
                  finalArrivalTime = terminalTime;
                }
              }
            }
            if (!finalArrivalTime && departureColIndices['천안 터미널_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['천안 터미널_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }
            
            // 경유지 시간 추정
            mergeViaStops(campusViaStops, viaStopsFromNote, asanTime, finalArrivalTime || 'X');
            mergeViaStops(campusViaStops, viaStopsFromColumns, asanTime, finalArrivalTime || 'X');
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '아산캠퍼스',
              arrival: '천안 터미널',
              departureTime: asanTime,
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
          const terminalTime = extractTimeValue(terminalCell.text());
            if (terminalTime) {
            // 도착 시간 찾기 (천안 터미널 → 아산캠퍼스)
            // 홈마트 에브리데이 컬럼이 실제 도착시간
            let finalArrivalTime = null;
            
            const terminalViaStops = [];
            mergeViaStops(terminalViaStops, viaStopsFromColumns, terminalTime, finalArrivalTime || 'X');
            mergeViaStops(terminalViaStops, viaStopsFromNote, terminalTime, finalArrivalTime || 'X');
            // 홈마트 에브리데이 컬럼 확인
            if (departureColIndices['홈마트 에브리데이'] !== undefined) {
              const homeMartIdx = departureColIndices['홈마트 에브리데이'];
              if (homeMartIdx < cells.length) {
                const homeMartCell = cells.eq(homeMartIdx);
                const homeMartTime = extractTimeValue(homeMartCell.text());
                if (homeMartTime) {
                  finalArrivalTime = homeMartTime;
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
            
            // 경유지 시간 추정
            mergeViaStops(terminalViaStops, viaStopsFromColumns, terminalTime, finalArrivalTime || 'X');
            mergeViaStops(terminalViaStops, viaStopsFromNote, terminalTime, finalArrivalTime || 'X');
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '천안 터미널',
              arrival: '아산캠퍼스',
              departureTime: terminalTime,
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
  console.log(`[DEBUG] crawlAllSchedules 호출됨, maxTime: ${maxTime}ms`);
  
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
  console.log(`\nDB 저장 시작: ${schedules.length}개 시간표...`);
  
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
      
      const batch = schedules.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (schedule) => {
        try {
          // 먼저 정확히 일치하는 레코드 찾기
          let existing = await ShuttleBus.findOne({
            departure: schedule.departure,
            arrival: schedule.arrival,
            departureTime: schedule.departureTime,
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
    
    const routeMap = new Map();
    
    for (const schedule of schedules) {
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

