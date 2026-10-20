(() => {
  const mat = (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
  class RigidT {
    constructor(x = 0, y = 0, z = 0) {
      this.position = { x, y, z, w: 1 }; this.orientation = { x: 0, y: 0, z: 0, w: 1 }; this.matrix = mat(x, y, z);
      this.inverse = { matrix: mat(-x, -y, -z), position: { x: -x, y: -y, z: -z, w: 1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } };
    }
  }
  const cfg = window.__XR_MOCK_CONFIG__ || {};
  const X = (window.__xr = { hit: null, cam: { x: 0, y: 1.4, z: 0 }, tracking: true, anchors: [], sessions: 0, ended: 0, deleted: 0, cancelled: 0, reject: null });
  window.__ARSPACE_TEST_HOOKS__ = {};
  class XRWebGLLayerMock {
    constructor(s, gl) { this.framebuffer = null; this.framebufferWidth = gl.drawingBufferWidth; this.framebufferHeight = gl.drawingBufferHeight; this.antialias = false; this.ignoreDepthValues = false; this.fixedFoveation = 0; }
    getViewport() { return { x: 0, y: 0, width: this.framebufferWidth, height: this.framebufferHeight }; }
  }
  window.XRWebGLLayer = XRWebGLLayerMock;
  window.XRFrame = class {};
  if (!cfg.noAnchors) window.XRFrame.prototype.createAnchor = function () {};
  class Session extends EventTarget {
    constructor(opts) {
      super();
      this.renderState = { baseLayer: null };
      this.enabledFeatures = ['hit-test', 'local', 'viewer', 'local-floor'].concat(cfg.noAnchors ? [] : ['anchors']).concat(cfg.noOverlay ? [] : ['dom-overlay']);
      this.domOverlayState = !cfg.noOverlay && opts.domOverlay ? { type: 'screen' } : undefined;
      this.inputSources = []; this.environmentBlendMode = 'alpha-blend'; this.visibilityState = 'visible'; this._id = 0; this.ended = false;
    }
    updateRenderState(s) { Object.assign(this.renderState, s); }
    async requestReferenceSpace(type) { return { type, getOffsetReferenceSpace() { return this; }, addEventListener() {}, removeEventListener() {} }; }
    async requestHitTestSource() { return { cancel() { X.cancelled++; } }; }
    requestAnimationFrame(cb) { const id = ++this._id; setTimeout(() => { if (!this.ended) cb(performance.now(), this._frame()); }, 16); return id; }
    cancelAnimationFrame() {}
    _frame() {
      const s = this;
      return {
        session: s,
        getViewerPose() {
          if (!X.tracking) return null;
          const t = new RigidT(X.cam.x, X.cam.y, X.cam.z);
          return { transform: t, emulatedPosition: false, views: [{ eye: 'none', projectionMatrix: new Float32Array([1.3,0,0,0, 0,2.4,0,0, 0,0,-1,-1, 0,0,-0.02,0]), transform: t, recommendedViewportScale: null }] };
        },
        getHitTestResults() {
          if (!X.hit) return [];
          const h = { ...X.hit };
          const r = { getPose() { return { transform: new RigidT(h.x, h.y, h.z) }; } };
          if (!cfg.noAnchors) r.createAnchor = () => {
            const a = { pos: { ...h }, deleted: false, anchorSpace: {}, delete() { if (!this.deleted) { this.deleted = true; X.deleted++; } } };
            a.anchorSpace.__anchor = a; X.anchors.push(a); return Promise.resolve(a);
          };
          return [r];
        },
        getPose(space) { if (space && space.__anchor) { const p = space.__anchor.pos; return { transform: new RigidT(p.x, p.y, p.z) }; } return null; },
      };
    }
    async end() { if (this.ended) return; this.ended = true; X.ended++; this.dispatchEvent(new Event('end')); }
  }
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async (m) => m === 'immersive-ar',
    requestSession: async (mode, opts) => {
      if (X.reject) { const e = new Error('denied'); e.name = X.reject; throw e; }
      if (X.session && !X.session.ended) { const e = new Error('busy'); e.name = 'InvalidStateError'; throw e; }
      X.sessions++; X.lastOpts = opts; const s = new Session(opts); X.session = s; return s;
    },
    addEventListener() {}, removeEventListener() {},
  }});
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) C.prototype.makeXRCompatible = function () { return Promise.resolve(); };
})();
