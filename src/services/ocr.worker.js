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
      // Matches: "Gross Weight  35000" or "Gross Wt: 35000" or "Gross  35,000"
      pattern: /gross\s*(?:weight|wt)?\s*[:\-]?\s*([\d,\.]+)/i,
      validate: (v) => parseFloat(v.replace(/,/g, '')) > 0
    },
    {
      label: 'tare_weight',
      // Matches: "Tare Weight  15000" or "Tare Wt: 15000"
      pattern: /tare\s*(?:weight|wt)?\s*[:\-]?\s*([\d,\.]+)/i,
      validate: (v) => parseFloat(v.replace(/,/g, '')) > 0
    },
    {
      label: 'net_weight',
      // Matches: "Nett Weight  20000" or "Net Weight: 20000"
      pattern: /n[ae]tt?\s*(?:weight|wt)?\s*[:\-]?\s*([\d,\.]+)/i,
      validate: (v) => parseFloat(v.replace(/,/g, '')) > 0
    },
    {
      label: 'vehicle_number',
      // Matches: "Vehicle Reg: YD16WMD" or "Veh No: GJ05AB1234"
      pattern: /vehicle\s*(?:reg|no|number|registration)?\s*[:\-]?\s*([A-Z0-9]{5,10})/i,
      validate: (v) => v.replace(/[\s\-]/g, '').length >= 5
    },
    {
      label: 'ticket_number',
      // Matches: "Ticket No  2000181"
      pattern: /ticket\s*(?:no|number|#)?\s*[:\-]?\s*(\w+)/i,
      validate: null
    },
    {
      label: 'date',
      // Matches: "27/06/2019" or "27-06-2019" or "Date  27/06/2019"
      pattern: /(?:date\s*[:\-]?\s*)?(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      validate: (v) => !isNaN(Date.parse(v.replace(/\./g, '/')))
    },
    {
      label: 'customer',
      // Matches: "Customer O/N  A004"
      pattern: /customer\s*(?:o\/n|no|number|name)?\s*[:\-]?\s*([A-Z0-9]+)/i,
      validate: null
    },
    {
      label: 'transaction_type',
      // Matches: "Transaction Type  INWARD"
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

  if (!capture) {
    console.error(`[OCR Worker] Capture not found: ${captureId}`);
    return;
  }

  await prisma.capture.update({
    where: { id: captureId },
    data: { status: 'PROCESSING' }
  });

  try {
    // Download image from Vercel Blob
    const imageResponse = await axios.get(capture.blobUrl, {
      responseType: 'arraybuffer'
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    // Run Tesseract — PSM 6 works well for structured forms/tickets
    const ocrResult = await Tesseract.recognize(imageBuffer, 'eng', {
      tessedit_pageseg_mode: '6',
    });

    // Extract structured fields
    const fields = extractFields(ocrResult, capture.documentType);

    // Delete any existing fields for this capture (in case of retry)
    await prisma.extractedField.deleteMany({
      where: { captureId }
    });

    // Save extracted fields to DB
    await prisma.extractedField.createMany({
      data: fields.map((f) => ({
        captureId,
        fieldName: f.fieldName,
        value: f.value,
        confidenceScore: f.confidenceScore
      }))
    });

    // Mark as PENDING_REVIEW
    await prisma.capture.update({
      where: { id: captureId },
      data: { status: 'PENDING_REVIEW' }
    });

    // Audit log
    await auditService.createAuditLog({
      captureId,
      eventType: 'OCR_COMPLETED',
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      fieldName: null,
      oldValue: null,
      newValue: `${fields.length} fields extracted. Page confidence: ${Math.round(ocrResult.data.confidence)}%`
    });

    console.log(
      `[OCR Worker] Done: ${captureId} — ${fields.length} fields, ` +
      `page confidence ${Math.round(ocrResult.data.confidence)}%`
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