#!/usr/bin/env node

// ============================================
// 개발용 JWT 무제한 토큰 생성 스크립트
// ============================================
// 이 파일은 개발/테스트용입니다.
// 프로덕션 배포 전에 제거하세요.
// 제거 방법: 이 파일을 삭제하면 됩니다.
// ============================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const connectDB = require('./src/config/database');
const User = require('./src/models/User');

async function main() {
  try {
    await connectDB();
    
    // 개발용 테스트 사용자 찾기 또는 생성
    let devUser = await User.findOne({ userId: 'dev_test' });
    
    if (!devUser) {
      console.log('개발용 테스트 사용자 생성 중...');
      devUser = new User({
        userId: 'dev_test',
        password: 'dev123456' // 개발용 비밀번호
      });
      await devUser.save();
      console.log('✅ 개발용 테스트 사용자 생성 완료');
    } else {
      console.log('✅ 기존 개발용 테스트 사용자 사용');
    }
    
    // JWT 토큰 생성 (무제한 - 만료 시간 없음)
    const userId = devUser._id.toString();
    const JWT_SECRET = process.env.JWT_SECRET;
    // expiresIn을 설정하지 않으면 무제한 토큰
    const token = jwt.sign({ userId: userId }, JWT_SECRET);
    
    console.log('\n' + '='.repeat(60));
    console.log('개발용 JWT 무제한 토큰 생성 완료');
    console.log('='.repeat(60));
    console.log('\n📋 사용자 정보:');
    console.log(`   ID: ${devUser.userId}`);
    console.log(`   Password: dev123456`);
    console.log(`   User ObjectId: ${userId}`);
    console.log('\n🔑 JWT 토큰 (무제한):');
    console.log(token);
    console.log('\n📝 사용 방법:');
    console.log('   curl 명령어:');
    console.log(`   curl -H "Authorization: Bearer ${token}" http://localhost:8080/api/bus/schedules`);
    console.log('\n   JavaScript/React:');
    console.log(`   fetch('/api/bus/schedules', {`);
    console.log(`     headers: { 'Authorization': 'Bearer ${token}' }`);
    console.log(`   })`);
    console.log('\n⏰ 토큰 유효기간: 무제한 (만료 없음)');
    console.log('\n⚠️  주의: 이 토큰은 개발/테스트용입니다. 프로덕션에서는 사용하지 마세요!');
    console.log('='.repeat(60));
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('오류 발생:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

main();

