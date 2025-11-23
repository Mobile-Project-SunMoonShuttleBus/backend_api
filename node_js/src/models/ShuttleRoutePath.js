const mongoose = require('mongoose');

const shuttleRoutePathSchema = new mongoose.Schema({
  routeKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  departure: {
    type: String,
    required: true,
    index: true
  },
  arrival: {
    type: String,
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['등교', '하교'],
    required: true,
    index: true
  },
  dayType: {
    type: String,
    enum: ['평일', '토요일/공휴일', '일요일'],
    required: true,
    index: true
  },
  viaStops: {
    type: [String],
    default: []
  },
  path: {
    type: [[Number]],
    required: true
  },
  distance: {
    type: Number,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  stopCoordinates: {
    type: [
      {
        name: { type: String, required: true },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        order: { type: Number, required: true }
      }
    ],
    default: []
  },
  viaStopHash: {
    type: String,
    required: true,
    index: true
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

shuttleRoutePathSchema.index({ departure: 1, arrival: 1, direction: 1, dayType: 1 });
shuttleRoutePathSchema.index({ viaStopHash: 1 });

shuttleRoutePathSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const ShuttleRoutePath = mongoose.model('ShuttleRoutePath', shuttleRoutePathSchema);

module.exports = ShuttleRoutePath;

