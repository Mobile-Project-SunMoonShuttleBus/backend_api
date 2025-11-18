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
  naverAddress: {
    type: String,
    default: null
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

// 정류장 이름으로 빠른 조회를 위한 인덱스 (unique로 이미 생성됨)
// busStopSchema.index({ name: 1 }); // unique 인덱스와 중복되므로 제거

// 좌표 기반 검색을 위한 2dsphere 인덱스 (향후 사용 가능)
busStopSchema.index({ location: '2dsphere' });

// 업데이트 시간 자동 갱신
busStopSchema.pre('findOneAndUpdate', function(next) {
  this.set({ lastUpdated: new Date() });
  next();
});

const BusStop = mongoose.model('BusStop', busStopSchema);

module.exports = BusStop;

