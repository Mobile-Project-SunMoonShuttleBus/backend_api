const axios = require('axios');
const cheerio = require('cheerio');

const URLS = {
  cheonan: 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx', // 평일 천안역
  terminal: 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_02.aspx' // 평일 천안 터미널
};

async function analyzeColumnMap(url, pageName) {
  try {
    console.log(`\n=== ${pageName} 페이지 분석 ===\n`);
    
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
          
          console.log(`헤더 행:`);
          cells.each((cellIdx, cell) => {
            const cellText = $(cell).text().trim();
            const normalizedCellText = cellText.replace(/\s+/g, '');
            
            console.log(`  컬럼 ${cellIdx}: "${cellText}"`);
            
            // columnMap 설정 시뮬레이션
            if (cellText.includes('순') || cellText === '순번') {
              columnMap.order = cellIdx;
            } else if (cellText.includes('출발') || cellText.includes('출발지')) {
              columnMap.departure = cellIdx;
            } else if (cellText.includes('도착') || cellText.includes('도착지')) {
              columnMap.arrival = cellIdx;
              console.log(`    -> columnMap.arrival = ${cellIdx}`);
            } else if (cellText.includes('비고') || cellText.includes('특이사항') || 
                       cellText.includes('운행') || cellText.includes('금')) {
              columnMap.note = cellIdx;
            }
            
            // departureColIndices 설정 시뮬레이션
            const hasDepartureKeyword = normalizedCellText.includes('출발');
            const hasArrivalKeyword = normalizedCellText.includes('도착');
            const isArrivalColumn = hasArrivalKeyword && !hasDepartureKeyword;
            
            if (isArrivalColumn) {
              if (normalizedCellText.includes('아산캠퍼스') || normalizedCellText.includes('선문대')) {
                departureColIndices['아산캠퍼스_도착'] = cellIdx;
                console.log(`    -> departureColIndices['아산캠퍼스_도착'] = ${cellIdx}`);
              }
            }
          });
        }
      });
      
      console.log(`\ncolumnMap:`, columnMap);
      console.log(`departureColIndices['아산캠퍼스_도착']:`, departureColIndices['아산캠퍼스_도착']);
      
      // 샘플 데이터 행 확인
      if (headerRowIdx >= 0) {
        console.log(`\n샘플 데이터 행 (첫 번째):`);
        const $row = $(rows[headerRowIdx + 1]);
        const cells = $row.find('td, th');
        if (cells.length > 0) {
          const firstCell = $(cells[0]).text().trim();
          if (/^[0-9]+$/.test(firstCell)) {
            cells.each((cellIdx, cell) => {
              const cellText = $(cell).text().trim();
              if (cellText) {
                console.log(`  [${cellIdx}] "${cellText}"`);
                if (columnMap.arrival === cellIdx) {
                  console.log(`    -> 이게 columnMap.arrival입니다!`);
                }
                if (departureColIndices['아산캠퍼스_도착'] === cellIdx) {
                  console.log(`    -> 이게 departureColIndices['아산캠퍼스_도착']입니다!`);
                }
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
  await analyzeColumnMap(URLS.cheonan, '천안역');
  await analyzeColumnMap(URLS.terminal, '천안 터미널');
}

main();

