#!/usr/bin/env node

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const HOST = '127.0.0.1';
const PORT = Number(process.env.SCRAPER_SERVICE_PORT || 4387);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getOutputFilename(country, mode) {
  const normalizedCountry = (country || 'US').toUpperCase();
  const countrySuffix = normalizedCountry !== 'US' ? `_${normalizedCountry}` : '';
  const modeSuffix = mode === 'breakout' ? '_breakout' : '';
  return `trending_music_with_trends${countrySuffix}${modeSuffix}.json`;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 1_000_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function runScraper({ country = 'US', mode = 'popular', limit = 100, noDates = true }) {
  return new Promise((resolve, reject) => {
    const normalizedCountry = String(country || 'US').toUpperCase();
    const normalizedMode = mode === 'breakout' ? 'breakout' : 'popular';
    const numericLimit = Number.isFinite(Number(limit)) ? Math.max(1, Number(limit)) : 100;

    const scraperScript = path.join(ROOT_DIR, 'scraper_with_trends.js');
    const args = [scraperScript, '--country', normalizedCountry, String(numericLimit)];
    if (noDates) args.push('--no-dates');
    if (normalizedMode === 'breakout') args.push('--breakout');

    // Use the exact Node binary running this service to avoid PATH/ENOENT issues.
    const nodeExecutable = process.execPath && process.execPath.length > 0 ? process.execPath : 'node';

    const child = spawn(nodeExecutable, args, {
      cwd: ROOT_DIR,
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr, country: normalizedCountry, mode: normalizedMode });
    });
  });
}

async function readOutputSummary(country, mode) {
  const filename = getOutputFilename(country, mode);
  const filepath = path.join(DATA_DIR, filename);

  const data = await fs.readFile(filepath, 'utf8');
  const parsed = JSON.parse(data);

  return {
    filename,
    filepath,
    totalSongs: parsed.total_songs || (Array.isArray(parsed.songs) ? parsed.songs.length : 0),
    scrapedAt: parsed.scraped_at || null
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'scraper-service',
        pid: process.pid,
        cwd: ROOT_DIR,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/songs/latest') {
      const country = (url.searchParams.get('country') || 'US').toUpperCase();
      const mode = (url.searchParams.get('mode') || 'popular').toLowerCase() === 'breakout' ? 'breakout' : 'popular';
      const summary = await readOutputSummary(country, mode);
      sendJson(res, 200, { ok: true, country, mode, summary });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/fetch-songs') {
      const body = await parseBody(req);
      const country = String(body.country || 'US').toUpperCase();
      const mode = String(body.mode || 'popular').toLowerCase() === 'breakout' ? 'breakout' : 'popular';
      const limit = Number(body.limit || 100);
      const noDates = body.noDates !== false;

      const startedAt = Date.now();
      const result = await runScraper({ country, mode, limit, noDates });
      let summary = null;

      try {
        summary = await readOutputSummary(country, mode);
      } catch (_) {
        summary = null;
      }

      sendJson(res, result.code === 0 ? 200 : 500, {
        ok: result.code === 0,
        country,
        mode,
        exitCode: result.code,
        durationMs: Date.now() - startedAt,
        stdout: result.stdout,
        stderr: result.stderr,
        summary
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[scraper-service] listening on http://${HOST}:${PORT}\n`);
});
