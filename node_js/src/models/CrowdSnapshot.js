const mongoose = require('mongoose');

/**
 * 혼잡도 스냅샷 모델 (요구사항 DB_table_crowd-02)
 * 혼잡도 리포트를 집계한 정류장·시간대별 평균 혼잡도 결과 저장
 */
const crowdSnapshotSchema = new mongoose.Schema({
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
  samples: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  avg_level_score: {
    type: Number,
    required: true,
    min: 0.0,
    max: 1.0,
    default: 0.0
  },
  top_level: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    required: true
  },
  updated_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: false, // createdAt, updatedAt 자동 생성 비활성화
  collection: 'crowd_snapshots' // 컬렉션 이름 명시
});

// 복합 인덱스 (조회 쿼리 최적화)
crowdSnapshotSchema.index({ busType: 1, start_id: 1, stop_id: 1, departure_time: 1, day_key: 1 }, { unique: true });
crowdSnapshotSchema.index({ day_key: 1, updated_at: -1 });
crowdSnapshotSchema.index({ busType: 1, start_id: 1, stop_id: 1, day_key: 1 });

const CrowdSnapshot = mongoose.model('CrowdSnapshot', crowdSnapshotSchema);

module.exports = CrowdSnapshot;
