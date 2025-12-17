const express = require('express');
const axios = require('axios');
const path = require('path');
const { parseStringPromise } = require('xml2js');
const cron = require('node-cron');
const { initDb, addResult, getAllResults, getResultById, addScheduledUrl, removeScheduledUrl, getAllScheduledUrls, updateScheduledUrlConfig, getSchedulerSettings, updateSchedulerSettings } = require('./database');
const { runScan } = require('./scanner');
const { runPa11yScan } = require('./pa11y-scanner');
const { normalizeUrl } = require('./url-util');
const fs = require('fs').promises;

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json({ limit: '50mb' }));

// Initialize the database
initDb();

// --- API Endpoints ---

// Get all test results (summary view)
app.get('/api/results', async (req, res) => {
    try {
        const results = await getAllResults();
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get the full JSON for a single result
app.get('/api/results/:id', async (req, res) => {
    try {
        const result = await getResultById(req.params.id);
        if (result) {
            res.json(result);
        } else {
            res.status(404).send('Result not found');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a result from a manual scan
app.post('/api/results', async (req, res) => {
    try {
        const result = req.body;
        result.url = normalizeUrl(result.url);
        await addResult(result);
        res.status(201).send('Result added');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


const sitemapJobs = {}; // In-memory store for job statuses

// --- Sitemap Scanning ---

app.post('/api/scan/sitemap', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Sitemap URL is required' });
    }

    const jobId = Date.now().toString();
    sitemapJobs[jobId] = { status: 'pending', total: 0, completed: 0, error: null, currentUrl: '' };

    res.status(202).json({ message: 'Sitemap scan initiated.', jobId });

    (async () => {
        try {
            const response = await axios.get(url);
            const sitemap = await parseStringPromise(response.data);
            const urlsToScan = sitemap.urlset.url.map(u => u.loc[0]);

            sitemapJobs[jobId].status = 'in-progress';
            sitemapJobs[jobId].total = urlsToScan.length;

            console.log(`Found ${urlsToScan.length} URLs in sitemap. Starting scan for job ${jobId}...`);

            for (const [index, scanUrl] of urlsToScan.entries()) {
                sitemapJobs[jobId].currentUrl = scanUrl;
                console.log(`Scanning ${scanUrl} (${index + 1}/${urlsToScan.length}) for job ${jobId}...`);
                
                const config = {}; // Use default config for now
                const result = await runScan(scanUrl, config);
                await addResult(result);

                sitemapJobs[jobId].completed = index + 1;
                console.log(`Finished scanning ${scanUrl} for job ${jobId}.`);
            }

            sitemapJobs[jobId].status = 'completed';
            console.log(`Sitemap scan completed for job ${jobId}.`);

        } catch (error) {
            console.error(`Error during sitemap scan for job ${jobId}:`, error);
            sitemapJobs[jobId].status = 'error';
            sitemapJobs[jobId].error = error.message;
        }
    })();
});

app.get('/api/scan/sitemap/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = sitemapJobs[jobId];

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);

    // Clean up old, completed jobs
    if (job.status === 'completed' || job.status === 'error') {
        setTimeout(() => {
            delete sitemapJobs[jobId];
        }, 60000); // Remove after 1 minute
    }
});

app.post('/api/scan/pa11y', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const results = await runPa11yScan(url);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Scheduled URL Management ---

app.get('/api/scheduled-urls', async (req, res) => {
    try {
        const urls = await getAllScheduledUrls();
        res.json(urls);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scheduled-urls', async (req, res) => {
    try {
        const { url, config } = req.body;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        const normalizedUrl = normalizeUrl(url);
        const newUrl = await addScheduledUrl(normalizedUrl, config);
        res.status(201).json(newUrl);
    } catch (error) {
        // Handle unique constraint error
        if (error.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'URL already exists.' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/scheduled-urls/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await removeScheduledUrl(id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'URL not found' });
        }
        res.status(204).send(); // No content
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scheduled-urls/:id/config', async (req, res) => {
    try {
        const { id } = req.params;
        const { config } = req.body;
        const result = await updateScheduledUrlConfig(id, config);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'URL not found' });
        }
        res.status(200).json({ message: 'Configuration updated successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Scheduler Settings ---

app.get('/api/scheduler-settings', async (req, res) => {
    try {
        const settings = await getSchedulerSettings();
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/scheduler-settings', async (req, res) => {
    try {
        const { enabled, cron } = req.body;
        // Basic validation
        if (typeof enabled !== 'boolean' || typeof cron !== 'string') {
            return res.status(400).json({ error: 'Invalid settings format.' });
        }

        await updateSchedulerSettings({ enabled, cron });
        res.status(200).json({ message: 'Scheduler settings updated successfully.' });
        
        // Restart the cron job with the new settings
        setupScheduledScans();

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- Axe-Core Configuration ---

const AXE_CONFIG_PATH = path.join(__dirname, 'axe-config.json');

app.get('/api/axe-config', async (req, res) => {
    try {
        const config = await fs.readFile(AXE_CONFIG_PATH, 'utf-8');
        res.json(JSON.parse(config));
    } catch (error) {
        if (error.code === 'ENOENT') {
            // If file doesn't exist, return a default empty config
            return res.json({});
        }
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/axe-config', async (req, res) => {
    try {
        const newConfig = req.body;
        // Validate that it's a valid JSON object
        if (typeof newConfig !== 'object' || newConfig === null) {
            return res.status(400).json({ error: 'Invalid JSON configuration.' });
        }
        await fs.writeFile(AXE_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
        res.status(200).json({ message: 'Configuration saved successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// --- Proxy for Manual Scans ---

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('URL is required');
    }

    try {
        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer', // Fetch as buffer to handle different charsets
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const contentType = response.headers['content-type'] || '';
        // If it's HTML, process it. Otherwise, just pipe it through.
        if (contentType.includes('text/html')) {
            let html = response.data.toString(); // Convert buffer to string

            // Function to resolve a relative URL to an absolute one
            const resolveUrl = (relativeUrl) => {
                try {
                    return new URL(relativeUrl, targetUrl).href;
                } catch (e) {
                    return relativeUrl; // Return original if it's a malformed URL
                }
            };

            // Replace attributes in common tags
            html = html.replace(/(<\s*(?:a|link|img|script|source|iframe)[^>]+(?:href|src)\s*=\s*['"])(?!https?|data:|#)([^'"`>]+)(['`"])/gi, 
                (match, p1, p2, p3) => {
                    return p1 + resolveUrl(p2) + p3;
                }
            );

            // Also handle srcset for images
            html = html.replace(/(srcset\s*=\s*['"])([^"]+)(['"])/gi, (match, p1, p2, p3) => {
                const newSrcset = p2.split(',').map(part => {
                    const [url, descriptor] = part.trim().split(/\s+/);
                    return resolveUrl(url) + (descriptor ? ` ${descriptor}` : '');
                }).join(', ');
                return p1 + newSrcset + p3;
            });

            // Inject a base tag as a fallback
            const baseTag = `<base href="${targetUrl}" />`;
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${baseTag}`);
            } else {
                html = baseTag + html;
            }

            res.send(html);
        } else {
            // For non-HTML content, just send the raw buffer with the correct content type
            res.setHeader('Content-Type', contentType);
            res.send(response.data);
        }

    } catch (error) {
        console.error('Error fetching the URL:', error.message);
        res.status(500).send('Failed to fetch the URL. It might be down or blocking requests.');
    }
});

// --- Scheduled Scans ---

let scheduledTask;

const setupScheduledScans = async () => {
    if (scheduledTask) {
        scheduledTask.stop();
    }

    try {
        const settings = await getSchedulerSettings();

        if (settings && settings.enabled) {
            if (cron.validate(settings.cron)) {
                scheduledTask = cron.schedule(settings.cron, async () => {
                    console.log('Running scheduled accessibility scans...');
                    try {
                        const urlsToScan = await getAllScheduledUrls();
                        if (urlsToScan.length === 0) {
                            console.log('No URLs scheduled for scanning.');
                            return;
                        }

                        for (const item of urlsToScan) {
                            console.log(`Scanning ${item.url}...`);
                            const result = await runScan(item.url, item.config);
                            await addResult(result);
                            console.log(`Finished scanning ${item.url}.`);
                        }
                    } catch (error) {
                        console.error('Error during scheduled scan:', error);
                    }
                });
                console.log(`Scheduled scans will run based on the cron expression: ${settings.cron}`);
            } else {
                console.error('Invalid cron expression in settings. Scheduled scans will not run.');
            }
        } else {
            console.log('Scheduled scans are disabled.');
        }
    } catch (error) {
        console.error('Error fetching scheduler settings:', error);
    }
};


// --- Static File Serving ---

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '')));

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    setupScheduledScans();
});
