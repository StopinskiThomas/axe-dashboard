document.addEventListener('DOMContentLoaded', async () => {
    let allHistoryResults = []; // Define at a higher scope

    const navDashboard = document.getElementById('nav-dashboard');
    const navHistory = document.getElementById('nav-history');
    const navConfig = document.getElementById('nav-config');
    const dashboardView = document.getElementById('dashboard-view');
    const historyView = document.getElementById('history-view');
    const resultsView = document.getElementById('results-view');
    const configView = document.getElementById('config-view');
    const axeForm = document.getElementById('axe-form');
    const historyList = document.getElementById('history-list');
    const historyUrlFilter = document.getElementById('history-url-filter');
    const historyTimeFilter = document.getElementById('history-time-filter');
    const toggleViolations = document.getElementById('toggle-violations');
    const togglePasses = document.getElementById('toggle-passes');
    const toggleIncomplete = document.getElementById('toggle-incomplete');
    const announcer = document.getElementById('announcer');

    await loadHistory();

    function announce(message) {
        announcer.textContent = message;
        setTimeout(() => {
            announcer.textContent = '';
        }, 3000);
    }

    function showView(view) {
        // Hide all views
        dashboardView.style.display = 'none';
        historyView.style.display = 'none';
        resultsView.style.display = 'none';
        configView.style.display = 'none';

        // De-select all tabs
        navDashboard.classList.remove('active');
        navHistory.classList.remove('active');
        navConfig.classList.remove('active');
        navDashboard.setAttribute('aria-selected', 'false');
        navHistory.setAttribute('aria-selected', 'false');
        navConfig.setAttribute('aria-selected', 'false');

        // Show the selected view
        view.style.display = 'block';

        // Select the correct tab
        let activeTab;
        if (view === dashboardView) activeTab = navDashboard;
        if (view === historyView) activeTab = navHistory;
        if (view === configView) activeTab = navConfig;

        if (activeTab) {
            activeTab.classList.add('active');
            activeTab.setAttribute('aria-selected', 'true');
            // Move focus to the main heading of the view
            const heading = view.querySelector('h1, h2');
            if (heading) {
                heading.setAttribute('tabindex', -1);
                heading.focus();
            }
        }
    }

    navDashboard.addEventListener('click', (e) => {
        e.preventDefault();
        showView(dashboardView);
    });

    navHistory.addEventListener('click', (e) => {
        e.preventDefault();
        showView(historyView);
    });

    axeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('url').value;
        runManualTest(url);
    });

    let manualAxeConfig = {}; // To hold config for manual scans

    const manualConfigModal = document.getElementById('manual-config-modal');
    const saveManualConfigBtn = document.getElementById('save-manual-config');

    manualConfigModal.addEventListener('show.bs.modal', () => {
        loadAxeConfig(manualAxeConfig, 'manual-');
    });

    saveManualConfigBtn.addEventListener('click', () => {
        manualAxeConfig = getAxeConfigFromForm('manual-');
        const modal = bootstrap.Modal.getInstance(manualConfigModal);
        modal.hide();
        announce('Manual scan configuration saved for this session.');
    });

    function getAxeConfigFromForm(prefix = '') {
        const newConfig = {};

        // Handle Run Only
        const tags = Array.from(document.querySelectorAll(`[id^=${prefix}tag-]:checked`)).map(cb => cb.value);
        const rulesToRun = document.getElementById(`${prefix}rules-to-run`).value.split(',').map(s => s.trim()).filter(Boolean);

        if (rulesToRun.length > 0) {
            newConfig.runOnly = { type: 'rule', values: rulesToRun };
        } else if (tags.length > 0) {
            newConfig.runOnly = { type: 'tag', values: tags };
        }

        // Handle Rules
        const rules = {};
        const ruleCheckboxes = document.querySelectorAll(`[id^=${prefix}rule-]`);
        ruleCheckboxes.forEach(checkbox => {
            rules[checkbox.value] = { enabled: checkbox.checked };
        });
        newConfig.rules = rules;

        // Handle Result Types
        const resultTypes = Array.from(document.querySelectorAll(`[id^=${prefix}result-]:checked`)).map(cb => cb.value);
        if (resultTypes.length > 0) {
            newConfig.resultTypes = resultTypes;
        }

        // Handle Other Options
        newConfig.iframes = document.getElementById(`${prefix}option-iframes`).checked;

        return newConfig;
    }

    function runManualTest(url) {
        const container = document.getElementById('test-frame-container');
        container.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
        const iframe = document.createElement('iframe');
        
        const encodedUrl = encodeURIComponent(url);
        // Use fetch and srcdoc to avoid security issues
        fetch(`/proxy?url=${encodedUrl}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Proxy request failed with status ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                container.innerHTML = ''; // Clear spinner
                iframe.srcdoc = html;
                container.appendChild(iframe);
            })
            .catch(err => {
                console.error('Proxy fetch error:', err);
                alert('Failed to load the page for testing. ' + err.message);
                container.innerHTML = '';
            });

        iframe.onload = () => {
            try {
                if (!iframe.contentDocument) {
                    throw new Error("Cannot access iframe content. The target website may have security policies (like X-Frame-Options) that prevent it from being loaded in an iframe.");
                }

                const axeScript = document.createElement('script');
                axeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.4.1/axe.min.js';
                
                axeScript.onload = async () => {
                    try {
                        const results = await iframe.contentWindow.axe.run(manualAxeConfig);
                        results.url = url; // Manually set the correct URL
                        // Save result to backend
                        await fetch('/api/results', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(results)
                        });
                        renderResults(results);
                        showView(resultsView);
                        announce('Test complete. Results are now displayed.');
                    } catch (err) {
                        console.error('Axe run error', err);
                        alert('An error occurred while running the Axe test: ' + err.message);
                    }
                };

                axeScript.onerror = () => {
                    throw new Error("Failed to load the axe-core script into the iframe.");
                };

                iframe.contentDocument.head.appendChild(axeScript);

            } catch (err) {
                console.error("Error loading page in iframe:", err);
                alert("Could not test the page. " + err.message);
                container.innerHTML = ''; // Clear the failed iframe
            }
        };
    }

    function renderResults(results) {
        const summary = document.getElementById('results-summary');
        summary.innerHTML = `
            <p>URL: ${results.url}</p>
            <p>Timestamp: ${new Date(results.timestamp).toLocaleString()}</p>
            <span class="badge bg-danger me-2">Violations: ${results.violations.length}</span>
            <span class="badge bg-success me-2">Passes: ${results.passes.length}</span>
            <span class="badge bg-warning me-2">Incomplete: ${results.incomplete.length}</span>
        `;

        const details = document.getElementById('results-details');
        details.innerHTML = '';

        if (results.violations.length > 0) {
            details.innerHTML += '<h2>Violations</h2>';
            results.violations.forEach((violation, index) => {
                details.innerHTML += createAccordionItem('violation', index, violation);
            });
        }

        if (results.passes.length > 0) {
            details.innerHTML += '<h2 class="mt-4">Passes</h2>';
            results.passes.forEach((pass, index) => {
                details.innerHTML += createAccordionItem('pass', index, pass);
            });
        }

        if (results.incomplete.length > 0) {
            details.innerHTML += '<h2 class="mt-4">Incomplete</h2>';
            results.incomplete.forEach((item, index) => {
                details.innerHTML += createAccordionItem('incomplete', index, item);
            });
        }
    }

    function createAccordionItem(type, index, item) {
        const itemType = type + '-' + index;
        let impactHtml = '';
        if (item.impact) {
            impactHtml = `<p><strong>Impact:</strong> ${item.impact}</p>`;
        }

        return `
            <div class="accordion-item">
                <h3 class="accordion-header" id="heading-${itemType}">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${itemType}" aria-expanded="false" aria-controls="collapse-${itemType}">
                        ${item.help}
                    </button>
                </h3>
                <div id="collapse-${itemType}" class="accordion-collapse collapse" aria-labelledby="heading-${itemType}">
                    <div class="accordion-body">
                        <p><strong>Description:</strong> ${item.description}</p>
                        <p><strong>Help URL:</strong> <a href="${item.helpUrl}" target="_blank">${item.helpUrl}</a></p>
                        ${impactHtml}
                        <p><strong>Tags:</strong> ${item.tags.join(', ')}</p>
                        <p><strong>Nodes:</strong></p>
                        <ul>
                            ${item.nodes.map(node => `<li><code>${node.html}</code></li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }

    async function loadHistory() {
        try {
            const response = await fetch('/api/results');
            allHistoryResults = await response.json();
            
            populateUrlFilter(allHistoryResults);
            updateHistoryChart(); // Initial chart and list render

            // Add event listeners for filters
            historyUrlFilter.addEventListener('change', updateHistoryChart);
            historyTimeFilter.addEventListener('change', updateHistoryChart);
            toggleViolations.addEventListener('change', updateHistoryChart);
            togglePasses.addEventListener('change', updateHistoryChart);
            toggleIncomplete.addEventListener('change', updateHistoryChart);

            announce('History loaded.');

        } catch (error) {
            console.error('Failed to load history:', error);
            document.getElementById('history-list').innerHTML = '<p class="text-danger">Could not load history data.</p>';
        }
    }

    function populateHistoryList(results) {
        historyList.innerHTML = '';
        if (results.length === 0) {
            historyList.innerHTML = '<p>No test history found.</p>';
            return;
        }

        results.forEach(result => {
            const card = document.createElement('div');
            card.className = 'card mb-3';
            card.innerHTML = `
                <div class="card-body">
                    <h5 class="card-title">${result.url}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">${new Date(result.timestamp).toLocaleString()}</h6>
                    <span class="badge bg-danger me-2">Violations: ${result.violations}</span>
                    <span class="badge bg-success me-2">Passes: ${result.passes}</span>
                    <span class="badge bg-warning me-2">Incomplete: ${result.incomplete}</span>
                    <button class="btn btn-sm btn-primary float-end view-result-btn" data-id="${result.id}">View Details</button>
                </div>
            `;
            card.querySelector('.view-result-btn').addEventListener('click', async (e) => {
                const resultId = e.target.getAttribute('data-id');
                const res = await fetch(`/api/results/${resultId}`);
                const fullResult = await res.json();
                renderResults(fullResult);
                showView(resultsView);
            });
            historyList.appendChild(card);
        });
    }

    function populateUrlFilter(results) {
        const uniqueUrls = [...new Set(results.map(r => r.url))];
        historyUrlFilter.innerHTML = '<option value="all">All URLs</option>';
        uniqueUrls.forEach(url => {
            const option = document.createElement('option');
            option.value = url;
            option.textContent = url;
            historyUrlFilter.appendChild(option);
        });
    }

    function updateHistoryChart() {
        const selectedUrl = historyUrlFilter.value;
        const selectedTime = historyTimeFilter.value;
        const showViolations = toggleViolations.checked;
        const showPasses = togglePasses.checked;
        const showIncomplete = toggleIncomplete.checked;

        let filteredResults = allHistoryResults;

        // Filter by URL
        if (selectedUrl !== 'all') {
            filteredResults = filteredResults.filter(r => r.url === selectedUrl);
        }

        // Filter by time
        if (selectedTime !== 'all') {
            const now = new Date();
            let timeAgo = new Date();

            if (selectedTime.endsWith('h')) {
                timeAgo.setHours(now.getHours() - parseInt(selectedTime));
            } else if (selectedTime.endsWith('d')) {
                timeAgo.setDate(now.getDate() - parseInt(selectedTime));
            } else if (selectedTime.endsWith('w')) {
                timeAgo.setDate(now.getDate() - (parseInt(selectedTime) * 7));
            } else if (selectedTime.endsWith('m')) {
                timeAgo.setMonth(now.getMonth() - parseInt(selectedTime));
            } else if (selectedTime.endsWith('y')) {
                timeAgo.setFullYear(now.getFullYear() - parseInt(selectedTime));
            }
            filteredResults = filteredResults.filter(r => new Date(r.timestamp) >= timeAgo);
        }

        // Sort by timestamp ascending for correct chart progression
        filteredResults.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const labels = filteredResults.map(r => new Date(r.timestamp).toLocaleString());
        const datasets = [];

        if (showViolations) {
            datasets.push({
                label: 'Violations',
                data: filteredResults.map(r => r.violations),
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderWidth: 2,
                tension: 0.1
            });
        }

        if (showPasses) {
            datasets.push({
                label: 'Passes',
                data: filteredResults.map(r => r.passes),
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2,
                tension: 0.1
            });
        }

        if (showIncomplete) {
            // Need to fetch full results to get incomplete count, as it's not in the summary
            // This is a limitation of the current summary data. For now, we will use a placeholder.
            // A proper fix would involve adding 'incomplete' to the summary data from the backend.
            datasets.push({
                label: 'Incomplete',
                data: filteredResults.map(r => r.incomplete || 0), // Assuming incomplete might not be in summary
                borderColor: 'rgba(255, 206, 86, 1)',
                backgroundColor: 'rgba(255, 206, 86, 0.2)',
                borderWidth: 2,
                tension: 0.1
            });
        }
        
        populateHistoryList(filteredResults);
        renderHistoryChart({ labels, datasets });
    }

    // --- Config View Logic ---
    const configForm = document.getElementById('config-form');
    const newScheduledUrlInput = document.getElementById('new-scheduled-url');
    const scheduledUrlsList = document.getElementById('scheduled-urls-list');
    const axeConfigFormGui = document.getElementById('axe-config-form-gui');

    const scheduledUrlSelect = document.getElementById('scheduled-url-select');

    navConfig.addEventListener('click', async (e) => {
        e.preventDefault();
        showView(configView);
        try {
            await loadScheduledUrls();
            await loadAxeConfig(); // Load default config initially
        } catch (error) {
            console.error("Error loading configuration data:", error);
            alert("Could not load configuration data. Please check the console for errors.");
        }
    });

    async function loadScheduledUrls() {
        const response = await fetch('/api/scheduled-urls');
        if (!response.ok) {
            const errorInfo = await response.json().catch(() => ({ error: 'Invalid JSON response from server' }));
            throw new Error(`Failed to load scheduled URLs: ${errorInfo.error || response.statusText}`);
        }
        const urls = await response.json();
        scheduledUrlsList.innerHTML = '';
        scheduledUrlSelect.innerHTML = '<option value="">Select a URL to configure</option>';

        if (urls.length === 0) {
            scheduledUrlsList.innerHTML = '<p>No URLs scheduled for automated testing.</p>';
            return;
        }

        if (Array.isArray(urls)) {
            urls.forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = item.url;
                option.dataset.config = JSON.stringify(item.config || {});
                scheduledUrlSelect.appendChild(option);
            });

            const list = document.createElement('ul');
            list.className = 'list-group';

            urls.forEach(item => {
                const listItem = document.createElement('li');
                listItem.className = 'list-group-item d-flex justify-content-between align-items-center';
                listItem.textContent = item.url;
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger btn-sm';
                deleteBtn.textContent = 'Delete';
                deleteBtn.addEventListener('click', async () => {
                    await deleteScheduledUrl(item.id);
                });

                listItem.appendChild(deleteBtn);
                list.appendChild(listItem);
            });

            scheduledUrlsList.appendChild(list);
        }
    }

    scheduledUrlSelect.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        const config = JSON.parse(selectedOption.dataset.config || '{}');
        loadAxeConfig(config);
    });

    configForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = newScheduledUrlInput.value;
        if (!url) return;

        await fetch('/api/scheduled-urls', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        newScheduledUrlInput.value = '';
        await loadScheduledUrls();
    });

    async function deleteScheduledUrl(id) {
        await fetch(`/api/scheduled-urls/${id}`, {
            method: 'DELETE'
        });
        await loadScheduledUrls();
    }

    async function loadAxeConfig(config = null, prefix = '') {
        // if no config is passed, fetch the default
        if (!config) {
            try {
                const response = await fetch('/api/axe-config');
                if (!response.ok) {
                    throw new Error('Failed to load Axe configuration.');
                }
                config = await response.json();
            } catch (error) {
                console.error('Error loading default Axe config:', error);
                config = {}; // Default to empty config on error
            }
        }

        // Clear all checkboxes before populating
        document.querySelectorAll(`[id^=${prefix}tag-], [id^=${prefix}rule-], [id^=${prefix}result-], [id^=${prefix}option-]`).forEach(cb => cb.checked = false);
        document.getElementById(`${prefix}rules-to-run`).value = '';

        // Default to all checked if no config
        if (Object.keys(config).length === 0) {
            document.querySelectorAll(`[id^=${prefix}tag-], [id^=${prefix}rule-], [id^=${prefix}result-], [id^=${prefix}option-]`).forEach(cb => cb.checked = true);
            return;
        }

        // Populate Run Only
        if (config.runOnly && config.runOnly.type === 'tag') {
            config.runOnly.values.forEach(tag => {
                const checkbox = document.getElementById(`${prefix}tag-${tag}`);
                if (checkbox) checkbox.checked = true;
            });
        }
        if (config.runOnly && config.runOnly.type === 'rule') {
            document.getElementById(`${prefix}rules-to-run`).value = config.runOnly.values.join(',');
        }

        // Populate Rules
        if (config.rules) {
            for (const ruleId in config.rules) {
                const checkbox = document.getElementById(`${prefix}rule-${ruleId}`);
                if (checkbox) checkbox.checked = config.rules[ruleId].enabled;
            }
        }

        // Populate Result Types
        if (config.resultTypes) {
            config.resultTypes.forEach(type => {
                const checkbox = document.getElementById(`${prefix}result-${type}`);
                if (checkbox) checkbox.checked = true;
            });
        }

        // Populate Other Options
        if (config.iframes !== undefined) {
            document.getElementById(`${prefix}option-iframes`).checked = config.iframes;
        }
    }

    axeConfigFormGui.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newConfig = getAxeConfigFromForm();

        const selectedUrlId = scheduledUrlSelect.value;

        if (selectedUrlId) {
            // Save to specific URL
            try {
                const response = await fetch(`/api/scheduled-urls/${selectedUrlId}/config`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ config: newConfig })
                });
                if (!response.ok) {
                    throw new Error('Failed to save the configuration.');
                }
                announce('Configuration saved successfully for the selected URL!');
                // Update the config in the dropdown
                const selectedOption = scheduledUrlSelect.options[scheduledUrlSelect.selectedIndex];
                selectedOption.dataset.config = JSON.stringify(newConfig);
            } catch (error) {
                console.error('Error saving Axe config:', error);
                alert('Error saving Axe configuration. See console for details.');
            }
        } else {
            // Save as default config
            try {
                const response = await fetch('/api/axe-config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(newConfig)
                });
                if (!response.ok) {
                    throw new Error('Failed to save the configuration.');
                }
                announce('Default Axe configuration saved successfully!');
            } catch (error) {
                console.error('Error saving Axe config:', error);
                alert('Error saving Axe configuration. See console for details.');
            }
        }
    });

    showView(dashboardView);
});