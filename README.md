# TikTok Creative Center Scraper

A fun project to fetch trending music data from TikTok's Creative Center!

## Features

- 🎵 Scrape trending music data from TikTok Creative Center
- 📊 Export data to JSON and CSV formats
- 📈 Track song rankings, trends, and metadata
- 📸 Auto-capture screenshots for debugging
- 💾 Save HTML source for selector refinement

## Setup

```bash
# Install Node.js dependencies
npm install

# That's it! Puppeteer includes Chromium automatically
```

## Usage

```bash
# Fetch trending music data
npm start

# Or run directly
node scraper.js
```

## Output

Data will be saved to the `data/` directory:
- `trending_music.json` - Full data in JSON format
- `trending_music.csv` - Spreadsheet-friendly CSV
- `page_screenshot.png` - Visual capture of the page
- `page_source.html` - HTML source for analysis

## Data Fields

- Rank
- Song Title
- Artist
- Duration (if available)
- 7-Day Trend
- Rank Change
- Related Videos Count
- TikTok Link
- Scraped At (timestamp)

## Project Structure

```
cct/
├── scraper.js          # Main scraping script (Node.js)
├── scraper.py          # Alternative Python version
├── package.json        # Node.js dependencies
├── requirements.txt    # Python dependencies (alternative)
├── data/              # Output data directory
└── README.md          # This file
```

## Next Steps

After running the scraper:
1. Check `data/page_screenshot.png` to see what was captured
2. Review `data/page_source.html` to find better CSS selectors
3. Update selectors in `scraper.js` for more accurate data extraction
