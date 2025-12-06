/*
Seed script for crowd_snapshots collection.
Usage:
  set MONGO_URI="your_mongo_uri"; node scripts/seedCrowdSnapshots.js 2025-12-02
If no date arg is provided, uses today's date (server timezone).
*/

const path = require('path');
const mongoose = require('mongoose');

const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'src', 'data', 'routeMaster.json');
const routeMaster = require(dataPath);

// Load models by requiring project's database config if present
try {
  require(path.join(root, 'src', 'config', 'database'));
} catch (e) {
  // If config/database throws because of missing env, ignore and connect manually below
}

const CrowdSnapshot = require(path.join(root, 'src', 'models', 'CrowdSnapshot'));

const MONGO_URI = process.env.MONGO_URI || process.env.MONGOURL || 'mongodb://localhost:27017/sunmoon_shuttle';

async function connect() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB:', MONGO_URI);
}

function pickTopLevel(samples) {
  if (samples < 15) return 'LOW';
  if (samples < 30) return 'MEDIUM';
  return 'HIGH';
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed(dayKey) {
  await connect();

  const docs = [];
  for (const route of routeMaster) {
    for (const time of route.departures) {
      // only include campus routes by default for overview; include shuttle optionally
      // create a random sample count between 10 and 40
      const samples = randInt(10, 40);
      const top_level = pickTopLevel(samples);

      docs.push({
        busType: route.busType,
        start_id: route.startId,
        stop_id: route.stopId,
        departure_time: time,
        day_key: dayKey,
        samples: samples,
        avg_level_score: Math.round((Math.random() * 1) * 100) / 100,
        top_level: top_level,
        updated_at: new Date()
      });
    }
  }

  if (docs.length === 0) {
    console.log('No documents to insert. Exiting.');
    process.exit(0);
  }

  try {
    // upsert each doc by unique key to avoid duplicates on repeated runs
    let inserted = 0;
    for (const doc of docs) {
      const filter = {
        busType: doc.busType,
        start_id: doc.start_id,
        stop_id: doc.stop_id,
        departure_time: doc.departure_time,
        day_key: doc.day_key
      };
      const update = { $set: doc };
      const opts = { upsert: true };
      await CrowdSnapshot.updateOne(filter, update, opts);
      inserted++;
    }
    console.log(`Upserted ${inserted} snapshots for ${dayKey}`);
  } catch (err) {
    console.error('Insert error:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

// CLI
const argDate = process.argv[2];
let dayKey;
if (argDate && /^\d{4}-\d{2}-\d{2}$/.test(argDate)) {
  dayKey = argDate;
} else {
  dayKey = new Date().toISOString().split('T')[0];
}

seed(dayKey).catch(err => {
  console.error(err);
  process.exit(1);
});
