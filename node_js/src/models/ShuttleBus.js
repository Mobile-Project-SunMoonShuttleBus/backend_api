const mongoose = require('mongoose');

const shuttleBusSchema = new mongoose.Schema({
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
  departureTime: {
    type: String,
    required: true
  },
  fridayOperates: {
    type: Boolean,
    required: true,
    default: true
  },
  dayType: {
    type: String,
    enum: ['평일', '토요일/공휴일', '일요일'],
    required: true,
    index: true
  },
  note: {
    type: String,
    default: ''
  },
  sourceUrl: {
    type: String,
    required: true
  },
  crawledAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 복합 인덱스: 요일별, 출발지별 조회 최적화
shuttleBusSchema.index({ dayType: 1, departure: 1 });
shuttleBusSchema.index({ dayType: 1, departure: 1, arrival: 1 });

// 업데이트 시간 자동 갱신
shuttleBusSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const ShuttleBus = mongoose.model('ShuttleBus', shuttleBusSchema);

module.exports = ShuttleBus;

