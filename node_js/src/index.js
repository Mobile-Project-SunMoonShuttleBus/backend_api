const express = require('express');
require('dotenv').config();
const connectDB = require('./config/database');

const app = express();
const PORT = process.env.SERVER_PORT || 8080;
const HOST = '0.0.0.0';

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 데이터베이스 연결
connectDB();

// 라우트 설정
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/bus', require('./routes/busRoutes'));

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
});