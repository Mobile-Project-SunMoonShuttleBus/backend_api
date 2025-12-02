const mongoose = require('mongoose');

/**
 * 혼잡도 리포트 모델 (요구사항 DB_table_crowd-01)
 * 사용자 단말에서 수집된 혼잡도 개별 리포트 데이터 저장
 */
const crowdReportSchema = new mongoose.Schema({
  busType: {
    type: String,
    enum: ['shuttle', 'campus'],
    required: true,
    index: true,
    description: '버스 타입 (shuttle: 셔틀버스, campus: 통학버스)'
  },
  start_id: {
    type: String,
    required: true,
    index: true,
    description: '출발지 이름 (셔틀: "아산캠퍼스", "아산(KTX)역" 등 / 통학: "성남(분당)", "안산" 등)'
  },
  stop_id: {
    type: String,
    required: true,
    index: true,
    description: '도착지 이름 (현재 정류장, 셔틀: "아산캠퍼스", "아산(KTX)역" 등 / 통학: "아산캠퍼스")'
  },
  departure_time: {
    type: String,
    required: true,
    match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, // HH:mm 형식
    index: true
  },
  day_key: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD 형식
    index: true
  },
  level: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    required: true,
    index: true
  },
  signal: {
    type: String,
    enum: ['BOARDING', 'FAILED', 'UNKNOWN'],
    required: true,
    default: 'UNKNOWN'
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  client_ts: {
    type: Date,
    required: true,
    index: true
  },
  server_ts: {
    type: Date,
    default: Date.now,
    index: true
  },
  meta: {
    app_ver: {
      type: String,
      default: null
    },
    os: {
      type: String,
      enum: ['android', 'ios', null],
      default: null
    },
    gps_acc: {
      type: Number,
      default: null
    }
  }
}, {
  timestamps: false, // createdAt, updatedAt 자동 생성 비활성화
  collection: 'crowd_reports' // 컬렉션 이름 명시
});

// 복합 인덱스 (집계 쿼리 최적화)
crowdReportSchema.index({ busType: 1, start_id: 1, stop_id: 1, departure_time: 1, day_key: 1 });
crowdReportSchema.index({ day_key: 1, server_ts: -1 });
crowdReportSchema.index({ busType: 1, start_id: 1, stop_id: 1, day_key: 1, departure_time: 1 });

const CrowdReport = mongoose.model('CrowdReport', crowdReportSchema);

module.exports = CrowdReport;
