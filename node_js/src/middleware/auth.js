const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config();
const TokenBlacklist = require('../models/TokenBlacklist');

const JWT_SECRET = process.env.JWT_SECRET;

// JWT 검증
const authToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer token

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 필요합니다.',
        error: 'JWT 토큰이 요청 헤더에 없습니다.',
        hint: 'Authorization 헤더에 "Bearer {토큰}" 형식으로 토큰을 포함해주세요. 로그인 API(/api/auth/login)를 통해 토큰을 발급받을 수 있습니다.'
      });
    }

    // MongoDB 연결 확인 및 블랙리스트 확인
    let isBlacklisted = false;
    if (mongoose.connection.readyState === 1) {
      try {
        const blacklistedToken = await Promise.race([
          TokenBlacklist.findOne({ token }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('블랙리스트 조회 타임아웃')), 5000)
          )
        ]);
        
        if (blacklistedToken) {
          isBlacklisted = true;
        }
      } catch (dbError) {
        console.warn('블랙리스트 확인 중 오류 (계속 진행):', dbError.message);
        // 데이터베이스 오류가 있어도 JWT 검증은 계속 진행
      }
    }

    if (isBlacklisted) {
      return res.status(403).json({
        success: false,
        message: '유효하지 않은 토큰입니다.',
        error: '이 토큰은 로그아웃되어 사용할 수 없습니다.',
        hint: '다시 로그인하여 새로운 토큰을 발급받아주세요.'
      });
    }

    // JWT 검증
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        let errorMessage = '토큰 검증에 실패했습니다.';
        if (err.name === 'TokenExpiredError') {
          errorMessage = '토큰이 만료되었습니다. 다시 로그인하여 새로운 토큰을 발급받아주세요.';
        } else if (err.name === 'JsonWebTokenError') {
          errorMessage = '토큰 형식이 올바르지 않습니다. 유효한 JWT 토큰을 사용해주세요.';
        }
        
        if (!res.headersSent) {
          return res.status(403).json({
            success: false,
            message: '유효하지 않은 토큰입니다.',
            error: errorMessage,
            errorType: err.name,
            hint: err.name === 'TokenExpiredError' 
              ? '토큰이 만료되었습니다. 다시 로그인해주세요.'
              : '올바른 JWT 토큰을 사용해주세요.'
          });
        }
        return;
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error('인증 미들웨어 오류:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: '인증 처리 중 오류가 발생했습니다.',
        error: error.message || '알 수 없는 오류가 발생했습니다.',
        hint: '서버 내부 오류입니다. 잠시 후 다시 시도해주세요.'
      });
    }
  }
};

// JWT 토큰 생성 함수
const createToken = (userId) => {
  return jwt.sign({ userId: userId }, JWT_SECRET, { expiresIn: '24h' });
};

module.exports = {
  authToken,
  createToken
};

