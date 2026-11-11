// One shared MongoDB connection for all routes:  npm install mongodb
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017', { serverSelectionTimeoutMS: 5000 });
let db;

async function connect() {
  await client.connect();
  db = client.db(process.env.MONGO_DB || 'truthlens');
  console.log('MongoDB connected:', db.databaseName);
  return db;
}

module.exports = { connect, getDb: () => db };
