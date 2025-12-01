const User = require('../models/User');
const SchoolAccount = require('../models/SchoolAccount');
const TokenBlacklist = require('../models/TokenBlacklist');
const { createToken } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// 회원가입
const register = async (req, res) => {
  try {
    // DB 연결 상태 확인
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: '데이터베이스 연결이 되지 않았습니다.',
        error: 'MongoDB 연결을 확인해주세요.',
        hint: '서버가 아직 초기화 중이거나 데이터베이스 연결에 문제가 있습니다.'
      });
    }
    const { userId, password, Password } = req.body;
    const userPassword = password ?? Password;

    // 입력 검증
    if (!userId || !userPassword) {
      return res.status(400).json({ 
        message: 'ID와 비밀번호를 입력해주세요.',
        error: '요청 본문에 userId와 password 필드가 필요합니다.'
      });
    }

    if (userId.length < 4 || userId.length > 20) {
      return res.status(400).json({ 
        message: 'ID는 4자 이상 20자 이하여야 합니다.',
        error: `입력하신 ID의 길이는 ${userId.length}자입니다. 4자 이상 20자 이하로 입력해주세요.`,
        userIdLength: userId.length
      });
    }

    if (userPassword.length < 6) {
      return res.status(400).json({ 
        message: '비밀번호는 6자 이상이어야 합니다.',
        error: `입력하신 비밀번호의 길이는 ${userPassword.length}자입니다. 6자 이상으로 입력해주세요.`
      });
    }

    // 중복 확인
    const existingUser = await User.findOne({ userId });
    if (existingUser) {
      return res.status(409).json({ 
        message: '이미 존재하는 ID입니다.',
        error: `"${userId}"는 이미 사용 중인 ID입니다. 다른 ID를 사용해주세요.`,
        userId: userId
      });
    }

    // 사용자 생성
    const user = new User({
      userId,
      password: userPassword
    });

    await user.save();

    res.status(201).json({ message: '회원가입이 완료되었습니다.' });
  } catch (error) {
    console.error('회원가입 오류:', error);
    res.status(500).json({ 
      message: '회원가입 중 오류가 발생했습니다.',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// 로그인
const login = async (req, res) => {
  try {
    const { userId, password, Password } = req.body;
    const userPassword = password ?? Password;

    // 입력 검증
    if (!userId || !userPassword) {
      return res.status(400).json({ 
        message: 'ID와 비밀번호를 입력해주세요.',
        error: '요청 본문에 userId와 password 필드가 필요합니다.'
      });
    }

    // 사용자 찾기
    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(401).json({ 
        message: '로그인 실패',
        error: `"${userId}"에 해당하는 사용자를 찾을 수 없습니다. ID를 확인해주세요.`,
        userId: userId
      });
    }

    // 비밀번호 확인
    const isPasswordValid = await user.comparePassword(userPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        message: '로그인 실패',
        error: '비밀번호가 일치하지 않습니다. 비밀번호를 확인해주세요.'
      });
    }

    // JWT 토큰 생성
    const userObjectId = user._id.toString();
    const accessToken = createToken(userObjectId);

    res.status(200).json({
      message: '로그인 성공',
      accessToken
    });
  } catch (error) {
    console.error('로그인 오류:', error);
    res.status(500).json({ 
      message: '로그인 중 오류가 발생했습니다.',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// 학교 포털 계정 정보 저장
const saveSchoolAccount = async (req, res) => {
  try {
    const userId = req.user.userId; // JWT에서 추출한 사용자 ID
    const { schoolId, schoolPassword } = req.body;

    // 입력 검증
    if (!schoolId || !schoolPassword) {
      return res.status(400).json({ 
        message: '학교 ID와 비밀번호를 입력해주세요.',
        error: '요청 본문에 schoolId와 schoolPassword 필드가 필요합니다.'
      });
    }

    // 사용자 찾기
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        message: '사용자를 찾을 수 없습니다.',
        error: `userId "${userId}"에 해당하는 사용자가 존재하지 않습니다.`,
        userId: userId
      });
    }

    // 학교 계정 정보 저장 또는 업데이트
    const schoolAccount = await SchoolAccount.findOneAndUpdate(
      { userId },
      {
        userId,
        schoolId,
        schoolPassword
      },
      {
        new: true,
        upsert: true
      }
    );

    const { crawlAndSaveTimetable } = require('../services/timetableCrawlerService');
    crawlAndSaveTimetable(userId).then(result => {
      if (result.success) {
        console.log(`시간표 자동 크롤링 완료: 사용자 ${userId}, ${result.count}개 저장`);
      } else {
        console.error(`시간표 자동 크롤링 실패: 사용자 ${userId}, ${result.error}`);
      }
    }).catch(error => {
      console.error(`시간표 자동 크롤링 오류: 사용자 ${userId}`, error.message);
    });

    res.status(200).json({ 
      message: '계정 정보 저장 완료',
      note: '시간표 크롤링이 백그라운드에서 진행 중입니다.'
    });
  } catch (error) {
    console.error('학교 계정 저장 오류:', error);
    res.status(500).json({ 
      message: '계정 정보 저장 중 오류가 발생했습니다.',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// 로그아웃
const logout = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(400).json({ 
        message: '토큰이 필요합니다.',
        error: 'Authorization 헤더에 Bearer 토큰이 없습니다.'
      });
    }

    // 토큰 디코딩하여 만료 시간 및 사용자 정보 확인
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp || !decoded.userId) {
      return res.status(400).json({ 
        message: '유효하지 않은 토큰입니다.',
        error: '토큰 형식이 올바르지 않거나 필수 정보가 없습니다.'
      });
    }

    // 토큰 만료 시간 계산
    const expiresAt = new Date(decoded.exp * 1000);
    const userId = decoded.userId;

    // 블랙리스트에 토큰 추가 (만료 시간까지 유지)
    await TokenBlacklist.findOneAndUpdate(
      { token },
      {
        token,
        userId,
        expiresAt
      },
      {
        upsert: true,
        new: true
      }
    );

    res.status(200).json({ message: '로그아웃 성공' });
  } catch (error) {
    console.error('로그아웃 오류:', error);
    res.status(500).json({ 
      message: '로그아웃 중 오류가 발생했습니다.',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  saveSchoolAccount
};

