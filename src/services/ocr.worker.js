const Tesseract = require('tesseract.js');
const axios = require('axios');

const prisma = require('../database/prismaClient');
const queueService = require('./queue.service');
const auditService = require('./audit.service');

// ─── FIELD EXTRACTION RULES PER DOCUMENT TYPE ───────────────────────────────
const FIELD_RULES = {
  WEIGHBRIDGE: [
    {
      label: 'gross_weight',
      pattern: /gross\s*(?:weight|wt)?\s*[:\-]?\s*([\d,\.]+)/i,
      validate: (v) => parseFloat(v.replace(/,/g, '')) > 0
    },
    {
      label: 'tare_weight',
      pattern: /tare\s*(?:weight|wt)?\s*[:\-]?\s*([\d,\.]+)/i,
      validate: (v) => parseFloat(v.replace(/,/g, '')) > 0
    },
    {
      label: 'net_weight',
      pattern: /n[ae]tt?\s*(?:weight|wt)?\s*[:\-]?\s*([\d,\.]+)/i,
      validate: (v) => parseFloat(v.replace(/,/g, '')) > 0
    },
    {
      label: 'vehicle_number',
      pattern: /vehicle\s*(?:reg|no|number|registration)?\s*[:\-]?\s*([A-Z0-9]{5,10})/i,
      validate: (v) => v.replace(/[\s\-]/g, '').length >= 5
    },
    {
      label: 'ticket_number',
      pattern: /ticket\s*(?:no|number|#)?\s*[:\-]?\s*(\w+)/i,
      validate: null
    },
    {
      label: 'date',
      pattern: /(?:date\s*[:\-]?\s*)?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      validate: (v) => !isNaN(Date.parse(v.replace(/\./g, '/')))
    },
    {
      label: 'customer',
      pattern: /customer\s*(?:o\/n|no|number|name)?\s*[:\-]?\s*([A-Z0-9]+)/i,
      validate: null
    },
    {
      label: 'transaction_type',
      pattern: /transaction\s*(?:type)?\s*[:\-]?\s*([A-Z]+)/i,
      validate: null
    }
  ],

  MOISTURE_METER: [
    {
      label: 'moisture_percent',
      pattern: /(\d{1,2}(?:\.\d{1,2})?)\s*%/,
      validate: (v) => parseFloat(v) >= 0 && parseFloat(v) <= 100
    },
    {
      label: 'material_type',
      pattern: /material\s*[:\-]?\s*([A-Za-z\s]+)/i,
      validate: null
    },
    {
      label: 'temperature',
      pattern: /temp(?:erature)?\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*°?[CF]?/i,
      validate: null
    },
    {
      label: 'date',
      pattern: /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
      validate: (v) => !isNaN(Date.parse(v.replace(/\./g, '/')))
    }
  ],

  DISPATCH_CHALLAN: [
    {
      label: 'challan_number',
      pattern: /challan\s*(?:no|number|#)?\s*[:\-]?\s*(\w+)/i,
      validate: null
    },
    {
      label: 'vehicle_number',
      pattern: /vehicle\s*(?:reg|no|number)?\s*[:\-]?\s*([A-Z0-9]{5,10})/i,
      validate: (v) => v.replace(/[\s\-]/g, '').length >= 5
    },
    {
      label: 'quantity',
      pattern: /(?:qty|quantity)\s*[:\-]?\s*([\d,\.]+)/i,
      validate: (v) => parseFloat(v.replace(/,/g, '')) > 0
    },
    {
      label: 'driver_name',
      pattern: /(?:driver|haulier)\s*[:\-]?\s*([A-Za-z\s]+)/i,
      validate: null
    },
    {
      label: 'date',
      pattern: /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
      validate: (v) => !isNaN(Date.parse(v.replace(/\./g, '/')))
    },
    {
      label: 'destination',
      pattern: /destination\s*[:\-]?\s*([A-Za-z\s,]+)/i,
      validate: null
    }
  ]
};

// ─── BLANK / UNREADABLE IMAGE DETECTION ─────────────────────────────────────
const isBlankOrUnreadable = (ocrResult) => {
  const { data } = ocrResult;
  const text = (data.text || '').trim();
  const confidence = data.confidence || 0;

  // Blank if nothing extracted or confidence too low to be useful
  return text.length === 0 || confidence < 20;
};

// ─── CONFIDENCE SCORING ──────────────────────────────────────────────────────
const scoreConfidence = (matchedValue, words, pageConfidence, rule) => {
  if (!matchedValue) return 0;

  const matchWords = matchedValue.trim().toLowerCase().split(/\s+/);
  const matchedWordObjs = words.filter((w) =>
    matchWords.some((mv) => w.text.toLowerCase().includes(mv))
  );

  let confidence;

  if (matchedWordObjs.length > 0) {
    const avg =
      matchedWordObjs.reduce((sum, w) => sum + w.confidence, 0) /
      matchedWordObjs.length;
    confidence = avg;
  } else {
    confidence = pageConfidence * 0.85;
  }

  if (rule.validate && !rule.validate(matchedValue)) {
    confidence = Math.min(confidence, 55);
  }

  if (pageConfidence < 50) {
    confidence = confidence * 0.7;
  }

  return Math.round(Math.min(100, Math.max(0, confidence)));
};

// ─── EXTRACT FIELDS FROM TEXT ────────────────────────────────────────────────
const extractFields = (ocrResult, documentType) => {
  const { data } = ocrResult;
  const text = data.text;
  const words = data.words || [];
  const pageConfidence = data.confidence || 50;

  console.log('[OCR Worker] Raw text:\n', text);
  console.log('[OCR Worker] Page confidence:', pageConfidence);

  const rules = FIELD_RULES[documentType] || FIELD_RULES.WEIGHBRIDGE;
  const extracted = [];

  for (const rule of rules) {
    const match = text.match(rule.pattern);
    const value = match ? match[1].trim() : null;
    const confidence = scoreConfidence(value, words, pageConfidence, rule);

    console.log(`[OCR Worker] Field "${rule.label}": "${value}" (${confidence}%)`);

    extracted.push({
      fieldName: rule.label,
      value: value || '',
      confidenceScore: value ? confidence : 0,
    });
  }

  return extracted;
};

// ─── PROCESS A SINGLE JOB ────────────────────────────────────────────────────
const processJob = async (job) => {
  const { captureId } = job;

  console.log(`[OCR Worker] Processing capture: ${captureId}`);

  const capture = await prisma.capture.findUnique({
    where: { id: captureId }
  });

  // Capture not found in DB — ack and bail immediately
  if (!capture) {
    console.error(`[OCR Worker] Capture not found: ${captureId}`);
    await queueService.ackJob(job);
    return;
  }

  // Guard: skip anything already past QUEUED to prevent reprocessing
  // This handles the case where the same job is delivered twice by the queue
  if (capture.status !== 'QUEUED') {
    console.warn(`[OCR Worker] Skipping ${captureId} — status is already "${capture.status}"`);
    await queueService.ackJob(job);
    return;
  }

  await prisma.capture.update({
    where: { id: captureId },
    data: { status: 'PROCESSING' }
  });

  try {
    // Download image from Vercel Blob
    // timeout: 15s guards against hanging on blank/corrupt blob URLs
    const imageResponse = await axios.get(capture.blobUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    // Run Tesseract — PSM 6 works well for structured forms/tickets
    const ocrResult = await Tesseract.recognize(imageBuffer, 'eng', {
      tessedit_pageseg_mode: '6',
    });

    const pageConfidence = Math.round(ocrResult.data.confidence);
    const rules = FIELD_RULES[capture.documentType] || FIELD_RULES.WEIGHBRIDGE;

    // ── CASE 1: Blank or completely unreadable image ─────────────────────────
    // e.g. dark photo, upside down, corrupted upload
    if (isBlankOrUnreadable(ocrResult)) {
      console.warn(`[OCR Worker] Blank/unreadable image for capture: ${captureId}`);

      // Still write all expected fields as empty so reviewer sees full structure
      await prisma.extractedField.deleteMany({ where: { captureId } });
      await prisma.extractedField.createMany({
        data: rules.map((rule) => ({
          captureId,
          fieldName: rule.label,
          value: '',
          confidenceScore: 0
        }))
      });

      await prisma.capture.update({
        where: { id: captureId },
        data: { status: 'OCR_FAILED' }
      });

      await auditService.createAuditLog({
        captureId,
        eventType: 'OCR_FAILED',
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        fieldName: null,
        oldValue: null,
        newValue: `Blank or unreadable image (confidence: ${pageConfidence}%)`
      });

      console.warn(`[OCR Worker] Marked as OCR_FAILED (blank): ${captureId}`);
      return; // falls through to finally → ackJob
    }

    // Extract structured fields
    const fields = extractFields(ocrResult, capture.documentType);

    const matchedCount = fields.filter((f) => f.value !== '').length;
    const totalCount = fields.length;
    const matchRatio = matchedCount / totalCount;

    console.log(`[OCR Worker] Matched ${matchedCount}/${totalCount} fields (ratio: ${matchRatio.toFixed(2)})`);

    // Always save whatever was extracted — even partial or empty
    await prisma.extractedField.deleteMany({ where: { captureId } });
    await prisma.extractedField.createMany({
      data: fields.map((f) => ({
        captureId,
        fieldName: f.fieldName,
        value: f.value,
        confidenceScore: f.confidenceScore
      }))
    });

    // ── CASE 2: Valid image but wrong document / missing data ─────────────────
    // e.g. AC unit photo uploaded as WEIGHBRIDGE — like in the screenshot
    // Threshold: less than 30% of expected fields matched
    if (matchRatio < 0.3) {
      console.warn(`[OCR Worker] Too few fields matched for capture: ${captureId}`);

      await prisma.capture.update({
        where: { id: captureId },
        data: { status: 'OCR_FAILED' }
      });

      await auditService.createAuditLog({
        captureId,
        eventType: 'OCR_FAILED',
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        fieldName: null,
        oldValue: null,
        newValue: `Only ${matchedCount}/${totalCount} fields matched — wrong document type or missing data (confidence: ${pageConfidence}%)`
      });

      console.warn(`[OCR Worker] Marked as OCR_FAILED (wrong doc/missing data): ${captureId}`);
      return; // falls through to finally → ackJob
    }

    // ── CASE 3: Normal successful extraction ──────────────────────────────────
    await prisma.capture.update({
      where: { id: captureId },
      data: { status: 'PENDING_REVIEW' }
    });

    await auditService.createAuditLog({
      captureId,
      eventType: 'OCR_COMPLETED',
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      fieldName: null,
      oldValue: null,
      newValue: `${matchedCount}/${totalCount} fields extracted. Page confidence: ${pageConfidence}%`
    });

    console.log(
      `[OCR Worker] Done: ${captureId} — ${matchedCount}/${totalCount} fields, ` +
      `page confidence ${pageConfidence}%`
    );

  } catch (error) {
    console.error(`[OCR Worker] Failed for ${captureId}:`, error.message);

    await prisma.capture.update({
      where: { id: captureId },
      data: { status: 'OCR_FAILED' }
    });

    await auditService.createAuditLog({
      captureId,
      eventType: 'OCR_FAILED',
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      fieldName: null,
      oldValue: null,
      newValue: error.message
    });

  } finally {
    // Always ack the job — this is what prevents the infinite loop
    // Every exit path (early return, success, catch) hits this
    await queueService.ackJob(job);
  }
};

// ─── POLL LOOP ────────────────────────────────────────────────────────────────
let isRunning = false;

const startWorker = () => {
  console.log('[OCR Worker] Started — polling every 3s');

  setInterval(async () => {
    if (isRunning) return;

    const job = await queueService.getJob();
    if (!job) return;

    isRunning = true;
    try {
      await processJob(job);
    } finally {
      isRunning = false;
    }
  }, 3000);
};

module.exports = { startWorker };