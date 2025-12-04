const axios = require('axios');
const cheerio = require('cheerio');

const URL = 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx'; // 평일 천안역

async function debugYongam() {
  try {
    const response = await axios.get(URL, {
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
            
            // departureColIndices 설정 시뮬레이션
            if (normalizedCellText.includes('용암마을')) {
              departureColIndices['용암마을'] = cellIdx;
              console.log(`용암마을 컬럼 인덱스: ${cellIdx}`);
            }
          });
        }
      });
      
      // 천안역 출발 시간이 있는 행에서 "용암마을" 컬럼 확인
      console.log('\n천안역 출발 시간이 있는 행에서 "용암마을" 컬럼 확인:');
      let count = 0;
      for (let i = headerRowIdx + 1; i < rows.length && count < 5; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th');
        if (cells.length === 0) continue;
        
        const firstCell = $(cells[0]).text().trim();
        if (!/^[0-9]+$/.test(firstCell)) continue;
        
        const cheonanColIdx = 2; // 천안역 출발 컬럼
        if (cheonanColIdx < cells.length) {
          const cheonanTime = $(cells[cheonanColIdx]).text().trim();
          if (cheonanTime && cheonanTime.match(/\d{1,2}:\d{2}/)) {
            count++;
            console.log(`\n  행 ${i + 1} (순번: ${firstCell}):`);
            console.log(`    천안역 출발: "${cheonanTime}"`);
            
            if (departureColIndices['용암마을'] !== undefined) {
              const yongamIdx = departureColIndices['용암마을'];
              if (yongamIdx < cells.length) {
                const yongamTime = $(cells[yongamIdx]).text().trim();
                console.log(`    용암마을[${yongamIdx}] 도착시간: "${yongamTime}"`);
              } else {
                console.log(`    용암마을[${yongamIdx}] 셀이 없음 (cells.length: ${cells.length})`);
              }
            } else {
              console.log(`    용암마을 컬럼을 찾을 수 없음`);
            }
          }
        }
      }
    });
    
  } catch (error) {
    console.error('오류:', error.message);
  }
}

debugYongam();

