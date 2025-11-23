const mongoose = require('mongoose');

const busStopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  naverPlaceId: {
    type: String,
    default: null
  },
  naverTitle: {
    type: String,
    default: null
  },
  naverAddress: {
    type: String,
    default: null
  },
  stopType: {
    type: String,
    enum: ['departure', 'conditional'],
    default: 'departure'
  },
  requiresStudentHallBoarding: {
    type: Boolean,
    default: false
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

busStopSchema.index({ location: '2dsphere' });

// 업데이트 시간 자동 갱신
busStopSchema.pre('findOneAndUpdate', function(next) {
  this.set({ lastUpdated: new Date() });
  next();
});

const BusStop = mongoose.model('BusStop', busStopSchema);

module.exports = BusStop;

