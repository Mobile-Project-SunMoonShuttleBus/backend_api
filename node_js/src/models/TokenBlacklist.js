const mongoose = require('mongoose');

const tokenBlacklistSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// expiresAt 시간이 지나면 DB가 자동 삭제
tokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// userId로 검색
tokenBlacklistSchema.index({ userId: 1 });

const TokenBlacklist = mongoose.model('TokenBlacklist', tokenBlacklistSchema);

module.exports = TokenBlacklist;

