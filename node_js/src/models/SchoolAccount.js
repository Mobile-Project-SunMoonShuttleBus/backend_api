const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const schoolAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  schoolId: {
    type: String,
    required: true,
    trim: true
  },
  schoolPassword: {
    type: String,
    required: true
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

// 학교 비밀번호 해시 (저장 전)
schoolAccountSchema.pre('save', async function(next) {
  if (!this.isModified('schoolPassword')) {
    return next()
  }
  
  // 솔트 기법 사용
  try {
    const salt = await bcrypt.genSalt(10);
    this.schoolPassword = await bcrypt.hash(this.schoolPassword, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 업데이트 시간 자동 갱신
schoolAccountSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const SchoolAccount = mongoose.model('SchoolAccount', schoolAccountSchema);

module.exports = SchoolAccount;

