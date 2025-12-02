const mongoose = require('mongoose');

/**
 * 기존 혼잡도 리포트 모델 (레거시)
 * /api/bus/congestion 엔드포인트에서 사용
 */
const crowdReportOldSchema = new mongoose.Schema({
  busType: {
    type: String,
    enum: ['shuttle', 'campus'],
    required: true,
    index: true
  },
  departure: {
    type: String,
    required: true,
    index: true
  },
  arrival: {
    type: String,
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['등교', '하교'],
    default: null,
    index: true
  },
  departureTime: {
    type: String,
    required: true,
    index: true
  },
  dayOfWeek: {
    type: String,
    enum: ['월', '화', '수', '목', '금', '토', '일'],
    required: true,
    index: true
  },
  date: {
    type: String,
    required: true,
    index: true
  },
  dayType: {
    type: String,
    enum: ['평일', '토요일/공휴일', '일요일'],
    required: true,
    index: true
  },
  congestionLevel: {
    type: Number,
    enum: [0, 1, 2],
    required: true
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  reportedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

crowdReportOldSchema.index({ busType: 1, departure: 1, arrival: 1, departureTime: 1, date: 1 });
crowdReportOldSchema.index({ busType: 1, departure: 1, arrival: 1, dayOfWeek: 1, departureTime: 1 });
crowdReportOldSchema.index({ date: 1, reportedAt: -1 });

const CrowdReportOld = mongoose.model('CrowdReportOld', crowdReportOldSchema);

module.exports = CrowdReportOld;
