const mongoose = require('mongoose');

const shuttleNoticeSchema = new mongoose.Schema({
  portalNoticeId: {
    type: String,
    required: true,
    index: true,
    unique: true, // 같은 공지면 upsert로 교체
  },
  title: {
    type: String,
    required: true,
    index: true,
  },
  content: {
    type: String,
    required: true, // 포털 공지 상세 본문 텍스트
  },
  summary: {
    type: String,
    default: '',    // LLM 요약 저장 (처음에는 빈 문자열)
  },
  url: {
    type: String,
    required: true, // 포털 상세 페이지 URL (원문 보기용)
  },
  postedAt: {
    type: Date,
    required: true, // 포털 상의 공지 게시일
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// findOneAndUpdate 시 updatedAt 자동 갱신
shuttleNoticeSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

const ShuttleNotice = mongoose.model('ShuttleNotice', shuttleNoticeSchema);

module.exports = ShuttleNotice;

