const jwt = require('jsonwebtoken');
require('dotenv').config();
const TokenBlacklist = require('../models/TokenBlacklist');

const JWT_SECRET = process.env.JWT_SECRET;

// JWT 검증
const authToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer token

  if (!token) {
    return res.status(401).json({
      message: '인증 토큰이 필요합니다.',
      error: 'JWT 토큰이 요청 헤더에 없습니다. Authorization 헤더에 "Bearer {토큰}" 형식으로 토큰을 포함해주세요.',
      hint: '로그인 API(/api/auth/login)를 통해 토큰을 발급받을 수 있습니다.'
    });
  }

  // JWT 블랙리스트 확인
  const blacklistedToken = await TokenBlacklist.findOne({ token });
  if (blacklistedToken) {
    return res.status(403).json({
      message: '유효하지 않은 토큰입니다.',
      error: '이 토큰은 로그아웃되어 사용할 수 없습니다. 다시 로그인하여 새로운 토큰을 발급받아주세요.'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      let errorMessage = '토큰 검증에 실패했습니다.';
      if (err.name === 'TokenExpiredError') {
        errorMessage = '토큰이 만료되었습니다. 다시 로그인하여 새로운 토큰을 발급받아주세요.';
      } else if (err.name === 'JsonWebTokenError') {
        errorMessage = '토큰 형식이 올바르지 않습니다. 유효한 JWT 토큰을 사용해주세요.';
      }
      
      return res.status(403).json({
        message: '유효하지 않은 토큰입니다.',
        error: errorMessage,
        errorType: err.name
      });
    }
    req.user = user;
    next();
  });
};

// JWT 토큰 생성 함수
const createToken = (userId) => {
  return jwt.sign({ userId: userId }, JWT_SECRET, { expiresIn: '24h' });
};

module.exports = {
  authToken,
  createToken
};

