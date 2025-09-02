# Axe Accessibility Dashboard

A simple, self-hosted web dashboard to run, store, and visualize accessibility scans using `axe-core`.

## Features

*   **Manual Scans:** Run on-demand accessibility tests against any URL.
*   **Detailed Results:** View detailed results from scans, including violations, passes, and incomplete items.
*   **Historical Data:** All scan results are saved, allowing you to track accessibility improvements over time.
*   **Visualization:** A chart visualizes the history of scan results for easy trend analysis.
*   **Scheduled Scans:** Schedule URLs to be scanned automatically every day.
*   **Configurable:** Customize the `axe-core` configuration for both manual and scheduled scans.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/StopinskiThomas/axe-dashboard.git
    cd axe-dashboard
    ```

2.  **Install dependencies:**
    Make sure you have [Node.js](https://nodejs.org/) installed. Then, run the following command in the project directory:
    ```bash
    npm install
    ```

## How to Run

1.  **Start the server:**
    ```bash
    node server.js
    ```

2.  **Open the dashboard:**
    Open your web browser and navigate to `http://localhost:3000`.

## How to Use

*   **Dashboard Tab:** Enter a URL and click "Run Test" to perform a manual scan.
*   **History Tab:** View a list and a chart of all previous scan results. You can filter the results by URL and time period.
*   **Configuration Tab:**
    *   Add URLs to be scanned automatically every day at 2 AM.
    *   Define the default `axe-core` configuration or a specific configuration for a scheduled URL.
