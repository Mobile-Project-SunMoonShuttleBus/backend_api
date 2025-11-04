const jwt = require('jsonwebtoken');
require('dotenv').config();
const TokenBlacklist = require('../models/TokenBlacklist');

const JWT_SECRET = process.env.JWT_SECRET;

// JWT 검증
const authToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer token

  if (!token) {
    return res.status(401).json(
        { 
            message: '인증 토큰이 필요합니다.' 
        }
    );
  }

  // JWT 블랙리스트 확인
  const blacklistedToken = await TokenBlacklist.findOne({ token });
  if (blacklistedToken) {
    return res.status(403).json(
        { 
            message: '유효하지 않은 토큰입니다.' 
        }
    );
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
        return res.status(403).json(
            { 
                message: '유효하지 않은 토큰입니다.' 
            }
        );
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

