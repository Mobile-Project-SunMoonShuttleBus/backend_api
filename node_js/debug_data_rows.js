const axios = require('axios');
const cheerio = require('cheerio');

const URLS = {
  cheonan: 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx', // 평일 천안역
  terminal: 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_02.aspx' // 평일 천안 터미널
};

async function analyzeDataRows(url, pageName) {
  try {
    console.log(`\n=== ${pageName} 페이지 데이터 행 분석 ===\n`);
    
    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    $('table').each((tableIdx, table) => {
      const $table = $(table);
      const tableText = $table.text();
      
      if (!tableText.includes('순') && !tableText.match(/\d{1,2}:\d{2}/)) {
        return;
      }
      
      const rows = $table.find('tr');
      let headerRowIdx = -1;
      const columnMap = {};
      const departureColIndices = {};
      
      // 헤더 찾기
      rows.each((rowIdx, row) => {
        const $row = $(row);
        const cells = $row.find('td, th');
        const rowText = $row.text().trim();
        
        if (rowText.includes('순') && (rowText.includes('출발') || rowText.includes('도착') || 
            rowText.match(/\d{1,2}:\d{2}/) || rowText.includes('시간'))) {
          headerRowIdx = rowIdx;
          
          cells.each((cellIdx, cell) => {
            const cellText = $(cell).text().trim();
            const normalizedCellText = cellText.replace(/\s+/g, '');
            
            if (cellText.includes('순') || cellText === '순번') {
              columnMap.order = cellIdx;
            } else if (cellText.includes('출발') || cellText.includes('출발지')) {
              columnMap.departure = cellIdx;
            } else if (cellText.includes('도착') || cellText.includes('도착지')) {
              columnMap.arrival = cellIdx;
            } else if (cellText.includes('비고') || cellText.includes('특이사항') || 
                       cellText.includes('운행') || cellText.includes('금')) {
              columnMap.note = cellIdx;
            }
            
            const hasDepartureKeyword = normalizedCellText.includes('출발');
            const hasArrivalKeyword = normalizedCellText.includes('도착');
            const isArrivalColumn = hasArrivalKeyword && !hasDepartureKeyword;
            
            if (isArrivalColumn) {
              if (normalizedCellText.includes('아산캠퍼스') || normalizedCellText.includes('선문대')) {
                departureColIndices['아산캠퍼스_도착'] = cellIdx;
              }
            }
          });
        }
      });
      
      console.log(`columnMap.arrival: ${columnMap.arrival}`);
      console.log(`departureColIndices['아산캠퍼스_도착']: ${departureColIndices['아산캠퍼스_도착']}\n`);
      
      // 여러 데이터 행 확인 (천안역 출발 시간이 있는 행)
      console.log(`데이터 행 확인 (천안역 출발 시간이 있는 행):`);
      let count = 0;
      for (let i = headerRowIdx + 1; i < rows.length && count < 5; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th');
        if (cells.length === 0) continue;
        
        const firstCell = $(cells[0]).text().trim();
        if (!/^[0-9]+$/.test(firstCell)) continue;
        
        // 천안역 출발 컬럼 확인 (컬럼 2)
        const cheonanColIdx = 2;
        if (cheonanColIdx < cells.length) {
          const cheonanTime = $(cells[cheonanColIdx]).text().trim();
          if (cheonanTime && cheonanTime.match(/\d{1,2}:\d{2}/)) {
            count++;
            console.log(`\n  행 ${i + 1} (순번: ${firstCell}):`);
            console.log(`    천안역 출발: "${cheonanTime}"`);
            console.log(`    전체 셀 개수: ${cells.length}`);
            
            // 도착 컬럼 확인
            if (columnMap.arrival !== undefined && columnMap.arrival < cells.length) {
              const arrivalTime = $(cells[columnMap.arrival]).text().trim();
              console.log(`    columnMap.arrival[${columnMap.arrival}] 도착시간: "${arrivalTime}"`);
            } else {
              console.log(`    columnMap.arrival[${columnMap.arrival}] 셀이 없음 (cells.length: ${cells.length})`);
            }
            
            if (departureColIndices['아산캠퍼스_도착'] !== undefined && departureColIndices['아산캠퍼스_도착'] < cells.length) {
              const arrivalTime = $(cells[departureColIndices['아산캠퍼스_도착']]).text().trim();
              console.log(`    departureColIndices['아산캠퍼스_도착'][${departureColIndices['아산캠퍼스_도착']}] 도착시간: "${arrivalTime}"`);
            } else {
              console.log(`    departureColIndices['아산캠퍼스_도착'][${departureColIndices['아산캠퍼스_도착']}] 셀이 없음 (cells.length: ${cells.length})`);
            }
            
            // 모든 컬럼 출력
            console.log(`    전체 컬럼:`);
            cells.each((cellIdx, cell) => {
              const cellText = $(cell).text().trim();
              if (cellText) {
                console.log(`      [${cellIdx}] "${cellText}"`);
              }
            });
          }
        }
      }
    });
    
  } catch (error) {
    console.error('오류:', error.message);
  }
}

async function main() {
  await analyzeDataRows(URLS.cheonan, '천안역');
  await analyzeDataRows(URLS.terminal, '천안 터미널');
}

main();

