const CrowdReport = require('../models/CrowdReport');
const CrowdSnapshot = require('../models/CrowdSnapshot');

/**
 * 혼잡도 스냅샷 집계 서비스 (요구사항 DB_table_crowd-02)
 * crowd_reports 데이터를 일정 주기마다 집계하여 crowd_snapshots에 저장
 */

/**
 * 혼잡도 레벨을 점수로 변환 (0.0~1.0)
 * LOW: 0.0, MEDIUM: 0.5, HIGH: 1.0
 */
function levelToScore(level) {
  switch (level) {
    case 'LOW':
      return 0.0;
    case 'MEDIUM':
      return 0.5;
    case 'HIGH':
      return 1.0;
    default:
      return 0.5;
  }
}

/**
 * 점수를 혼잡도 레벨로 변환
 */
function scoreToLevel(score) {
  if (score <= 0.33) {
    return 'LOW';
  } else if (score <= 0.66) {
    return 'MEDIUM';
  } else {
    return 'HIGH';
  }
}

/**
 * 특정 조건의 리포트들을 집계하여 스냅샷 생성/업데이트
 * @param {string} busType - 버스 타입 (shuttle/campus)
 * @param {string} startId - 출발지 이름
 * @param {string} stopId - 도착지 이름
 * @param {string} departureTime - 출발 시각 (HH:mm)
 * @param {string} dayKey - 날짜 키 (YYYY-MM-DD)
 */
async function aggregateAndSaveSnapshot(busType, startId, stopId, departureTime, dayKey) {
  try {
    // 해당 조건의 리포트들 조회
    const reports = await CrowdReport.find({
      busType: busType,
      start_id: startId,
      stop_id: stopId,
      departure_time: departureTime,
      day_key: dayKey
    });

    if (reports.length === 0) {
      // 리포트가 없으면 스냅샷 생성하지 않음
      return null;
    }

    // 집계 계산
    const samples = reports.length;
    
    // 평균 혼잡도 점수 계산
    const totalScore = reports.reduce((sum, report) => {
      return sum + levelToScore(report.level);
    }, 0);
    const avgLevelScore = totalScore / samples;

    // 최빈 혼잡도 수준 계산
    const levelCounts = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0
    };
    reports.forEach(report => {
      levelCounts[report.level]++;
    });
    
    const topLevel = Object.keys(levelCounts).reduce((a, b) => 
      levelCounts[a] > levelCounts[b] ? a : b
    );

    // 스냅샷 생성 또는 업데이트
    const snapshot = await CrowdSnapshot.findOneAndUpdate(
      {
        busType: busType,
        start_id: startId,
        stop_id: stopId,
        departure_time: departureTime,
        day_key: dayKey
      },
      {
        busType: busType,
        start_id: startId,
        stop_id: stopId,
        departure_time: departureTime,
        day_key: dayKey,
        samples: samples,
        avg_level_score: avgLevelScore,
        top_level: topLevel,
        updated_at: new Date()
      },
      {
        upsert: true,
        new: true
      }
    );

    return snapshot;
  } catch (error) {
    console.error('스냅샷 집계 오류:', error);
    console.error('집계 파라미터:', { busType, startId, stopId, departureTime, dayKey });
    throw error;
  }
}

/**
 * 특정 날짜의 모든 리포트를 집계하여 스냅샷 생성
 * @param {string} dayKey - 날짜 키 (YYYY-MM-DD)
 */
async function aggregateDaySnapshots(dayKey) {
  try {
    // 해당 날짜의 모든 리포트 조회
    const reports = await CrowdReport.find({
      day_key: dayKey
    });

    if (reports.length === 0) {
      return { processed: 0, snapshots: [] };
    }

    // busType, start_id, stop_id, departure_time별로 그룹화
    const groups = {};
    reports.forEach(report => {
      const key = `${report.busType}_${report.start_id}_${report.stop_id}_${report.departure_time}`;
      if (!groups[key]) {
        groups[key] = {
          busType: report.busType,
          start_id: report.start_id,
          stop_id: report.stop_id,
          departure_time: report.departure_time,
          reports: []
        };
      }
      groups[key].reports.push(report);
    });

    // 각 그룹별로 스냅샷 생성
    const snapshots = [];
    for (const key in groups) {
      const group = groups[key];
      const snapshot = await aggregateAndSaveSnapshot(
        group.busType,
        group.start_id,
        group.stop_id,
        group.departure_time,
        dayKey
      );
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return {
      processed: Object.keys(groups).length,
      snapshots: snapshots
    };
  } catch (error) {
    console.error('일일 스냅샷 집계 오류:', error);
    throw error;
  }
}

/**
 * 특정 노선·정류장의 모든 리포트를 집계하여 스냅샷 생성
 * @param {string} busType - 버스 타입 (shuttle/campus)
 * @param {string} startId - 출발지 이름
 * @param {string} stopId - 도착지 이름
 */
async function aggregateRouteStopSnapshots(busType, startId, stopId) {
  try {
    // 해당 노선·정류장의 모든 리포트 조회
    const reports = await CrowdReport.find({
      busType: busType,
      start_id: startId,
      stop_id: stopId
    });

    if (reports.length === 0) {
      return { processed: 0, snapshots: [] };
    }

    // departure_time, day_key별로 그룹화
    const groups = {};
    reports.forEach(report => {
      const key = `${report.departure_time}_${report.day_key}`;
      if (!groups[key]) {
        groups[key] = {
          departure_time: report.departure_time,
          day_key: report.day_key,
          reports: []
        };
      }
      groups[key].reports.push(report);
    });

    // 각 그룹별로 스냅샷 생성
    const snapshots = [];
    for (const key in groups) {
      const group = groups[key];
      const snapshot = await aggregateAndSaveSnapshot(
        busType,
        startId,
        stopId,
        group.departure_time,
        group.day_key
      );
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return {
      processed: Object.keys(groups).length,
      snapshots: snapshots
    };
  } catch (error) {
    console.error('노선·정류장 스냅샷 집계 오류:', error);
    throw error;
  }
}

module.exports = {
  aggregateAndSaveSnapshot,
  aggregateDaySnapshots,
  aggregateRouteStopSnapshots,
  levelToScore,
  scoreToLevel
};
