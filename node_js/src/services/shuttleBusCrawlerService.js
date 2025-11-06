const axios = require('axios');
const cheerio = require('cheerio');
const ShuttleBus = require('../models/ShuttleBus');

// 크롤링할 URL 목록
const CRAWL_URLS = {
  평일: {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_01.aspx',
    '천안 아산역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_02.aspx',
    '천안터미널': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_03.aspx'
  },
  '토요일/공휴일': {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_02_01.aspx',
    '천안 아산역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_02_03.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_02_02.aspx'
  },
  '일요일': {
    '아산캠퍼스': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_03_01.aspx',
    '천안아산역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_03_03_03.aspx',
    '천안역': 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_03_02.aspx'
  }
};

//HTML 페이지 가져오기
async function fetchHtml(url) {
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
    '천안터미널': '천안터미널',
    '천안 터미널': '천안터미널',
    '온양역/아산터미널': '온양역/아산터미널',
    '온양역/터미널': '온양역/아산터미널'
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
    '천안터미널': '천안터미널',
    '천안 터미널': '천안터미널',
    '온양역/아산터미널': '온양역/아산터미널',
    '온양역/터미널': '온양역/아산터미널'
  };
  return normalized[arrival] || arrival;
}

// HTML 시간표 파싱
function parseScheduleTable(html, dayType, expectedDeparture) {
  const schedules = [];
  const $ = cheerio.load(html);
  
  // 출발지와 도착지 설정
  const normalizedDeparture = normalizeDeparture(expectedDeparture);
  
  // 출발지에 따른 도착지 결정
  let defaultArrival = '아산캠퍼스';
  const pageText = $('body').text();
  
  if (normalizedDeparture === '아산캠퍼스') {
    // 아산캠퍼스에서 출발하는 경우: 페이지에서 도착지 정보 찾기
    if (pageText.includes('천안 아산역') || pageText.includes('천안아산역') || pageText.includes('아산역')) {
      defaultArrival = '천안 아산역';
    } else if (pageText.includes('천안역')) {
      defaultArrival = '천안역';
    } else if (pageText.includes('천안터미널')) {
      defaultArrival = '천안터미널';
    } else {
      // 도착지를 찾을 수 없으면 이 노선은 저장하지 않음
      defaultArrival = null;
    }
  } else {
    // 천안 아산역, 천안역, 천안터미널 등에서 출발하는 경우: 도착지는 아산캠퍼스
    defaultArrival = '아산캠퍼스';
  }
  
  // 아산캠퍼스 -> 아산캠퍼스는 저장하지 않음
  if (normalizedDeparture === '아산캠퍼스' && defaultArrival === '아산캠퍼스') {
    return schedules;
  }
  
  if (!defaultArrival) {
    return schedules;
  }
  
  // 모든 테이블 찾기
  $('table').each((tableIdx, table) => {
    const $table = $(table);
    const tableText = $table.text();
    
    // 시간표 테이블 확인
    if (!tableText.includes('순') && !tableText.match(/\d{1,2}:\d{2}/)) {
      return; // 다음 테이블로
    }
    
    // 테이블에 현재 페이지의 출발지가 포함되어 있는지 확인 (동적)
    // 테이블 헤더를 확인하기 전에 간단한 전처리만 수행
    
    // 테이블 행 파싱
    const rows = $table.find('tr');
    let headerRowIdx = -1;
    const columnMap = {};
    
    // 헤더 행 찾기 및 컬럼 매핑
    rows.each((rowIdx, row) => {
      const $row = $(row);
      const cells = $row.find('td, th');
      const rowText = $row.text().trim();
      
      // 헤더 행 찾기 (순번, 출발, 도착, 시간 행)
      if (rowText.includes('순') && (rowText.includes('출발') || rowText.includes('도착') || 
          rowText.match(/\d{1,2}:\d{2}/) || rowText.includes('시간'))) {
        headerRowIdx = rowIdx;
        
        // 각 컬럼의 역할 파악
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
        
        return false; // break
      }
    });
    
    // 데이터 행 파싱
    if (headerRowIdx >= 0) {
      // 헤더 이전 행들에서 출발지/도착지 정보 찾기
      // 현재 페이지의 출발지만 찾기 (다른 출발지는 무시)
      let tableDepartureStops = []; // 여러 출발지 가능하지만 현재 페이지 출발지만 저장
      let tableArrivalStop = null;
      
      // 헤더 행에서도 출발지/도착지 찾기
      const $headerRow = $(rows[headerRowIdx]);
      const headerCells = $headerRow.find('td, th');
      
      headerCells.each((cellIdx, cell) => {
        const cellText = $(cell).text().trim();
        // 출발지 찾기 - 현재 페이지의 출발지만 추가
        if (cellText.includes('출발') && (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널'))) {
          // 아산캠퍼스 출발 페이지인 경우, 아산캠퍼스 출발 컬럼만 확인
          if (normalizedDeparture === '아산캠퍼스') {
            const normalizedCellText = cellText.replace(/\s+/g, '');
            if (normalizedCellText.includes('아산캠퍼스') && normalizedCellText.includes('출발') && 
                !normalizedCellText.includes('천안') && !normalizedCellText.includes('천안아산역')) {
              if (!tableDepartureStops.includes(normalizedDeparture)) {
                tableDepartureStops.push(normalizedDeparture);
              }
            }
          } else {
            // 다른 출발지인 경우
            const matches = cellText.match(/([가-힣\s]+(?:캠퍼스|역|터미널))/g);
            if (matches) {
              matches.forEach(match => {
                const normalized = normalizeDeparture(match.replace(/출발|\(출발\)/g, '').trim());
                // 현재 페이지의 출발지만 추가
                if (normalized && normalized === normalizedDeparture && !tableDepartureStops.includes(normalized)) {
                  tableDepartureStops.push(normalized);
                }
              });
            }
          }
        }
        // 도착지 찾기
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
      
      // 헤더 이전 행들에서도 찾기
      for (let i = headerRowIdx - 1; i >= Math.max(0, headerRowIdx - 5); i--) {
        const $prevRow = $(rows[i]);
        const prevRowText = $prevRow.text().trim();
        const prevCells = $prevRow.find('td, th');
        
        // 출발지 찾기 - 현재 페이지의 출발지만 추가
        if (prevRowText.includes('출발')) {
          prevCells.each((idx, cell) => {
            const cellText = $(cell).text().trim();
            if (cellText && (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널'))) {
              // 아산캠퍼스 출발 페이지인 경우, 아산캠퍼스 출발만 확인
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
                // 현재 페이지의 출발지만 추가
                if (normalized && normalized === normalizedDeparture && !tableDepartureStops.includes(normalized)) {
                  tableDepartureStops.push(normalized);
                }
              }
            }
          });
        }
        
        // 도착지 찾기
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
      
      // 테이블 구조 완전 동적 분석: 헤더에서 모든 출발지 컬럼 인덱스 찾기
      const $headerRowForColIdx = $(rows[headerRowIdx]);
      const headerCellsForColIdx = $headerRowForColIdx.find('td, th');
      
      // 모든 출발지 컬럼 인덱스 맵 생성 (완전 동적)
      const departureColIndices = {};
      
      // 헤더 행을 순회하며 각 출발지 컬럼 인덱스 찾기 (하드코딩 없이 완전 동적)
      headerCellsForColIdx.each((cellIdx, cell) => {
        const cellText = $(cell).text().trim();
        const normalizedCellText = cellText.replace(/\s+/g, '');
        
        // 출발지 컬럼 찾기 (완전 동적 - 하드코딩 최소화)
        // "출발" 키워드가 있거나, 출발지 이름 패턴이 있는 경우 확인
        // 도착지 컬럼이 아닌 경우만 확인 (도착 키워드가 없어야 함)
        const hasDepartureKeyword = normalizedCellText.includes('출발');
        const hasArrivalKeyword = normalizedCellText.includes('도착');
        const hasLocationName = normalizedCellText.includes('캠퍼스') || 
                               normalizedCellText.includes('역') || 
                               normalizedCellText.includes('터미널');
        
        // 출발지 컬럼인지 확인: "출발" 키워드가 있거나, 위치 이름이 있고 "도착"이 없으면 출발지로 간주
        const isDepartureColumn = (hasDepartureKeyword || hasLocationName) && !hasArrivalKeyword;
        
        if (isDepartureColumn) {
          // 천안 아산역 출발 먼저 확인 (더 구체적이므로 우선)
          // "천안아산역"이 포함되어 있고 "도착"이 없으면 출발지로 간주
          if (normalizedCellText.includes('천안아산역')) {
            departureColIndices['천안 아산역'] = cellIdx;
          }
          // 천안역 출발: "천안역"이 있고 "아산역"과 "도착"이 없어야 함
          else if (normalizedCellText.includes('천안역') && !normalizedCellText.includes('아산역')) {
            departureColIndices['천안역'] = cellIdx;
          }
          // 아산캠퍼스 출발: "아산캠퍼스"가 있고 "천안"과 "도착"이 없어야 함
          else if (normalizedCellText.includes('아산캠퍼스') && 
              !normalizedCellText.includes('천안') && 
              !normalizedCellText.includes('천안아산역')) {
            departureColIndices['아산캠퍼스'] = cellIdx;
          }
          // 천안터미널 출발: "터미널"이 포함되어 있고 "도착"이 없으면 천안터미널로 간주
          else if (normalizedCellText.includes('터미널') && !normalizedCellText.includes('천안역')) {
            departureColIndices['천안터미널'] = cellIdx;
          }
          // 새로운 출발지가 추가되어도 인식 가능하도록 (일반적인 패턴)
          // "출발" 키워드가 있고 아직 매핑되지 않은 출발지인 경우
          // (추후 새로운 출발지 추가 시 이 부분에서 자동으로 인식 가능)
        }
      });
      
      // 테이블에서 찾은 모든 출발지 컬럼 처리
      // 하나의 테이블에 여러 출발지가 있을 수 있으므로, 각 출발지별로 처리
      const departureKeysToProcess = [];
      
      // 현재 페이지의 출발지가 있으면 추가
      if (departureColIndices[normalizedDeparture] !== undefined) {
        departureKeysToProcess.push(normalizedDeparture);
      }
      
      // 아산캠퍼스 출발 페이지인 경우, 같은 테이블에 다른 출발지 컬럼이 있으면 함께 처리
      // 예: "천안아산역 출발", "천안역 출발" 등
      // 단, "천안터미널"은 제외 (별도 페이지에서 처리)
      if (normalizedDeparture === '아산캠퍼스') {
        // 천안 아산역 출발 컬럼이 있으면 함께 처리
        if (departureColIndices['천안 아산역'] !== undefined) {
          departureKeysToProcess.push('천안 아산역');
        }
        // 천안역 출발 컬럼이 있으면 함께 처리
        if (departureColIndices['천안역'] !== undefined) {
          departureKeysToProcess.push('천안역');
        }
        // 천안터미널은 제외 (별도 페이지에서 처리하므로)
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
        
        // 현재 페이지의 출발지 컬럼에서만 시간 추출 (동적으로 찾은 컬럼 인덱스만 사용)
        // 다른 컬럼은 완전히 무시
        if (currentDepartureColIdx >= cells.length || currentDepartureColIdx < 0) {
          continue;
        }
        
        // 동적으로 찾은 컬럼 인덱스로 셀 가져오기 (정확히 해당 컬럼만)
        // cells는 cheerio 객체이므로 .eq()를 사용해야 함
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
        
        // 출발 시간 추출 (동적으로 찾은 컬럼에서만)
        // 시간 형식: 숫자:숫자 또는 숫자;숫자 (콜론 또는 세미콜론 모두 인식)
        const departureTimeMatch = departureCellText.match(/(\d{1,2})[:;](\d{2})/);
        
        // 시간이 없는 경우 저장하지 않음
        if (!departureTimeMatch) {
          continue;
        }
        
        // 세미콜론(;)을 콜론(:)으로 정규화
        const departureTime = departureTimeMatch[0].replace(';', ':');
        
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
        
        // 천안터미널 -> 아산캠퍼스는 저장하지 않음 (잘못된 데이터 방지)
        if (finalDeparture === '천안터미널' && finalArrival === '아산캠퍼스') {
          if (process.env.DEBUG_CRAWLER) {
            console.log(`[${departureKey}] 천안터미널 -> 아산캠퍼스는 저장하지 않음`);
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
          schedules.push({
            departure: finalDeparture,
            arrival: finalArrival,
            departureTime: departureTime,
            fridayOperates: fridayOperates,
            dayType: dayType,
            note: note || '',
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

