const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  subjectName: {
    type: String,
    required: true
  },
  dayOfWeek: {
    type: String,
    enum: ['월', '화', '수', '목', '금', '토', '일'],
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  location: {
    type: String
  },
  professor: {
    type: String
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
timetableSchema.index({ userId: 1, dayOfWeek: 1 });

const Timetable = mongoose.model('Timetable', timetableSchema);

module.exports = Timetable;

