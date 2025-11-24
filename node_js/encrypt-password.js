const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { encrypt } = require('./src/utils/encryption');

const password = process.argv[2] || process.env.SCHOOL_PW;

if (!password) {
  console.error('사용법: node encrypt-password.js <비밀번호>');
  console.error('또는 .env에 SCHOOL_PW를 설정하고 실행: node encrypt-password.js');
  process.exit(1);
}

try {
  const encrypted = encrypt(password);
  console.log('\n암호화된 비밀번호:');
  console.log(encrypted);
  console.log('\n.env 파일에 다음과 같이 설정하세요:');
  console.log(`SCHOOL_PW="${encrypted}"`);
  console.log('');
} catch (error) {
  console.error('암호화 오류:', error.message);
  process.exit(1);
}

