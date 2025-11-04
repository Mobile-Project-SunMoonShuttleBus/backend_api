const mongoose = require('mongoose');

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

// 업데이트 시간 자동 갱신
schoolAccountSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const SchoolAccount = mongoose.model('SchoolAccount', schoolAccountSchema);

module.exports = SchoolAccount;

