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
// UTF-8 인코딩 명시 (한글 처리 보장)
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// 요청 로깅 미들웨어 (디버깅용)
app.use((req, res, next) => {
  if (req.path.includes('route-time')) {
    console.log(`[요청] ${req.method} ${req.path}`, {
      query: req.query,
      body: req.body,
      auth: req.headers.authorization ? '있음' : '없음'
    });
  }
  next();
});

// 서버 준비 상태 플래그
let isServerReady = false;

// 데이터베이스 연결 및 초기화
(async () => {
  try {
    console.log('[초기화] 데이터베이스 연결 시작...');
    await connectDB();
    console.log('[초기화] 데이터베이스 연결 완료');
    
    console.log('[초기화] 초기 크롤링 시작...');
    await runInitialCrawlers();
    console.log('[초기화] 초기 크롤링 완료');
    
    // 서버 준비 완료
    isServerReady = true;
    console.log('[초기화] 서버 준비 완료 - API 요청 처리 가능');
  } catch (error) {
    console.error('[초기화] 서버 초기화 중 오류:', error);
    if (error.stack) {
      console.error('[초기화] 오류 스택:', error.stack);
    }
    // DB 연결 실패 시에는 isServerReady를 false로 유지
    const mongoose = require('mongoose');
    const isDBConnected = mongoose.connection.readyState === 1;
    
    if (isDBConnected) {
      isServerReady = true;
      console.log('[초기화] 서버 준비 완료 (일부 오류 발생했지만 DB는 연결됨)');
    } else {
      isServerReady = false;
      console.error('[초기화] 데이터베이스 연결 실패 - 서버는 실행 중이지만 API 요청은 처리할 수 없습니다.');
      console.error('[초기화] MongoDB 연결을 확인해주세요.');
    }
  }
})();

// 서버 시작 전에 초기화 시작
console.log('[시작] 서버 초기화 프로세스 시작');

// 혼잡도 웹페이지 라우트 (서버 준비 상태 확인 전에 등록, 인증 없이 접근 가능)
const congestionController = require('./controllers/congestionController');
app.get('/congestion/view', congestionController.renderCongestionView);

// 서버 준비 상태 확인 미들웨어
app.use((req, res, next) => {
  // DB 연결 상태 확인
  const mongoose = require('mongoose');
  const isDBConnected = mongoose.connection.readyState === 1;
  
  if (!isServerReady || !isDBConnected) {
    return res.status(503).json({
      success: false,
      message: '서버가 아직 준비되지 않았습니다.',
      error: '데이터베이스 연결 및 초기 크롤링이 진행 중입니다.',
      hint: '잠시 후 다시 시도해주세요. 보통 10-30초 정도 소요됩니다.',
      dbStatus: isDBConnected ? 'connected' : 'disconnected'
    });
  }
  next();
});

// 라우트 설정
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/shuttle', require('./routes/shuttleRoutes'));
app.use('/api/campus', require('./routes/campusRoutes'));
app.use('/api/stops', require('./routes/stopRoutes'));
app.use('/api/timetable', require('./routes/timetableRoutes'));
app.use('/api/notices', require('./routes/noticeRoutes'));
app.use('/api/bus/route-time', require('./routes/routeTimeRoutes'));

// /api/congestion 라우트 설정
// /api/congestion의 모든 라우트들 (POST: 조회, /report: 저장, /snapshots: 집계 등)
app.use('/api/congestion', require('./routes/congestionRoutes'));

app.use('/api/bus/arrival-time', require('./routes/arrivalTimeRoutes'));

// Swagger 설정 (라우트 설정 후 등록해 경로 충돌 방지)
swaggerSetup(app);

// 루트 경로
app.get('/', (req, res) => {
  res.json({ message: '구동중' });
});

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '요청한 경로를 찾을 수 없습니다.',
    error: `경로 '${req.path}'를 찾을 수 없습니다.`,
    path: req.path,
    hint: 'API 경로를 확인해주세요. Swagger 문서(/api-docs)를 참고하세요.',
    availableEndpoints: {
      congestion: {
        report: 'POST /api/congestion/report',
        aggregate: 'POST /api/congestion/snapshots/aggregate?dayKey=YYYY-MM-DD',
        overview: 'GET /api/congestion/campus/overview?dayKey=YYYY-MM-DD',
        status: 'GET /api/congestion/snapshots/status',
        stats: 'GET /api/congestion/snapshots/stats'
      },
      swagger: 'GET /api-docs'
    }
  });
});

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('에러 핸들러:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      success: false,
      message: err.message || '서버 오류가 발생했습니다.',
      error: process.env.NODE_ENV === 'development' ? err.stack : '서버 내부 오류가 발생했습니다.',
      hint: '서버 내부 오류입니다. 잠시 후 다시 시도해주세요.'
    });
  }
});

// 셔틀버스 스케줄러 시작
const shuttleBusScheduler = require('./services/shuttleBusScheduler');
shuttleBusScheduler.startScheduler();

// 시간표 자동 크롤링 스케줄러 시작
const timetableScheduler = require('./services/timetableScheduler');
timetableScheduler.startScheduler();

// 혼잡도 집계 스케줄러 시작
const crowdSnapshotScheduler = require('./services/crowdSnapshotScheduler');
crowdSnapshotScheduler.startScheduler();

// 서버 시작
app.listen(PORT, HOST, () => {
  console.log(`서버 실행중: http://${HOST}:${PORT}`);
  console.log('데이터베이스 연결 및 초기 크롤링 진행 중...');
});