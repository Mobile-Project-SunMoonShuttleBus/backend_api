const axios = require('axios');
const cheerio = require('cheerio');
const ShuttleRoute = require('../models/ShuttleRoute');
const { parseHtmlSchedule, PAGE_URLS } = require('./busScheduleService_html');

/**
 * DB에 시간표 저장
 */
async function saveRoutesToDB(routes, sourceUrl) {
  try {
    const savedRoutes = [];

    for (const route of routes) {
      if (route.timetable.length === 0) continue; // 시간표가 없는 경우 건너뛰기

      route.rawFileUrl = sourceUrl;
      route.routeId = `${route.dayType}_${route.routeName}`;

      // 기존 데이터 확인 및 업데이트
      const existingRoute = await ShuttleRoute.findOne({ routeId: route.routeId });
      
      if (existingRoute) {
        // 업데이트
        await ShuttleRoute.findOneAndUpdate(
          { routeId: route.routeId },
          {
            ...route,
            updatedAt: new Date()
          },
          { new: true }
        );
        console.log(`시간표 업데이트: ${route.routeId}`);
      } else {
        // 새로 생성
        await ShuttleRoute.create(route);
        console.log(`시간표 생성: ${route.routeId}`);
      }

      savedRoutes.push(route);
    }

    return savedRoutes;
  } catch (error) {
    console.error('DB 저장 실패:', error);
    throw error;
  }
}

// 평일 셔틀버스 시간표 업데이트
async function updateWeekdaySchedule() {
  try {
    console.log('=== 평일 셔틀버스 시간표 업데이트 시작 ===');
    
    const pageUrl = PAGE_URLS.weekday;
    
    // HTML 파싱
    const routes = await parseHtmlSchedule(pageUrl, '평일');
    
    // DB 저장
    const saveResult = await saveRoutesToDB(routes, pageUrl);
    
    // 저장 확인
    const savedCount = await ShuttleRoute.countDocuments({ dayType: '평일' });
    
    console.log('=== 평일 셔틀버스 시간표 업데이트 완료 ===');
    console.log(`저장된 노선 수: ${saveResult.length}개`);
    console.log(`DB에 저장된 평일 노선 총 개수: ${savedCount}개`);
    
    return { 
      success: true, 
      routesFound: routes.length,
      saved: saveResult.length,
      totalInDB: savedCount
    };
  } catch (error) {
    console.error('평일 시간표 업데이트 실패:', error);
    return { success: false, error: error.message };
  }
}

// 휴일 셔틀버스 시간표 업데이트
async function updateHolidaySchedule() {
  try {
    console.log('=== 휴일 셔틀버스 시간표 업데이트 시작 ===');
    
    const pageUrl = PAGE_URLS.holiday;
    
    // HTML 파싱
    const routes = await parseHtmlSchedule(pageUrl, '공휴일');
    
    // DB 저장
    const saveResult = await saveRoutesToDB(routes, pageUrl);
    
    // 저장 확인
    const savedCount = await ShuttleRoute.countDocuments({ dayType: '공휴일' });
    
    console.log('=== 휴일 셔틀버스 시간표 업데이트 완료 ===');
    console.log(`저장된 노선 수: ${saveResult.length}개`);
    console.log(`DB에 저장된 공휴일 노선 총 개수: ${savedCount}개`);
    
    return { 
      success: true, 
      routesFound: routes.length,
      saved: saveResult.length,
      totalInDB: savedCount
    };
  } catch (error) {
    console.error('휴일 시간표 업데이트 실패:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 모든 셔틀버스 시간표 업데이트
 */
async function updateAllSchedules() {
  try {
    console.log('=== 셔틀버스 시간표 전체 업데이트 시작 ===');
    
    const weekdayResult = await updateWeekdaySchedule();
    const holidayResult = await updateHolidaySchedule();
    
    console.log('=== 셔틀버스 시간표 전체 업데이트 완료 ===');
    
    // 저장 확인
    const checkService = require('./busScheduleCheckService');
    const checkResult = await checkService.checkSavedRoutes();
    
    return {
      weekday: weekdayResult,
      holiday: holidayResult,
      dbStatus: {
        totalRoutes: checkResult.total,
        byDayType: checkResult.byDayType
      }
    };
  } catch (error) {
    console.error('전체 시간표 업데이트 실패:', error);
    throw error;
  }
}

module.exports = {
  updateWeekdaySchedule,
  updateHolidaySchedule,
  updateAllSchedules,
  saveRoutesToDB
};
