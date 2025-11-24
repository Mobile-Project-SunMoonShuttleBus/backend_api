const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

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
  },
  crawlingStatus: {
    type: String,
    enum: ['idle', 'crawling', 'completed', 'failed'],
    default: 'idle'
  },
  lastCrawledAt: {
    type: Date,
    default: null
  },
  crawlingError: {
    type: String,
    default: null
  }
});

schoolAccountSchema.pre('save', async function(next) {
  if (!this.isModified('schoolPassword')) {
    return next();
  }
  
  try {
    this.schoolPassword = encrypt(this.schoolPassword);
    next();
  } catch (error) {
    next(error);
  }
});

schoolAccountSchema.methods.getDecryptedPassword = function() {
  try {
    return decrypt(this.schoolPassword);
  } catch (error) {
    console.error('비밀번호 복호화 오류:', error);
    return null;
  }
};

schoolAccountSchema.pre('findOneAndUpdate', async function(next) {
  const update = this.getUpdate();
  
  if (update && update.schoolPassword) {
    try {
      if (update.$set) {
        update.$set.schoolPassword = encrypt(update.$set.schoolPassword);
      } else {
        update.schoolPassword = encrypt(update.schoolPassword);
      }
    } catch (error) {
      return next(error);
    }
  } else if (update && update.$set && update.$set.schoolPassword) {
    try {
      update.$set.schoolPassword = encrypt(update.$set.schoolPassword);
    } catch (error) {
      return next(error);
    }
  }
  
  this.set({ updatedAt: new Date() });
  next();
});

const SchoolAccount = mongoose.model('SchoolAccount', schoolAccountSchema);

module.exports = SchoolAccount;

