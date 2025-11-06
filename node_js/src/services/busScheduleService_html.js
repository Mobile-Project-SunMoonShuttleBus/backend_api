// 웹페이지에서 HTML 테이블을 파싱
const axios = require('axios');
const cheerio = require('cheerio');

// 웹페이지 URL
const PAGE_URLS = {
  weekday: 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_01.aspx',
  holiday: 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_02_01.aspx'
};

// 웹 HTML 가져오기
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
    console.error('HTML 가져오기 실패:', error.message);
    throw error;
  }
}

// 천안아산역/아산역 노선 테이블 파싱
function parseHtmlTable(html, dayType) {
  const routes = [];
  const $ = cheerio.load(html);
  
  // 천안아산역/아산역 노선 찾기
  // 페이지에서 "천안아산역" 또는 "아산역" 텍스트가 포함된 영역 찾기
  let routeTable = null;
  
  // 모든 테이블을 확인
  $('table').each((idx, table) => {
    const tableText = $(table).text();
    if (tableText.includes('천안아산역') || tableText.includes('아산역')) {
      routeTable = $(table);
      return false;
    }
  });
  
  if (!routeTable || routeTable.length === 0) {
    console.log('천안아산역/아산역 노선 테이블을 찾을 수 없습니다.');
    return routes;
  }
  
  console.log('테이블 발견');
  
  // 테이블 구조 분석
  const rows = routeTable.find('tr');
  console.log(`테이블 행 수: ${rows.length}`);
  
  // 헤더 찾기
  let headerRow = null;
  let headerRowIdx = -1;
  let dataStartIdx = -1;
  
  rows.each((idx, row) => {
    const rowText = $(row).text().trim();
    if (rowText.includes('순') && (rowText.includes('출발') || rowText.includes('도착'))) {
      headerRow = $(row);
      headerRowIdx = idx;
      
      // 헤더 다음 줄부터 데이터 시작
      dataStartIdx = idx + 1;
      return false;
    }
  });
  
  if (!headerRow || headerRow.length === 0) {
    console.log('헤더 행을 찾을 수 없습니다.');
    return routes;
  }
  
  console.log(`헤더 발견: 줄 ${headerRowIdx + 1}`);
  console.log(`데이터 시작: 줄 ${dataStartIdx + 1}`);
  
  // 헤더에서 컬럼 정보 추출
  const headers = [];
  headerRow.find('th, td').each((idx, cell) => {
    const text = $(cell).text().trim();
    if (text) {
      headers.push(text);
    }
  });
  
  console.log(`컬럼: ${headers.join(', ')}`);
  
  // 출발지/도착지 정보 추출
  let departureStops = [];
  let arrivalStop = null;
  
  // 헤더 이전 줄들에서 출발지/도착지 찾기
  for (let i = headerRowIdx - 1; i >= Math.max(0, headerRowIdx - 10); i--) {
    const row = $(rows[i]);
    const rowText = row.text().trim();
    
    // 출발지 찾기
    if (rowText.includes('출발') || rowText.includes('(출발)')) {
      const cells = row.find('td, th');
      cells.each((idx, cell) => {
        const cellText = $(cell).text().trim();
        if (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널')) {
          if (!departureStops.includes(cellText) && !cellText.includes('도착')) {
            departureStops.push(cellText);
          }
        }
      });
    }
    
    // 도착지 찾기
    if (rowText.includes('도착') || rowText.includes('(도착)')) {
      const cells = row.find('td, th');
      cells.each((idx, cell) => {
        const cellText = $(cell).text().trim();
        if (cellText.includes('캠퍼스') || cellText.includes('역') || cellText.includes('터미널')) {
          if (!cellText.includes('출발')) {
            arrivalStop = cellText;
          }
        }
      });
    }
  }
  
  // 헤더에서도 출발지/도착지 찾기
  if (departureStops.length === 0 || !arrivalStop) {
    headerRow.find('th, td').each((idx, cell) => {
      const text = $(cell).text().trim();
      if (text.includes('아산캠퍼스') && !departureStops.includes('아산캠퍼스')) {
        departureStops.push('아산캠퍼스');
      }
      if (text.includes('천안아산역') && !departureStops.includes('천안아산역')) {
        departureStops.push('천안아산역');
      }
      if (text.includes('도착') && text.includes('아산캠퍼스')) {
        arrivalStop = '아산캠퍼스';
      }
    });
  }
  
  if (departureStops.length === 0 || !arrivalStop) {
    // 기본값 설정
    departureStops = ['아산캠퍼스', '천안아산역'];
    arrivalStop = '아산캠퍼스';
  }
  
  console.log(`출발지: ${departureStops.join(', ')}`);
  console.log(`도착지: ${arrivalStop}`);
  
  // 노선 생성
  let routeName;
  if (departureStops.length > 1) {
    routeName = `${departureStops[0]}→${departureStops[1]}→${arrivalStop}`;
  } else {
    routeName = `${departureStops[0]}→${arrivalStop}`;
  }
  
  const currentRoute = {
    busType: '셔틀버스',
    dayType: dayType,
    routeName: routeName,
    routeId: `${dayType}_${routeName}`,
    timetable: [],
    note: '',
    rawFileUrl: PAGE_URLS.weekday
  };
  
  // 데이터 행 파싱
  let processedOrders = new Set();
  
  for (let i = dataStartIdx; i < rows.length; i++) {
    const row = $(rows[i]);
    const cells = row.find('td, th');
    
    if (cells.length === 0) continue;
    
    // 첫 번째 셀이 순번인지 확인
    const firstCell = $(cells[0]).text().trim();
    const orderMatch = firstCell.match(/^(\d+)$/);
    
    if (!orderMatch) continue;
    
    const orderNum = parseInt(orderMatch[1]);
    
    if (orderNum < 1 || orderNum > 100) continue;
    if (processedOrders.has(orderNum)) continue;
    
    // 시간 추출 (HH:MM 형식)
    const rowText = row.text();
    const timeMatches = rowText.match(/\d{1,2}:\d{2}/g);
    
    if (!timeMatches || timeMatches.length < 2) continue;
    
    // 특이사항 추출
    let note = '';
    cells.each((idx, cell) => {
      const cellText = $(cell).text().trim();
      if (cellText.includes('금(X)') || cellText.includes('시간변경') || 
          cellText.includes('경유') || cellText.includes('운영') ||
          cellText.includes('소요') || cellText.includes('전용')) {
        note = cellText;
      }
    });
    
    // 시간이 3개인 경우: 아산캠퍼스 출발, 천안아산역 출발, 아산캠퍼스 도착
    if (departureStops.length >= 2 && timeMatches.length >= 3) {
      const departureTime1 = timeMatches[0]; // 아산캠퍼스 출발
      const departureTime2 = timeMatches[1]; // 천안아산역 출발
      const arrivalTime = timeMatches[2]; // 아산캠퍼스 도착
      
      // "X" 표시 확인
      const hasX = rowText.includes('X') || rowText.includes('Χ');
      
      // 1. 아산캠퍼스 출발 시간표
      if (!hasX && departureTime1) {
        currentRoute.timetable.push({
          departureStops: [departureStops[0]],
          departureTime: departureTime1,
          arrivalStop: arrivalStop,
          arrivalTime: arrivalTime,
          note: note
        });
      }
      
      // 2. 천안아산역 출발 시간표
      if (departureTime2) {
        currentRoute.timetable.push({
          departureStops: [departureStops[1]],
          departureTime: departureTime2,
          arrivalStop: arrivalStop,
          arrivalTime: arrivalTime,
          note: note
        });
      }
      
      processedOrders.add(orderNum);
    } else if (timeMatches.length >= 2) {
      // 시간이 2개인 경우
      const departureTime = timeMatches[0];
      const arrivalTime = timeMatches[timeMatches.length - 1];
      
      currentRoute.timetable.push({
        departureStops: departureStops.length > 0 ? [...departureStops] : ['출발지'],
        departureTime: departureTime,
        arrivalStop: arrivalStop,
        arrivalTime: arrivalTime,
        note: note
      });
      
      processedOrders.add(orderNum);
    }
  }
  
  console.log(`파싱 완료: ${currentRoute.timetable.length}개 시간표`);
  console.log(`처리된 순번: ${Array.from(processedOrders).sort((a, b) => a - b).join(', ')}`);
  
  if (currentRoute.timetable.length > 0) {
    routes.push(currentRoute);
  }
  
  return routes;
}

// HTML에서 시간표 파싱
async function parseHtmlSchedule(pageUrl, dayType) {
  try {
    console.log(`HTML 가져오기: ${pageUrl}`);
    const html = await fetchHtml(pageUrl);
    
    console.log('HTML 가져오기 완료');
    console.log(`HTML 길이: ${html.length}자`);
    
    console.log('\nHTML 테이블 파싱 시작...');
    const routes = parseHtmlTable(html, dayType);
    
    return routes;
  } catch (error) {
    console.error('HTML 파싱 실패:', error);
    throw error;
  }
}

module.exports = {
  parseHtmlSchedule,
  fetchHtml,
  parseHtmlTable,
  PAGE_URLS
};


