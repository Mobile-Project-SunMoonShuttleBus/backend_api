const axios = require('axios');
const cheerio = require('cheerio');
const CommuterBus = require('../models/CommuterBus');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // puppeteer가 설치되지 않은 경우 무시
}

const CRAWL_URL = 'https://lily.sunmoon.ac.kr/Page2/About/SchoolBus.aspx';

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
      
      await page.waitForSelector('table', { timeout: 10000 }).catch(() => {});
      
      const html = await page.evaluate(() => {
        return document.documentElement.outerHTML;
      });
      
      await browser.close();
      return html;
    } catch (error) {
      console.warn(`Puppeteer로 HTML 가져오기 실패 (${url}), axios로 폴백:`, error.message);
    }
  }
  
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

// 시간 추출
function extractTimeValue(text) {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const match = cleaned.match(/(\d{1,2})[:;](\d{2})/);
  if (match) {
    const hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  return null;
}

// 출발지 정규화
function normalizeDeparture(departure) {
  const normalized = {
    '성남 (분당)': '성남(분당)',
    '성남(분당)': '성남(분당)',
    '성남': '성남(분당)',
    '인천': '인천',
    '수원': '수원',
    '서울(경부)': '서울(경부)',
    '서울 경부': '서울(경부)',
    '서울': '서울(경부)',
    '선문대': '아산캠퍼스',
    '선문대학교': '아산캠퍼스',
    '아산캠퍼스': '아산캠퍼스'
  };
  return normalized[departure] || departure;
}

// 통학버스 시간표 파싱
function parseCommuterBusTable(html) {
  const schedules = [];
  const $ = cheerio.load(html);
  
  // 등교 통학버스 테이블 찾기 (출발지 | 출발장소 | 월~목요일 | 금요일 | 비고)
  $('table').each((tableIdx, table) => {
    const $table = $(table);
    const rows = $table.find('tr').toArray();
    
    if (rows.length < 2) return;
    
    // 헤더 확인
    const headerRow = $(rows[0]);
    const headerCells = headerRow.find('th, td').toArray();
    const headerTexts = headerCells.map(cell => $(cell).text().trim());
    
    // 등교 통학버스 테이블인지 확인 (출발지, 출발장소, 월~목요일, 금요일, 비고)
    const isToSchoolTable = headerTexts.some(text => 
      text.includes('출발지') && 
      headerTexts.some(t => t.includes('월~목') || t.includes('금요일'))
    );
    
    if (isToSchoolTable) {
      // 등교 통학버스 파싱
      for (let i = 1; i < rows.length; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th').toArray();
        
        if (cells.length < 5) continue;
        
        const departure = normalizeDeparture($(cells[0]).text().trim());
        if (!departure || departure === '') continue;
        
        // 셀 구조: [0] 출발지, [1] 빈 셀, [2] 출발장소, [3] 월~목요일, [4] 금요일, [5] 비고
        const departurePlace = cells.length > 2 ? $(cells[2]).text().trim() : '';
        const weekdayTime = cells.length > 3 ? extractTimeValue($(cells[3]).text()) : null;
        const fridayTime = cells.length > 4 ? extractTimeValue($(cells[4]).text()) : null;
        const note = cells.length > 5 ? $(cells[5]).text().trim() : '';
        
        // 경유지 추출 (출발장소에서)
        const viaStops = [];
        if (departurePlace) {
          // 출발장소 텍스트에서 정류장 이름 추출
          const places = departurePlace.split(/[→\n]/).map(p => p.trim()).filter(Boolean);
          places.forEach((place, idx) => {
            if (idx > 0 && place) {
              viaStops.push({
                name: place,
                time: null,
                source: 'table'
              });
            }
          });
        }
        
        // 월~목요일 시간표
        if (weekdayTime) {
          schedules.push({
            departure,
            arrival: '아산캠퍼스',
            departureTime: weekdayTime,
            arrivalTime: null,
            direction: '등교',
            dayType: '월~목',
            viaStops: [...viaStops],
            note,
            sourceUrl: CRAWL_URL
          });
        }
        
        // 금요일 시간표
        if (fridayTime) {
          schedules.push({
            departure,
            arrival: '아산캠퍼스',
            departureTime: fridayTime,
            arrivalTime: null,
            direction: '등교',
            dayType: '금요일',
            viaStops: [...viaStops],
            note,
            sourceUrl: CRAWL_URL
          });
        }
      }
    }
    
    // 하교 통학버스 테이블 찾기 (성남(분당), 죽전, 신갈 (간이정류장) ,안산 | 월~목 | 금요일 | 비고)
    const isFromSchoolTable = headerTexts.some(text => 
      text.includes('성남') || text.includes('안산')
    ) && headerTexts.some(text => text.includes('월~목') || text.includes('금요일'));
    
    if (isFromSchoolTable) {
      // 하교 통학버스 파싱
      const departure = '아산캠퍼스';
      const arrivalText = headerTexts[0] || '';
      // 도착지 추출: "성남(분당), 죽전, 신갈 (간이정류장) ,안산" -> ["성남(분당)", "죽전", "신갈", "안산"]
      const arrivals = arrivalText
        .split(',')
        .map(a => a.trim().replace(/\s*\([^)]*\)\s*/g, '').trim())
        .filter(a => a && !a.includes('간이정류장'));
      
      for (let i = 1; i < rows.length; i++) {
        const $row = $(rows[i]);
        const cells = $row.find('td, th').toArray();
        
        if (cells.length < 2) continue;
        
        const weekdayTime = extractTimeValue($(cells[0]).text());
        const fridayTime = extractTimeValue($(cells[1]).text());
        const note = cells.length > 2 ? $(cells[2]).text().trim() : '';
        
        // 각 도착지별로 시간표 생성
        arrivals.forEach(arrival => {
          const normalizedArrival = normalizeDeparture(arrival);
          if (!normalizedArrival) return;
          
          if (weekdayTime) {
            schedules.push({
              departure,
              arrival: normalizedArrival,
              departureTime: weekdayTime,
              arrivalTime: null,
              direction: '하교',
              dayType: '월~목',
              viaStops: [],
              note,
              sourceUrl: CRAWL_URL
            });
          }
          
          if (fridayTime) {
            schedules.push({
              departure,
              arrival: normalizedArrival,
              departureTime: fridayTime,
              arrivalTime: null,
              direction: '하교',
              dayType: '금요일',
              viaStops: [],
              note,
              sourceUrl: CRAWL_URL
            });
          }
        });
      }
    }
  });
  
  return schedules;
}

// 크롤링 및 저장
async function crawlAndSave() {
  try {
    console.log('통학버스 크롤링 시작...');
    const html = await fetchHtml(CRAWL_URL);
    const schedules = parseCommuterBusTable(html);
    
    console.log(`파싱된 시간표: ${schedules.length}개`);
    
    let saved = 0;
    let updated = 0;
    
    for (const schedule of schedules) {
      const existing = await CommuterBus.findOne({
        departure: schedule.departure,
        arrival: schedule.arrival,
        departureTime: schedule.departureTime,
        direction: schedule.direction,
        dayType: schedule.dayType
      });
      
      if (existing) {
        await CommuterBus.findOneAndUpdate(
          { _id: existing._id },
          {
            ...schedule,
            crawledAt: new Date()
          }
        );
        updated++;
      } else {
        await CommuterBus.create({
          ...schedule,
          crawledAt: new Date()
        });
        saved++;
      }
    }
    
    return {
      success: true,
      schedulesFound: schedules.length,
      saved,
      updated
    };
  } catch (error) {
    console.error('통학버스 크롤링 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  crawlAndSave,
  parseCommuterBusTable,
  fetchHtml
};

