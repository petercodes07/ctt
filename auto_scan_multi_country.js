#!/usr/bin/env node

/**
 * Automated Multi-Country Scanner
 *
 * Scans multiple countries automatically with smart breaks to avoid rate limiting
 * Keeps computer awake during the entire process (macOS)
 *
 * Features:
 *   - 30-second break between each country
 *   - 2-minute break every 5 countries
 *   - Prevents computer sleep
 *   - Email notifications
 *   - Progress tracking
 *
 * Usage:
 *   node auto_scan_multi_country.js quick                    -> Quick scan (50 songs) for top 10 countries
 *   node auto_scan_multi_country.js full                     -> Full scan (100 songs) for top 10 countries
 *   node auto_scan_multi_country.js quick US,PH,JP           -> Quick scan for specific countries
 *   node auto_scan_multi_country.js full US,PH,JP,BR,FR      -> Full scan for specific countries
 *   node auto_scan_multi_country.js quick --top10            -> Quick scan for top 10 countries
 *   node auto_scan_multi_country.js full --all               -> Full scan ALL 72 countries (takes ~4 hours!)
 *   node auto_scan_multi_country.js full --email             -> Full scan with email notification
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load countries
const countriesData = require('./countries.json');
const allCountries = countriesData.countries.map(c => c.code);

// Top countries by TikTok usage
const topCountries = ['US', 'ID', 'BR', 'MX', 'VN', 'PH', 'TH', 'TR', 'RU', 'JP'];

// Parse arguments
const args = process.argv.slice(2);
const scanType = args[0]?.toLowerCase(); // quick or full
let countries = [];
let sendEmail = false;

// Parse country selection
for (let i = 1; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--email') {
    sendEmail = true;
  } else if (arg === '--top10') {
    countries = topCountries;
  } else if (arg === '--all') {
    countries = allCountries;
  } else if (arg.includes(',')) {
    countries = arg.split(',').map(c => c.trim().toUpperCase());
  } else {
    countries.push(arg.toUpperCase());
  }
}

// Default to top 10 if no countries specified
if (countries.length === 0) {
  countries = topCountries;
}

// Validate scan type
if (!scanType || !['quick', 'full'].includes(scanType)) {
  console.log('❌ Invalid scan type\n');
  console.log('📖 Usage:');
  console.log('  node auto_scan_multi_country.js quick [countries]');
  console.log('  node auto_scan_multi_country.js full [countries]\n');
  console.log('Options:');
  console.log('  --top10       Scan top 10 countries (default)');
  console.log('  --all         Scan all 72 countries');
  console.log('  --email       Send email notification when complete');
  console.log('  US,PH,JP      Comma-separated country codes\n');
  console.log('Examples:');
  console.log('  node auto_scan_multi_country.js quick');
  console.log('  node auto_scan_multi_country.js full --top10');
  console.log('  node auto_scan_multi_country.js quick US,PH,JP,BR');
  console.log('  node auto_scan_multi_country.js full --all --email\n');
  process.exit(1);
}

const maxSongs = scanType === 'quick' ? 50 : 100;

// Break configuration
const DELAY_BETWEEN_COUNTRIES = 30000; // 30 seconds between each country
const LONG_BREAK_INTERVAL = 5; // Take a long break every 5 countries
const LONG_BREAK_DURATION = 120000; // 2 minutes long break

// Calculate estimated time with breaks
const shortBreaks = Math.max(0, countries.length - 1) * (DELAY_BETWEEN_COUNTRIES / 1000);
const longBreaks = Math.floor(countries.length / LONG_BREAK_INTERVAL) * (LONG_BREAK_DURATION / 1000);
const scanTime = countries.length * 120; // ~2 minutes per country
const totalEstimatedSeconds = scanTime + shortBreaks + longBreaks;
const estimatedMinutes = Math.ceil(totalEstimatedSeconds / 60);

// Display scan plan
console.log('\n' + '='.repeat(70));
console.log('🌍 AUTOMATED MULTI-COUNTRY SCANNER');
console.log('='.repeat(70));
console.log(`📊 Scan type: ${scanType.toUpperCase()} (${maxSongs} songs per tab)`);
console.log(`🌎 Countries: ${countries.length} (${countries.join(', ')})`);
console.log(`📧 Email: ${sendEmail ? 'Yes' : 'No'}`);
console.log(`⏰ Estimated time: ${estimatedMinutes} minutes (includes breaks)`);
console.log(`⏸️  Breaks: 30s between countries, 2min every 5 countries`);
console.log(`💤 Sleep prevention: ACTIVE (computer will stay awake)`);
console.log('='.repeat(70) + '\n');

// Results tracking
const results = {
  total: countries.length,
  completed: 0,
  failed: 0,
  startTime: Date.now(),
  countryResults: []
};

/**
 * Scan a single country
 */
async function scanCountry(countryCode, index) {
  return new Promise((resolve) => {
    const countryStartTime = Date.now();

    console.log('\n' + '─'.repeat(70));
    console.log(`🚀 [${index + 1}/${countries.length}] Scanning ${countryCode}`);
    console.log('─'.repeat(70));

    const scriptPath = path.join(__dirname, 'scraper_with_trends.js');
    const cmdArgs = [
      scriptPath,
      '--country', countryCode,
      maxSongs.toString(),
      '--both'
    ];

    const scraperProcess = spawn('node', cmdArgs, {
      stdio: 'inherit',
      env: { ...process.env, CCT_CACHE: '0' }
    });

    scraperProcess.on('exit', (code) => {
      const duration = Math.round((Date.now() - countryStartTime) / 1000);

      if (code === 0) {
        results.completed++;
        results.countryResults.push({
          country: countryCode,
          status: 'success',
          duration
        });
        console.log(`\n✅ ${countryCode} completed in ${duration}s\n`);
      } else {
        results.failed++;
        results.countryResults.push({
          country: countryCode,
          status: 'failed',
          duration
        });
        console.log(`\n❌ ${countryCode} failed with code ${code}\n`);
      }

      resolve(code);
    });

    scraperProcess.on('error', (error) => {
      results.failed++;
      results.countryResults.push({
        country: countryCode,
        status: 'error',
        error: error.message
      });
      console.error(`\n❌ ${countryCode} error:`, error.message, '\n');
      resolve(1);
    });
  });
}

/**
 * Send completion email
 */
async function sendCompletionEmail() {
  if (!sendEmail) return;

  try {
    console.log('\n📧 Sending completion email...');
    const EmailNotifier = require('./email_notifier');
    const notifier = new EmailNotifier();
    await notifier.initialize();

    const totalDuration = Math.round((Date.now() - results.startTime) / 1000);
    const successCountries = results.countryResults.filter(r => r.status === 'success').map(r => r.country);
    const failedCountries = results.countryResults.filter(r => r.status !== 'success').map(r => r.country);

    await notifier.sendMultiCountryResults({
      scanType,
      totalCountries: results.total,
      completed: results.completed,
      failed: results.failed,
      successCountries,
      failedCountries,
      duration: totalDuration,
      results: results.countryResults
    });

    console.log('✅ Email sent successfully!\n');
  } catch (error) {
    console.error('❌ Email failed:', error.message, '\n');
  }
}

/**
 * Delay helper
 */
function delay(ms, message) {
  return new Promise(resolve => {
    if (message) {
      const seconds = Math.round(ms / 1000);
      console.log(`\n${message} (${seconds}s)...`);

      // Show countdown
      let remaining = seconds;
      const interval = setInterval(() => {
        if (remaining > 0) {
          process.stdout.write(`\r⏳ ${remaining}s remaining...`);
          remaining--;
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(interval);
        process.stdout.write('\r✅ Break complete!         \n\n');
        resolve();
      }, ms);
    } else {
      setTimeout(resolve, ms);
    }
  });
}

/**
 * Main scanning loop
 */
async function runMultiCountryScan() {
  console.log('⏳ Starting automated scan...\n');

  // Scan each country sequentially
  for (let i = 0; i < countries.length; i++) {
    await scanCountry(countries[i], i);

    // Progress update
    const progress = Math.round(((i + 1) / countries.length) * 100);
    const elapsed = Math.round((Date.now() - results.startTime) / 1000);
    const elapsedMinutes = Math.floor(elapsed / 60);
    const elapsedSeconds = elapsed % 60;
    console.log(`📊 Progress: ${i + 1}/${countries.length} (${progress}%) - Elapsed: ${elapsedMinutes}m ${elapsedSeconds}s`);

    // Take breaks between countries (but not after the last one)
    if (i < countries.length - 1) {
      // Check if it's time for a long break
      const countriesCompleted = i + 1;
      if (countriesCompleted % LONG_BREAK_INTERVAL === 0) {
        // Long break every 5 countries
        await delay(LONG_BREAK_DURATION, `\n🛑 Taking a 2-minute break after ${countriesCompleted} countries to avoid rate limiting`);
      } else {
        // Short break between countries
        await delay(DELAY_BETWEEN_COUNTRIES, `⏸️  Taking a 30-second break before next country`);
      }
    }
  }

  // Final summary
  const totalDuration = Math.round((Date.now() - results.startTime) / 1000);
  const minutes = Math.floor(totalDuration / 60);
  const seconds = totalDuration % 60;

  console.log('\n' + '='.repeat(70));
  console.log('🏁 SCAN COMPLETE');
  console.log('='.repeat(70));
  console.log(`✅ Completed: ${results.completed}/${results.total}`);
  console.log(`❌ Failed: ${results.failed}/${results.total}`);
  console.log(`⏱️  Total time: ${minutes}m ${seconds}s`);
  console.log('='.repeat(70) + '\n');

  // Show individual results
  console.log('📋 Individual Results:');
  results.countryResults.forEach((result, i) => {
    const status = result.status === 'success' ? '✅' : '❌';
    const time = result.duration ? `(${result.duration}s)` : '';
    console.log(`  ${i + 1}. ${status} ${result.country} ${time}`);
  });
  console.log('');

  // Send email if enabled
  await sendCompletionEmail();

  // Exit
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Wrap execution with caffeinate to prevent sleep (macOS)
 */
function preventSleep() {
  // Check if running on macOS
  if (process.platform === 'darwin') {
    console.log('💤 Preventing system sleep (macOS caffeinate)...\n');

    // Spawn caffeinate wrapper
    const caffeinateProcess = spawn('caffeinate', ['-i', process.execPath, __filename, ...args], {
      stdio: 'inherit'
    });

    caffeinateProcess.on('exit', (code) => {
      process.exit(code);
    });

    return true;
  }

  return false;
}

// If not already wrapped with caffeinate, wrap it
if (process.platform === 'darwin' && !process.env.CAFFEINATED) {
  process.env.CAFFEINATED = '1';
  preventSleep();
} else {
  // Run the scan
  runMultiCountryScan().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
