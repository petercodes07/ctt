#!/usr/bin/env node

/**
 * Genre Fetcher using Deezer and TuneCore APIs
 * Fetches genre data for songs with caching support
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs').promises;
const path = require('path');

class GenreFetcher {
  constructor() {
    this.tunecoreApiKey = process.env.TUNECORE_API_KEY;
    this.tunecoreEndpoint = process.env.TUNECORE_API_ENDPOINT || 'https://api.tunecore.com/v1';
    this.cacheDir = 'data/cache/genres';
    this.cacheTTL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {}
  }

  /**
   * Get cache file path for a song
   */
  getCachePath(songId) {
    return path.join(this.cacheDir, `${songId}.json`);
  }

  /**
   * Check if cached genre data exists and is fresh
   */
  async getCachedGenre(songId) {
    try {
      const cachePath = this.getCachePath(songId);
      const data = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data);

      // Check if cache is expired
      const expiresAt = new Date(cached.expires_at).getTime();
      if (Date.now() > expiresAt) {
        return null; // Cache expired
      }

      return {
        found: true,
        genre: cached.genre,
        allGenres: cached.all_genres,
        source: cached.source,
        cached: true
      };
    } catch (error) {
      return null; // Cache miss
    }
  }

  /**
   * Save genre data to cache
   */
  async saveGenreCache(songId, title, artist, genreData) {
    await this.ensureCacheDir();

    const cachePath = this.getCachePath(songId);
    const cachedAt = new Date();
    const expiresAt = new Date(cachedAt.getTime() + this.cacheTTL);

    const cacheEntry = {
      song_id: songId,
      title: title,
      artist: artist,
      genre: genreData.genre,
      all_genres: genreData.allGenres || [],
      source: genreData.source,
      cached_at: cachedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    await fs.writeFile(cachePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
  }

  /**
   * HTTP GET helper
   */
  httpGet(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse JSON: ${e.message}`));
          }
        });
      }).on('error', (e) => {
        reject(e);
      });
    });
  }

  /**
   * Fetch genre from Deezer API
   * Two-step process: search track → get album details for genres
   */
  async fetchGenreFromDeezer(title, artist) {
    try {
      // Step 1: Search for track
      const query = `${title} ${artist}`.replace(/[^\w\s]/g, '');
      const searchUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;

      const searchResult = await this.httpGet(searchUrl);

      if (!searchResult.data || searchResult.data.length === 0) {
        return { found: false, source: 'deezer' };
      }

      const track = searchResult.data[0];

      // Step 2: Get album details for genre information
      if (!track.album || !track.album.id) {
        return { found: false, source: 'deezer' };
      }

      const albumUrl = `https://api.deezer.com/album/${track.album.id}`;
      const album = await this.httpGet(albumUrl);

      // Extract genres
      if (album.genres && album.genres.data && album.genres.data.length > 0) {
        const genres = album.genres.data.map(g => g.name);
        return {
          found: true,
          genre: genres[0], // Primary genre
          allGenres: genres,
          source: 'deezer'
        };
      }

      return { found: false, source: 'deezer' };
    } catch (error) {
      return { found: false, error: error.message, source: 'deezer' };
    }
  }

  /**
   * Fetch genre from TuneCore API (placeholder)
   * TODO: Implement when user provides API details
   */
  async fetchGenreFromTuneCore(title, artist) {
    if (!this.tunecoreApiKey) {
      return { found: false, source: 'tunecore', error: 'No API key configured' };
    }

    try {
      // TODO: Implement TuneCore API call
      // const url = `${this.tunecoreEndpoint}/lookup?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
      // const result = await this.httpGet(url);
      // return { found: true, genre: result.genre, allGenres: result.genres, source: 'tunecore' };

      return { found: false, source: 'tunecore', error: 'TuneCore API not implemented' };
    } catch (error) {
      return { found: false, error: error.message, source: 'tunecore' };
    }
  }

  /**
   * Fetch genre with fallback strategy
   * Try Deezer first, then TuneCore if Deezer fails
   */
  async fetchGenreWithFallback(songId, title, artist) {
    // Check cache first
    const cached = await this.getCachedGenre(songId);
    if (cached) {
      return cached;
    }

    // Try Deezer first (free, no auth)
    let result = await this.fetchGenreFromDeezer(title, artist);

    // Fallback to TuneCore if Deezer fails
    if (!result.found && this.tunecoreApiKey) {
      result = await this.fetchGenreFromTuneCore(title, artist);
    }

    // If found, save to cache
    if (result.found) {
      await this.saveGenreCache(songId, title, artist, result);
    }

    return result;
  }

  /**
   * Enrich songs with genre data
   * Uses parallel processing with rate limiting
   */
  async enrichWithGenres(songs, options = {}) {
    const {
      concurrency = 5,
      batchDelay = 1000,
      showProgress = true
    } = options;

    if (showProgress) {
      console.log('');
      console.log(`⏳ Fetching genres for ${songs.length} songs...`);
      console.log(`   Using: Deezer API (primary)${this.tunecoreApiKey ? ' + TuneCore (fallback)' : ''}`);
      console.log('');
    }

    let found = 0;
    let cached = 0;
    let unknown = 0;

    // Process in batches for parallel execution
    for (let i = 0; i < songs.length; i += concurrency) {
      const batch = songs.slice(i, i + concurrency);

      // Process batch in parallel
      await Promise.all(batch.map(async (song, batchIndex) => {
        const songIndex = i + batchIndex;
        const songId = song.song_id || song.clip_id || `${song.title}-${song.artist}`;

        try {
          const result = await this.fetchGenreWithFallback(songId, song.title, song.artist);

          if (result.found) {
            song.genre = result.genre;
            song.all_genres = result.allGenres || [result.genre];
            song.genre_source = result.source;

            if (result.cached) {
              cached++;
            } else {
              found++;
            }

            if (showProgress) {
              const cacheIndicator = result.cached ? '💾' : '✓';
              process.stdout.write(
                `${cacheIndicator} ${(songIndex + 1).toString().padStart(3)}/${songs.length} ` +
                `${song.title.substring(0, 30).padEnd(30)} ${result.genre}\n`
              );
            }
          } else {
            song.genre = 'Unknown';
            song.all_genres = [];
            song.genre_source = 'none';
            unknown++;

            if (showProgress) {
              process.stdout.write(
                `✗ ${(songIndex + 1).toString().padStart(3)}/${songs.length} ` +
                `${song.title.substring(0, 30).padEnd(30)} Unknown\n`
              );
            }
          }
        } catch (error) {
          song.genre = 'Unknown';
          song.all_genres = [];
          song.genre_source = 'error';
          song.genre_error = error.message;
          unknown++;

          if (showProgress) {
            process.stdout.write(
              `✗ ${(songIndex + 1).toString().padStart(3)}/${songs.length} ` +
              `${song.title.substring(0, 30).padEnd(30)} Error\n`
            );
          }
        }
      }));

      // Rate limiting between batches
      if (i + concurrency < songs.length) {
        await new Promise(resolve => setTimeout(resolve, batchDelay));
      }
    }

    if (showProgress) {
      console.log('');
      console.log(`✅ Genre enrichment complete:`);
      console.log(`   Found: ${found} (${cached} from cache)`);
      console.log(`   Unknown: ${unknown}`);
      console.log('');
    }

    return songs;
  }
}

module.exports = GenreFetcher;

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('\nUsage:');
    console.log('  node genre_fetcher.js "Song Title" "Artist Name"\n');
    console.log('Example:');
    console.log('  node genre_fetcher.js "Shape of You" "Ed Sheeran"\n');
    process.exit(0);
  }

  const fetcher = new GenreFetcher();
  const [title, artist] = args;

  (async () => {
    console.log(`\nFetching genre for: ${title} - ${artist}\n`);

    const songId = `test-${Date.now()}`;
    const result = await fetcher.fetchGenreWithFallback(songId, title, artist);

    if (result.found) {
      console.log('✅ Found:');
      console.log(`   Genre: ${result.genre}`);
      console.log(`   All Genres: ${result.allGenres.join(', ')}`);
      console.log(`   Source: ${result.source}`);
      console.log(`   Cached: ${result.cached || false}`);
    } else {
      console.log('❌ Not found');
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
    console.log('');
  })();
}
