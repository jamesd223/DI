// wwwroot/sensors-core.js
// Camera + PoseNet only. Emits normalized values via callback.

window.sensorCore = (function () {
  let state = null; // { net, handler, stream, video, last }

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
      const px = Math.abs(re.x - le.x);
      const norm = px / video.videoWidth;
      state && (state.last = { px, norm, width: video.videoWidth });
      if (onMeasure) onMeasure({ px, norm, width: video.videoWidth });
      if (onValue) onValue(clamp01(norm));
    };

    net.on("pose", handler);
    state = { net, handler, stream, video, last: null };
  }

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

  function getLastMeasurement() {
    return state?.last || null;
  }

  return { start, stop, getLastMeasurement, _getState: () => state };
})();
