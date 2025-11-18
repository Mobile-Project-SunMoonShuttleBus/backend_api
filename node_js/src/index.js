const express = require('express');
require('dotenv').config();
const connectDB = require('./config/database');
const { swaggerSetup } = require('./config/swagger');

const app = express();
const PORT = process.env.SERVER_PORT || 8080;
const HOST = '0.0.0.0';
const { runInitialCrawlers } = require('./services/initialDataLoader');

// CORS 설정 (프론트엔드 및 외부 IP에서 API 접근 허용)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 데이터베이스 연결
connectDB();

// 라우트 설정
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/shuttle', require('./routes/shuttleRoutes'));
app.use('/api/campus', require('./routes/campusRoutes'));
app.use('/api/stops', require('./routes/stopRoutes'));

// Swagger 설정 (라우트 설정 후 등록해 경로 충돌 방지)
swaggerSetup(app);

// 루트 경로
app.get('/', (req, res) => {
  res.json({ message: '구동중' });
});

// 셔틀버스 스케줄러 시작
const shuttleBusScheduler = require('./services/shuttleBusScheduler');
shuttleBusScheduler.startScheduler();

// 서버 시작
app.listen(PORT, HOST, () => {
  console.log(`서버 실행중: http://${HOST}:${PORT}`);
  runInitialCrawlers().catch((error) => {
    console.error('초기 크롤링 실행 실패:', error);
  });
});