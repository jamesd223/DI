/**
 * Module: historyChart
 * Responsibilities:
 * - Render an immutable line chart for an array of values (session history)
 * - Recreate chart when new data arrives
 *
 * Public API
 * - render(values:number[]): Promise<void>
 */
window.historyChart = (function () {
  let chart = null;
  /**
   * Idempotently load a script tag by src.
   * @param {string} src
   * @returns {Promise<void>}
   */
  function loadScriptOnce(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }
  /**
   * Render values on the #history-chart canvas, replacing any existing chart.
   * @param {number[]} values
   */
  async function render(values) {
    if (!window.Chart) {
      await loadScriptOnce(
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"
      );
    }
    const canvas = document.getElementById("history-chart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (chart) {
      chart.destroy();
    }
    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: Array(values?.length || 0).fill(""),
        datasets: [
          {
            label: "Value",
            data: values || [],
            borderColor: "#1b6ec2",
            backgroundColor: "rgba(27,110,194,0.1)",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: { x: { display: false } },
        plugins: { legend: { display: false } },
      },
    });
  }
  return { render };
})();
