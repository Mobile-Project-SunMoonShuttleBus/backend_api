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
        
        // 출발 컬럼 조건
        const isDepartureColumn = (hasDepartureKeyword || hasLocationName) && !hasArrivalKeyword;
        
        if (isDepartureColumn) {
          // 천안 아산역
          if (normalizedCellText.includes('천안아산역')) {
            departureColIndices['천안 아산역'] = cellIdx;
          }
          // 천안역
          else if (normalizedCellText.includes('천안역') && !normalizedCellText.includes('아산역')) {
            departureColIndices['천안역'] = cellIdx;
          }
          // 아산캠퍼스
          else if ((normalizedCellText.includes('아산캠퍼스') || normalizedCellText.includes('선문대')) && 
              !normalizedCellText.includes('천안') && 
              !normalizedCellText.includes('천안아산역')) {
            departureColIndices['아산캠퍼스'] = cellIdx;
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
      });
      
      // 출발지별 처리 목록 구성
      const departureKeysToProcess = [];
      
      // 현재 페이지 출발지 우선
      if (departureColIndices[normalizedDeparture] !== undefined) {
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

        // 테이블에서 정류장 컬럼 찾기
        const stopColumns = Object.entries(departureColIndices)
          .filter(([stopName, idx]) => {
            if (stopName === '아산캠퍼스') return false;
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
          const arrivalTime = campusArrivalIdx !== undefined && campusArrivalIdx < cells.length
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

            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: name,
              arrival: '아산캠퍼스',
              departureTime,
              arrivalTime: arrivalTime || 'X',
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

    // 천안 아산역 특수 처리
    if (normalizedDeparture === '천안 아산역') {
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

        if (campusColIdx !== undefined && campusColIdx < cells.length) {
          const campusCell = cells.eq(campusColIdx);
          const campusTime = extractTimeValue(campusCell.text());
          if (campusTime) {
            const campusViaStops = [];
            mergeViaStops(campusViaStops, viaStopsFromNote);
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '아산캠퍼스',
              arrival: '천안 아산역',
              departureTime: campusTime,
              arrivalTime: arrivalTime || 'X',
              fridayOperates,
              dayType,
              note: noteText || '',
              viaStops: campusViaStops,
              studentHallBoardingAvailable: hasHighlight(campusCell),
              sourceUrl: CRAWL_URLS[dayType]?.[expectedDeparture] || ''
            });
          }
        }

        if (stationColIdx !== undefined && stationColIdx < cells.length) {
          const stationCell = cells.eq(stationColIdx);
          const stationTime = extractTimeValue(stationCell.text());
          if (stationTime) {
            const stationViaStops = [];
            mergeViaStops(stationViaStops, viaStopsFromColumns);
            mergeViaStops(stationViaStops, viaStopsFromNote);
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '천안 아산역',
              arrival: '아산캠퍼스',
              departureTime: stationTime,
              arrivalTime: arrivalTime || 'X',
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

        if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanTime = extractTimeValue(asanCell.text());
          if (asanTime) {
            const campusViaStops = [];
            mergeViaStops(campusViaStops, viaStopsFromNote);
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '아산캠퍼스',
              arrival: '천안역',
              departureTime: asanTime,
              arrivalTime: arrivalTime || 'X',
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
            // 도착시간이 없으면 X로 저장
            schedules.push({
              departure: '천안역',
              arrival: '아산캠퍼스',
              departureTime: cheonanTime,
              arrivalTime: arrivalTime || 'X',
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

          if (asanColIdx !== undefined && asanColIdx < cells.length) {
          const asanCell = cells.eq(asanColIdx);
          const asanTime = extractTimeValue(asanCell.text());
            if (asanTime) {
            const campusViaStops = [];
            mergeViaStops(campusViaStops, viaStopsFromNote);
              // 도착시간이 없으면 X로 저장
              schedules.push({
                departure: '아산캠퍼스',
                arrival: '천안 터미널',
                departureTime: asanTime,
                arrivalTime: arrivalTime || 'X',
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
              // 도착시간이 없으면 X로 저장
              schedules.push({
                departure: '천안 터미널',
                arrival: '아산캠퍼스',
                departureTime: terminalTime,
                arrivalTime: arrivalTime || 'X',
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
              // 도착시간이 없으면 X로 저장
          schedules.push({
            departure: finalDeparture,
            arrival: finalArrival,
            departureTime: departureTime,
            arrivalTime: 'X',
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
  try {
    console.log(`\nDB 저장 시작: ${schedules.length}개 시간표...`);
    
    let savedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const schedule of schedules) {
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
    }
    
    console.log(`DB 저장 완료: 신규 ${savedCount}개, 업데이트 ${updatedCount}개, 건너뜀 ${skippedCount}개`);
    
    return {
      saved: savedCount,
      updated: updatedCount,
      skipped: skippedCount,
      total: schedules.length
    };
  } catch (error) {
    console.error('DB 저장 실패:', error);
    throw error;
  }
}

// 전체 크롤링 및 저장
async function crawlAndSaveAll() {
  try {
    const schedules = await crawlAllSchedules();
    const result = await saveSchedulesToDB(schedules);
    
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
  CRAWL_URLS
};

