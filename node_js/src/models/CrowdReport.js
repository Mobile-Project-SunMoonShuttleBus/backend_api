const mongoose = require('mongoose');

const crowdReportSchema = new mongoose.Schema({
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
    enum: ['평일', '월~목', '금요일', '토요일/공휴일', '일요일'],
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

crowdReportSchema.index({ busType: 1, departure: 1, arrival: 1, departureTime: 1, date: 1 });
crowdReportSchema.index({ busType: 1, departure: 1, arrival: 1, dayOfWeek: 1, departureTime: 1 });
crowdReportSchema.index({ date: 1, reportedAt: -1 });

const CrowdReport = mongoose.model('CrowdReport', crowdReportSchema);

module.exports = CrowdReport;

