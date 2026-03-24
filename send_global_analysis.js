#!/usr/bin/env node

/**
 * Send Global Multi-Country Analysis Email
 *
 * Analyzes all scanned countries and sends 3 types of emails:
 * 1. Popular Songs - Global hits (songs in 25% of countries)
 * 2. Breakout Songs - Global hits (songs in 25% of countries)
 * 3. Most Trending - Songs with highest usage score (top 50 by total plays)
 *
 * Usage:
 *   node send_global_analysis.js
 *
 * This is the ONLY email command you need!
 */

require('dotenv').config();
const EmailNotifier = require('./email_notifier');
const fs = require('fs');
const path = require('path');

async function sendGlobalAnalysis() {
  console.log('\n' + '═'.repeat(70));
  console.log('SENDING GLOBAL MULTI-COUNTRY ANALYSIS');
  console.log('═'.repeat(70) + '\n');

  try {
    // Find all country files
    const dataDir = path.join(__dirname, 'data');
    const files = fs.readdirSync(dataDir);

    const allCountryData = [];

    files.forEach(file => {
      if (file.startsWith('trending_music_with_trends') &&
          file.endsWith('.json') &&
          !file.includes('breakout')) {

        let countryCode = 'US';
        if (file !== 'trending_music_with_trends.json') {
          const match = file.match(/trending_music_with_trends_([A-Z]{2})\.json/);
          if (match) countryCode = match[1];
        }

        try {
          const popularData = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
          const breakoutFile = file.replace('.json', '_breakout.json');
          let breakoutData = { songs: [] };

          if (fs.existsSync(path.join(dataDir, breakoutFile))) {
            breakoutData = JSON.parse(fs.readFileSync(path.join(dataDir, breakoutFile), 'utf8'));
          }

          allCountryData.push({
            country: countryCode,
            popularSongs: popularData.songs || [],
            breakoutSongs: breakoutData.songs || []
          });
        } catch (e) {
          console.log(`Skipping ${countryCode}: ${e.message}`);
        }
      }
    });

    console.log(`Loaded data from ${allCountryData.length} countries\n`);
    console.log('Countries:', allCountryData.map(d => d.country).join(', '));
    console.log('');

    // Initialize notifier
    const notifier = new EmailNotifier();
    await notifier.initialize();
    console.log('');

    // Analyze cross-country (25% threshold)
    console.log('Analyzing cross-country trends...');
    console.log(`Threshold: 25% (${Math.ceil(allCountryData.length * 0.25)}+ of ${allCountryData.length} countries)\n`);

    const analysis = notifier.analyzeMultiCountrySongs(allCountryData, 0.25);

    // Analyze most trending (highest usage score)
    console.log('Analyzing most trending songs (highest usage score)...');
    const trendingAnalysis = notifier.analyzeMostTrendingSongs(allCountryData, 50);

    console.log('\n' + '─'.repeat(70));
    console.log('ANALYSIS RESULTS');
    console.log('─'.repeat(70));

    console.log('\n1. Cross-Country Analysis:');
    console.log(`   Popular songs in ${analysis.threshold}+ countries: ${analysis.popular.length}`);
    console.log(`   Breakout songs in ${analysis.threshold}+ countries: ${analysis.breakout.length}`);

    console.log('\n2. Most Trending (Highest Usage):');
    console.log(`   Top trending songs: ${trendingAnalysis.songs.length}`);
    console.log(`   Total songs analyzed: ${trendingAnalysis.totalSongsAnalyzed}`);
    console.log('');

    if (analysis.popular.length > 0) {
      console.log('Top 5 Cross-Country Popular Hits:');
      analysis.popular.slice(0, 5).forEach((song, i) => {
        console.log(`   ${i + 1}. ${song.title} - ${song.artist}`);
        console.log(`      ${song.countryCount} countries`);
      });
      console.log('');
    }

    if (trendingAnalysis.songs.length > 0) {
      console.log('Top 5 Most Trending Songs (Highest Usage):');
      trendingAnalysis.songs.slice(0, 5).forEach((song, i) => {
        const countryName = notifier.getCountryName(song.country);
        const scoreDisplay = (song.usageScore * 100).toFixed(1) + '%';
        console.log(`   ${i + 1}. ${song.title} - ${song.artist}`);
        console.log(`      ${scoreDisplay} trending score (${countryName})`);
      });
      console.log('');
    }

    // Send emails
    console.log('Sending global analysis emails...\n');

    // Send cross-country analysis
    await notifier.sendMultiCountryAnalysis(analysis);

    // Send most trending
    await notifier.sendMostTrendingEmail(trendingAnalysis);

    console.log('\n' + '═'.repeat(70));
    console.log('GLOBAL ANALYSIS COMPLETE!');
    console.log('═'.repeat(70));
    console.log('\nCheck your inbox for 3 types of emails:');
    console.log(`  1. Popular Songs (in ${analysis.threshold}+ countries)`);
    console.log(`  2. Breakout Songs (in ${analysis.threshold}+ countries)`);
    console.log(`  3. Most Trending (highest usage score)\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

sendGlobalAnalysis();
