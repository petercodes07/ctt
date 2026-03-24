#!/usr/bin/env node

/**
 * Send email for a specific country's scan results
 * Usage: node send_country_email.js US
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const EmailNotifier = require('./email_notifier');

async function sendCountryEmail(country = 'US') {
  const emailNotifier = new EmailNotifier();

  console.log(`\n📧 Preparing to send emails for ${country}...\n`);

  // Initialize email transporter
  await emailNotifier.initialize();

  // Load data files
  const dataDir = path.join(__dirname, 'data');
  const popularFile = path.join(dataDir, `trending_music_with_trends_${country}.json`);
  const breakoutFile = path.join(dataDir, `trending_music_with_trends_${country}_breakout.json`);

  let popularSongs = [];
  let breakoutSongs = [];

  // Load popular songs
  if (fs.existsSync(popularFile)) {
    const popularData = JSON.parse(fs.readFileSync(popularFile, 'utf8'));
    popularSongs = popularData.songs || [];
    console.log(`✓ Loaded ${popularSongs.length} popular songs`);
  } else {
    console.log(`⚠️  Popular file not found: ${popularFile}`);
  }

  // Load breakout songs
  if (fs.existsSync(breakoutFile)) {
    const breakoutData = JSON.parse(fs.readFileSync(breakoutFile, 'utf8'));
    breakoutSongs = breakoutData.songs || [];
    console.log(`✓ Loaded ${breakoutSongs.length} breakout songs`);
  } else {
    console.log(`⚠️  Breakout file not found: ${breakoutFile}`);
  }

  if (popularSongs.length === 0 && breakoutSongs.length === 0) {
    console.log(`\n❌ No songs found for ${country}. Run a scan first:\n   node scan.js quick ${country}\n`);
    process.exit(1);
  }

  // Send emails
  const startTime = Date.now();
  await emailNotifier.sendScanResults({
    country,
    popularSongs,
    breakoutSongs,
    popularCount: popularSongs.length,
    breakoutCount: breakoutSongs.length,
    scanType: 'manual',
    duration: 0
  });

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Emails sent successfully in ${duration}s\n`);
}

// Main
const args = process.argv.slice(2);
const country = args[0] ? args[0].toUpperCase() : 'US';

if (args[0] === '--help' || args[0] === '-h') {
  console.log('\nUsage:');
  console.log('  node send_country_email.js [COUNTRY]\n');
  console.log('Examples:');
  console.log('  node send_country_email.js           # Send USA emails');
  console.log('  node send_country_email.js US        # Send USA emails');
  console.log('  node send_country_email.js PH        # Send Philippines emails');
  console.log('  node send_country_email.js JP        # Send Japan emails\n');
  process.exit(0);
}

sendCountryEmail(country).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
