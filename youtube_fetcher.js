#!/usr/bin/env node

/**
 * YouTube Link Fetcher using YouTube Data API v3
 * Searches for songs and returns YouTube video URLs
 */

require('dotenv').config();
const https = require('https');

class YouTubeFetcher {
  constructor() {
    this.apiKey = process.env.YOUTUBE_API_KEY;
  }

  async searchSong(title, artist) {
    return new Promise((resolve) => {
      if (!this.apiKey || this.apiKey === 'your-youtube-api-key') {
        resolve(null);
        return;
      }

      // Build search query
      const query = `${title} ${artist} official audio`;
      const encodedQuery = encodeURIComponent(query);
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodedQuery}&type=video&videoCategoryId=10&maxResults=1&key=${this.apiKey}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);

            if (result.error) {
              console.error(`YouTube API error: ${result.error.message}`);
              resolve(null);
              return;
            }

            if (result.items && result.items.length > 0) {
              const videoId = result.items[0].id.videoId;
              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
              resolve({
                url: videoUrl,
                videoId: videoId,
                title: result.items[0].snippet.title
              });
            } else {
              resolve(null);
            }
          } catch (e) {
            resolve(null);
          }
        });
      }).on('error', () => resolve(null));
    });
  }

  async enrichWithYouTubeLinks(songs, options = {}) {
    const { limit = 50, skipExisting = true } = options;

    if (!this.apiKey || this.apiKey === 'your-youtube-api-key') {
      console.log('⚠️  YouTube API key not configured, skipping YouTube links');
      return songs;
    }

    console.log('');
    console.log(`⏳ Fetching YouTube links (limit: ${limit} songs)...`);

    // Filter songs that need YouTube links
    let songsToFetch = songs.filter(s => !s.youtube_url);

    if (skipExisting) {
      songsToFetch = songsToFetch.filter(s => !s.link || s.link.includes('ads.tiktok.com'));
    }

    // Only fetch for top N songs (by rank)
    songsToFetch.sort((a, b) => (a.rank || 999) - (b.rank || 999));
    songsToFetch = songsToFetch.slice(0, limit);

    if (songsToFetch.length === 0) {
      console.log('✅ All songs already have links!\n');
      return songs;
    }

    console.log(`   Processing ${songsToFetch.length} songs (skipped ${songs.length - songsToFetch.length} with existing links)\n`);

    let found = 0;
    for (let i = 0; i < songsToFetch.length; i++) {
      const song = songsToFetch[i];
      const youtubeData = await this.searchSong(song.title, song.artist);

      if (youtubeData) {
        song.youtube_url = youtubeData.url;
        song.youtube_id = youtubeData.videoId;
        process.stdout.write(`✓ ${(i + 1).toString().padStart(2)}/${songsToFetch.length} #${song.rank} ${song.title.substring(0, 25).padEnd(25)} YT\n`);
        found++;
      }

      // Rate limiting - YouTube API has quota limits
      if (i % 10 === 0 && i > 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`✅ Found ${found}/${songsToFetch.length} YouTube links (saved ${limit - songsToFetch.length} API calls)\n`);
    return songs;
  }
}

module.exports = YouTubeFetcher;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('\nUsage:');
    console.log('  node youtube_fetcher.js "Song Title" "Artist Name"\n');
    console.log('Example:');
    console.log('  node youtube_fetcher.js "Shape of You" "Ed Sheeran"\n');
    process.exit(0);
  }

  const fetcher = new YouTubeFetcher();
  const [title, artist] = args;

  (async () => {
    console.log(`Searching YouTube for: ${title} - ${artist}`);
    const result = await fetcher.searchSong(title, artist);

    if (result) {
      console.log('\n✅ Found:');
      console.log(`   Title: ${result.title}`);
      console.log(`   URL: ${result.url}`);
    } else {
      console.log('\n❌ Not found');
    }
  })();
}
