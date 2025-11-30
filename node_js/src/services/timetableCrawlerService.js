const SchoolAccount = require('../models/SchoolAccount');
const Timetable = require('../models/Timetable');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('Puppeteer가 설치되지 않았습니다. 시간표 크롤링을 사용할 수 없습니다.');
}

const LOGIN_URL = 'https://sws.sunmoon.ac.kr/Login.aspx';
const TIMETABLE_URL = 'https://sws.sunmoon.ac.kr/UA/Course/CourseRegisterCal.aspx';

// 현재 날짜 기준으로 년도와 학기를 결정하는 함수
function getCurrentYearAndSemester() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  
  let semester;
  let targetYear = year;
  
  // 학기 결정 로직
  if (month >= 1 && month <= 2) {
    // 1월, 2월: 겨울학기 (전년도 기준)
    semester = '겨울학기';
    targetYear = year - 1;
  } else if (month >= 3 && month <= 6) {
    // 3월 ~ 6월: 1학기
    semester = '1학기';
  } else if (month >= 7 && month <= 8) {
    // 7월 ~ 8월: 여름학기
    semester = '여름학기';
  } else {
    // 9월 ~ 12월: 2학기
    semester = '2학기';
  }
  
  return {
    year: targetYear,
    semester: semester
  };
}

async function loginToPortal(schoolId, schoolPassword) {
  if (!puppeteer) {
    throw new Error('Puppeteer가 설치되지 않았습니다.');
  }

  console.log('학교 포털 로그인 시작...');
  
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=IsolateOrigins,site-per-process'
    ],
    ignoreHTTPSErrors: true,
    timeout: 60000
  };
  
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    
    console.log(`로그인 페이지 접속: ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const idInputSelector = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
      if (inputs.length === 0) return null;
      
      const targetInput = inputs.find(input => {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        return name.includes('id') || name.includes('user') || id.includes('id') || id.includes('user');
      }) || inputs[0];
      
      if (targetInput) {
        if (targetInput.id) return `#${targetInput.id}`;
        if (targetInput.name) return `input[name="${targetInput.name}"]`;
        return 'input[type="text"]';
      }
      return null;
    });

    const idInput = idInputSelector ? await page.$(idInputSelector) : await page.$('input[type="text"]');
    const passwordInput = await page.$('input[type="password"]');
    
    if (!idInput || !passwordInput) {
      const pageContent = await page.content();
      const inputInfo = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(input => ({
          type: input.type,
          name: input.name,
          id: input.id,
          placeholder: input.placeholder
        }));
      });
      console.error('입력 필드 정보:', JSON.stringify(inputInfo, null, 2));
      throw new Error(`로그인 입력 필드를 찾을 수 없습니다. 페이지 HTML 일부: ${pageContent.substring(0, 500)}`);
    }

    console.log('ID/PW 입력 중...');
    await idInput.click({ clickCount: 3 });
    await idInput.type(schoolId, { delay: 100 });
    await passwordInput.click({ clickCount: 3 });
    await passwordInput.type(schoolPassword, { delay: 100 });

    await new Promise(resolve => setTimeout(resolve, 500));

    let loginButton = await page.$('input[type="submit"]');
    if (!loginButton) {
      loginButton = await page.$('button[type="submit"]');
    }
    if (!loginButton) {
      const buttons = await page.$$('input, button');
      for (const btn of buttons) {
        const value = await btn.evaluate(el => el.value || el.textContent || '');
        if (value.includes('로그인')) {
          loginButton = btn;
          break;
        }
      }
    }
    
    if (loginButton) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
        loginButton.click()
      ]);
    } else {
      await passwordInput.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    const currentUrl = page.url();
    console.log(`로그인 후 URL: ${currentUrl}`);

    if (currentUrl.includes('Login.aspx') || currentUrl.includes('login')) {
      const errorText = await page.evaluate(() => {
        return document.body.innerText;
      });
      const errorMessage = errorText.substring(0, 200);
      console.error('로그인 실패:', errorMessage);
      throw new Error(`로그인 실패: ${errorMessage}`);
    }

    console.log('로그인 성공!');
    return { browser, page };
  } catch (error) {
    console.error('로그인 오류:', error.message);
    await browser.close();
    throw error;
  }
}

async function crawlTimetable(page) {
  try {
    console.log(`시간표 페이지 접속: ${TIMETABLE_URL}`);
    await page.goto(TIMETABLE_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const currentUrl = page.url();
    console.log(`시간표 페이지 URL: ${currentUrl}`);
    
    if (currentUrl.includes('SessionExpire') || currentUrl.includes('Login.aspx') || currentUrl.includes('login')) {
      const pageText = await page.evaluate(() => document.body.innerText);
      throw new Error(`로그인이 필요합니다. 페이지가 로그인 페이지로 리다이렉트되었습니다: ${pageText.substring(0, 100)}`);
    }

    // 현재 날짜 기준으로 년도와 학기 결정
    const { year, semester } = getCurrentYearAndSemester();
    console.log(`현재 날짜 기준 선택: ${year}년 ${semester}`);

    // 년도 select 찾기 (label 텍스트로 찾기)
    const yearSelectInfo = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const yearLabel = labels.find(label => label.textContent.trim() === '년도');
      
      if (!yearLabel) return null;
      
      // label의 for 속성으로 연결된 select 찾기
      const forAttr = yearLabel.getAttribute('for');
      if (forAttr) {
        const select = document.querySelector(`select#${forAttr}, select[name="${forAttr}"]`);
        if (select) {
          return {
            selector: `select#${forAttr}, select[name="${forAttr}"]`,
            found: true
          };
        }
      }
      
      // label의 부모 요소에서 select 찾기
      const parent = yearLabel.parentElement;
      if (parent) {
        const select = parent.querySelector('select');
        if (select) {
          return {
            selector: null,
            found: true,
            name: select.name,
            id: select.id
          };
        }
      }
      
      // label 다음 형제 요소에서 select 찾기
      let element = yearLabel.nextElementSibling;
      while (element) {
        if (element.tagName === 'SELECT') {
          return {
            selector: null,
            found: true,
            name: element.name,
            id: element.id
          };
        }
        element = element.nextElementSibling;
      }
      
      return null;
    });
    
    let yearSelect = null;
    if (yearSelectInfo && yearSelectInfo.found) {
      if (yearSelectInfo.selector) {
        yearSelect = await page.$(yearSelectInfo.selector);
      } else if (yearSelectInfo.id) {
        yearSelect = await page.$(`select#${yearSelectInfo.id}`);
      } else if (yearSelectInfo.name) {
        yearSelect = await page.$(`select[name="${yearSelectInfo.name}"]`);
      }
    }
    
    // 년도 select를 찾지 못한 경우 일반적인 패턴 시도
    if (!yearSelect) {
      const yearSelectors = [
        'select[name="ddlyear"]',
        'select[name="ddlYear"]',
        'select[id="ddlyear"]',
        'select[id="ddlYear"]',
        'select[name*="year"]',
        'select[id*="year"]'
      ];
      for (const selector of yearSelectors) {
        yearSelect = await page.$(selector);
        if (yearSelect) break;
      }
    }

    if (yearSelect) {
      const yearOptions = await page.evaluate((select) => {
        return Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.text.trim()
        }));
      }, yearSelect);
      
      const yearOption = yearOptions.find(opt => 
        opt.text.includes(year.toString()) || 
        opt.value === year.toString() ||
        opt.value === (year % 100).toString()
      );
      
      if (yearOption) {
        await yearSelect.select(yearOption.value);
        console.log(`년도 선택: ${yearOption.text} (value: ${yearOption.value})`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.warn(`년도 ${year}를 찾을 수 없습니다. 사용 가능한 옵션:`, yearOptions.map(o => `${o.text}(${o.value})`));
      }
    } else {
      console.warn('년도 선택 드롭다운을 찾을 수 없습니다.');
    }

    // 학기 select 찾기 (label 텍스트로 찾기)
    const semesterSelectInfo = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      const semesterLabel = labels.find(label => label.textContent.trim() === '학기');
      
      if (!semesterLabel) return null;
      
      // label의 for 속성으로 연결된 select 찾기
      const forAttr = semesterLabel.getAttribute('for');
      if (forAttr) {
        const select = document.querySelector(`select#${forAttr}, select[name="${forAttr}"]`);
        if (select) {
          return {
            selector: `select#${forAttr}, select[name="${forAttr}"]`,
            found: true
          };
        }
      }
      
      // label의 부모 요소에서 select 찾기
      const parent = semesterLabel.parentElement;
      if (parent) {
        const select = parent.querySelector('select');
        if (select) {
          return {
            selector: null,
            found: true,
            name: select.name,
            id: select.id
          };
        }
      }
      
      // label 다음 형제 요소에서 select 찾기
      let element = semesterLabel.nextElementSibling;
      while (element) {
        if (element.tagName === 'SELECT') {
          return {
            selector: null,
            found: true,
            name: element.name,
            id: element.id
          };
        }
        element = element.nextElementSibling;
      }
      
      return null;
    });
    
    let semesterSelect = null;
    if (semesterSelectInfo && semesterSelectInfo.found) {
      if (semesterSelectInfo.selector) {
        semesterSelect = await page.$(semesterSelectInfo.selector);
      } else if (semesterSelectInfo.id) {
        semesterSelect = await page.$(`select#${semesterSelectInfo.id}`);
      } else if (semesterSelectInfo.name) {
        semesterSelect = await page.$(`select[name="${semesterSelectInfo.name}"]`);
      }
    }
    
    // 학기 select를 찾지 못한 경우 일반적인 패턴 시도
    if (!semesterSelect) {
      const semesterSelectors = [
        'select[name="ddlsemester"]',
        'select[name="ddlSemester"]',
        'select[id="ddlsemester"]',
        'select[id="ddlSemester"]',
        'select[name*="semester"]',
        'select[id*="semester"]'
      ];
      for (const selector of semesterSelectors) {
        semesterSelect = await page.$(selector);
        if (semesterSelect) break;
      }
    }

    if (semesterSelect) {
      const semesterOptions = await page.evaluate((select) => {
        return Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.text.trim()
        }));
      }, semesterSelect);
      
      const semesterOption = semesterOptions.find(opt => {
        const optText = opt.text.toLowerCase();
        const optValue = opt.value.toLowerCase();
        
        if (semester === '1학기') {
          return (optText.includes('1') && !optText.includes('여름') && !optText.includes('겨울') && !optText.includes('2')) || optValue === '1';
        } else if (semester === '여름학기') {
          return optText.includes('여름') || optText.includes('summer') || optValue === 's' || optValue === 'summer';
        } else if (semester === '2학기') {
          return (optText.includes('2') && !optText.includes('겨울')) || optValue === '2';
        } else if (semester === '겨울학기') {
          return optText.includes('겨울') || optText.includes('winter') || optValue === 'w' || optValue === 'winter';
        }
        return false;
      });
      
      if (semesterOption) {
        await semesterSelect.select(semesterOption.value);
        console.log(`학기 선택: ${semesterOption.text} (value: ${semesterOption.value})`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.warn(`학기 ${semester}를 찾을 수 없습니다. 사용 가능한 옵션:`, semesterOptions.map(o => `${o.text}(${o.value})`));
      }
    } else {
      console.warn('학기 선택 드롭다운을 찾을 수 없습니다.');
    }

    // 수강신청 선택 (고정값)
    const selectElement = await page.$('select[name="ddlorder"]');
    if (!selectElement) {
      throw new Error('수강신청 선택 드롭다운을 찾을 수 없습니다.');
    }

    await selectElement.select('2');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const searchButton = await page.$('#btn_s_search, a[id*="search"], button[id*="search"]');
    if (!searchButton) {
      throw new Error('조회 버튼을 찾을 수 없습니다.');
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      searchButton.click()
    ]);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const timetableData = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) {
        return null;
      }

      const rows = Array.from(table.querySelectorAll('tr'));
      const timetable = [];

      const dayHeaders = [];
      const firstRow = rows[0];
      if (firstRow) {
        const headers = Array.from(firstRow.querySelectorAll('th, td'));
        headers.forEach((header, index) => {
          const text = header.textContent.trim();
          if (['월', '화', '수', '목', '금', '토', '일'].includes(text)) {
            dayHeaders.push({ day: text, index });
          }
        });
      }

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = Array.from(row.querySelectorAll('td, th'));
        
        if (cells.length === 0) continue;

        const periodInfo = cells[0]?.textContent.trim();
        if (!periodInfo || !periodInfo.includes('교시')) continue;

        const timeMatch = periodInfo.match(/(\d+):(\d+)[~-](\d+):(\d+)/);
        if (!timeMatch) continue;

        const startTime = `${timeMatch[1]}:${timeMatch[2]}`;
        const endTime = `${timeMatch[3]}:${timeMatch[4]}`;

        dayHeaders.forEach(({ day, index }) => {
          const cell = cells[index];
          if (!cell) return;

          const cellText = cell.textContent.trim();
          if (!cellText || cellText === '-' || cellText === '') return;

          const paragraphs = Array.from(cell.querySelectorAll('p')).map(p => p.textContent.trim());
          const firstText = cell.childNodes[0]?.textContent?.trim() || '';
          
          let subjectName = '';
          let location = '';
          let professor = '';
          
          if (firstText) {
            subjectName = firstText;
          }
          
          paragraphs.forEach((para, idx) => {
            if (!para) return;
            
            if (/\d+반/.test(para)) {
              if (subjectName && !subjectName.includes(para)) {
                subjectName += ' ' + para;
              } else if (!subjectName) {
                subjectName = para;
              }
            }
            else if (para.includes('인문') || para.includes('공학') || para.includes('예술')) {
              location = para;
            }
            else if (/^[가-힣]{2,4}$/.test(para) && !para.includes('반')) {
              professor = para;
            }
            else if (/^\d+$/.test(para)) {
              if (location) {
                location += ' ' + para;
              } else {
                location = para;
              }
            }
          });
          
          if (paragraphs.length === 0 && firstText) {
            const parts = cellText.split(/\s+/).filter(p => p);
            if (parts.length > 0) {
              subjectName = parts[0];
              
              for (let j = 1; j < parts.length; j++) {
                const part = parts[j];
                if (/\d+반/.test(part)) {
                  subjectName += ' ' + part;
                } else if (part.includes('인문') || part.includes('공학') || part.includes('예술')) {
                  location = part;
                } else if (/^[가-힣]{2,4}$/.test(part) && !part.includes('반')) {
                  professor = part;
                } else if (/^\d+$/.test(part)) {
                  location = part;
                }
              }
            }
          }

          if (subjectName) {
            timetable.push({
              subjectName: subjectName.trim(),
              dayOfWeek: day,
              startTime,
              endTime,
              location: location.trim() || null,
              professor: professor.trim() || null
            });
          }
        });
      }

      return timetable;
    });

    if (!timetableData || timetableData.length === 0) {
      throw new Error('시간표 데이터를 찾을 수 없습니다.');
    }

    return timetableData;
  } catch (error) {
    console.error('시간표 크롤링 오류:', error);
    throw error;
  }
}

async function crawlAndSaveTimetable(userId) {
  if (!puppeteer) {
    throw new Error('Puppeteer가 설치되지 않았습니다.');
  }

  const schoolAccount = await SchoolAccount.findOne({ userId });
  if (!schoolAccount) {
    throw new Error('학교 포털 계정 정보를 찾을 수 없습니다. /api/auth/school-account API로 계정을 저장하세요.');
  }

  const schoolId = schoolAccount.schoolId;
  const schoolPassword = schoolAccount.getDecryptedPassword();

  if (!schoolPassword) {
    throw new Error('학교 포털 비밀번호를 복호화할 수 없습니다.');
  }

  schoolAccount.crawlingStatus = 'crawling';
  schoolAccount.crawlingError = null;
  await schoolAccount.save();

  let browser = null;
  try {
    const { browser: browserInstance, page } = await loginToPortal(schoolId, schoolPassword);
    browser = browserInstance;

    const timetableData = await crawlTimetable(page);

    await browser.close().catch(() => {});
    browser = null;

    await Timetable.deleteMany({ userId });

    const timetableDocs = timetableData.map(item => ({
      userId,
      ...item,
      crawledAt: new Date()
    }));

    await Timetable.insertMany(timetableDocs);

    schoolAccount.crawlingStatus = 'completed';
    schoolAccount.lastCrawledAt = new Date();
    schoolAccount.crawlingError = null;
    await schoolAccount.save();

    return {
      success: true,
      count: timetableDocs.length,
      timetable: timetableDocs
    };
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    schoolAccount.crawlingStatus = 'failed';
    schoolAccount.crawlingError = error.message;
    await schoolAccount.save();
    
    console.error('시간표 크롤링 및 저장 오류:', error);
    throw error;
  }
}

module.exports = {
  crawlAndSaveTimetable,
  loginToPortal,
  crawlTimetable
};

