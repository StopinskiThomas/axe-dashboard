function normalizeUrl(url) {
    if (!url) return '';

    let normalized = url.trim();

    // Add protocol if missing
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = 'https://' + normalized;
    }

    try {
        const urlObj = new URL(normalized);

        // Convert hostname to lowercase and remove www.
        urlObj.hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');

        // Remove trailing slash
        if (urlObj.pathname.endsWith('/')) {
            urlObj.pathname = urlObj.pathname.slice(0, -1);
        }

        // Sort query parameters
        if (urlObj.search) {
            const params = new URLSearchParams(urlObj.search);
            const sortedParams = new URLSearchParams();
            Array.from(params.keys()).sort().forEach(key => {
                sortedParams.append(key, params.get(key));
            });
            urlObj.search = sortedParams.toString();
        }

        // Fix common TLD typos
        const tldFixes = {
            'd': 'de',
            'comcom': 'com',
            'cmo': 'com',
            // Add more fixes as needed
        };
        const hostnameParts = urlObj.hostname.split('.');
        const tld = hostnameParts[hostnameParts.length - 1];
        if (tldFixes[tld]) {
            hostnameParts[hostnameParts.length - 1] = tldFixes[tld];
            urlObj.hostname = hostnameParts.join('.');
        }

        return urlObj.toString();

    } catch (error) {
        console.error('Invalid URL:', url, error);
        return url; // Return original URL if parsing fails
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeUrl };
} else {
    window.normalizeUrl = normalizeUrl;
}