// wwwroot/sensors-core.js
// Camera + PoseNet only. Emits normalized values via callback.
/**
 * Module: sensorCore
 * Responsibilities:
 * - Lazily load TensorFlow.js and ml5 PoseNet
 * - Open the user's webcam and listen for pose events
 * - Emit a normalized proximity value in [0,1] via onValue
 * - Emit raw measurement ({ px, norm, width }) via onMeasure
 *
 * Public API
 * - start({ selector, onValue, onMeasure }): Promise<void>
 * - stop(): void
 * - getLastMeasurement(): { px:number, norm:number, width:number } | null
 */

window.sensorCore = (function () {
  let state = null; // { net, handler, stream, video, last }

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

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Start camera + PoseNet and begin emitting measurements.
   * @param {{ selector?: string, onValue?: (v:number)=>void, onMeasure?: (m:{ px:number, norm:number, width:number })=>void }} options
   * @returns {Promise<void>}
   */
  async function start(options) {
    const opts = options || {};
    const selector = opts.selector;
    const onValue = typeof opts.onValue === "function" ? opts.onValue : null;
    const onMeasure =
      typeof opts.onMeasure === "function" ? opts.onMeasure : null;

    stop();

    // deps: tfjs first, then ml5 (classic 0.12.2 with poseNet)
    if (!window.tf)
      await loadScriptOnce(
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.7.4/dist/tf.min.js"
      );
    if (!window.ml5)
      await loadScriptOnce("https://unpkg.com/ml5@0.12.2/dist/ml5.min.js");

    const host = selector ? document.querySelector(selector) : document.body;
    if (!host)
      console.warn("sensorCore: host not found, using <body>", selector);

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.width = 320;
    video.height = 240;
    (host || document.body).appendChild(video);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();

    if (!window.ml5 || typeof window.ml5.poseNet !== "function") {
      console.error("sensorCore: ml5.poseNet is not available");
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {}
      try {
        video.remove();
      } catch {}
      return;
    }

    const net = ml5.poseNet(video, () =>
      console.log("sensorCore: posenet ready")
    );

    const handler = (results) => {
      if (!results || !results[0]) return;
      const p = results[0].pose;
      const le = p?.leftEye,
        re = p?.rightEye;
      if (!le || !re || !video.videoWidth) return;
      // Eye-to-eye pixel distance as a simple proxy for proximity
      const px = Math.abs(re.x - le.x);
      // Normalize to [0..1] relative to frame width
      const norm = px / video.videoWidth;
      state && (state.last = { px, norm, width: video.videoWidth });
      if (onMeasure) onMeasure({ px, norm, width: video.videoWidth });
      if (onValue) onValue(clamp01(norm));
    };

    net.on("pose", handler);
    state = { net, handler, stream, video, last: null };
  }

  /**
   * Stop pose stream, release camera, and clean up DOM.
   */
  function stop() {
    if (!state) return;
    try {
      if (state.net?.off) state.net.off("pose", state.handler);
      else if (state.net?.removeListener)
        state.net.removeListener("pose", state.handler);
    } catch {}
    try {
      state.stream?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    try {
      state.video?.remove();
    } catch {}
    state = null;
  }

  /**
   * Return the most recent measurement or null if none yet.
   * @returns {{ px:number, norm:number, width:number } | null}
   */
  function getLastMeasurement() {
    return state?.last || null;
  }

  return { start, stop, getLastMeasurement, _getState: () => state };
})();
