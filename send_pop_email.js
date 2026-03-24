#!/usr/bin/env node

/**
 * Send email with pop songs from USA scan
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const EmailNotifier = require('./email_notifier');

async function sendPopEmail() {
  const emailNotifier = new EmailNotifier();

  console.log('\n📧 Preparing to send pop music email...\n');

  // Initialize email transporter
  await emailNotifier.initialize();

  // Load data files
  const dataDir = path.join(__dirname, 'data');
  const popularFile = path.join(dataDir, 'trending_music_with_trends_USA.json');
  const breakoutFile = path.join(dataDir, 'trending_music_with_trends_USA_breakout.json');

  let allPopularSongs = [];
  let allBreakoutSongs = [];

  // Load popular songs
  if (fs.existsSync(popularFile)) {
    const popularData = JSON.parse(fs.readFileSync(popularFile, 'utf8'));
    allPopularSongs = popularData.songs || [];
    console.log(`✓ Loaded ${allPopularSongs.length} popular songs`);
  }

  // Load breakout songs
  if (fs.existsSync(breakoutFile)) {
    const breakoutData = JSON.parse(fs.readFileSync(breakoutFile, 'utf8'));
    allBreakoutSongs = breakoutData.songs || [];
    console.log(`✓ Loaded ${allBreakoutSongs.length} breakout songs`);
  }

  // Filter for pop songs only
  const popGenres = ['pop', 'dance pop', 'indie pop', 'electropop', 'synth-pop', 'k-pop'];

  const popularPopSongs = allPopularSongs.filter(song => {
    if (!song.genre) return false;
    return popGenres.some(pg => song.genre.toLowerCase().includes(pg));
  });

  const breakoutPopSongs = allBreakoutSongs.filter(song => {
    if (!song.genre) return false;
    return popGenres.some(pg => song.genre.toLowerCase().includes(pg));
  });

  console.log(`✓ Filtered to ${popularPopSongs.length} popular pop songs`);
  console.log(`✓ Filtered to ${breakoutPopSongs.length} breakout pop songs`);

  if (popularPopSongs.length === 0 && breakoutPopSongs.length === 0) {
    console.log('\n❌ No pop songs found. Make sure genres were fetched first.\n');
    process.exit(1);
  }

  // Send emails
  const startTime = Date.now();
  await emailNotifier.sendScanResults({
    country: 'USA (Pop Only)',
    popularSongs: popularPopSongs,
    breakoutSongs: breakoutPopSongs,
    popularCount: popularPopSongs.length,
    breakoutCount: breakoutPopSongs.length,
    scanType: 'pop-filtered',
    duration: 0
  });

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Pop music email sent successfully in ${duration}s\n`);
}

sendPopEmail().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
