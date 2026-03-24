#!/usr/bin/env node

/**
 * Fetch release dates for songs using Deezer API
 * Usage: node enrich_with_release_dates.js <file.json> or --all
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch album details
async function getAlbumDetails(albumId) {
  const url = `https://api.deezer.com/album/${albumId}`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const album = JSON.parse(data);
          resolve({
            releaseDate: album.release_date || null,
            albumTitle: album.title || null
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

// Deezer API - No auth required, free to use
async function searchDeezer(title, artist) {
  const query = `${title} ${artist}`.replace(/[^\w\s]/g, '');
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.deezer.com/search?q=${encodedQuery}&limit=1`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', async () => {
        try {
          const result = JSON.parse(data);
          if (result.data && result.data.length > 0) {
            const track = result.data[0];

            // Fetch full album details to get release date
            let albumDetails = { releaseDate: null, albumTitle: track.album?.title };
            if (track.album && track.album.id) {
              try {
                albumDetails = await getAlbumDetails(track.album.id);
              } catch (e) {
                console.error(`  Error fetching album ${track.album.id}: ${e.message}`);
              }
            }

            resolve({
              found: true,
              releaseDate: albumDetails.releaseDate,
              albumTitle: albumDetails.albumTitle || track.album?.title || null,
              deezerUrl: track.link || null,
              duration: track.duration || null
            });
          } else {
            resolve({ found: false });
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (e) => {
      reject(e);
    });
  });
}

// Rate limiting helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enrichSongs(songs, batchSize = 10, delayMs = 1000) {
  const enriched = [];
  let found = 0;
  let skipped = 0;

  console.log(`Fetching release dates for ${songs.length} songs...\n`);

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];

    try {
      // Skip if already has release date
      if (song.release_date) {
        enriched.push(song);
        skipped++;
        continue;
      }

      const result = await searchDeezer(song.title, song.artist);

      if (result.found && result.releaseDate) {
        const year = result.releaseDate.split('-')[0];
        console.log(`✓ ${song.title.substring(0, 40)} - ${year}`);

        enriched.push({
          ...song,
          release_date: result.releaseDate,
          album_title: result.albumTitle,
          deezer_url: result.deezerUrl,
          enriched_at: new Date().toISOString()
        });
        found++;
      } else {
        enriched.push({
          ...song,
          release_date: null,
          enriched_at: new Date().toISOString()
        });
      }

      // Rate limiting
      if (i % batchSize === 0 && i > 0) {
        await delay(delayMs);
      }

    } catch (error) {
      enriched.push({
        ...song,
        release_date: null,
        enriched_at: new Date().toISOString()
      });
    }
  }

  console.log(`\nComplete: ${found} dates found, ${skipped} already had dates\n`);
  return enriched;
}

async function processFile(filePath) {
  console.log(`\nProcessing: ${path.basename(filePath)}`);

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.songs || data.songs.length === 0) {
    console.log('No songs found\n');
    return;
  }

  const enrichedSongs = await enrichSongs(data.songs);

  data.songs = enrichedSongs;
  data.enriched_at = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✓ Saved to ${path.basename(filePath)}\n`);
}

async function processAllFiles() {
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir)
    .filter(f => f.startsWith('trending_music_with_trends') && f.endsWith('.json'))
    .map(f => path.join(dataDir, f));

  console.log(`\nProcessing ${files.length} files...\n`);

  for (const file of files) {
    await processFile(file);
    await delay(2000);
  }

  console.log('Done!\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('\nUsage:');
    console.log('  node enrich_with_release_dates.js <file.json>    # Single file');
    console.log('  node enrich_with_release_dates.js --all          # All files\n');
    process.exit(0);
  }

  if (args[0] === '--all') {
    await processAllFiles();
  } else {
    const filePath = args[0];
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    await processFile(filePath);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
