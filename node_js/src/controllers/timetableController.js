const Timetable = require('../models/Timetable');
const User = require('../models/User');
const SchoolAccount = require('../models/SchoolAccount');

exports.getTimetable = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    const timetables = await Timetable.find({ userId }).sort({ 
      dayOfWeek: 1, 
      startTime: 1 
    });

    const schoolAccount = await SchoolAccount.findOne({ userId });
    
    let crawlingStatus = 'idle';
    let statusMessage = null;
    
    if (schoolAccount) {
      crawlingStatus = schoolAccount.crawlingStatus || 'idle';
      
      if (crawlingStatus === 'crawling') {
        statusMessage = '시간표를 불러오는 중입니다. 잠시만 기다려주세요.';
      } else if (crawlingStatus === 'failed') {
        statusMessage = schoolAccount.crawlingError || '시간표 크롤링에 실패했습니다.';
      } else if (crawlingStatus === 'idle' && timetables.length === 0) {
        statusMessage = '시간표가 아직 크롤링되지 않았습니다. 포털 계정 정보를 저장하면 자동으로 크롤링이 시작됩니다.';
      }
    } else if (timetables.length === 0) {
      statusMessage = '포털 계정 정보가 저장되지 않았습니다. 계정 정보를 저장하면 시간표가 자동으로 크롤링됩니다.';
    }

    const days = ['월', '화', '수', '목', '금', '토', '일'];
    const groupedByDay = {};

    days.forEach(day => {
      groupedByDay[day] = timetables
        .filter(item => item.dayOfWeek === day)
        .map(item => ({
          subjectName: item.subjectName,
          startTime: item.startTime,
          endTime: item.endTime,
          location: item.location || null,
          professor: item.professor || null
        }));
    });

    const response = {
      success: true,
      count: timetables.length,
      timetable: groupedByDay,
      crawlingStatus: crawlingStatus
    };
    
    if (statusMessage) {
      response.statusMessage = statusMessage;
    }
    
    if (schoolAccount && schoolAccount.lastCrawledAt) {
      response.lastCrawledAt = schoolAccount.lastCrawledAt;
    }

    res.json(response);
  } catch (error) {
    console.error('시간표 조회 오류:', error);
    res.status(500).json({
      message: '시간표 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
};

