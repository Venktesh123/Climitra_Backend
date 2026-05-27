require('dotenv').config();

const app = require('./app');

const prisma = require('./database/prismaClient');

const { redis } = require('./services/queue.service');

const { startWorker } = require('./services/ocr.worker');

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {

    // PostgreSQL Connection
    await prisma.$connect();
    console.log('PostgreSQL Connected Successfully');

    // Redis connects automatically via queue.service.js

    // Start OCR Worker — polls Redis queue every 3s
    startWorker();

    // Start Server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.log('Server Startup Failed');
    console.log(error.message);
  }
}

startServer();