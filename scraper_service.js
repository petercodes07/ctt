#!/usr/bin/env node

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

const HOST = process.env.SCRAPER_SERVICE_HOST || '0.0.0.0';
const PORT = Number(process.env.SCRAPER_SERVICE_PORT || 9090);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const countriesData = require('./countries.json');
const ALL_COUNTRIES = Array.isArray(countriesData?.countries)
  ? countriesData.countries.map((c) => String(c.code || '').toUpperCase()).filter(Boolean)
  : [];
const CODE_TO_NAME = {};
if (Array.isArray(countriesData?.countries)) {
  countriesData.countries.forEach((c) => {
    if (c.code && c.name) {
      CODE_TO_NAME[c.code.toUpperCase()] = c.name;
    }
  });
}
const DEFAULT_COUNTRIES = ['US', 'ID', 'BR', 'MX', 'VN', 'PH', 'TH'];
const DEFAULT_LIMIT = 3;
const AUTO_FETCH_ENABLED = ['1', 'true', 'yes'].includes(String(process.env.AUTO_FETCH_ENABLED || 'true').toLowerCase());
const AUTO_FETCH_INTERVAL_MINUTES = Math.max(30, Number(process.env.AUTO_FETCH_INTERVAL_MINUTES || 360));
const AUTO_FETCH_LIMIT = Math.max(1, Number(process.env.AUTO_FETCH_LIMIT || DEFAULT_LIMIT));
const AUTO_FETCH_ON_START = String(process.env.AUTO_FETCH_ON_START || 'true').toLowerCase() !== 'false';
let activeFetchJob = null;
let activeFetchMeta = null;
let lastFetchResult = null;
let nextAutoFetchAt = null;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
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

function normalizeSong(song, index, countryFallback) {
  const thumbnail = song.thumbnail_url
    ?? song.thumbnailUrl
    ?? song.thumbnail
    ?? song.image
    ?? song.cover
    ?? '';
  const tiktokSoundUrl = song.link
    ?? song.tiktok_sound_url
    ?? song.tiktokSoundUrl
    ?? song.url
    ?? null;

  const rawCountry = (song.country ?? song.country_code ?? (countryFallback || 'US')).toUpperCase();
  const countryName = CODE_TO_NAME[rawCountry] || rawCountry;

  return {
    rank: song.rank ?? song.position ?? song.index ?? (index + 1),
    title: song.title ?? song.song_title ?? song.track ?? 'Unknown title',
    artist: song.artist ?? song.author ?? song.singer ?? 'Unknown artist',
    trend: song.trend ?? song.trend_type ?? 'steady',
    country: countryName,
    thumbnail_url: thumbnail,
    thumbnailUrl: thumbnail,
    thumbnail: thumbnail,
    image: song.image ?? thumbnail,
    cover: song.cover ?? thumbnail,
    tiktok_sound_url: tiktokSoundUrl,
    tiktokSoundUrl: tiktokSoundUrl,
    video_url: tiktokSoundUrl,
    videoUrl: tiktokSoundUrl,
    url: tiktokSoundUrl,
    source_url: song.url ?? null
  };
}

async function readSongs(country, mode) {
  const filename = getOutputFilename(country, mode);
  const filepath = path.join(DATA_DIR, filename);
  const data = await fs.readFile(filepath, 'utf8');
  const parsed = JSON.parse(data);

  const rawSongs = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed.songs) ? parsed.songs : []);

  return {
    filename,
    filepath,
    songs: rawSongs.map((song, index) => normalizeSong(song, index, country.toUpperCase())),
    scrapedAt: parsed.scraped_at || null
  };
}

async function readOutputSummary(country, mode) {
  const songsResult = await readSongs(country, mode);
  return {
    filename: songsResult.filename,
    filepath: songsResult.filepath,
    totalSongs: songsResult.songs.length,
    scrapedAt: songsResult.scrapedAt
  };
}

function parseCountries(rawCountries) {
  if (typeof rawCountries === 'string') {
    const value = rawCountries.trim();
    if (!value) return DEFAULT_COUNTRIES;
    if (value.toLowerCase() === 'all') {
      return ALL_COUNTRIES.length > 0 ? ALL_COUNTRIES : DEFAULT_COUNTRIES;
    }
    const parsed = value.split(',').map((c) => c.trim().toUpperCase()).filter(Boolean);
    return parsed.length > 0 ? parsed : DEFAULT_COUNTRIES;
  }

  if (Array.isArray(rawCountries) && rawCountries.length > 0) {
    const parsed = rawCountries.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
    if (parsed.some((c) => c === 'ALL')) {
      return ALL_COUNTRIES.length > 0 ? ALL_COUNTRIES : DEFAULT_COUNTRIES;
    }
    return parsed;
  }
  return DEFAULT_COUNTRIES;
}

function parseModes(rawMode) {
  const value = String(rawMode || 'both').toLowerCase();
  if (value === 'both' || value === 'all' || value === '') {
    return ['popular', 'breakout'];
  }
  if (value.includes(',')) {
    const modes = value.split(',').map((m) => m.trim()).filter(Boolean);
    const hasPopular = modes.includes('popular');
    const hasBreakout = modes.includes('breakout');
    if (hasPopular || hasBreakout) {
      return [hasPopular ? 'popular' : null, hasBreakout ? 'breakout' : null].filter(Boolean);
    }
    return ['popular', 'breakout'];
  }
  return value === 'breakout' ? ['breakout'] : ['popular'];
}

function dedupeSongs(songs) {
  const byKey = new Map();
  for (const song of songs) {
    const baseKey = song.tiktok_sound_url || song.url || `${song.title}|${song.artist}`;
    const key = `${song.country || 'XX'}|${baseKey}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        ...song,
        mode_ranks: song.source_mode ? { [song.source_mode]: song.rank } : {},
        source_modes: Array.isArray(song.source_modes)
          ? song.source_modes
          : (song.source_mode ? [song.source_mode] : [])
      });
      continue;
    }

    const existing = byKey.get(key);
    const mergedModes = new Set([...(existing.source_modes || [])]);
    if (song.source_mode) {
      mergedModes.add(song.source_mode);
    }
    if (Array.isArray(song.source_modes)) {
      song.source_modes.forEach((mode) => mergedModes.add(mode));
    }
    existing.source_modes = Array.from(mergedModes);
    if (song.source_mode && Number.isFinite(Number(song.rank))) {
      existing.mode_ranks = existing.mode_ranks || {};
      const current = existing.mode_ranks[song.source_mode];
      const nextRank = Number(song.rank);
      if (!Number.isFinite(current) || nextRank < current) {
        existing.mode_ranks[song.source_mode] = nextRank;
      }
    }
    byKey.set(key, existing);
  }

  const merged = Array.from(byKey.values());
  const byCountry = new Map();
  for (const song of merged) {
    const country = song.country || 'XX';
    if (!byCountry.has(country)) {
      byCountry.set(country, []);
    }
    byCountry.get(country).push(song);
  }

  const ranked = [];
  for (const [country, countrySongs] of byCountry.entries()) {
    const sorted = countrySongs.sort((a, b) => {
      const aPopular = Number(a.mode_ranks?.popular ?? Number.POSITIVE_INFINITY);
      const bPopular = Number(b.mode_ranks?.popular ?? Number.POSITIVE_INFINITY);
      const aBreakout = Number(a.mode_ranks?.breakout ?? Number.POSITIVE_INFINITY);
      const bBreakout = Number(b.mode_ranks?.breakout ?? Number.POSITIVE_INFINITY);
      const aBest = Math.min(aPopular, aBreakout);
      const bBest = Math.min(bPopular, bBreakout);

      if (aBest !== bBest) return aBest - bBest;

      const aBoth = Number.isFinite(aPopular) && Number.isFinite(aBreakout) ? 1 : 0;
      const bBoth = Number.isFinite(bPopular) && Number.isFinite(bBreakout) ? 1 : 0;
      if (aBoth !== bBoth) return bBoth - aBoth;

      if (aPopular !== bPopular) return aPopular - bPopular;
      if (aBreakout !== bBreakout) return aBreakout - bBreakout;

      return String(a.title || '').localeCompare(String(b.title || ''));
    });

    sorted.forEach((song, index) => {
      ranked.push({
        ...song,
        country,
        rank: index + 1
      });
    });
  }

  return ranked;
}

function startFetchJob(options) {
  if (activeFetchJob) {
    return false;
  }

  const startedAt = Date.now();
  const countries = parseCountries(options.countries || options.country);
  const modes = parseModes(options.mode);
  activeFetchMeta = {
    trigger: options.trigger || 'manual',
    startedAt: new Date(startedAt).toISOString(),
    countries,
    modes,
    limit: options.limit,
    noDates: options.noDates
  };
  activeFetchJob = (async () => {
    const countryResults = [];
    for (const country of countries) {
      for (const mode of modes) {
        const result = await runScraper({
          country,
          mode,
          limit: options.limit,
          noDates: options.noDates
        });
        countryResults.push({
          country,
          mode,
          ok: result.code === 0,
          exitCode: result.code
        });
      }
    }
    const failed = countryResults.filter((entry) => !entry.ok).length;
    const ok = failed === 0;
    const firstFailure = countryResults.find((entry) => !entry.ok);
    const firstCountry = countries[0] || 'US';
    return {
      ok,
      country: firstFailure ? firstFailure.country : firstCountry,
      mode: options.mode,
      exitCode: ok ? 0 : (firstFailure ? firstFailure.exitCode : 1),
      countryResults
    };
  })()
    .then((result) => {
      lastFetchResult = {
        ok: result.ok,
        country: result.country,
        mode: options.mode,
        trigger: activeFetchMeta?.trigger || options.trigger || 'manual',
        startedAt: activeFetchMeta?.startedAt || new Date(startedAt).toISOString(),
        countries,
        modes,
        limit: options.limit,
        exitCode: result.exitCode,
        durationMs: Date.now() - startedAt,
        countryResults: result.countryResults,
        completedAt: new Date().toISOString()
      };
    })
    .catch((error) => {
      lastFetchResult = {
        ok: false,
        country: options.country,
        mode: options.mode,
        trigger: activeFetchMeta?.trigger || options.trigger || 'manual',
        startedAt: activeFetchMeta?.startedAt || new Date(startedAt).toISOString(),
        countries,
        modes,
        limit: options.limit,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        stdout: '',
        stderr: error.message,
        completedAt: new Date().toISOString()
      };
    })
    .finally(() => {
      activeFetchJob = null;
      activeFetchMeta = null;
    });

  return true;
}

function scheduleAutoFetch() {
  if (!AUTO_FETCH_ENABLED) {
    return;
  }

  const intervalMs = AUTO_FETCH_INTERVAL_MINUTES * 60 * 1000;
  const runOnce = () => {
    const started = startFetchJob({
      countries: ALL_COUNTRIES.length > 0 ? ALL_COUNTRIES : DEFAULT_COUNTRIES,
      mode: 'both',
      limit: AUTO_FETCH_LIMIT,
      noDates: true,
      trigger: 'auto'
    });
    if (!started) {
      process.stdout.write('[scraper-service] auto fetch skipped (job already running)\n');
    } else {
      process.stdout.write('[scraper-service] auto fetch started for all countries\n');
    }
    nextAutoFetchAt = new Date(Date.now() + intervalMs).toISOString();
  };

  if (AUTO_FETCH_ON_START) {
    runOnce();
  } else {
    nextAutoFetchAt = new Date(Date.now() + intervalMs).toISOString();
  }

  setInterval(runOnce, intervalMs);
  process.stdout.write(
    `[scraper-service] auto fetch enabled: countries=${ALL_COUNTRIES.length || DEFAULT_COUNTRIES.length}, interval=${AUTO_FETCH_INTERVAL_MINUTES}m, limit=${AUTO_FETCH_LIMIT}\n`
  );
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
      sendJson(res, 200, {
        ok: true,
        service: 'scraper-service',
        pid: process.pid,
        host: HOST,
        port: PORT,
        cwd: ROOT_DIR,
        timestamp: new Date().toISOString(),
        autoFetch: {
          enabled: AUTO_FETCH_ENABLED,
          intervalMinutes: AUTO_FETCH_INTERVAL_MINUTES,
          limit: AUTO_FETCH_LIMIT,
          onStart: AUTO_FETCH_ON_START,
          nextRunAt: nextAutoFetchAt
        },
        activeFetch: activeFetchMeta
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/fetch-status') {
      sendJson(res, 200, {
        ok: true,
        inProgress: activeFetchJob !== null,
        activeFetch: activeFetchMeta,
        lastFetchResult,
        autoFetch: {
          enabled: AUTO_FETCH_ENABLED,
          intervalMinutes: AUTO_FETCH_INTERVAL_MINUTES,
          limit: AUTO_FETCH_LIMIT,
          onStart: AUTO_FETCH_ON_START,
          countryCount: ALL_COUNTRIES.length || DEFAULT_COUNTRIES.length,
          nextRunAt: nextAutoFetchAt
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/songs') {
      const countryParam = url.searchParams.get('country');
      const modeParam = url.searchParams.get('mode');
      const modes = parseModes(modeParam);
      const countries = parseCountries(countryParam ? [countryParam] : null);
      const songsByCountry = [];

      for (const country of countries) {
        for (const mode of modes) {
          try {
            const songsResult = await readSongs(country, mode);
            songsByCountry.push(...songsResult.songs.map((song) => ({
              ...song,
              source_mode: mode
            })));
          } catch (error) {
            if (!(error && error.code === 'ENOENT')) {
              throw error;
            }
          }
        }
      }
      sendJson(res, 200, dedupeSongs(songsByCountry));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/thumbnail') {
      const sourceUrl = url.searchParams.get('url');
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
        sendJson(res, 400, { ok: false, error: 'Invalid thumbnail url' });
        return;
      }

      const upstream = await fetch(sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Android) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
        }
      });

      if (!upstream.ok) {
        sendJson(res, 502, { ok: false, error: `Thumbnail upstream error (${upstream.status})` });
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      });
      res.end(body);
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
      const mode = String(body.mode || 'both').toLowerCase();
      const modes = parseModes(mode);
      const countries = body.allCountries === true
        ? (ALL_COUNTRIES.length > 0 ? ALL_COUNTRIES : DEFAULT_COUNTRIES)
        : parseCountries(body.countries || body.country);
      const limit = Number(body.limit || DEFAULT_LIMIT);
      const noDates = body.noDates !== false;
      const waitForCompletion = body.wait === true || body.sync === true;

      if (!waitForCompletion) {
        const started = startFetchJob({ countries, mode, limit, noDates, trigger: 'manual' });
        sendJson(res, 202, {
          ok: true,
          accepted: true,
          started,
          inProgress: activeFetchJob !== null,
          countries,
          mode: modes.length === 2 ? 'both' : modes[0],
          limit,
          lastFetchResult
        });
        return;
      }

      const startedAt = Date.now();
      const countryResults = [];
      for (const country of countries) {
        for (const entryMode of modes) {
          const result = await runScraper({ country, mode: entryMode, limit, noDates });
          countryResults.push({ country, mode: entryMode, ok: result.code === 0, exitCode: result.code });
        }
      }
      const failed = countryResults.filter((entry) => !entry.ok).length;

      sendJson(res, failed === 0 ? 200 : 500, {
        ok: failed === 0,
        countries,
        mode: modes.length === 2 ? 'both' : modes[0],
        limit,
        exitCode: failed === 0 ? 0 : 1,
        countryResults,
        durationMs: Date.now() - startedAt,
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
  scheduleAutoFetch();
});
