#!/usr/bin/env node

/**
 * Simple data visualization for TikTok music trends
 * Displays the scraped data in a nice formatted table
 */

const fs = require('fs');
const path = require('path');

function visualizeData() {
  const dataPath = path.join(__dirname, 'data', 'trending_music.json');

  if (!fs.existsSync(dataPath)) {
    console.log('❌ No data found! Run the scraper first: npm start');
    return;
  }

  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log('\n' + '='.repeat(80));
  console.log('🎵 TikTok Trending Music - Summary');
  console.log('='.repeat(80) + '\n');

  console.log(`📊 Total Songs: ${data.length}`);
  console.log(`📅 Last Updated: ${data[0]?.scraped_at || 'Unknown'}\n`);

  console.log('='.repeat(80));
  console.log('Top Trending Songs:');
  console.log('='.repeat(80) + '\n');

  data.slice(0, 20).forEach((song, index) => {
    console.log(`${index + 1}. ${song.title || 'Unknown Title'}`);
    console.log(`   Artist: ${song.artist || 'Unknown'}`);
    console.log(`   Trend: ${song.trend || 'N/A'}`);

    if (song.raw_text) {
      const preview = song.raw_text.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   Preview: ${preview}${song.raw_text.length > 100 ? '...' : ''}`);
    }

    console.log('');
  });

  console.log('='.repeat(80));
  console.log(`\n💡 Full data available in: ${dataPath}`);
  console.log('📊 CSV format available in: data/trending_music.csv\n');
}

if (require.main === module) {
  visualizeData();
}

module.exports = visualizeData;
