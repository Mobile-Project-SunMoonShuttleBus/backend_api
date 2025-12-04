const axios = require('axios');
const cheerio = require('cheerio');

const URL = 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx'; // 평일 천안역

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
            console.log(`  컬럼 ${cellIdx}: "${cellText}"`);
          });
        }
      });
      
      if (headerRowIdx < 0) {
        console.log('헤더를 찾을 수 없습니다.');
        return;
      }
      
      // 데이터 행 샘플 분석 (최대 5개)
      console.log('\n데이터 행 샘플 (최대 5개):');
      let sampleCount = 0;
      
      for (let i = headerRowIdx + 1; i < rows.length && sampleCount < 5; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th');
        if (cells.length === 0) continue;
        
        const firstCell = $(cells[0]).text().trim();
        if (!/^[0-9]+$/.test(firstCell)) continue;
        
        sampleCount++;
        console.log(`\n  행 ${i + 1} (순번: ${firstCell}):`);
        
        // 모든 컬럼 출력
        cells.each((cellIdx, cell) => {
          const cellText = $(cell).text().trim();
          if (cellText) {
            console.log(`      [${cellIdx}] "${cellText}"`);
          }
        });
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

