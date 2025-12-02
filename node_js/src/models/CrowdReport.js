const mongoose = require('mongoose');

/**
 * 혼잡도 리포트 모델 (요구사항 DB_table_crowd-01)
 * 사용자 단말에서 수집된 혼잡도 개별 리포트 데이터 저장
 */
const crowdReportSchema = new mongoose.Schema({
  route_id: {
    type: String,
    required: true,
    index: true,
    description: '노선 이름 (예: "천안 아산역→아산캠퍼스")'
  },
  stop_id: {
    type: String,
    required: true,
    index: true,
    description: '정류장 이름 (예: "천안 아산역")'
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
crowdReportSchema.index({ route_id: 1, stop_id: 1, departure_time: 1, day_key: 1 });
crowdReportSchema.index({ day_key: 1, server_ts: -1 });
crowdReportSchema.index({ route_id: 1, stop_id: 1, day_key: 1, departure_time: 1 });

const CrowdReport = mongoose.model('CrowdReport', crowdReportSchema);

module.exports = CrowdReport;
