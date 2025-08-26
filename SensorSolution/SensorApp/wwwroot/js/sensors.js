// wwwroot/sensors.js
// Thin orchestrator: uses sensorCore and proximityUI, bridges to Blazor.
/**
 * Module: sensorInterop
 * Responsibilities:
 * - Initialize live chart (proximityUI) and capture (sensorCore)
 * - Bridge measurements to Blazor via DotNetObjectReference
 * - Provide calibration helpers (px0/D0, gamma, scale) and thresholding
 *
 * Public API
 * - start(dotnetObj, selector): Promise<void>
 * - stop(): void
 * - setCalibration(px0, D0in): void
 * - calibrateNow(D0in): boolean
 * - refineScaleNow(D1in): boolean
 * - setScale(scale): void
 * - setGamma(gamma): void
 * - setThreshold(threshold01): void
 */

window.sensorInterop = (function () {
  let state = null; // { lastSent, px0, D0, scale, gamma, threshold }

  /**
   * Throttle interop calls to avoid overwhelming the server.
   * @param {any} dotnetObj DotNetObjectReference from Blazor
   * @param {number} value Normalized [0..1] proximity value
   */
  function throttleInterop(dotnetObj, value) {
    const now = performance.now();
    if (!state?.lastSent || now - state.lastSent > 150) {
      state && (state.lastSent = now);
      dotnetObj.invokeMethodAsync("OnReading", value);
    }
  }

  /**
   * Start live chart + capture and wire callbacks.
   * @param {any} dotnetObj DotNetObjectReference from Blazor
   * @param {string} selector CSS selector for the camera host element
   */
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

  /**
   * Stop capture and dispose UI.
   */
  function stop() {
    try {
      window.sensorCore && window.sensorCore.stop();
    } catch {}
    try {
      window.proximityUI && window.proximityUI.destroy();
    } catch {}
    state = null;
  }

  // expose a way to set calibration from the app (px0 at known D0, in inches)
  function setCalibration(px0, D0in) {
    if (!state) state = { lastSent: 0, px0: null, D0: null };
    state.px0 = px0;
    state.D0 = D0in;
  }

  /**
   * Calibrate using the last measurement and a known distance D0.
   * @param {number} D0in inches
   * @returns {boolean} true if calibration was applied
   */
  function calibrateNow(D0in) {
    const last =
      window.sensorCore &&
      window.sensorCore.getLastMeasurement &&
      window.sensorCore.getLastMeasurement();
    if (!last || !last.px || last.px <= 0) return false;
    setCalibration(last.px, D0in);
    return true;
  }

  /**
   * Refine scale to hit a target distance D1 for the current frame.
   * @param {number} D1in inches
   * @returns {boolean}
   */
  function refineScaleNow(D1in) {
    const last =
      window.sensorCore &&
      window.sensorCore.getLastMeasurement &&
      window.sensorCore.getLastMeasurement();
    if (!last || !last.px || last.px <= 0) return false;
    if (!state?.px0 || !state?.D0) return false;
    const base = (state.px0 * state.D0) / last.px;
    const gamma = state?.gamma ?? 1;
    if (base <= 0) return false;
    state.scale = D1in / Math.pow(base, gamma);
    return true;
  }

  /**
   * Set multiplicative scale for distance.
   * @param {number} scale
   */
  function setScale(scale) {
    if (!state) return;
    state.scale = Number(scale) || 1;
  }

  /**
   * Set exponent for distance curve.
   * @param {number} gamma > 0
   */
  function setGamma(gamma) {
    if (!state) return;
    const g = Number(gamma);
    if (!isFinite(g) || g <= 0) return;
    state.gamma = g;
  }

  /**
   * Set normalized threshold in [0,1] for OnThreshold callback.
   * @param {number} threshold
   */
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
