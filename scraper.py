#!/usr/bin/env python3
"""
TikTok Creative Center Music Scraper
Fetches trending music data from TikTok's Creative Center
"""

import json
import csv
import os
from datetime import datetime
from playwright.sync_api import sync_playwright
import time


class TikTokMusicScraper:
    def __init__(self):
        self.url = "https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en"
        self.data_dir = "data"
        self.ensure_data_dir()

    def ensure_data_dir(self):
        """Create data directory if it doesn't exist"""
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)

    def scrape_trending_music(self, max_songs=50):
        """
        Scrape trending music data from TikTok Creative Center

        Args:
            max_songs: Maximum number of songs to scrape (default: 50)

        Returns:
            list: List of dictionaries containing song data
        """
        print(f"🎵 Starting TikTok Music Scraper...")
        print(f"📊 Target URL: {self.url}")

        songs_data = []

        with sync_playwright() as p:
            # Launch browser
            print("🌐 Launching browser...")
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # Navigate to the page
            print("📡 Loading TikTok Creative Center...")
            page.goto(self.url, wait_until="networkidle")

            # Wait for content to load
            print("⏳ Waiting for content to load...")
            time.sleep(5)  # Give time for dynamic content

            # Try to find song elements
            # Note: Selectors may need adjustment based on actual page structure
            try:
                # Wait for song list to appear
                page.wait_for_selector('[class*="music"], [class*="song"], [class*="track"]', timeout=10000)

                # Get page content for parsing
                content = page.content()

                # Take a screenshot for debugging
                screenshot_path = f"{self.data_dir}/page_screenshot.png"
                page.screenshot(path=screenshot_path)
                print(f"📸 Screenshot saved to {screenshot_path}")

                # Extract song data (this will need to be customized based on actual HTML structure)
                # For now, we'll create a template structure
                print("🔍 Extracting song data...")

                # This is a placeholder - actual selectors will need to be determined
                # by inspecting the page structure
                songs = page.query_selector_all('[class*="item"], [class*="card"], [class*="row"]')

                print(f"Found {len(songs)} potential song elements")

                for i, song in enumerate(songs[:max_songs]):
                    try:
                        # Extract text content
                        text_content = song.inner_text()

                        # Basic data structure
                        song_data = {
                            "rank": i + 1,
                            "scraped_at": datetime.now().isoformat(),
                            "raw_text": text_content,
                            # Additional fields will be populated when we analyze the structure
                            "title": "Unknown",
                            "artist": "Unknown",
                            "trend": "N/A"
                        }

                        songs_data.append(song_data)

                    except Exception as e:
                        print(f"⚠️  Error extracting song {i}: {e}")
                        continue

            except Exception as e:
                print(f"❌ Error during scraping: {e}")
                print("💡 Tip: The page structure may have changed. Check the screenshot and HTML.")

            finally:
                # Save raw HTML for analysis
                html_path = f"{self.data_dir}/page_source.html"
                with open(html_path, 'w', encoding='utf-8') as f:
                    f.write(page.content())
                print(f"💾 HTML source saved to {html_path}")

                browser.close()

        print(f"✅ Scraped {len(songs_data)} songs")
        return songs_data

    def save_json(self, data, filename="trending_music.json"):
        """Save data to JSON file"""
        filepath = f"{self.data_dir}/{filename}"
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"💾 JSON saved to {filepath}")

    def save_csv(self, data, filename="trending_music.csv"):
        """Save data to CSV file"""
        if not data:
            print("⚠️  No data to save to CSV")
            return

        filepath = f"{self.data_dir}/{filename}"

        # Get all unique keys from all dictionaries
        keys = set()
        for item in data:
            keys.update(item.keys())

        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=sorted(keys))
            writer.writeheader()
            writer.writerows(data)

        print(f"📊 CSV saved to {filepath}")

    def run(self, max_songs=50):
        """Run the complete scraping workflow"""
        print("\n" + "="*60)
        print("🎵 TikTok Creative Center Music Scraper")
        print("="*60 + "\n")

        # Scrape data
        songs = self.scrape_trending_music(max_songs)

        if songs:
            # Save to both formats
            self.save_json(songs)
            self.save_csv(songs)

            # Display summary
            print("\n" + "="*60)
            print("📈 Summary")
            print("="*60)
            print(f"Total songs scraped: {len(songs)}")
            print(f"Data directory: {os.path.abspath(self.data_dir)}")
            print("\n✨ Scraping completed successfully!")
        else:
            print("\n⚠️  No data was scraped. Please check the screenshot and HTML source.")
            print("💡 You may need to update the selectors in the scraper.")

        return songs


def main():
    scraper = TikTokMusicScraper()
    scraper.run(max_songs=50)


if __name__ == "__main__":
    main()
