#!/usr/bin/env node

/**
 * TikTok Creative Center Music Scraper
 * Fetches trending music data from TikTok's Creative Center
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

class TikTokMusicScraper {
  constructor() {
    this.url = 'https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en';
    this.dataDir = 'data';
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async scrapeMusic(maxSongs = 50) {
    console.log('🎵 Starting TikTok Music Scraper...');
    console.log(`📊 Target URL: ${this.url}`);

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const songs = [];

    try {
      console.log('🌐 Launching browser...');
      await page.setViewport({ width: 1920, height: 1080 });

      console.log('📡 Loading TikTok Creative Center...');
      await page.goto(this.url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      console.log('⏳ Waiting for content to load...');
      await page.waitForTimeout(5000);

      // Take screenshot for debugging
      const screenshotPath = path.join(this.dataDir, 'page_screenshot.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot saved to ${screenshotPath}`);

      // Save HTML for analysis
      const htmlPath = path.join(this.dataDir, 'page_source.html');
      const html = await page.content();
      await fs.writeFile(htmlPath, html, 'utf-8');
      console.log(`💾 HTML source saved to ${htmlPath}`);

      // Extract song data - we'll need to inspect the page to find the right selectors
      console.log('🔍 Extracting song data...');

      // Try to find any card/list items
      const songElements = await page.$$('[class*="CardPc"], [class*="card"], [class*="item"], [class*="list"] > div');

      console.log(`Found ${songElements.length} potential song elements`);

      // Extract data from each element
      for (let i = 0; i < Math.min(songElements.length, maxSongs); i++) {
        try {
          const element = songElements[i];
          const text = await element.evaluate(el => el.innerText);

          // Try to extract structured data
          const songData = {
            rank: i + 1,
            raw_text: text,
            scraped_at: new Date().toISOString(),
            title: 'Unknown',
            artist: 'Unknown',
            trend: 'N/A'
          };

          // Try to find specific elements (these selectors may need adjustment)
          try {
            const titleElement = await element.$('[class*="title"], [class*="name"], h3, h4');
            if (titleElement) {
              songData.title = await titleElement.evaluate(el => el.innerText.trim());
            }
          } catch (e) {}

          try {
            const artistElement = await element.$('[class*="artist"], [class*="creator"]');
            if (artistElement) {
              songData.artist = await artistElement.evaluate(el => el.innerText.trim());
            }
          } catch (e) {}

          songs.push(songData);
        } catch (error) {
          console.log(`⚠️  Error extracting song ${i}: ${error.message}`);
        }
      }

      // Also try to extract via page evaluation for more structured data
      const extractedData = await page.evaluate(() => {
        const results = [];

        // Look for common patterns in music listing pages
        const selectors = [
          '[class*="music"]',
          '[class*="song"]',
          '[class*="track"]',
          '[class*="card"]',
          '[role="listitem"]'
        ];

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach((el, index) => {
              results.push({
                selector: selector,
                index: index,
                text: el.innerText?.substring(0, 200) || '',
                html: el.innerHTML?.substring(0, 300) || ''
              });
            });
            break; // Use first successful selector
          }
        }

        return results;
      });

      if (extractedData.length > 0) {
        console.log(`✨ Found ${extractedData.length} items using page evaluation`);

        // Merge or replace with better data
        extractedData.forEach((item, index) => {
          if (index < songs.length) {
            songs[index].evaluated_text = item.text;
            songs[index].selector_used = item.selector;
          }
        });
      }

    } catch (error) {
      console.error(`❌ Error during scraping: ${error.message}`);
      console.log('💡 Tip: The page structure may have changed. Check the screenshot and HTML.');
    } finally {
      await browser.close();
    }

    console.log(`✅ Scraped ${songs.length} songs`);
    return songs;
  }

  async saveJSON(data, filename = 'trending_music.json') {
    const filepath = path.join(this.dataDir, filename);
    await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 JSON saved to ${filepath}`);
  }

  async saveCSV(data, filename = 'trending_music.csv') {
    if (!data || data.length === 0) {
      console.log('⚠️  No data to save to CSV');
      return;
    }

    const filepath = path.join(this.dataDir, filename);

    // Get all unique keys
    const keys = new Set();
    data.forEach(item => {
      Object.keys(item).forEach(key => keys.add(key));
    });

    const headers = Array.from(keys).map(key => ({ id: key, title: key }));

    const csvWriter = createCsvWriter({
      path: filepath,
      header: headers
    });

    await csvWriter.writeRecords(data);
    console.log(`📊 CSV saved to ${filepath}`);
  }

  async run(maxSongs = 50) {
    console.log('\n' + '='.repeat(60));
    console.log('🎵 TikTok Creative Center Music Scraper');
    console.log('='.repeat(60) + '\n');

    await this.ensureDataDir();

    const songs = await this.scrapeMusic(maxSongs);

    if (songs.length > 0) {
      await this.saveJSON(songs);
      await this.saveCSV(songs);

      console.log('\n' + '='.repeat(60));
      console.log('📈 Summary');
      console.log('='.repeat(60));
      console.log(`Total songs scraped: ${songs.length}`);
      console.log(`Data directory: ${path.resolve(this.dataDir)}`);
      console.log('\n✨ Scraping completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('   - Check data/page_screenshot.png to see what was captured');
      console.log('   - Review data/page_source.html to find better selectors');
      console.log('   - Update selectors in scraper.js for more accurate data');
    } else {
      console.log('\n⚠️  No data was scraped. Please check the screenshot and HTML source.');
      console.log('💡 You may need to update the selectors in the scraper.');
    }

    return songs;
  }
}

// Run the scraper
if (require.main === module) {
  const scraper = new TikTokMusicScraper();
  scraper.run(50).catch(console.error);
}

module.exports = TikTokMusicScraper;
