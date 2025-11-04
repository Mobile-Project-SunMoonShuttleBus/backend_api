const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB 연결 URI 생성
const MONGO_HOST = process.env.MONGO_HOST || 'database';
const MONGO_PORT = process.env.MONGO_PORT || 27017;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'bus_api_DB';
const MONGO_USER = process.env.MONGO_INITDB_ROOT_USERNAME;
const MONGO_PASS = process.env.MONGO_INITDB_ROOT_PASSWORD;

const MONGO_URI = `mongodb://${MONGO_USER}:${MONGO_PASS}` +
`@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}?authSource=admin`;

// MongoDB 연결
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('MongoDB 연결 성공');
    
    // 데이터베이스 초기화
    await initializeDatabase();
  } catch (error) {
    console.error('MongoDB 연결 실패:', error);
    process.exit(1);
  }
};

// 데이터베이스 초기화
const initializeDatabase = async () => {
  try {
    // mongoose
    require('../models/User');
    require('../models/SchoolAccount');
    require('../models/Timetable');
    require('../models/ShuttleRoute');
    require('../models/CrowdReport');
    require('../models/TokenBlacklist');
    
    // 테이블 생성
    const User = mongoose.model('User');
    const SchoolAccount = mongoose.model('SchoolAccount');
    const Timetable = mongoose.model('Timetable');
    const ShuttleRoute = mongoose.model('ShuttleRoute');
    const CrowdReport = mongoose.model('CrowdReport');
    const TokenBlacklist = mongoose.model('TokenBlacklist');
    
    // 컬럼 생성
    await User.createIndexes();
    await SchoolAccount.createIndexes();
    await Timetable.createIndexes();
    await ShuttleRoute.createIndexes();
    await CrowdReport.createIndexes();
    await TokenBlacklist.createIndexes();
    
    console.log('데이터베이스 초기화 완료');
  } catch (error) {
    console.error('데이터베이스 초기화 실패:', error);
  }
};

module.exports = connectDB;

