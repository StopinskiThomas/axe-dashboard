let historyChart = null;

function renderHistoryChart(chartData) {
    const ctx = document.getElementById('history-chart').getContext('2d');

    if (historyChart) {
        historyChart.destroy();
    }

    historyChart = new Chart(ctx, {
        type: 'line',
        data: chartData, // Expects { labels: [], datasets: [] }
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        // Ensure only integers are shown on the y-axis
                        stepSize: 1
                    }
                }
            },
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}
