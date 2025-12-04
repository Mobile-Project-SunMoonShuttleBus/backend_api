const { runManually } = require('./src/services/shuttleBusScheduler');

(async () => {
  const totalStart = Date.now();
  console.log('=== 타임 측정 시작 ===\n');
  
  try {
    const step1Start = Date.now();
    console.log('1. runManually 호출 시작...');
    
    const result = await Promise.race([
      runManually(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('전체 타임아웃 30초')), 30000)
      )
    ]);
    
    const step1Elapsed = ((Date.now() - step1Start) / 1000).toFixed(1);
    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
    
    console.log(`\n=== 결과 ===`);
    console.log(`runManually 소요시간: ${step1Elapsed}초`);
    console.log(`전체 소요시간: ${totalElapsed}초`);
    console.log(JSON.stringify({ 
      success: result.success, 
      found: result.schedulesFound, 
      saved: result.saved, 
      updated: result.updated 
    }, null, 2));
  } catch(e) {
    const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
    console.error(`\n⚠️ 에러 (전체 소요시간: ${totalElapsed}초):`, e.message);
    console.error(e.stack);
  }
})();

