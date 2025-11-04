const mongoose = require('mongoose');

const crowdReportSchema = new mongoose.Schema({
  routeId: {
    type: String,
    required: true,
    index: true
  },
  departureTime: {
    type: String,
    required: true
  },
  level: {
    type: String,
    enum: ['low', 'medium', 'heavy'],
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

// 복합 인덱스 (조회 성능 향상)
crowdReportSchema.index({ routeId: 1, departureTime: 1, reportedAt: -1 });

const CrowdReport = mongoose.model('CrowdReport', crowdReportSchema);

module.exports = CrowdReport;

