'use strict';
/* =====================================================================
   Oddiy strukturali log. Bot tokeni va cookie'lar hech qachon
   logga tushmaydi (redaktsiya qilinadi).
   ===================================================================== */
const { config } = require('./config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[(process.env.LOG_LEVEL || (config.isProd ? 'info' : 'debug')).toLowerCase()] || LEVELS.info;

function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return text;
  if (config.botToken) text = text.split(config.botToken).join('***TOKEN***');
  if (config.sessionSecret) text = text.split(config.sessionSecret).join('***SECRET***');
  if (config.webhookSecret) text = text.split(config.webhookSecret).join('***WEBHOOK_SECRET***');
  return text.replace(/\d{6,}:[A-Za-z0-9_-]{30,}/g, '***TOKEN***');
}

function emit(level, message, meta) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${redact(message)}`;
  const extra = meta === undefined ? '' : ' ' + redact(meta);
  (level === 'error' || level === 'warn' ? console.error : console.log)(line + extra);
}

module.exports = {
  debug: (m, x) => emit('debug', m, x),
  info: (m, x) => emit('info', m, x),
  warn: (m, x) => emit('warn', m, x),
  error: (m, x) => emit('error', m, x),
  redact,
};
