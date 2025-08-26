// wwwroot/sensors.js
// Thin orchestrator: uses sensorCore and proximityUI, bridges to Blazor.

window.sensorInterop = (function () {
  let state = null; // { lastSent, px0, D0, scale, gamma, threshold }

  function throttleInterop(dotnetObj, value) {
    const now = performance.now();
    if (!state?.lastSent || now - state.lastSent > 150) {
      state && (state.lastSent = now);
      dotnetObj.invokeMethodAsync("OnReading", value);
    }
  }

  async function start(dotnetObj, selector) {
    stop();

    // init UI first (chart only)
    if (window.proximityUI) {
      await window.proximityUI.init({
        canvasId: "proximity-chart",
      });
    }

    // start sensing core, route value to UI and Blazor
    await window.sensorCore.start({
      selector,
      onValue: (v) => {
        window.proximityUI && window.proximityUI.updateNorm(v);
        throttleInterop(dotnetObj, v);
      },
      onMeasure: (m) => {
        // if calibrated, compute distance ≈ (px0 * D0) / px
        if (state?.px0 && state?.D0 && m?.px > 0) {
          const base = (state.px0 * state.D0) / m.px;
          const gamma = state?.gamma ?? 1;
          const scale = state?.scale ?? 1;
          const distance = scale * Math.pow(base, gamma);
          try {
            dotnetObj.invokeMethodAsync("OnCalibratedDistanceIn", distance);
          } catch {}
          try {
            window.proximityUI && window.proximityUI.updateDistance(distance);
          } catch {}
          const threshold = state?.threshold;
          if (typeof threshold === "number") {
            const v = m.px / m.width;
            if (v >= threshold) {
              try {
                dotnetObj.invokeMethodAsync("OnThreshold", v);
              } catch {}
            }
          }
        }
      },
    });

    state = {
      lastSent: 0,
      px0: null,
      D0: null,
      scale: 1,
      gamma: 1,
      threshold: null,
    };
  }

  function stop() {
    try {
      window.sensorCore && window.sensorCore.stop();
    } catch {}
    try {
      window.proximityUI && window.proximityUI.destroy();
    } catch {}
    state = null;
  }

  // expose a way to set calibration from the app (px0 at known D0)
  function setCalibration(px0, D0cm) {
    if (!state) state = { lastSent: 0, px0: null, D0: null };
    state.px0 = px0;
    state.D0 = D0cm;
  }

  function calibrateNow(D0cm) {
    const last =
      window.sensorCore &&
      window.sensorCore.getLastMeasurement &&
      window.sensorCore.getLastMeasurement();
    if (!last || !last.px || last.px <= 0) return false;
    setCalibration(last.px, D0cm);
    return true;
  }

  function refineScaleNow(D1cm) {
    const last =
      window.sensorCore &&
      window.sensorCore.getLastMeasurement &&
      window.sensorCore.getLastMeasurement();
    if (!last || !last.px || last.px <= 0) return false;
    if (!state?.px0 || !state?.D0) return false;
    const base = (state.px0 * state.D0) / last.px;
    const gamma = state?.gamma ?? 1;
    if (base <= 0) return false;
    state.scale = D1cm / Math.pow(base, gamma);
    return true;
  }

  function setScale(scale) {
    if (!state) return;
    state.scale = Number(scale) || 1;
  }

  function setGamma(gamma) {
    if (!state) return;
    const g = Number(gamma);
    if (!isFinite(g) || g <= 0) return;
    state.gamma = g;
  }

  function setThreshold(threshold) {
    if (!state) return;
    const t = Number(threshold);
    if (!isFinite(t) || t < 0 || t > 1) {
      state.threshold = null;
      return;
    }
    state.threshold = t;
  }

  return {
    start,
    stop,
    setCalibration,
    calibrateNow,
    refineScaleNow,
    setScale,
    setGamma,
    setThreshold,
  };
})();
