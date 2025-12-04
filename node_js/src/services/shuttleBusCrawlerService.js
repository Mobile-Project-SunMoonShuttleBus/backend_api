const axios = require('axios');
const cheerio = require('cheerio');
const ShuttleBus = require('../models/ShuttleBus');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // puppeteer가 설치되지 않은 경우 무시
}

// 크롤링할 URL 목록
const CRAWL_URLS = {
  평일: {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_01.aspx',
    '천안 아산역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx',
    '천안 터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_02.aspx',
    '온양역/아산터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_03.aspx'
  },
  '토요일/공휴일': {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_02_01.aspx',
    '천안 아산역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_02_03.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_02_03.aspx',
    '천안 터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_02_02.aspx'
  },
  '일요일': {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_03_01.aspx',
    '천안아산역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_03_03.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_03_03.aspx',
    '천안 터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_03_02.aspx'
  }
};

// HTML 페이지 로드
async function fetchHtml(url) {
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
      
      // 렌더링 완료 대기
      await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});
      
      // 최종 HTML 확보
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
  const schedules = [];
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
      results.push({
        name: normalized,
        time: null,
        source: 'note'
      });
    }
    return results;
  };

  const mergeViaStops = (base, additions) => {
    const exists = new Set(base.map((item) => `${item.name}|${item.time || ''}|${item.source || ''}`));
    additions.forEach((item) => {
      if (!item || !item.name) return;
      const key = `${item.name}|${item.time || ''}|${item.source || ''}`;
      if (!exists.has(key)) {
        base.push({
          name: item.name,
          time: item.time || null,
          source: item.source || 'table'
        });
        exists.add(key);
      }
    });
    return base;
  };
  
  // 출발, 도착 기본값
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
      // 도착지를 찾지 못하면 저장 스킵
      defaultArrival = null;
    }
  } else {
    // 기타 페이지는 기본값 아산캠퍼스
    defaultArrival = '아산캠퍼스';
  }
  
  // 아산캠퍼스 왕복은 저장하지 않음
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
    
    // 테이블 행 파싱
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
        
        // 도착 컬럼도 별도로 저장 (도착시간 파싱용)
        const isArrivalColumn = hasArrivalKeyword && !hasDepartureKeyword;
        
        if (isDepartureColumn) {
          // 천안 아산역
          if (normalizedCellText.includes('천안아산역')) {
            departureColIndices['천안 아산역'] = cellIdx;
          }
          // 천안역
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
          let arrivalTime = campusArrivalIdx !== undefined && campusArrivalIdx < cells.length
            ? extractTimeValue($(cells[campusArrivalIdx]).text())
            : null;

          // 정류장 -> 아산캠
          for (const { idx, name } of validStopColumns) {
            const timeText = $(cells[idx]).text();
            const departureTime = extractTimeValue(timeText);
            if (!departureTime) continue;

            // 다른 정류장들을 경유지로 추가
            const viaStopsForRoute = [];
            for (const { idx: otherIdx, name: otherName } of validStopColumns) {
              if (otherIdx === idx) continue;
              const otherCell = cells.eq(otherIdx);
              const otherTimeText = otherCell.text().trim();
              const otherTime = extractTimeValue(otherTimeText);
              if (otherTime) {
                // 출발 시간보다 늦으면 경유지
                const depTime = departureTime.split(':').map(Number);
                const othTime = otherTime.split(':').map(Number);
                if (othTime[0] * 60 + othTime[1] > depTime[0] * 60 + depTime[1]) {
                  viaStopsForRoute.push({
                    name: otherName,
                    time: otherTime,
                    source: 'table'
                  });
                }
              } else if (otherTimeText && (otherTimeText.includes('경유') || !/^[XΧ]+$/i.test(otherTimeText))) {
                // 시간이 없어도 "경유" 텍스트가 있거나 빈 셀이 아니면 경유지로 추가
                viaStopsForRoute.push({
                  name: otherName,
                  time: null,
                  source: 'table'
                });
              }
            }
            mergeViaStops(viaStopsForRoute, viaStopsFromNote);

            // 도착 시간 찾기:
            // 1. columnMap.arrival이 있으면 사용
            // 2. "아산캠퍼스_도착" 컬럼 확인 (정류장 → 아산캠퍼스이므로 아산캠퍼스 도착 컬럼 사용)
            // 주의: 아산캠퍼스 출발 컬럼은 사용하지 않음 (그건 아산캠퍼스 → 정류장 방향의 출발 시간)
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
              departure: name,
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
                      viaStopsForRoute.push({
                        name: otherName,
                        time: otherTime,
                        source: 'table'
                      });
                    }
                  } else if (otherTimeText && (otherTimeText.includes('경유') || !/^[XΧ]+$/i.test(otherTimeText))) {
                    // 시간이 없어도 "경유" 텍스트가 있거나 빈 셀이 아니면 경유지로 추가
                    viaStopsForRoute.push({
                      name: otherName,
                      time: null,
                      source: 'table'
                    });
                  }
                }
                mergeViaStops(viaStopsForRoute, viaStopsFromNote);

                // 도착시간이 없으면 X로 저장
                schedules.push({
                  departure: '아산캠퍼스',
                  arrival: name,
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
    if (normalizedDeparture === '천안 아산역' || 
        (normalizedDeparture === '아산캠퍼스' && departureColIndices['천안 아산역'] !== undefined)) {
      const campusColIdx = departureColIndices['아산캠퍼스'];
      const stationColIdx = departureColIndices['천안 아산역'];
      if (campusColIdx === undefined && stationColIdx === undefined) {
        return;
      }

      const arrivalColIdx = columnMap.arrival;
      const intermediateEntries = Object.entries(departureColIndices).filter(([stopName, idx]) => {
        if (stopName === '천안 아산역' || stopName === '아산캠퍼스') return false;
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
            ? extractTimeValue($(cells[arrivalColIdx]).text())
            : null;

        const viaStopsFromColumns = [];
        for (const [stopName, idx] of intermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
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
            // 시간이 없어도 텍스트가 있으면 경유지로 추가 (예: "5분~10분 소요예상", "하이렉스파 건너편" 등)
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              source: 'table'
            });
          } else {
            const viaFromCell = extractViaStopsFromText(rawValue);
            mergeViaStops(viaStopsFromColumns, viaFromCell);
          }
        }

        const viaStopsFromNote = extractViaStopsFromText(noteText);

        // 아산캠퍼스 출발 컬럼 확인 (컬럼 1: "아산캠퍼스     출발")
        // 주의: "아산캠퍼스" 컬럼은 "출발" 키워드가 있는 컬럼만 사용 (도착 컬럼 제외)
        const campusDepartureColIdx = departureColIndices['아산캠퍼스'];
        if (campusDepartureColIdx !== undefined && campusDepartureColIdx < cells.length) {
          const campusCell = cells.eq(campusDepartureColIdx);
          const campusTime = extractTimeValue(campusCell.text());
          if (campusTime) {
            const campusViaStops = [];
            mergeViaStops(campusViaStops, viaStopsFromNote);
            
            // 도착 시간 찾기: 
            // 아산캠퍼스 → 천안 아산역 방향: 천안 아산역 출발 컬럼의 시간이 도착 시간
            // 예: 아산캠퍼스 출발 8:10, 천안아산역 출발 8:25 → 도착시간은 8:25
            // 주의: arrivalTime은 columnMap.arrival에서 가져온 것인데, 이건 "아산캠퍼스 도착" 컬럼일 수 있으므로 사용하지 않음
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
              mergeViaStops(stationViaStops, viaStopsFromColumns);
              mergeViaStops(stationViaStops, viaStopsFromNote);
              
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
            const stationViaStops = [];
            mergeViaStops(stationViaStops, viaStopsFromColumns);
            mergeViaStops(stationViaStops, viaStopsFromNote);
            
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
            
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '천안 아산역',
              arrival: '아산캠퍼스',
              departureTime: stationTime,
              arrivalTime: finalArrivalTime || 'X',
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
            ? extractTimeValue($(cells[arrivalColIdx]).text())
            : null;

        const viaStopsFromColumns = [];
        // 천안역 페이지 특수 처리: "용암마을" 컬럼은 경유지가 아닌 아산캠퍼스 도착시간으로 사용
        // 천안역 → 아산캠퍼스 방향에서는 "용암마을" 컬럼의 시간이 실제 도착시간이므로 경유지에서 제외
        const excludedStops = normalizedDeparture === '천안역' ? ['용암마을'] : [];
        for (const [stopName, idx] of intermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
          // 천안역 → 아산캠퍼스 방향에서는 "용암마을" 제외 (도착시간으로 사용)
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
            // 시간이 없어도 텍스트가 있으면 경유지로 추가 (예: "5분~10분 소요예상", "하이렉스파 건너편" 등)
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              source: 'table'
            });
          } else {
            const viaFromCell = extractViaStopsFromText(rawValue);
            mergeViaStops(viaStopsFromColumns, viaFromCell);
          }
        }

        const viaStopsFromNote = extractViaStopsFromText(noteText);

        if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanTime = extractTimeValue(asanCell.text());
          if (asanTime) {
            const campusViaStops = [];
            mergeViaStops(campusViaStops, viaStopsFromNote);
            
            // 도착 시간 찾기:
            // 1. columnMap.arrival이 있으면 사용
            // 2. 없으면 cheonanColIdx(천안역 출발 컬럼)의 시간 사용
            // 3. 없으면 "천안역_도착" 컬럼 확인
            let finalArrivalTime = arrivalTime;
            if (!finalArrivalTime && cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
              const cheonanCell = cells.eq(cheonanColIdx);
              finalArrivalTime = extractTimeValue(cheonanCell.text());
            }
            if (!finalArrivalTime && departureColIndices['천안역_도착'] !== undefined) {
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
            const cheonanViaStops = [];
            mergeViaStops(cheonanViaStops, viaStopsFromColumns);
            mergeViaStops(cheonanViaStops, viaStopsFromNote);
            
            // 도착 시간 찾기 (천안역 → 아산캠퍼스)
            // 천안역 페이지 HTML 구조상 실제 도착시간은 "용암마을" 컬럼(컬럼 4)에 저장됨
            // columnMap.arrival(컬럼 5)에는 특이사항만 있음
            let finalArrivalTime = null;
            // 1. intermediateEntries에서 "용암마을" 찾기
            for (const [stopName, idx] of intermediateEntries) {
              if (stopName === '용암마을' && idx !== undefined && idx < cells.length) {
                const yongamCell = cells.eq(idx);
                const yongamTime = extractTimeValue(yongamCell.text());
                if (yongamTime) {
                  finalArrivalTime = yongamTime;
                  break;
                }
              }
            }
            // 2. "용암마을" 컬럼 직접 확인
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
            // 3. columnMap.arrival 확인 (다른 페이지용)
            if (!finalArrivalTime && columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
              const arrivalCell = cells.eq(columnMap.arrival);
              finalArrivalTime = extractTimeValue(arrivalCell.text());
            }
            // 4. "아산캠퍼스_도착" 컬럼 확인
            if (!finalArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['아산캠퍼스_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
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
            ? extractTimeValue($(cells[arrivalColIdx]).text())
            : null;

        const viaStopsFromColumns = [];
        // 천안 터미널 페이지 특수 처리: "홈마트 에브리데이" 컬럼은 경유지가 아닌 아산캠퍼스 도착시간으로 사용
        // 천안 터미널 → 아산캠퍼스 방향에서는 "홈마트 에브리데이" 컬럼의 시간이 실제 도착시간이므로 경유지에서 제외
        const excludedStops = normalizedDeparture === '천안 터미널' ? ['홈마트 에브리데이'] : [];
        for (const [stopName, idx] of intermediateEntries) {
          if (idx === undefined || idx >= cells.length) continue;
          // 천안 터미널 → 아산캠퍼스 방향에서는 "홈마트 에브리데이" 제외 (도착시간으로 사용)
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
            // 시간이 없어도 텍스트가 있으면 경유지로 추가 (예: "5분~10분 소요예상", "하이렉스파 건너편" 등)
            viaStopsFromColumns.push({
              name: stopName,
              time: null,
              source: 'table'
            });
          } else {
            const viaFromCell = extractViaStopsFromText(rawValue);
            mergeViaStops(viaStopsFromColumns, viaFromCell);
          }
        }

        const viaStopsFromNote = extractViaStopsFromText(noteText);

          if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanTime = extractTimeValue(asanCell.text());
            if (asanTime) {
            const campusViaStops = [];
            mergeViaStops(campusViaStops, viaStopsFromNote);
            
            // 도착 시간 찾기:
            // 아산캠퍼스 → 천안 터미널 방향: 천안 터미널 출발 컬럼의 시간이 도착 시간
            // 예: 아산캠퍼스 7:30 출발 → 천안 터미널 8:10 도착 (터미널 출발 컬럼의 8:10)
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
            const terminalViaStops = [];
            mergeViaStops(terminalViaStops, viaStopsFromColumns);
            mergeViaStops(terminalViaStops, viaStopsFromNote);
            
            // 도착 시간 찾기 (천안 터미널 → 아산캠퍼스)
            // 천안 터미널 페이지 HTML 구조상 실제 도착시간은 "홈마트 에브리데이" 컬럼(컬럼 4)에 저장됨
            // columnMap.arrival(컬럼 6)은 데이터 행에 없음
            let finalArrivalTime = null;
            // 1. intermediateEntries에서 "홈마트 에브리데이" 찾기
            for (const [stopName, idx] of intermediateEntries) {
              if (stopName === '홈마트 에브리데이' && idx !== undefined && idx < cells.length) {
                const homeMartCell = cells.eq(idx);
                const homeMartTime = extractTimeValue(homeMartCell.text());
                if (homeMartTime) {
                  finalArrivalTime = homeMartTime;
                  break;
                }
              }
            }
            // 2. "홈마트 에브리데이" 컬럼 직접 확인
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
            // 3. columnMap.arrival 확인 (다른 페이지용)
            if (!finalArrivalTime && columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
              const arrivalCell = cells.eq(columnMap.arrival);
              finalArrivalTime = extractTimeValue(arrivalCell.text());
            }
            // 4. "아산캠퍼스_도착" 컬럼 확인
            if (!finalArrivalTime && departureColIndices['아산캠퍼스_도착'] !== undefined) {
              const arrivalColIdx = departureColIndices['아산캠퍼스_도착'];
              if (arrivalColIdx < cells.length) {
                const arrivalCell = cells.eq(arrivalColIdx);
                finalArrivalTime = extractTimeValue(arrivalCell.text());
              }
            }
            
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

// 단일 URL 시간표 크롤링
async function crawlSingleUrl(dayType, departure, url) {
  try {
    console.log(`크롤링 시작: ${dayType} - ${departure} (${url})`);
    
    const html = await fetchHtml(url);
    const schedules = parseScheduleTable(html, dayType, departure);
    
    console.log(`크롤링 완료: ${schedules.length}개 시간표 발견`);
    
    return schedules;
  } catch (error) {
    console.error(`크롤링 실패: ${dayType} - ${departure}`, error.message);
    return [];
  }
}

// 모든 시간표 크롤링
async function crawlAllSchedules() {
  console.log('=== 셔틀버스 시간표 전체 크롤링 시작 ===');
  
  const allSchedules = [];
  
  for (const [dayType, urls] of Object.entries(CRAWL_URLS)) {
    console.log(`\n${dayType} 크롤링 시작...`);
    
    for (const [departure, url] of Object.entries(urls)) {
      const schedules = await crawlSingleUrl(dayType, departure, url);
      allSchedules.push(...schedules);
      
      // 요청 간격 (서버 부하 방지)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`\n=== 크롤링 완료: 총 ${allSchedules.length}개 시간표 발견 ===`);
  
  return allSchedules;
}

// DB 시간표 저장
async function saveSchedulesToDB(schedules) {
  console.log(`\nDB 저장 시작: ${schedules.length}개 시간표...`);
  
  let savedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  for (const schedule of schedules) {
    try {
      // 중복 체크: 출발지, 도착지, 출발시간, 요일 타입이 모두 동일한 경우
      const existing = await ShuttleBus.findOne({
        departure: schedule.departure,
        arrival: schedule.arrival,
        departureTime: schedule.departureTime,
        dayType: schedule.dayType
      });
      
      if (existing) {
        // 기존 데이터 업데이트
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
        // 새 데이터 저장
        await ShuttleBus.create({
          ...schedule,
          crawledAt: new Date()
        });
        savedCount++;
      }
    } catch (error) {
      console.error(`시간표 저장 실패: ${schedule.departure} -> ${schedule.arrival} (${schedule.departureTime})`, error.message);
      failedCount++;
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
  try {
    const schedules = await crawlAllSchedules();
    const result = await saveSchedulesToDB(schedules);
    
    await saveRoutePaths(schedules);
    
    return {
      success: true,
      schedulesFound: schedules.length,
      ...result
    };
  } catch (error) {
    console.error('크롤링 및 저장 실패:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  crawlAllSchedules,
  crawlAndSaveAll,
  saveSchedulesToDB,
  saveRoutePaths,
  CRAWL_URLS,
  normalizeDeparture,
  normalizeArrival
};

