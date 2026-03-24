/**
 * Cookie Loader - Parse Netscape format cookies and load into browser
 */

const fs = require('fs').promises;

class CookieLoader {
  /**
   * Parse Netscape HTTP Cookie File format
   * Format: domain flag path secure expiration name value
   */
  static parseNetscapeCookies(cookieText) {
    const cookies = [];
    const lines = cookieText.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') continue;

      const parts = line.split('\t');
      if (parts.length < 7) continue;

      const [domain, flag, path, secure, expiration, name, value] = parts;

      // Convert to Playwright/Puppeteer cookie format
      cookies.push({
        name: name.trim(),
        value: value.trim(),
        domain: domain.trim(),
        path: path.trim(),
        expires: parseInt(expiration),
        httpOnly: false,
        secure: secure.trim() === 'TRUE',
        sameSite: 'Lax'
      });
    }

    return cookies;
  }

  /**
   * Load cookies from Netscape format file
   */
  static async loadFromFile(filepath) {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const cookies = this.parseNetscapeCookies(content);
      console.log(`🍪 Loaded ${cookies.length} cookies from ${filepath}`);
      return cookies;
    } catch (error) {
      console.error(`❌ Failed to load cookies: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if cookies file exists and is recent
   */
  static async isCookieFileValid(filepath, maxAgeHours = 24) {
    try {
      const stats = await fs.stat(filepath);
      const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

      if (ageHours > maxAgeHours) {
        console.log(`⚠️  Cookie file is ${ageHours.toFixed(1)}h old (> ${maxAgeHours}h)`);
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Export cookies from Playwright context to Netscape format
   */
  static async exportToNetscape(cookies, filepath) {
    const lines = [
      '# Netscape HTTP Cookie File',
      '# https://curl.haxx.se/rfc/cookie_spec.html',
      '# This is a generated file! Do not edit.',
      ''
    ];

    for (const cookie of cookies) {
      const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
      const flag = 'TRUE';
      const path = cookie.path || '/';
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const expiration = cookie.expires || Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60);
      const name = cookie.name;
      const value = cookie.value;

      lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}`);
    }

    await fs.writeFile(filepath, lines.join('\n'), 'utf-8');
    console.log(`💾 Saved ${cookies.length} cookies to ${filepath}`);
  }
}

module.exports = CookieLoader;
