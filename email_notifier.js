#!/usr/bin/env node

/**
 * Email Notification Module for TikTok Music Scraper
 * Sends scan results via Gmail SMTP
 */

require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailNotifier {
  constructor() {
    // Gmail SMTP configuration
    this.gmailUser = process.env.GMAIL_USER;
    this.gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    const envRecipients = (process.env.EMAIL_RECIPIENTS || '')
      .split(/[,\n;]/)
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);

    // Recipients (matches your Python configuration)
    const defaultRecipients = [
      this.gmailUser, // The sender
      'jossecalif@gmail.com',
      'ondiegibri@gmail.com',
      'ndunguabigael9@gmail.com'
    ].filter(Boolean); // Remove undefined if GMAIL_USER not set

    const selectedRecipients = envRecipients.length > 0
      ? [...envRecipients, this.gmailUser].filter(Boolean)
      : defaultRecipients;

    this.recipients = [...new Set(selectedRecipients)];

    // Create transporter
    this.transporter = null;

    // Country code to full name mapping
    this.countryNames = {
      'US': 'United States',
      'GB': 'United Kingdom',
      'PH': 'Philippines',
      'JP': 'Japan',
      'BR': 'Brazil',
      'FR': 'France',
      'DE': 'Germany',
      'IN': 'India',
      'ID': 'Indonesia',
      'TH': 'Thailand',
      'VN': 'Vietnam',
      'KR': 'South Korea',
      'MX': 'Mexico',
      'CA': 'Canada',
      'AU': 'Australia',
      'ES': 'Spain',
      'IT': 'Italy',
      'NL': 'Netherlands',
      'SE': 'Sweden',
      'NO': 'Norway',
      'DK': 'Denmark',
      'FI': 'Finland',
      'PL': 'Poland',
      'RU': 'Russia',
      'TR': 'Turkey',
      'SA': 'Saudi Arabia',
      'AE': 'United Arab Emirates',
      'EG': 'Egypt',
      'ZA': 'South Africa',
      'NG': 'Nigeria',
      'KE': 'Kenya',
      'AR': 'Argentina',
      'CL': 'Chile',
      'CO': 'Colombia',
      'PE': 'Peru',
      'MY': 'Malaysia',
      'SG': 'Singapore',
      'TW': 'Taiwan',
      'HK': 'Hong Kong',
      'NZ': 'New Zealand'
    };
  }

  getCountryName(countryCode) {
    return this.countryNames[countryCode] || countryCode;
  }

  formatReleaseDate(releaseDate) {
    if (!releaseDate) return null;

    const released = new Date(releaseDate);
    const now = new Date();
    const monthsOld = (now - released) / (1000 * 60 * 60 * 24 * 30);

    // Format the date
    const year = released.getFullYear();
    const month = released.toLocaleString('en-US', { month: 'short' });

    // Determine age category and emoji
    const releasedMonth = released.getMonth();
    const releasedYear = released.getFullYear();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    if (releasedMonth === currentMonth && releasedYear === currentYear) {
      return { text: `${month} ${year}`, emoji: '🆕', badge: 'NEW' };
    }
    if (monthsOld < 3) {
      return { text: `${month} ${year}`, emoji: '✨', badge: null };
    }
    if (monthsOld >= 24) {
      return { text: `${month} ${year}`, emoji: '📼', badge: 'VIRAL' };
    }

    return { text: `${month} ${year}`, emoji: null, badge: null };
  }

  calculate24HourChange(song) {
    // Calculate 24-hour percentage change for sorting
    if (!song.trend_chart || song.trend_chart.length < 2) {
      return -Infinity; // Put songs without data at the end
    }

    const lastDay = song.trend_chart[song.trend_chart.length - 1];
    const previousDay = song.trend_chart[song.trend_chart.length - 2];

    // Handle edge case: previousDay has 0 or very low value (NEW songs)
    if (previousDay.value === 0 || previousDay.value < 0.0001) {
      if (lastDay.value > 0) {
        return Infinity; // NEW songs go to the top
      }
      return -Infinity; // No data
    }

    // Calculate percentage change
    const change = ((lastDay.value - previousDay.value) / previousDay.value) * 100;

    if (!isFinite(change)) {
      return Infinity; // NEW trending
    }

    return change;
  }

  sortSongsByUsage(songs) {
    // Sort songs by 24h usage: NEW songs first, then highest growth to lowest
    return [...songs].sort((a, b) => {
      const changeA = this.calculate24HourChange(a);
      const changeB = this.calculate24HourChange(b);

      // Sort descending (highest change first)
      return changeB - changeA;
    });
  }

  analyzeMostTrendingSongs(allCountryData, limit = 50) {
    // Find songs with HIGHEST USAGE SCORE (not percentage, actual usage)
    const allSongs = [];

    allCountryData.forEach(countryData => {
      const country = countryData.country;

      // Collect all songs (Popular + Breakout)
      if (countryData.popularSongs) {
        countryData.popularSongs.forEach(song => {
          allSongs.push({ ...song, country, tab: 'Popular' });
        });
      }

      if (countryData.breakoutSongs) {
        countryData.breakoutSongs.forEach(song => {
          allSongs.push({ ...song, country, tab: 'Breakout' });
        });
      }
    });

    // Get actual usage score from trend chart
    const songsWithScore = allSongs.map(song => {
      let usageScore = 0;
      let trend24hChange = 0;

      if (song.trend_chart && song.trend_chart.length > 0) {
        // Get latest usage value
        const lastDay = song.trend_chart[song.trend_chart.length - 1];
        usageScore = lastDay.value || 0;

        // Also calculate 24h change for display
        if (song.trend_chart.length > 1) {
          const previousDay = song.trend_chart[song.trend_chart.length - 2];
          if (previousDay.value && previousDay.value > 0) {
            trend24hChange = ((lastDay.value - previousDay.value) / previousDay.value) * 100;
          }
        }
      }

      return {
        ...song,
        usageScore: usageScore,
        trend24h: trend24hChange,
        trend24hDisplay: this.get24HourUsage(song).display
      };
    });

    // Sort by ACTUAL USAGE SCORE (highest absolute number first)
    songsWithScore.sort((a, b) => b.usageScore - a.usageScore);

    // Take top N songs
    const topTrending = songsWithScore.slice(0, limit);

    return {
      songs: topTrending,
      totalSongsAnalyzed: allSongs.length,
      totalCountries: allCountryData.length
    };
  }

  analyzeMultiCountrySongs(allCountryData, threshold = 0.75) {
    // allCountryData format: [{ country: 'US', popularSongs: [...], breakoutSongs: [...] }, ...]

    const popularSongMap = new Map(); // song_id -> { song, countries: [] }
    const breakoutSongMap = new Map();

    // Aggregate songs across countries
    allCountryData.forEach(countryData => {
      const country = countryData.country;

      // Track Popular songs
      if (countryData.popularSongs) {
        countryData.popularSongs.forEach(song => {
          const key = `${song.title}-${song.artist}`.toLowerCase(); // Use title+artist as key
          if (!popularSongMap.has(key)) {
            popularSongMap.set(key, {
              song: song,
              countries: []
            });
          }
          popularSongMap.get(key).countries.push(country);
        });
      }

      // Track Breakout songs
      if (countryData.breakoutSongs) {
        countryData.breakoutSongs.forEach(song => {
          const key = `${song.title}-${song.artist}`.toLowerCase();
          if (!breakoutSongMap.has(key)) {
            breakoutSongMap.set(key, {
              song: song,
              countries: []
            });
          }
          breakoutSongMap.get(key).countries.push(country);
        });
      }
    });

    const totalCountries = allCountryData.length;
    const minCountries = Math.ceil(totalCountries * threshold); // 3/4 threshold

    // Filter and sort by country count
    const filterAndSort = (songMap) => {
      const songs = Array.from(songMap.values())
        .filter(item => item.countries.length >= minCountries)
        .sort((a, b) => b.countries.length - a.countries.length); // Most countries first

      return songs.map(item => ({
        ...item.song,
        countryCount: item.countries.length,
        countries: item.countries
      }));
    };

    return {
      popular: filterAndSort(popularSongMap),
      breakout: filterAndSort(breakoutSongMap),
      totalCountries,
      threshold: minCountries
    };
  }

  async sendMostTrendingEmail(trendingData) {
    const { songs, totalSongsAnalyzed, totalCountries } = trendingData;

    if (songs.length === 0) {
      console.log('No trending songs to send');
      return { success: true, emailsSent: 0 };
    }

    const BATCH_SIZE = 20;
    const subject = `Most Trending Songs - Highest Usage (${totalCountries} countries)`;

    const batches = [];
    for (let i = 0; i < songs.length; i += BATCH_SIZE) {
      batches.push(songs.slice(i, i + BATCH_SIZE));
    }

    console.log(`\nSending Most Trending email (${songs.length} songs in ${batches.length} batch(es))...`);

    let emailsSent = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      const rows = batch.map((song, index) => {
        const globalRank = i * BATCH_SIZE + index + 1;
        const usage24h = this.get24HourUsage(song);
        const countryName = this.getCountryName(song.country);
        const releaseInfo = this.formatReleaseDate(song.release_date);

        // Format usage score (normalized 0-1, show as percentage)
        const scoreDisplay = (song.usageScore * 100).toFixed(1) + '%';

        let releaseDateHTML = '';
        if (releaseInfo) {
          const badgeHTML = releaseInfo.badge
            ? `<span style="background: ${releaseInfo.badge === 'NEW' ? '#4CAF50' : '#FF9800'}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; margin-left: 3px;">${releaseInfo.badge}</span>`
            : '';
          releaseDateHTML = `<br><span style="font-size: 10px; color: #999;">${releaseInfo.emoji || '📅'} ${releaseInfo.text}${badgeHTML}</span>`;
        }

        // Build play link HTML
        let playLinkHTML = '';
        if (song.youtube_url) {
          playLinkHTML = `<a href="${song.youtube_url}" style="color: #FF0000; text-decoration: none; font-size: 12px; font-weight: 600;">▶ YouTube</a>`;
        } else {
          const link = song.link || song.url || '#';
          playLinkHTML = `<a href="${link}" style="color: #667eea; text-decoration: none; font-size: 12px; font-weight: 600;">▶ TikTok</a>`;
        }

        return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px; text-align: center; font-weight: bold; color: #667eea;">${globalRank}</td>
          <td style="padding: 8px;">
            <img src="${song.cover || song.image}" alt="" style="width: 40px; height: 40px; border-radius: 4px; vertical-align: middle; margin-right: 10px; object-fit: cover;">
            <strong style="color: #333;">${song.title}</strong><br>
            <span style="font-size: 11px; color: #666;">${song.artist}</span>${releaseDateHTML}
          </td>
          <td style="padding: 8px; text-align: center; font-size: 13px; color: #666;">${countryName}</td>
          <td style="padding: 8px; text-align: center; font-weight: bold; font-size: 14px; color: #667eea;">${scoreDisplay}</td>
          <td style="padding: 8px; text-align: center; font-weight: bold; font-size: 12px;">
            <span style="color: ${usage24h.color};">${usage24h.display}</span>
          </td>
          <td style="padding: 8px; text-align: center;">
            ${playLinkHTML}
          </td>
        </tr>
        `;
      }).join('');

      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; font-size: 18px;">Most Trending Songs - Highest Usage</h2>
      <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 13px;">Analyzed ${totalSongsAnalyzed} songs from ${totalCountries} countries</p>
    </div>
    <div class="content">
      ${batches.length > 1 ? `<h3 style="color: #667eea; margin: 15px 0 10px 0; font-size: 16px;">Top Trending (Part ${batchNum}/${batches.length})</h3>` : ''}
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 40px;">#</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; color: #666; font-size: 12px;">Song</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 90px;">Country</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 70px;">Usage</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 70px;">24h</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 55px;">Play</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="font-size: 11px; color: #999; margin: 8px 0 0 0; text-align: center;">
        Songs sorted by highest trending score. Usage shows TikTok's normalized popularity metric (0-100%).
      </p>
    </div>
    <div class="footer">
      TikTok Music Trends Scraper • Global Trending Analysis
    </div>
  </div>
</body>
</html>
      `;

      const textBody = `
Most Trending Songs - Highest 24h Growth

Analyzed ${totalSongsAnalyzed} songs from ${totalCountries} countries

${batch.map((s, idx) => `${i * BATCH_SIZE + idx + 1}. ${s.title} - ${s.artist} (${s.trend24hDisplay})`).join('\n')}

---
TikTok Music Trends Scraper
      `;

      const mailOptions = {
        from: `"TikTok Music Scraper" <${this.gmailUser}>`,
        to: this.recipients.join(', '),
        subject: subject,
        text: textBody,
        html: htmlBody
      };

      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`   Sent batch ${batchNum}/${batches.length}`);
        emailsSent++;

        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2s delay
        }
      } catch (error) {
        console.error(`   Failed batch ${batchNum}: ${error.message}`);
      }
    }

    console.log(`\nMost Trending email complete!`);
    console.log(`   Total emails sent: ${emailsSent}`);

    return { success: true, emailsSent };
  }

  async sendMultiCountryAnalysis(analysisData) {
    const { popular, breakout, totalCountries, threshold, scanType = 'multi' } = analysisData;

    const BATCH_SIZE = 20;
    const DELAY_BETWEEN_EMAILS = 2000;

    console.log(`\nSending multi-country analysis emails...`);
    console.log(`   Found in ${threshold}+ of ${totalCountries} countries`);

    let emailsSent = 0;

    // Send Popular cross-country songs
    if (popular.length > 0) {
      const popularBatches = [];
      for (let i = 0; i < popular.length; i += BATCH_SIZE) {
        popularBatches.push(popular.slice(i, i + BATCH_SIZE));
      }

      console.log(`Sending ${popularBatches.length} Popular cross-country batches (${popular.length} songs)...`);

      for (let i = 0; i < popularBatches.length; i++) {
        const result = await this.sendMultiCountryBatchEmail(
          popularBatches[i],
          'Popular Songs',
          i + 1,
          popularBatches.length,
          totalCountries,
          threshold
        );

        if (result.success) emailsSent++;

        if (i < popularBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
        }
      }
    }

    // Send Breakout cross-country songs
    if (breakout.length > 0) {
      const breakoutBatches = [];
      for (let i = 0; i < breakout.length; i += BATCH_SIZE) {
        breakoutBatches.push(breakout.slice(i, i + BATCH_SIZE));
      }

      console.log(`Sending ${breakoutBatches.length} Breakout cross-country batches (${breakout.length} songs)...`);

      for (let i = 0; i < breakoutBatches.length; i++) {
        const result = await this.sendMultiCountryBatchEmail(
          breakoutBatches[i],
          'Breakout Songs',
          i + 1,
          breakoutBatches.length,
          totalCountries,
          threshold
        );

        if (result.success) emailsSent++;

        if (i < breakoutBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
        }
      }
    }

    console.log(`\nMulti-country analysis complete!`);
    console.log(`   Total emails sent: ${emailsSent} batches`);

    return { success: true, emailsSent };
  }

  async sendMultiCountryBatchEmail(songs, tabName, batchNum, totalBatches, totalCountries, threshold) {
    const subject = `Global Trending - ${tabName} (Found in ${threshold}+ of ${totalCountries} countries)`;

    const rows = songs.map((song, index) => {
      const usage24h = this.get24HourUsage(song);
      const countryList = song.countries.slice(0, 10).join(', ') + (song.countries.length > 10 ? `, +${song.countries.length - 10} more` : '');
      const releaseInfo = this.formatReleaseDate(song.release_date);

      let releaseDateHTML = '';
      if (releaseInfo) {
        const badgeHTML = releaseInfo.badge
          ? `<span style="background: ${releaseInfo.badge === 'NEW' ? '#4CAF50' : '#FF9800'}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; margin-left: 3px;">${releaseInfo.badge}</span>`
          : '';
        releaseDateHTML = `<br><span style="font-size: 10px; color: #999;">${releaseInfo.emoji || '📅'} ${releaseInfo.text}${badgeHTML}</span>`;
      }

      return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; text-align: center; font-weight: bold; color: #667eea;">${index + 1}</td>
        <td style="padding: 8px;">
          <img src="${song.cover || song.image}" alt="" style="width: 40px; height: 40px; border-radius: 4px; vertical-align: middle; margin-right: 10px; object-fit: cover;">
          <strong style="color: #333;">${song.title}</strong><br>
          <span style="font-size: 11px; color: #666;">${song.artist}</span>${releaseDateHTML}
        </td>
        <td style="padding: 8px; text-align: center; font-weight: bold; color: #4CAF50; font-size: 14px;">${song.countryCount}</td>
        <td style="padding: 8px; text-align: center; font-size: 12px;">
          <span style="color: ${usage24h.color}; font-weight: bold;">${usage24h.display}</span>
        </td>
        <td style="padding: 8px; text-align: center;">
          ${song.youtube_url
            ? `<a href="${song.youtube_url}" style="color: #FF0000; text-decoration: none; font-size: 12px; font-weight: 600;">▶ YouTube</a>`
            : `<a href="${song.link || song.url}" style="color: #667eea; text-decoration: none; font-size: 12px; font-weight: 600;">▶ TikTok</a>`
          }
        </td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td colspan="5" style="padding: 4px 8px 8px 8px; background: #f8f9fa; font-size: 11px; color: #666;">
          Countries: ${countryList}
        </td>
      </tr>
      `;
    }).join('');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; font-size: 18px;">Global Trending Music - ${tabName}</h2>
      <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 13px;">Found in ${threshold}+ of ${totalCountries} countries</p>
    </div>
    <div class="content">
      <h3 style="color: #667eea; margin: 15px 0 10px 0; font-size: 16px;">
        ${tabName} (Part ${batchNum}/${totalBatches})
      </h3>
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 40px;">#</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; color: #666; font-size: 12px;">Song</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 90px;">Countries</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 70px;">24h</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 55px;">Play</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="font-size: 11px; color: #999; margin: 8px 0 0 0; text-align: center;">
        Songs trending globally across ${threshold}+ countries. Sorted by country count.
      </p>
    </div>
    <div class="footer">
      TikTok Music Trends Scraper • Global Multi-Country Analysis
    </div>
  </div>
</body>
</html>
    `;

    const textBody = `
Global Trending Music - ${tabName}
Found in ${threshold}+ of ${totalCountries} countries

${songs.map(s => `${s.title} - ${s.artist} (${s.countryCount} countries)`).join('\n')}

---
TikTok Music Trends Scraper
    `;

    const mailOptions = {
      from: `"TikTok Music Scraper" <${this.gmailUser}>`,
      to: this.recipients.join(', '),
      subject: subject,
      text: textBody,
      html: htmlBody
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`   Sent ${tabName} batch ${batchNum}/${totalBatches}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`   Failed batch ${batchNum}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  getRankChangeIndicator(song) {
    // rank_diff_type: 0 = no change, 1 = up, 2 = down, 3 = new
    const diff = song.rank_diff || 0;
    const type = song.rank_diff_type || 0;

    if (type === 3 || diff === 0) {
      // New entry
      return '<span style="background: #4CAF50; color: white; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;">NEW</span>';
    } else if (type === 1 && diff > 0) {
      // Rank improved (went up)
      return `<span style="color: #4CAF50; font-weight: bold;">↑ ${diff}</span>`;
    } else if (type === 2 && diff > 0) {
      // Rank dropped (went down)
      return `<span style="color: #f44336; font-weight: bold;">↓ ${diff}</span>`;
    } else {
      // No change
      return '<span style="color: #999;">-</span>';
    }
  }

  get24HourUsage(song) {
    // Calculate 24-hour usage from trend chart
    if (!song.trend_chart || song.trend_chart.length < 2) {
      return { display: '-', color: '#999' };
    }

    // Get last two days from trend chart
    const lastDay = song.trend_chart[song.trend_chart.length - 1];
    const previousDay = song.trend_chart[song.trend_chart.length - 2];

    // Handle edge case: previousDay has 0 or very low value
    if (previousDay.value === 0 || previousDay.value < 0.0001) {
      if (lastDay.value > 0) {
        // Brand new trending song
        return {
          display: 'NEW',
          color: '#4CAF50',
          icon: ''
        };
      } else {
        // Both are 0
        return { display: '-', color: '#999' };
      }
    }

    // Calculate percentage change
    const change = ((lastDay.value - previousDay.value) / previousDay.value) * 100;

    // Handle Infinity or very large numbers
    if (!isFinite(change)) {
      return {
        display: 'NEW',
        color: '#4CAF50',
        icon: ''
      };
    }

    // Calculate estimated usage (using trend value as proxy)
    // trend value ranges 0-1, we can multiply by a factor to show engagement
    const usageEstimate = Math.round(lastDay.value * 1000000); // Example scaling

    if (change > 10) {
      // Significant increase
      return {
        display: `+${Math.round(change)}%`,
        color: '#4CAF50',
        icon: ''
      };
    } else if (change > 0) {
      // Slight increase
      return {
        display: `+${Math.round(change)}%`,
        color: '#8BC34A',
        icon: ''
      };
    } else if (change < -10) {
      // Significant decrease
      return {
        display: `${Math.round(change)}%`,
        color: '#f44336',
        icon: ''
      };
    } else if (change < 0) {
      // Slight decrease
      return {
        display: `${Math.round(change)}%`,
        color: '#FF9800',
        icon: ''
      };
    } else {
      // No change
      return {
        display: '0%',
        color: '#999',
        icon: ''
      };
    }
  }

  generateCompactSongTableHTML(songs, tabName, batchNum, totalBatches) {
    if (!songs || songs.length === 0) {
      return '';
    }

    const rows = songs.map(song => {
      const usage24h = this.get24HourUsage(song);
      const releaseInfo = this.formatReleaseDate(song.release_date);

      let releaseDateHTML = '';
      if (releaseInfo) {
        const badgeHTML = releaseInfo.badge
          ? `<span style="background: ${releaseInfo.badge === 'NEW' ? '#4CAF50' : '#FF9800'}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; margin-left: 3px;">${releaseInfo.badge}</span>`
          : '';
        releaseDateHTML = `<br><span style="font-size: 10px; color: #999;">${releaseInfo.emoji || '📅'} ${releaseInfo.text}${badgeHTML}</span>`;
      }

      // Build play link HTML
      let playLinkHTML = '';
      if (song.youtube_url) {
        playLinkHTML = `<a href="${song.youtube_url}" style="color: #FF0000; text-decoration: none; font-size: 12px; font-weight: 600;">▶ YouTube</a>`;
      } else {
        const link = song.link || song.url || '#';
        playLinkHTML = `<a href="${link}" style="color: #667eea; text-decoration: none; font-size: 12px; font-weight: 600;">▶ TikTok</a>`;
      }

      return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; text-align: center; font-weight: bold; color: #667eea;">${song.rank}</td>
        <td style="padding: 8px;">
          <img src="${song.cover || song.image}" alt="" style="width: 40px; height: 40px; border-radius: 4px; vertical-align: middle; margin-right: 10px; object-fit: cover;">
          <strong style="color: #333;">${song.title}</strong><br>
          <span style="font-size: 11px; color: #666;">${song.artist}</span>${releaseDateHTML}
        </td>
        <td style="padding: 8px; text-align: center; font-size: 12px;">${this.getRankChangeIndicator(song)}</td>
        <td style="padding: 8px; text-align: center; font-size: 12px;">
          <span style="color: ${usage24h.color}; font-weight: bold;">${usage24h.display}</span>
        </td>
        <td style="padding: 8px; text-align: center;">
          ${playLinkHTML}
        </td>
      </tr>
      `;
    }).join('');

    return `
      <h3 style="color: #667eea; margin: 15px 0 10px 0; font-size: 16px;">
        ${tabName} (Part ${batchNum}/${totalBatches})
      </h3>
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 45px;">#</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; color: #666; font-size: 12px;">Song</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 70px;">Rank</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 70px;">24h</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 55px;">Play</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <p style="font-size: 11px; color: #999; margin: 8px 0 0 0; text-align: center;">
        24h shows popularity change from yesterday. Click Play to listen on TikTok.
      </p>
    `;
  }

  async sendBatchEmail(songs, tabName, batchNum, totalBatches, country, scanType) {
    const startRank = songs[0].rank;
    const endRank = songs[songs.length - 1].rank;
    const countryName = this.getCountryName(country);
    const subject = `${countryName} ${tabName} - Songs #${startRank}-${endRank} (Batch ${batchNum}/${totalBatches})`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 650px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; font-size: 18px;">TikTok Music Trends - ${countryName}</h2>
    </div>
    <div class="content">
      ${this.generateCompactSongTableHTML(songs, tabName, batchNum, totalBatches)}
      <div style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-top: 15px; font-size: 12px; color: #666;">
        Showing songs ${startRank}-${endRank}. More batches will arrive shortly.
      </div>
    </div>
    <div class="footer">
      TikTok Music Trends Scraper • Powered by TikTok Creative Center
    </div>
  </div>
</body>
</html>
    `;

    const textBody = `
TikTok Music Trends - ${countryName}
${tabName} - Batch ${batchNum}/${totalBatches}

Songs ${startRank}-${endRank}:

${songs.map(s => `${s.rank}. ${s.title} - ${s.artist} (${s.duration}s)`).join('\n')}

---
TikTok Music Trends Scraper
    `;

    const mailOptions = {
      from: `"TikTok Music Scraper" <${this.gmailUser}>`,
      to: this.recipients.join(', '),
      subject: subject,
      text: textBody,
      html: htmlBody
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`   Sent batch ${batchNum}/${totalBatches} - Songs ${startRank}-${endRank}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`   Failed batch ${batchNum}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async initialize() {
    if (!this.gmailUser || !this.gmailAppPassword) {
      throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables');
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use TLS
      auth: {
        user: this.gmailUser,
        pass: this.gmailAppPassword
      }
    });

    // Verify connection
    await this.transporter.verify();
    console.log('Email SMTP connection verified');
  }

  async sendScanResults(scanData) {
    const {
      country,
      popularCount = 0,
      breakoutCount = 0,
      popularFile = null,
      breakoutFile = null,
      popularSongs = [],
      breakoutSongs = [],
      scanType = 'full',
      duration = 0
    } = scanData;

    const BATCH_SIZE = 20;
    const DELAY_BETWEEN_EMAILS = 2000; // 2 seconds delay

    console.log(`\nPreparing to send emails in batches of ${BATCH_SIZE} songs...`);

    let emailsSent = 0;
    let emailsFailed = 0;

    // Send Popular songs in batches
    if (popularSongs.length > 0) {
      // Sort by 24h usage (most used first)
      const sortedPopularSongs = this.sortSongsByUsage(popularSongs);

      const popularBatches = [];
      for (let i = 0; i < sortedPopularSongs.length; i += BATCH_SIZE) {
        popularBatches.push(sortedPopularSongs.slice(i, i + BATCH_SIZE));
      }

      console.log(`Sending ${popularBatches.length} Popular song batches...`);

      for (let i = 0; i < popularBatches.length; i++) {
        const result = await this.sendBatchEmail(
          popularBatches[i],
          'Popular Songs',
          i + 1,
          popularBatches.length,
          country,
          scanType
        );

        if (result.success) emailsSent++;
        else emailsFailed++;

        // Delay between emails to avoid rate limits
        if (i < popularBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
        }
      }
    }

    // Send Breakout songs in batches
    if (breakoutSongs.length > 0) {
      // Sort by 24h usage (most used first)
      const sortedBreakoutSongs = this.sortSongsByUsage(breakoutSongs);

      const breakoutBatches = [];
      for (let i = 0; i < sortedBreakoutSongs.length; i += BATCH_SIZE) {
        breakoutBatches.push(sortedBreakoutSongs.slice(i, i + BATCH_SIZE));
      }

      console.log(`Sending ${breakoutBatches.length} Breakout song batches...`);

      for (let i = 0; i < breakoutBatches.length; i++) {
        const result = await this.sendBatchEmail(
          breakoutBatches[i],
          'Breakout Songs',
          i + 1,
          breakoutBatches.length,
          country,
          scanType
        );

        if (result.success) emailsSent++;
        else emailsFailed++;

        // Delay between emails
        if (i < breakoutBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
        }
      }
    }

    // Summary email disabled per user request
    // await this.sendSummaryEmail({
    //   country,
    //   popularCount,
    //   breakoutCount,
    //   duration,
    //   scanType,
    //   emailsSent,
    //   emailsFailed
    // });

    console.log(`\nEmail sending complete!`);
    console.log(`   Total emails sent: ${emailsSent} batches`);
    console.log(`   Recipients: ${this.recipients.join(', ')}`);

    return {
      success: true,
      emailsSent: emailsSent,
      emailsFailed
    };
  }

  async sendSummaryEmail(data) {
    const { country, popularCount, breakoutCount, duration, scanType, emailsSent, emailsFailed } = data;
    const subject = `TikTok Music Scan Summary - ${country} (${popularCount + breakoutCount} songs)`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center; }
    .content { padding: 25px; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
    .stat-card { background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: bold; color: #667eea; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
    .info-box { background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 13px; color: #1565c0; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 22px;">TikTok Music Scan Complete!</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">${country} • ${scanType === 'quick' ? 'Quick' : 'Full'} Scan • ${duration}s</p>
    </div>

    <div class="content">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${popularCount}</div>
          <div class="stat-label">POPULAR SONGS</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${breakoutCount}</div>
          <div class="stat-label">BREAKOUT SONGS</div>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${popularCount + breakoutCount}</div>
          <div class="stat-label">TOTAL SONGS</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${emailsSent}</div>
          <div class="stat-label">EMAILS SENT</div>
        </div>
      </div>

      <div class="info-box">
        <strong>Scan Complete!</strong><br>
        Check your inbox for ${emailsSent} emails with song details in batches of 20.
      </div>

      <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; font-size: 12px; color: #666;">
        <strong>Data Files:</strong><br>
        • Popular songs: JSON & CSV format<br>
        • Breakout songs: JSON & CSV format<br>
        • Location: Server data directory
      </div>
    </div>

    <div class="footer">
      TikTok Music Trends Scraper • Powered by TikTok Creative Center API
    </div>
  </div>
</body>
</html>
    `;

    const textBody = `
TikTok Music Scan Complete - ${country}

Summary:
- Scan Type: ${scanType === 'quick' ? 'Quick' : 'Full'}
- Popular Songs: ${popularCount}
- Breakout Songs: ${breakoutCount}
- Total Songs: ${popularCount + breakoutCount}
- Duration: ${duration}s
- Emails Sent: ${emailsSent}

Check your inbox for ${emailsSent} emails with song details in batches of 20.

Data files (JSON & CSV) are stored on the server.

---
TikTok Music Trends Scraper
    `;

    const mailOptions = {
      from: `"TikTok Music Scraper" <${this.gmailUser}>`,
      to: this.gmailUser, // Summary only to pitah
      subject: subject,
      text: textBody,
      html: htmlBody
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Summary email sent');
      console.log(`   Recipient: ${this.gmailUser}`);
      console.log(`   Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Failed to send summary email:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendQuickNotification(message, subject = 'TikTok Scraper Notification') {
    const mailOptions = {
      from: `"TikTok Music Scraper" <${this.gmailUser}>`,
      to: this.recipients.join(', '),
      subject: subject,
      text: message,
      html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #667eea;">${subject}</h2>
        <p style="font-size: 14px; color: #333;">${message}</p>
      </div>`
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log('Notification email sent');
      return { success: true };
    } catch (error) {
      console.error('Failed to send notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendMultiCountryResults(data) {
    const {
      scanType,
      totalCountries,
      completed,
      failed,
      successCountries,
      failedCountries,
      duration,
      results
    } = data;

    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const subject = `Multi-Country Scan Complete - ${completed}/${totalCountries} countries (${scanType})`;

    const successRows = successCountries.map((country, i) => {
      const result = results.find(r => r.country === country);
      const dur = result ? `${result.duration}s` : '-';
      return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px; text-align: center; font-weight: bold; color: #4CAF50;">${i + 1}</td>
        <td style="padding: 10px;"><strong>${country}</strong></td>
        <td style="padding: 10px; text-align: center;">✅ Success</td>
        <td style="padding: 10px; text-align: center; color: #666;">${dur}</td>
      </tr>
      `;
    }).join('');

    const failedRows = failedCountries.map((country, i) => {
      const result = results.find(r => r.country === country);
      const status = result ? result.status : 'error';
      return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 10px; text-align: center; font-weight: bold; color: #f44336;">${i + 1}</td>
        <td style="padding: 10px;"><strong>${country}</strong></td>
        <td style="padding: 10px; text-align: center;">❌ Failed</td>
        <td style="padding: 10px; text-align: center; color: #666;">-</td>
      </tr>
      `;
    }).join('');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 700px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .content { padding: 25px; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
    .stat-card { background: #f8f9fa; padding: 20px; border-radius: 6px; text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; color: #667eea; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; text-transform: uppercase; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">🌍 Multi-Country Scan Complete!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 14px;">${scanType.toUpperCase()} Scan • ${totalCountries} Countries • ${minutes}m ${seconds}s</p>
    </div>

    <div class="content">
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-value">${totalCountries}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #4CAF50;">${completed}</div>
          <div class="stat-label">Success</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #f44336;">${failed}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>

      ${successCountries.length > 0 ? `
      <h3 style="color: #4CAF50; margin: 25px 0 15px 0; font-size: 16px;">✅ Successful Scans (${successCountries.length})</h3>
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: center; font-weight: 600; color: #666; width: 50px;">#</th>
            <th style="padding: 10px; text-align: left; font-weight: 600; color: #666;">Country</th>
            <th style="padding: 10px; text-align: center; font-weight: 600; color: #666;">Status</th>
            <th style="padding: 10px; text-align: center; font-weight: 600; color: #666;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${successRows}
        </tbody>
      </table>
      ` : ''}

      ${failedCountries.length > 0 ? `
      <h3 style="color: #f44336; margin: 25px 0 15px 0; font-size: 16px;">❌ Failed Scans (${failedCountries.length})</h3>
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: center; font-weight: 600; color: #666; width: 50px;">#</th>
            <th style="padding: 10px; text-align: left; font-weight: 600; color: #666;">Country</th>
            <th style="padding: 10px; text-align: center; font-weight: 600; color: #666;">Status</th>
            <th style="padding: 10px; text-align: center; font-weight: 600; color: #666;">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${failedRows}
        </tbody>
      </table>
      ` : ''}

      <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin-top: 25px; font-size: 13px; color: #1565c0;">
        <strong>Next Steps:</strong><br>
        • Check your data folder for JSON/CSV files<br>
        • Review individual country scan results<br>
        • ${failed > 0 ? 'Retry failed countries if needed' : 'All scans completed successfully!'}
      </div>
    </div>

    <div class="footer">
      TikTok Music Trends Scraper • Automated Multi-Country Scanner
    </div>
  </div>
</body>
</html>
    `;

    const textBody = `
Multi-Country Scan Complete

Summary:
- Scan Type: ${scanType.toUpperCase()}
- Total Countries: ${totalCountries}
- Successful: ${completed}
- Failed: ${failed}
- Total Duration: ${minutes}m ${seconds}s

Successful Countries:
${successCountries.map((c, i) => `${i + 1}. ${c}`).join('\n')}

${failedCountries.length > 0 ? `Failed Countries:\n${failedCountries.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

---
TikTok Music Trends Scraper
    `;

    const mailOptions = {
      from: `"TikTok Music Scraper" <${this.gmailUser}>`,
      to: this.recipients.join(', '),
      subject: subject,
      text: textBody,
      html: htmlBody
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`Multi-country summary email sent`);
      console.log(`   Recipients: ${this.recipients.join(', ')}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send multi-country summary:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendHighGrowthEmail(data) {
    const { country, songs, threshold } = data;
    const countryName = this.getCountryName(country);
    const subject = `🚀 High Growth Songs - ${countryName} (${songs.length} songs with ${threshold}%+ 24h change)`;

    const rows = songs.map((song, index) => {
      const usage24h = this.get24HourUsage(song);
      const releaseInfo = this.formatReleaseDate(song.release_date);

      let releaseDateHTML = '';
      if (releaseInfo) {
        const badgeHTML = releaseInfo.badge
          ? `<span style="background: ${releaseInfo.badge === 'NEW' ? '#4CAF50' : '#FF9800'}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; margin-left: 3px;">${releaseInfo.badge}</span>`
          : '';
        releaseDateHTML = `<br><span style="font-size: 10px; color: #999;">${releaseInfo.emoji || '📅'} ${releaseInfo.text}${badgeHTML}</span>`;
      }

      // Build play link HTML
      let playLinkHTML = '';
      if (song.youtube_url) {
        playLinkHTML = `<a href="${song.youtube_url}" style="color: #FF0000; text-decoration: none; font-size: 12px; font-weight: 600;">▶ YouTube</a>`;
      } else {
        const link = song.link || song.url || '#';
        playLinkHTML = `<a href="${link}" style="color: #667eea; text-decoration: none; font-size: 12px; font-weight: 600;">▶ TikTok</a>`;
      }

      // Format 24h change
      let change24hDisplay = '';
      if (song.change24h === Infinity) {
        change24hDisplay = '<span style="color: #4CAF50; font-weight: bold; font-size: 14px;">🔥 NEW</span>';
      } else {
        change24hDisplay = `<span style="color: #4CAF50; font-weight: bold; font-size: 14px;">+${Math.round(song.change24h)}%</span>`;
      }

      return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; text-align: center; font-weight: bold; color: #4CAF50;">${index + 1}</td>
        <td style="padding: 8px;">
          <img src="${song.cover || song.image}" alt="" style="width: 40px; height: 40px; border-radius: 4px; vertical-align: middle; margin-right: 10px; object-fit: cover;">
          <strong style="color: #333;">${song.title}</strong><br>
          <span style="font-size: 11px; color: #666;">${song.artist}</span>${releaseDateHTML}
        </td>
        <td style="padding: 8px; text-align: center;">
          <span style="background: #f0f0f0; padding: 3px 6px; border-radius: 3px; font-size: 11px; color: #666;">${song.tab}</span>
        </td>
        <td style="padding: 8px; text-align: center; font-size: 12px;">
          <span style="color: #999; font-size: 11px;">#${song.rank}</span>
        </td>
        <td style="padding: 8px; text-align: center;">
          ${change24hDisplay}
        </td>
        <td style="padding: 8px; text-align: center;">
          ${playLinkHTML}
        </td>
      </tr>
      `;
    }).join('');

    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 750px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 25px; text-align: center; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; font-size: 20px;">🚀 High Growth Songs - ${countryName}</h2>
      <p style="margin: 8px 0 0 0; opacity: 0.95; font-size: 14px;">${songs.length} songs with ${threshold}%+ 24h growth</p>
    </div>
    <div class="content">
      <p style="color: #666; font-size: 13px; margin: 0 0 15px 0;">
        Sorted by 24-hour growth rate • Songs exploding in popularity right now
      </p>
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 40px;">#</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; color: #666; font-size: 12px;">Song</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 70px;">Tab</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 60px;">Rank</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 90px;">24h Growth</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 80px;">Play</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="background: #f0f9f4; padding: 12px; border-radius: 6px; margin-top: 15px; font-size: 12px; color: #2e7d32;">
        <strong>💡 Tip:</strong> These songs are growing explosively - perfect for trending content!
      </div>
    </div>
    <div class="footer">
      TikTok Music Trends • High Growth Alert
    </div>
  </div>
</body>
</html>
    `;

    const textBody = `
High Growth Songs - ${countryName}
${songs.length} songs with ${threshold}%+ 24h growth

${songs.map((s, i) => {
  const growth = s.change24h === Infinity ? 'NEW' : `+${Math.round(s.change24h)}%`;
  return `${i + 1}. ${s.title} - ${s.artist} (${growth})`;
}).join('\n')}

These songs are exploding in popularity right now!
    `;

    const mailOptions = {
      from: this.gmailUser,
      to: this.recipients.join(', '),
      subject: subject,
      text: textBody,
      html: htmlBody
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`High growth email sent`);
      console.log(`   Recipients: ${this.recipients.join(', ')}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send high growth email:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendGlobalBreakoutsEmail(data) {
    const { songs, totalCountries } = data;
    const subject = `🌍 Top ${songs.length} Breakout Songs Worldwide (${totalCountries} countries)`;

    const BATCH_SIZE = 20;
    const batches = [];
    for (let i = 0; i < songs.length; i += BATCH_SIZE) {
      batches.push(songs.slice(i, i + BATCH_SIZE));
    }

    console.log(`\nSending ${batches.length} email batches (${BATCH_SIZE} songs each)...`);

    let emailsSent = 0;
    const DELAY_BETWEEN_EMAILS = 2000;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNum = i + 1;

      const rows = batch.map((song, index) => {
        const globalRank = i * BATCH_SIZE + index + 1;
        const usage24h = this.get24HourUsage(song);
        const countryName = this.getCountryName(song.country);
        const releaseInfo = this.formatReleaseDate(song.release_date);

        let releaseDateHTML = '';
        if (releaseInfo) {
          const badgeHTML = releaseInfo.badge
            ? `<span style="background: ${releaseInfo.badge === 'NEW' ? '#4CAF50' : '#FF9800'}; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; margin-left: 3px;">${releaseInfo.badge}</span>`
            : '';
          releaseDateHTML = `<br><span style="font-size: 10px; color: #999;">${releaseInfo.emoji || '📅'} ${releaseInfo.text}${badgeHTML}</span>`;
        }

        // Build play link HTML
        let playLinkHTML = '';
        if (song.youtube_url) {
          playLinkHTML = `<a href="${song.youtube_url}" style="color: #FF0000; text-decoration: none; font-size: 12px; font-weight: 600;">▶ YouTube</a>`;
        } else {
          const link = song.link || song.url || '#';
          playLinkHTML = `<a href="${link}" style="color: #667eea; text-decoration: none; font-size: 12px; font-weight: 600;">▶ TikTok</a>`;
        }

        // Format 24h change
        let change24hDisplay = '';
        if (song.change24h === Infinity) {
          change24hDisplay = '<span style="color: #4CAF50; font-weight: bold; font-size: 13px;">🔥 NEW</span>';
        } else {
          change24hDisplay = `<span style="color: #4CAF50; font-weight: bold; font-size: 13px;">+${Math.round(song.change24h)}%</span>`;
        }

        return `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px; text-align: center; font-weight: bold; color: #4CAF50;">${globalRank}</td>
          <td style="padding: 8px;">
            <img src="${song.cover || song.image}" alt="" style="width: 40px; height: 40px; border-radius: 4px; vertical-align: middle; margin-right: 10px; object-fit: cover;">
            <strong style="color: #333;">${song.title}</strong><br>
            <span style="font-size: 11px; color: #666;">${song.artist}</span>${releaseDateHTML}
          </td>
          <td style="padding: 8px; text-align: center; font-size: 12px; color: #666;">${countryName}</td>
          <td style="padding: 8px; text-align: center;">
            ${change24hDisplay}
          </td>
          <td style="padding: 8px; text-align: center;">
            ${playLinkHTML}
          </td>
        </tr>
        `;
      }).join('');

      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 750px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; text-align: center; }
    .content { padding: 20px; }
    .footer { text-align: center; padding: 15px; color: #999; font-size: 11px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0; font-size: 20px;">🌍 Top ${songs.length} Breakout Songs Worldwide</h2>
      <p style="margin: 8px 0 0 0; opacity: 0.95; font-size: 14px;">From ${totalCountries} countries • Sorted by 24h growth</p>
    </div>
    <div class="content">
      ${batches.length > 1 ? `<h3 style="color: #667eea; margin: 15px 0 10px 0; font-size: 16px;">Part ${batchNum}/${batches.length}</h3>` : ''}
      <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 6px; overflow: hidden; font-size: 13px;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 40px;">#</th>
            <th style="padding: 8px; text-align: left; font-weight: 600; color: #666; font-size: 12px;">Song</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 90px;">Country</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 80px;">24h Growth</th>
            <th style="padding: 8px; text-align: center; font-weight: 600; color: #666; font-size: 12px; width: 80px;">Play</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      <div style="background: #f0f9f4; padding: 12px; border-radius: 6px; margin-top: 15px; font-size: 12px; color: #2e7d32;">
        <strong>💡 Tip:</strong> These are the fastest-growing breakout songs worldwide!
      </div>
    </div>
    <div class="footer">
      TikTok Music Trends • Global Breakout Alert
    </div>
  </div>
</body>
</html>
      `;

      const startRank = i * BATCH_SIZE + 1;
      const endRank = i * BATCH_SIZE + batch.length;
      const batchSubject = `${subject} - Songs #${startRank}-${endRank} (Batch ${batchNum}/${batches.length})`;

      const textBody = `
Top ${songs.length} Breakout Songs Worldwide
From ${totalCountries} countries

Batch ${batchNum}/${batches.length} - Songs #${startRank}-${endRank}

${batch.map((s, idx) => {
  const rank = i * BATCH_SIZE + idx + 1;
  const growth = s.change24h === Infinity ? 'NEW' : `+${Math.round(s.change24h)}%`;
  return `${rank}. ${s.title} - ${s.artist} (${s.country}) ${growth}`;
}).join('\n')}
      `;

      const mailOptions = {
        from: this.gmailUser,
        to: this.recipients.join(', '),
        subject: batchSubject,
        text: textBody,
        html: htmlBody
      };

      try {
        await this.transporter.sendMail(mailOptions);
        console.log(`   Sent batch ${batchNum}/${batches.length} - Songs ${startRank}-${endRank}`);
        emailsSent++;

        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_EMAILS));
        }
      } catch (error) {
        console.error(`   Failed batch ${batchNum}: ${error.message}`);
      }
    }

    console.log(`\nEmail sending complete!`);
    console.log(`   Total emails sent: ${emailsSent} batches`);
    console.log(`   Recipients: ${this.recipients.join(', ')}`);

    return { success: emailsSent > 0, emailsSent };
  }
}

module.exports = EmailNotifier;

// Test if run directly
if (require.main === module) {
  (async () => {
    try {
      const notifier = new EmailNotifier();
      await notifier.initialize();

      // Test email with sample songs
      const sampleSongs = [
        {
          rank: 1,
          title: "霧化する言語",
          artist: "yasuhiro soda",
          cover: "https://p16-sg.tiktokcdn.com/aweme/720x720/tos-alisg-v-2774/owEttFptdBAABJDSEfzBAQAgEz3gLb10eByCZL.jpeg",
          link: "https://www.tiktok.com/music/x-7596970562758395920",
          duration: 60,
          rank_diff: 0,
          rank_diff_type: 3, // New
          trend_chart: [
            { time: 1771113600, value: 0.29 },
            { time: 1771200000, value: 0.37 },
            { time: 1771286400, value: 0.45 },
            { time: 1771372800, value: 0.68 },
            { time: 1771459200, value: 0.72 },
            { time: 1771545600, value: 0.85 },
            { time: 1771632000, value: 1.0 }  // +17.6% in last 24h
          ]
        },
        {
          rank: 2,
          title: "Two Birds",
          artist: "Regina Spektor",
          cover: "https://p16-sg.tiktokcdn.com/aweme/720x720/tos-alisg-v-2774/example.jpeg",
          link: "https://www.tiktok.com/music/x-6705083433225291777",
          duration: 30,
          rank_diff: 5,
          rank_diff_type: 1, // Up 5
          trend_chart: [
            { time: 1771113600, value: 0.55 },
            { time: 1771200000, value: 0.62 },
            { time: 1771286400, value: 0.58 },
            { time: 1771372800, value: 0.71 },
            { time: 1771459200, value: 0.68 },
            { time: 1771545600, value: 0.65 },
            { time: 1771632000, value: 0.72 }  // +10.8% in last 24h
          ]
        },
        {
          rank: 3,
          title: "Plastic Cigarette",
          artist: "Zach Bryan",
          cover: "https://p16-sg.tiktokcdn.com/aweme/720x720/tos-alisg-v-2774/example2.jpeg",
          link: "https://www.tiktok.com/music/x-7593208400261220353",
          duration: 60,
          rank_diff: 3,
          rank_diff_type: 2, // Down 3
          trend_chart: [
            { time: 1771113600, value: 0.88 },
            { time: 1771200000, value: 0.92 },
            { time: 1771286400, value: 0.85 },
            { time: 1771372800, value: 0.79 },
            { time: 1771459200, value: 0.73 },
            { time: 1771545600, value: 0.68 },
            { time: 1771632000, value: 0.54 }  // -20.6% in last 24h
          ]
        }
      ];

      await notifier.sendScanResults({
        country: 'US',
        popularCount: 3,
        breakoutCount: 3,
        popularSongs: sampleSongs,
        breakoutSongs: sampleSongs,
        popularFile: 'data/trending_music_with_trends',
        breakoutFile: 'data/trending_music_with_trends_breakout',
        scanType: 'full',
        duration: 60
      });

      console.log('\nTest email sent successfully!');
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}
