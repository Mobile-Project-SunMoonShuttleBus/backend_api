const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { loginToPortal } = require('./src/services/timetableCrawlerService');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.error('Puppeteer가 설치되지 않았습니다.');
  process.exit(1);
}

const TIMETABLE_URL = 'https://sws.sunmoon.ac.kr/UA/Course/CourseRegisterCal.aspx';

async function debugTimetableHTML() {
  const schoolId = process.env.SCHOOL_ID;
  const schoolPassword = process.env.SCHOOL_PW;

  let password = schoolPassword;
  if (schoolPassword.includes(':') && schoolPassword.split(':').length === 2) {
    const { decrypt } = require('./src/utils/encryption');
    password = decrypt(schoolPassword);
  }

  const { browser, page } = await loginToPortal(schoolId, password);
  
  try {
    await page.goto(TIMETABLE_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const selectElement = await page.$('select[name="ddlorder"]');
    if (selectElement) {
      await selectElement.select('2');
      await new Promise(resolve => setTimeout(resolve, 1000));

      const searchButton = await page.$('#btn_s_search, a[id*="search"], button[id*="search"]');
      if (searchButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          searchButton.click()
        ]);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // 첫 번째 시간표 셀의 HTML 구조 확인
    const firstCellHTML = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;
      
      const rows = Array.from(table.querySelectorAll('tr'));
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (cells.length > 1) {
          const cell = cells[1]; // 월요일 셀
          if (cell && cell.textContent.trim() && cell.textContent.trim() !== '-') {
            return {
              innerHTML: cell.innerHTML,
              textContent: cell.textContent,
              innerText: cell.innerText
            };
          }
        }
      }
      return null;
    });

    console.log('첫 번째 시간표 셀 HTML 구조:');
    console.log(JSON.stringify(firstCellHTML, null, 2));

    await browser.close();
  } catch (error) {
    await browser.close();
    throw error;
  }
}

debugTimetableHTML().catch(console.error);

