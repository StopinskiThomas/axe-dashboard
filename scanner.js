const puppeteer = require('puppeteer');
const { AxePuppeteer } = require('@axe-core/puppeteer');
const fs = require('fs').promises;
const path = require('path');

const AXE_CONFIG_PATH = path.join(__dirname, 'axe-config.json');

async function runScan(url, config) {
    let browser = null;
    try {
        // Use the provided config or default to an empty object
        const axeConfig = config || {};

        browser = await puppeteer.launch({
            headless: true, // Run in the background
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for some environments
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });

        const results = await new AxePuppeteer(page).withOptions(axeConfig).analyze();
        
        await browser.close();
        return results;

    } catch (error) {
        console.error(`Error scanning ${url}:`, error);
        if (browser) {
            await browser.close();
        }
        // Return a consistent error structure
        return {
            url: url,
            timestamp: new Date().toISOString(),
            violations: [{ help: 'Scan Error', description: error.message, nodes: [] }],
            passes: [],
            incomplete: []
        };
    }
}

module.exports = { runScan };
