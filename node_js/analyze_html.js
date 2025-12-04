const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const URL = 'https://lily.sunmoon.ac.kr/Page2/About/About08_04_02_01_01_01.aspx'; // 평일 아산캠퍼스

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
      const columnMap = {};
      
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
          
          console.log('\n컬럼 맵:', JSON.stringify(columnMap, null, 2));
        }
      });
      
      if (headerRowIdx < 0) {
        console.log('헤더를 찾을 수 없습니다.');
        return;
      }
      
      // 출발지 컬럼 찾기
      const $headerRow = $(rows[headerRowIdx]);
      const headerCells = $headerRow.find('td, th');
      const departureColIndices = {};
      
      headerCells.each((cellIdx, cell) => {
        const cellText = $(cell).text().trim();
        const normalizedCellText = cellText.replace(/\s+/g, '');
        
        if (normalizedCellText.includes('천안아산역')) {
          departureColIndices['천안 아산역'] = cellIdx;
        } else if (normalizedCellText.includes('천안역') && !normalizedCellText.includes('아산역')) {
          departureColIndices['천안역'] = cellIdx;
        } else if ((normalizedCellText.includes('아산캠퍼스') || normalizedCellText.includes('선문대')) && 
                   !normalizedCellText.includes('천안') && 
                   !normalizedCellText.includes('천안아산역')) {
          departureColIndices['아산캠퍼스'] = cellIdx;
        } else if (normalizedCellText.includes('천안터미널') || (normalizedCellText.includes('터미널') && !normalizedCellText.includes('천안역'))) {
          departureColIndices['천안 터미널'] = cellIdx;
        }
      });
      
      console.log('\n출발지 컬럼 인덱스:', JSON.stringify(departureColIndices, null, 2));
      
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
        
        const campusColIdx = departureColIndices['아산캠퍼스'];
        const stationColIdx = departureColIndices['천안 아산역'];
        const arrivalColIdx = columnMap.arrival;
        
        if (campusColIdx !== undefined && campusColIdx < cells.length) {
          const campusCell = cells.eq(campusColIdx);
          const campusTime = campusCell.text().trim();
          console.log(`    아산캠퍼스 컬럼(${campusColIdx}): "${campusTime}"`);
        }
        
        if (stationColIdx !== undefined && stationColIdx < cells.length) {
          const stationCell = cells.eq(stationColIdx);
          const stationTime = stationCell.text().trim();
          console.log(`    천안 아산역 컬럼(${stationColIdx}): "${stationTime}"`);
        }
        
        if (arrivalColIdx !== undefined && arrivalColIdx < cells.length) {
          const arrivalCell = cells.eq(arrivalColIdx);
          const arrivalTime = arrivalCell.text().trim();
          console.log(`    도착 컬럼(${arrivalColIdx}): "${arrivalTime}"`);
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
    });
    
    // HTML 파일로 저장
    fs.writeFileSync('/tmp/analyzed_page.html', html);
    console.log('\n\nHTML 파일 저장: /tmp/analyzed_page.html');
    
  } catch (error) {
    console.error('오류:', error.message);
    if (error.response) {
      console.error('응답 상태:', error.response.status);
    }
  }
}

analyzeHtml();

