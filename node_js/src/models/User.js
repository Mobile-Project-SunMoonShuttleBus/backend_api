const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  password: {
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

// 비밀번호 해시 (저장 전)
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next()
  }
  
  // 솔트 기법 사용
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 비밀번호 비교
userSchema.methods.comparePassword = async function(cmp_pw) {
  return await bcrypt.compare(cmp_pw, this.password);
};

// 업데이트 시간 자동 갱신
userSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;

