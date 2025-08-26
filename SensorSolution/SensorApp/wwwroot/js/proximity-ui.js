// wwwroot/proximity-ui.js
// Chart-only UI for proximity values.

window.proximityUI = (function () {
  let state = null; // { chart, lastUi, mode: 'norm'|'distance' }

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

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  async function init(options) {
    const opts = options || {};
    const canvasId = opts.canvasId || "proximity-chart";

    // ensure Chart.js (UMD) is present
    if (!window.Chart)
      await loadScriptOnce(
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"
      );

    const canvas = document.getElementById(canvasId) || null;
    let chart = null;
    if (canvas && window.Chart) {
      const ctx = canvas.getContext("2d");
      chart = new Chart(ctx, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Proximity (0–1)",
              data: [],
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
          scales: {
            x: { display: false },
            y: { suggestedMin: 0, suggestedMax: 1, ticks: { stepSize: 0.25 } },
          },
          plugins: { legend: { display: false } },
        },
      });
    }

    state = { chart, lastUi: 0, mode: "norm" };
  }

  function updateNorm(value) {
    if (!state) return;
    const v = clamp01(value);

    const now = performance.now();
    if (state.lastUi && now - state.lastUi <= 100) return;
    state.lastUi = now;

    // chart
    if (state.chart) {
      const ds = state.chart.data.datasets[0].data;
      const labels = state.chart.data.labels;
      ds.push(v);
      labels.push("");
      if (ds.length > 120) {
        ds.shift();
        labels.shift();
      }
      state.chart.update("none");
    }
  }

  function updateDistance(distanceCm) {
    if (!state) return;
    const now = performance.now();
    if (state.lastUi && now - state.lastUi <= 100) return;
    state.lastUi = now;

    if (state.chart) {
      if (state.mode !== "distance") {
        state.mode = "distance";
        try {
          state.chart.data.datasets[0].label = "Distance (cm)";
          state.chart.options.scales.y.suggestedMin = 0;
          state.chart.options.scales.y.suggestedMax = undefined;
          state.chart.update();
        } catch {}
      }
      const ds = state.chart.data.datasets[0].data;
      const labels = state.chart.data.labels;
      ds.push(distanceCm);
      labels.push("");
      if (ds.length > 120) {
        ds.shift();
        labels.shift();
      }
      state.chart.update("none");
    }
  }

  function destroy() {
    try {
      if (state?.chart) state.chart.destroy();
    } catch {}
    state = null;
  }

  return {
    init,
    update: updateNorm,
    updateNorm,
    updateDistance,
    destroy,
    _getState: () => state,
  };
})();
