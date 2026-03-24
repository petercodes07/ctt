#!/usr/bin/env node

/**
 * Enrich songs with genre data and save back to file
 */

const GenreFetcher = require('./genre_fetcher');
const fs = require('fs').promises;

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: node enrich_and_save.js <json_file>');
    console.log('Example: node enrich_and_save.js data/trending_music_with_trends_USA_breakout.json');
    process.exit(1);
  }

  const inputFile = args[0];

  try {
    // Load JSON file
    console.log(`📂 Loading ${inputFile}...`);
    const data = JSON.parse(await fs.readFile(inputFile, 'utf-8'));
    const songs = data.songs || [];

    console.log(`✅ Loaded ${songs.length} songs\n`);

    // Enrich with genres
    const fetcher = new GenreFetcher();
    await fetcher.enrichWithGenres(songs, {
      concurrency: 3,
      batchDelay: 1000,
      showProgress: true
    });

    // Save back to file
    console.log(`\n💾 Saving enriched data back to ${inputFile}...`);
    await fs.writeFile(inputFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log('✅ File saved successfully\n');

    // Display stats
    const withGenre = songs.filter(s => s.genre && s.genre !== 'Unknown').length;
    const unknown = songs.filter(s => !s.genre || s.genre === 'Unknown').length;

    console.log('Summary:');
    console.log(`  Total songs: ${songs.length}`);
    console.log(`  With genre: ${withGenre}`);
    console.log(`  Unknown: ${unknown}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
