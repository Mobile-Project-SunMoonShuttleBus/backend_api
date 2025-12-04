const axios = require('axios');
const cheerio = require('cheerio');

const URL = 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_02.aspx'; // 평일 천안역

function extractTimeValue(text) {
  if (!text) return null;
  const match = text.match(/(\d{1,2})[:;](\d{2})/);
  if (!match) return null;
  const hour = match[1].padStart(2, '0');
  const minute = match[2];
  return `${hour}:${minute}`;
}

function isArrivalColumn(key) {
  return key && (key.includes('_도착') || key.endsWith('_도착'));
}

async function testParsing() {
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
            
            // departureColIndices 설정
            if (normalizedCellText.includes('천안역') && !normalizedCellText.includes('아산역')) {
              departureColIndices['천안역'] = cellIdx;
            } else if (normalizedCellText.includes('아산캠퍼스') && normalizedCellText.includes('출발')) {
              departureColIndices['아산캠퍼스'] = cellIdx;
            } else if (normalizedCellText.includes('용암마을')) {
              departureColIndices['용암마을'] = cellIdx;
            }
            
            const hasArrivalKeyword = normalizedCellText.includes('도착');
            const hasDepartureKeyword = normalizedCellText.includes('출발');
            const isArrivalCol = hasArrivalKeyword && !hasDepartureKeyword;
            
            if (isArrivalCol && normalizedCellText.includes('아산캠퍼스')) {
              departureColIndices['아산캠퍼스_도착'] = cellIdx;
            }
          });
        }
      });
      
      console.log('departureColIndices:', JSON.stringify(departureColIndices, null, 2));
      
      const intermediateEntries = Object.entries(departureColIndices).filter(([stopName, idx]) => {
        if (stopName === '천안역' || stopName === '아산캠퍼스') return false;
        if (isArrivalColumn(stopName)) return false;
        return idx !== undefined;
      });
      
      console.log('intermediateEntries:', JSON.stringify(intermediateEntries, null, 2));
      
      // 천안역 출발 시간이 있는 행 확인
      const cheonanColIdx = departureColIndices['천안역'];
      console.log(`\n천안역 컬럼 인덱스: ${cheonanColIdx}`);
      
      for (let i = headerRowIdx + 1; i < rows.length && i < headerRowIdx + 3; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th');
        if (cells.length === 0) continue;
        
        const firstCell = $(cells[0]).text().trim();
        if (!/^[0-9]+$/.test(firstCell)) continue;
        
        if (cheonanColIdx !== undefined && cheonanColIdx < cells.length) {
          const cheonanTime = extractTimeValue($(cells[cheonanColIdx]).text());
          if (cheonanTime) {
            console.log(`\n행 ${i + 1}: 천안역 출발 ${cheonanTime}`);
            
            // intermediateEntries에서 "용암마을" 찾기
            let found = false;
            for (const [stopName, idx] of intermediateEntries) {
              if (stopName === '용암마을' && idx !== undefined && idx < cells.length) {
                const yongamTime = extractTimeValue($(cells[idx]).text());
                console.log(`  intermediateEntries에서 찾음: 용암마을[${idx}] = ${yongamTime}`);
                found = true;
                break;
              }
            }
            
            // departureColIndices에서 직접 찾기
            if (!found && departureColIndices['용암마을'] !== undefined) {
              const yongamIdx = departureColIndices['용암마을'];
              if (yongamIdx < cells.length) {
                const yongamTime = extractTimeValue($(cells[yongamIdx]).text());
                console.log(`  departureColIndices에서 찾음: 용암마을[${yongamIdx}] = ${yongamTime}`);
              }
            }
          }
        }
      }
    });
    
  } catch (error) {
    console.error('오류:', error.message);
  }
}

testParsing();

