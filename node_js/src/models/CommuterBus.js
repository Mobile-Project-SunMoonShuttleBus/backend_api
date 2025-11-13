const mongoose = require('mongoose');

const commuterBusSchema = new mongoose.Schema({
  departure: {
    type: String,
    required: true,
    index: true
  },
  arrival: {
    type: String,
    required: true,
    index: true,
    default: '아산캠퍼스'
  },
  departureTime: {
    type: String,
    required: true
  },
  arrivalTime: {
    type: String,
    default: null
  },
  direction: {
    type: String,
    enum: ['등교', '하교'],
    required: true,
    index: true
  },
  dayType: {
    type: String,
    enum: ['평일', '월~목', '금요일', '토요일/공휴일', '일요일'],
    required: true,
    index: true
  },
  viaStops: {
    type: [
      {
        name: { type: String, required: true },
        time: { type: String, default: null },
        source: { type: String, enum: ['table', 'note'], default: 'table' }
      }
    ],
    default: []
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

// 복합 인덱스
commuterBusSchema.index({ dayType: 1, departure: 1 });
commuterBusSchema.index({ dayType: 1, departure: 1, arrival: 1 });
commuterBusSchema.index({ direction: 1, dayType: 1, departure: 1, departureTime: 1 });

// 업데이트 시간 자동 갱신
commuterBusSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const CommuterBus = mongoose.model('CommuterBus', commuterBusSchema);

module.exports = CommuterBus;

