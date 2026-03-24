#!/usr/bin/env node

/**
 * Add YouTube links to existing scan data
 * Usage: node add_youtube_links.js data/trending_music_with_trends_US.json
 */

require('dotenv').config();
const fs = require('fs');
const YouTubeFetcher = require('./youtube_fetcher');

async function addYouTubeLinks(filePath, limit = 50) {
  console.log(`\n📹 Adding YouTube links to: ${filePath}\n`);

  // Read file
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.songs || data.songs.length === 0) {
    console.log('No songs found\n');
    return;
  }

  console.log(`Found ${data.songs.length} songs`);

  // Fetch YouTube links (smart - top 50 only, skips existing)
  const fetcher = new YouTubeFetcher();
  await fetcher.enrichWithYouTubeLinks(data.songs, { limit, skipExisting: true });

  // Save back
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ Saved to ${filePath}\n`);
}

// Main
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help') {
  console.log('\nUsage:');
  console.log('  node add_youtube_links.js <file.json> [limit]\n');
  console.log('Examples:');
  console.log('  node add_youtube_links.js data/trending_music_with_trends_US.json');
  console.log('  node add_youtube_links.js data/trending_music_with_trends_US.json 30  # Top 30 only\n');
  console.log('Smart features:');
  console.log('  - Only fetches for top N songs (default: 50)');
  console.log('  - Skips songs with existing TikTok music links');
  console.log('  - Skips songs already with YouTube links\n');
  process.exit(0);
}

const filePath = args[0];
const limit = parseInt(args[1]) || 50;

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

addYouTubeLinks(filePath, limit).catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
