const pa11y = require('pa11y');

async function runPa11yScan(url) {
    try {
        const results = await pa11y(url);
        return results;
    } catch (error) {
        throw error;
    }
}

module.exports = { runPa11yScan };
