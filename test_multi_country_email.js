#!/usr/bin/env node

/**
 * Test Multi-Country Cross-Analysis Email
 * Shows songs trending in multiple countries
 */

require('dotenv').config();
const EmailNotifier = require('./email_notifier');

// Sample multi-country data
const multiCountryData = [
  {
    country: 'US',
    popularSongs: [
      {
        rank: 1,
        song_id: '7596970562758395920',
        title: 'Espresso',
        artist: 'Sabrina Carpenter',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample.webp',
        link: 'https://www.tiktok.com/music/Espresso-7596970562758395920',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 1680000 },
          { date: '2024-01-21', value: 2100000 }
        ]
      },
      {
        rank: 2,
        song_id: '7589123456789012345',
        title: 'Beautiful Things',
        artist: 'Benson Boone',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample2.webp',
        link: 'https://www.tiktok.com/music/Beautiful-Things-7589123456789012345',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 1400000 },
          { date: '2024-01-21', value: 1560000 }
        ]
      }
    ],
    breakoutSongs: [
      {
        rank: 1,
        song_id: '7598765432109876543',
        title: 'Rising Star',
        artist: 'New Artist',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample3.webp',
        link: 'https://www.tiktok.com/music/Rising-Star-7598765432109876543',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 678000 },
          { date: '2024-01-21', value: 982000 }
        ]
      }
    ]
  },
  {
    country: 'GB',
    popularSongs: [
      {
        rank: 1,
        song_id: '7596970562758395920',
        title: 'Espresso',
        artist: 'Sabrina Carpenter',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample.webp',
        link: 'https://www.tiktok.com/music/Espresso-7596970562758395920',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 980000 },
          { date: '2024-01-21', value: 1200000 }
        ]
      },
      {
        rank: 3,
        song_id: '7589123456789012345',
        title: 'Beautiful Things',
        artist: 'Benson Boone',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample2.webp',
        link: 'https://www.tiktok.com/music/Beautiful-Things-7589123456789012345',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 890000 },
          { date: '2024-01-21', value: 950000 }
        ]
      }
    ],
    breakoutSongs: [
      {
        rank: 2,
        song_id: '7598765432109876543',
        title: 'Rising Star',
        artist: 'New Artist',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample3.webp',
        link: 'https://www.tiktok.com/music/Rising-Star-7598765432109876543',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 445000 },
          { date: '2024-01-21', value: 678000 }
        ]
      }
    ]
  },
  {
    country: 'PH',
    popularSongs: [
      {
        rank: 2,
        song_id: '7596970562758395920',
        title: 'Espresso',
        artist: 'Sabrina Carpenter',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample.webp',
        link: 'https://www.tiktok.com/music/Espresso-7596970562758395920',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 1230000 },
          { date: '2024-01-21', value: 1580000 }
        ]
      }
    ],
    breakoutSongs: [
      {
        rank: 1,
        song_id: '7598765432109876543',
        title: 'Rising Star',
        artist: 'New Artist',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample3.webp',
        link: 'https://www.tiktok.com/music/Rising-Star-7598765432109876543',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 556000 },
          { date: '2024-01-21', value: 892000 }
        ]
      }
    ]
  },
  {
    country: 'JP',
    popularSongs: [
      {
        rank: 5,
        song_id: '7596970562758395920',
        title: 'Espresso',
        artist: 'Sabrina Carpenter',
        cover: 'https://p16-sign-sg.tiktokcdn.com/tos-alisg-v-0000/sample.webp',
        link: 'https://www.tiktok.com/music/Espresso-7596970562758395920',
        duration: 60,
        trend_chart: [
          { date: '2024-01-20', value: 780000 },
          { date: '2024-01-21', value: 1020000 }
        ]
      }
    ],
    breakoutSongs: []
  }
];

async function testMultiCountryEmail() {
  console.log('\nTesting Multi-Country Cross-Analysis Email...\n');
  console.log('─'.repeat(70));

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('GMAIL_USER or GMAIL_APP_PASSWORD not set');
    process.exit(1);
  }

  console.log('Environment variables found');
  console.log('─'.repeat(70));

  try {
    const notifier = new EmailNotifier();
    await notifier.initialize();
    console.log('Email notifier initialized\n');

    // Analyze cross-country data
    console.log('Analyzing multi-country data...');
    console.log(`   Total countries: ${multiCountryData.length}`);
    console.log(`   Threshold: 75% (3+ of 4 countries)\n`);

    const analysis = notifier.analyzeMultiCountrySongs(multiCountryData, 0.75);

    console.log('Analysis Results:');
    console.log(`   Popular songs in 3+ countries: ${analysis.popular.length}`);
    console.log(`   Breakout songs in 3+ countries: ${analysis.breakout.length}\n`);

    if (analysis.popular.length > 0) {
      console.log('Popular cross-country hits:');
      analysis.popular.forEach(song => {
        console.log(`   - ${song.title} by ${song.artist}`);
        console.log(`     Found in ${song.countryCount} countries: ${song.countries.join(', ')}`);
      });
      console.log('');
    }

    if (analysis.breakout.length > 0) {
      console.log('Breakout cross-country hits:');
      analysis.breakout.forEach(song => {
        console.log(`   - ${song.title} by ${song.artist}`);
        console.log(`     Found in ${song.countryCount} countries: ${song.countries.join(', ')}`);
      });
      console.log('');
    }

    // Send emails
    console.log('Sending multi-country analysis emails...\n');
    await notifier.sendMultiCountryAnalysis(analysis);

    console.log('\n' + '═'.repeat(70));
    console.log('MULTI-COUNTRY EMAIL TEST SUCCESSFUL!');
    console.log('═'.repeat(70));
    console.log('\nCheck your inbox for global trending songs!');
    console.log('Songs shown are those appearing in 3+ of 4 scanned countries.\n');

  } catch (error) {
    console.log('\n' + '═'.repeat(70));
    console.error('TEST FAILED');
    console.log('═'.repeat(70));
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

testMultiCountryEmail();
