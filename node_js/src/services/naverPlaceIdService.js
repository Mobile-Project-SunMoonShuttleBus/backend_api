const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // puppeteer가 설치되지 않은 경우 무시
}

const axiosInstance = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

/**
 * 네이버 지도 URL에서 좌표 추출
 * @param {string} url - 네이버 지도 URL
 * @returns {Promise<Object>} - 좌표 정보
 */
async function getCoordinatesFromNaverMapUrl(url) {
  try {
    // URL에서 place ID 또는 bus-station ID 추출
    const placeMatch = url.match(/place\/(\d+)/);
    const busStationMatch = url.match(/bus-station\/(\d+)/);
    
    const placeId = placeMatch ? placeMatch[1] : (busStationMatch ? busStationMatch[1] : null);
    const placeType = placeMatch ? 'place' : (busStationMatch ? 'bus-station' : null);
    
    if (!placeId) {
      return {
        success: false,
        error: 'URL에서 장소 ID를 찾을 수 없습니다.'
      };
    }

    // URL 파라미터에서 좌표 정보 찾기 시도
    // p= 파라미터는 인코딩된 좌표일 수 있음
    const pParamMatch = url.match(/[?&]p=([^&]+)/);
    if (pParamMatch) {
      console.log('p 파라미터 발견:', pParamMatch[1]);
      // Base64나 다른 인코딩일 수 있음
    }

    // c= 파라미터는 카메라 설정 (줌 레벨 등)
    const cParamMatch = url.match(/[?&]c=([^&]+)/);
    if (cParamMatch) {
      console.log('c 파라미터:', cParamMatch[1]);
    }

    // Puppeteer를 사용하여 실제 페이지 로드 및 좌표 추출
    if (puppeteer) {
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
        
        // 페이지가 로드될 때까지 대기
        await page.waitForTimeout(3000);
        
        // JavaScript를 실행하여 좌표 추출
        const coordinates = await page.evaluate(() => {
          // 여러 방법으로 좌표 찾기 시도
          let lat = null;
          let lng = null;
          
          // 방법 1: window 객체에서 찾기
          if (window.map && window.map.getCenter) {
            const center = window.map.getCenter();
            if (center && center.getLat && center.getLng) {
              lat = center.getLat();
              lng = center.getLng();
            }
          }
          
          // 방법 2: naver.maps 객체에서 찾기
          if (!lat && window.naver && window.naver.maps) {
            // 지도 인스턴스 찾기
            const maps = document.querySelectorAll('[data-map]');
            if (maps.length > 0) {
              // 지도 데이터에서 좌표 추출 시도
            }
          }
          
          // 방법 3: URL에서 좌표 찾기 (페이지 로드 후 URL 변경 확인)
          const currentUrl = window.location.href;
          const coordMatch = currentUrl.match(/search\/([0-9.]+),([0-9.]+)/);
          if (coordMatch) {
            lat = parseFloat(coordMatch[1]);
            lng = parseFloat(coordMatch[2]);
          }
          
          // 방법 4: 페이지 내 데이터에서 찾기
          if (!lat) {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
              const content = script.textContent || '';
              // JSON 데이터에서 좌표 찾기
              const latMatch = content.match(/["']lat["']\s*:\s*([0-9.]+)/i);
              const lngMatch = content.match(/["']lng["']\s*:\s*([0-9.]+)/i);
              if (latMatch && lngMatch) {
                const foundLat = parseFloat(latMatch[1]);
                const foundLng = parseFloat(lngMatch[1]);
                // 아산 지역 좌표 범위 확인
                if (foundLat >= 36 && foundLat <= 37 && foundLng >= 126 && foundLng <= 128) {
                  lat = foundLat;
                  lng = foundLng;
                  break;
                }
              }
            }
          }
          
          return { lat, lng };
        });
        
        await browser.close();
        
        if (coordinates.lat && coordinates.lng) {
          return {
            success: true,
            latitude: coordinates.lat,
            longitude: coordinates.lng,
            placeId: placeId,
            placeType: placeType
          };
        }
      } catch (puppeteerError) {
        console.warn('Puppeteer로 좌표 추출 실패, axios로 폴백:', puppeteerError.message);
      }
    }

    // Puppeteer가 없거나 실패한 경우 axios로 시도
    const fullUrl = url;
    const response = await axiosInstance.get(fullUrl);

    // HTML에서 좌표 정보 찾기
    const html = response.data;
    
    // 방법 1: window.__NEXT_DATA__ 또는 window.__INITIAL_STATE__에서 좌표 찾기
    const nextDataMatch = html.match(/window\.__NEXT_DATA__\s*=\s*({.+?});/s);
    const initialStateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/s);
    
    if (nextDataMatch) {
      try {
        const data = JSON.parse(nextDataMatch[1]);
        // 좌표 정보 추출 시도
        const coordinates = extractCoordinatesFromData(data);
        if (coordinates) {
          return {
            success: true,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            placeId: placeId,
            placeType: placeType
          };
        }
      } catch (e) {
        console.warn('JSON 파싱 실패:', e.message);
      }
    }

    // 방법 2: 정규식으로 좌표 패턴 찾기
    const latPatterns = [
      /lat[itude]*['":\s]*([0-9]+\.[0-9]+)/gi,
      /"lat":\s*([0-9]+\.[0-9]+)/gi,
      /latitude['":\s]*([0-9]+\.[0-9]+)/gi
    ];
    
    const lngPatterns = [
      /lng[itude]*['":\s]*([0-9]+\.[0-9]+)/gi,
      /"lng":\s*([0-9]+\.[0-9]+)/gi,
      /longitude['":\s]*([0-9]+\.[0-9]+)/gi
    ];

    let latitude = null;
    let longitude = null;

    for (const pattern of latPatterns) {
      const match = html.match(pattern);
      if (match) {
        const lat = parseFloat(match[0].replace(/[^0-9.]/g, ''));
        if (lat >= 36 && lat <= 37) { // 아산 지역 위도 범위
          latitude = lat;
          break;
        }
      }
    }

    for (const pattern of lngPatterns) {
      const match = html.match(pattern);
      if (match) {
        const lng = parseFloat(match[0].replace(/[^0-9.]/g, ''));
        if (lng >= 126 && lng <= 128) { // 아산 지역 경도 범위
          longitude = lng;
          break;
        }
      }
    }

    if (latitude && longitude) {
      return {
        success: true,
        latitude,
        longitude,
        placeId: placeId,
        placeType: placeType
      };
    }

    return {
      success: false,
      error: 'HTML에서 좌표를 찾을 수 없습니다.'
    };
  } catch (error) {
    console.error('네이버 지도 URL에서 좌표 추출 실패:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 데이터 객체에서 좌표 정보 재귀적으로 추출
 */
function extractCoordinatesFromData(data, depth = 0) {
  if (depth > 5) return null; // 깊이 제한
  
  if (typeof data !== 'object' || data === null) return null;

  // lat, lng 또는 latitude, longitude 키 찾기
  if (('lat' in data || 'latitude' in data) && ('lng' in data || 'longitude' in data)) {
    const lat = data.lat || data.latitude;
    const lng = data.lng || data.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      return { latitude: lat, longitude: lng };
    }
  }

  // 배열이나 객체를 재귀적으로 탐색
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      const result = extractCoordinatesFromData(data[key], depth + 1);
      if (result) return result;
    }
  }

  return null;
}

module.exports = {
  getCoordinatesFromNaverMapUrl
};

