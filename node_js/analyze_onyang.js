const axios = require('axios');
const cheerio = require('cheerio');

const URL = 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_03.aspx'; // 평일 온양역/아산터미널

async function analyzeHtml() {
  try {
    console.log(`HTML 가져오기: ${URL}\n`);
    
    const response = await axios.get(URL, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    console.log('=== 테이블 분석 ===\n');
    
    $('table').each((tableIdx, table) => {
      const $table = $(table);
      const tableText = $table.text();
      
      if (!tableText.includes('순') && !tableText.match(/\d{1,2}:\d{2}/)) {
        return;
      }
      
      console.log(`\n테이블 ${tableIdx + 1}:`);
      console.log('─'.repeat(80));
      
      const rows = $table.find('tr');
      let headerRowIdx = -1;
      const departureColIndices = {};
      
      // 헤더 찾기
      rows.each((rowIdx, row) => {
        const $row = $(row);
        const cells = $row.find('td, th');
        const rowText = $row.text().trim();
        
        if (rowText.includes('순') && (rowText.includes('출발') || rowText.includes('도착') || 
            rowText.match(/\d{1,2}:\d{2}/) || rowText.includes('시간'))) {
          headerRowIdx = rowIdx;
          
          console.log(`\n헤더 행 (${rowIdx + 1}번째):`);
          cells.each((cellIdx, cell) => {
            const cellText = $(cell).text().trim();
            const normalizedCellText = cellText.replace(/\s+/g, '');
            console.log(`  컬럼 ${cellIdx}: "${cellText}"`);
            
            if (normalizedCellText.includes('아산캠퍼스') && normalizedCellText.includes('출발')) {
              departureColIndices['아산캠퍼스'] = cellIdx;
            } else if (normalizedCellText.includes('터미널') || normalizedCellText.includes('온양역')) {
              departureColIndices['천안 터미널'] = cellIdx; // 온양역/아산터미널 페이지에서도 천안 터미널로 처리
            } else if (normalizedCellText.includes('아산캠퍼스') && normalizedCellText.includes('도착')) {
              departureColIndices['아산캠퍼스_도착'] = cellIdx;
            }
          });
        }
      });
      
      if (headerRowIdx < 0) {
        console.log('헤더를 찾을 수 없습니다.');
        return;
      }
      
      console.log('\n컬럼 인덱스:', JSON.stringify(departureColIndices, null, 2));
      
      // 19:05 시간대 데이터 찾기
      console.log('\n19:05 시간대 데이터:');
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th');
        if (cells.length === 0) continue;
        
        const firstCell = $(cells[0]).text().trim();
        if (!/^[0-9]+$/.test(firstCell)) continue;
        
        const terminalColIdx = departureColIndices['천안 터미널'];
        const asanArrivalColIdx = departureColIndices['아산캠퍼스_도착'];
        
        if (terminalColIdx !== undefined && terminalColIdx < cells.length) {
          const terminalTime = $(cells[terminalColIdx]).text().trim();
          if (terminalTime.includes('19:05') || terminalTime === '19:05') {
            console.log(`\n  행 ${i + 1} (순번: ${firstCell}):`);
            console.log(`    천안 터미널 출발: "${terminalTime}"`);
            
            if (asanArrivalColIdx !== undefined && asanArrivalColIdx < cells.length) {
              const arrivalTime = $(cells[asanArrivalColIdx]).text().trim();
              console.log(`    아산캠퍼스 도착: "${arrivalTime}"`);
            } else {
              console.log(`    아산캠퍼스 도착 컬럼 없음 (인덱스: ${asanArrivalColIdx})`);
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
    if (error.response) {
      console.error('응답 상태:', error.response.status);
    }
  }
}

analyzeHtml();

