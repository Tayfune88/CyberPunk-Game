const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('file:///app/index.html');

  // Click start
  await page.click('#start-btn');

  // Wait a moment for game to initialize
  await page.waitForTimeout(500);

  // Press and hold the 'D' key to run right
  await page.keyboard.down('d');

  // Wait a bit to get up to speed
  await page.waitForTimeout(1000);

  // Take a screenshot while moving
  await page.screenshot({ path: '/app/running_screenshot.png' });

  await page.keyboard.up('d');

  await browser.close();
  console.log("Screenshot taken at /app/running_screenshot.png");
})();
