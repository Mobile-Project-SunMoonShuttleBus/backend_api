const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// MongoDB 연결 URI 생성
// 로컬 환경에서는 localhost 사용, Docker 환경에서는 database 사용
let MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || 27017;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'bus_api_DB';
const MONGO_USER = process.env.MONGO_INITDB_ROOT_USERNAME || process.env.MONGO_USER;
const MONGO_PASS = process.env.MONGO_INITDB_ROOT_PASSWORD || process.env.MONGO_PASS;

// database 호스트를 찾을 수 없으면 localhost로 변경 (로컬 개발 환경)
if (MONGO_HOST === 'database') {
  // Docker 환경이 아니면 localhost 사용
  const isDocker = process.env.DOCKER_ENV === 'true' || process.env.COMPOSE_PROJECT_NAME;
  if (!isDocker) {
    MONGO_HOST = 'localhost';
    console.log('로컬 개발 환경 감지: database -> localhost로 변경');
  }
}

// .env 파일에서 인증 정보 가져오기
// MONGO_INITDB_ROOT_USERNAME과 MONGO_INITDB_ROOT_PASSWORD 우선 사용
const rootUser = process.env.MONGO_INITDB_ROOT_USERNAME || 'root';
const rootPass = process.env.MONGO_INITDB_ROOT_PASSWORD;

// 인증 정보 확인 - .env 파일의 값을 그대로 사용
const hasRootAuth = rootUser && rootPass;

// 일반 사용자 인증 정보 (MONGO_USER, MONGO_PASS)
const hasUserAuth = MONGO_USER && MONGO_PASS && MONGO_USER !== 'user_name';

// .env 파일의 인증 정보를 사용하여 연결
let MONGO_URI;
if (hasRootAuth) {
  // root 인증 정보 사용 (.env 파일의 값 그대로 사용)
  MONGO_URI = `mongodb://${rootUser}:${rootPass}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}?authSource=admin`;
  console.log(`MongoDB 연결 시도 (root 인증): ${rootUser}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}`);
} else if (hasUserAuth) {
  // 일반 사용자 인증 정보 사용
  MONGO_URI = `mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}?authSource=admin`;
  console.log(`MongoDB 연결 시도 (사용자 인증): ${MONGO_USER}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}`);
} else {
  // 인증 정보가 없으면 인증 없이 연결 시도
  MONGO_URI = `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}`;
  console.log(`MongoDB 연결 시도 (인증 없음): ${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}`);
}

// MongoDB 연결
const connectDB = async () => {
  try {
    // 이미 연결되어 있으면 스킵
    if (mongoose.connection.readyState === 1) {
      console.log('MongoDB 이미 연결됨');
      return;
    }
    
    // 연결 시도
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('MongoDB 연결 성공');
    
    // 연결 후 인증 확인 (간단한 명령 실행)
    try {
      await mongoose.connection.db.admin().ping();
      console.log('MongoDB 인증 확인 완료');
    } catch (authError) {
      console.warn('MongoDB 인증 확인 실패, 계속 진행:', authError.message);
    }
    
    // 데이터베이스 초기화
    await initializeDatabase();
  } catch (error) {
    // 이미 연결된 경우 에러 무시
    if (error.message.includes('already connected') || mongoose.connection.readyState === 1) {
      console.log('MongoDB 이미 연결됨');
      return;
    }
    console.error('MongoDB 연결 실패:', error.message);
    
    // 인증 오류인 경우 인증 없이 재시도
    if (error.message.includes('authentication') || error.code === 13) {
      console.log('인증 오류 발생, 인증 없이 재시도...');
      try {
        const noAuthURI = `mongodb://${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB_NAME}`;
        await mongoose.connect(noAuthURI, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });
        console.log('MongoDB 인증 없이 연결 성공');
        await initializeDatabase();
        return;
      } catch (retryError) {
        console.error('인증 없이 연결도 실패:', retryError.message);
      }
    }
    
    // process.exit는 스케줄러에서 호출될 때는 종료하지 않음
    if (process.env.NODE_ENV !== 'test') {
      throw error;
    }
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
    require('../models/ShuttleRoutePath');
    require('../models/ShuttleBus');
    require('../models/CampusBus');
    require('../models/BusStop');
    require('../models/CrowdReport');
    require('../models/TokenBlacklist');
    require('../models/ShuttleNotice');
    
    // 테이블 생성
    const User = mongoose.model('User');
    const SchoolAccount = mongoose.model('SchoolAccount');
    const Timetable = mongoose.model('Timetable');
    const ShuttleRoute = mongoose.model('ShuttleRoute');
    const ShuttleRoutePath = mongoose.model('ShuttleRoutePath');
    const ShuttleBus = mongoose.model('ShuttleBus');
    const CampusBus = mongoose.model('CampusBus');
    const BusStop = mongoose.model('BusStop');
    const CrowdReport = mongoose.model('CrowdReport');
    const TokenBlacklist = mongoose.model('TokenBlacklist');
    const ShuttleNotice = mongoose.model('ShuttleNotice');
    
    // 컬럼 생성
    await User.createIndexes();
    await SchoolAccount.createIndexes();
    await Timetable.createIndexes();
    await ShuttleRoute.createIndexes();
    await ShuttleRoutePath.createIndexes();
    await ShuttleBus.createIndexes();
    await CampusBus.createIndexes();
    await BusStop.createIndexes();
    await CrowdReport.createIndexes();
    await TokenBlacklist.createIndexes();
    await ShuttleNotice.createIndexes();
    
    console.log('데이터베이스 초기화 완료');
  } catch (error) {
    console.error('데이터베이스 초기화 실패:', error);
  }
};

module.exports = connectDB;

