const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  stopId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  lat: {
    type: Number,
    required: true
  },
  lon: {
    type: Number,
    required: true
  }
}, { _id: false });

const timeSlotSchema = new mongoose.Schema({
  departure: {
    type: String,
    required: true
  },
  arrival: {
    type: String,
    required: true
  },
  note: {
    type: String,
    default: ''
  }
}, { _id: false });

const shuttleRouteSchema = new mongoose.Schema({
  routeId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  routeName: {
    type: String,
    required: true
  },
  stops: {
    type: [stopSchema],
    required: true
  },
  timetable: {
    weekday: [timeSlotSchema],
    weekend: [timeSlotSchema]
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 업데이트 시간 자동 갱신
shuttleRouteSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const ShuttleRoute = mongoose.model('ShuttleRoute', shuttleRouteSchema);

module.exports = ShuttleRoute;

