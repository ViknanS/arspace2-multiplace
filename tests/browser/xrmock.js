(() => {
  const mat = (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
  // pose on a surface whose normal is n (+Y axis = n), like a real hit-test result
  function surfaceMatrix(x, y, z, n) {
    const l = Math.hypot(n.x, n.y, n.z) || 1; const Y = { x: n.x / l, y: n.y / l, z: n.z / l };
    const ref = Math.abs(Y.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    let X = { x: ref.y * Y.z - ref.z * Y.y, y: ref.z * Y.x - ref.x * Y.z, z: ref.x * Y.y - ref.y * Y.x };
    const xl = Math.hypot(X.x, X.y, X.z); X = { x: X.x / xl, y: X.y / xl, z: X.z / xl };
    const Z = { x: X.y * Y.z - X.z * Y.y, y: X.z * Y.x - X.x * Y.z, z: X.x * Y.y - X.y * Y.x };
    return new Float32Array([X.x, X.y, X.z, 0, Y.x, Y.y, Y.z, 0, Z.x, Z.y, Z.z, 0, x, y, z, 1]);
  }
  class RigidT {
    constructor(x = 0, y = 0, z = 0, n = null) {
      this.position = { x, y, z, w: 1 }; this.orientation = { x: 0, y: 0, z: 0, w: 1 }; this.matrix = n ? surfaceMatrix(x, y, z, n) : mat(x, y, z);
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
  window.XRRigidTransform = class { constructor(p = {}, o = {}) { this.position = { x: p.x || 0, y: p.y || 0, z: p.z || 0, w: 1 }; this.orientation = { x: o.x || 0, y: o.y || 0, z: o.z || 0, w: o.w ?? 1 }; } };
  const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
  const crossV = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  // column-major matrix whose -Z axis points from `from` to `to`
  function lookMatrix(from, to) {
    const f = norm({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
    const z = { x: -f.x, y: -f.y, z: -f.z };
    let x = crossV({ x: 0, y: 1, z: 0 }, z);
    if (Math.hypot(x.x, x.y, x.z) < 1e-6) x = { x: 1, y: 0, z: 0 };
    x = norm(x);
    const y = crossV(z, x);
    return new Float32Array([x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, from.x, from.y, from.z, 1]);
  }
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
    requestAnimationFrame(cb) { const id = ++this._id; setTimeout(() => { if (!this.ended) cb(performance.now(), this._frame()); }, cfg.frameMs || 16); return id; }
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
          // X.hit = { x, y, z, n?: {x,y,z} } — n is the surface normal (default: floor, +Y)
          const r = { getPose() { return { transform: new RigidT(h.x, h.y, h.z, h.n || null) }; } };
          if (!cfg.noAnchors) r.createAnchor = () => {
            const a = { pos: { ...h }, deleted: false, anchorSpace: {}, delete() { if (!this.deleted) { this.deleted = true; X.deleted++; } } };
            a.anchorSpace.__anchor = a; X.anchors.push(a); return Promise.resolve(a);
          };
          return [r];
        },
        getPose(space) {
          if (space && space.__anchor) { const p = space.__anchor.pos; return { transform: new RigidT(p.x, p.y, p.z) }; }
          if (space && space.__ray) return { transform: { matrix: lookMatrix(space.__ray.from, space.__ray.to), position: { ...space.__ray.from, w: 1 } } };
          return null;
        },
        createAnchor: cfg.noAnchors ? undefined : (t) => {
          const a = { pos: { x: t.position.x, y: t.position.y, z: t.position.z }, deleted: false, anchorSpace: {}, delete() { if (!this.deleted) { this.deleted = true; X.deleted++; } } };
          a.anchorSpace.__anchor = a; X.anchors.push(a); return Promise.resolve(a);
        },
      };
    }
    /** Simulate a screen tap whose ray goes from the camera towards `to` (or no target). */
    tap(to) {
      const e = new Event('select');
      e.frame = this._frame();
      e.inputSource = { targetRaySpace: { __ray: { from: { ...X.cam }, to: to || { x: X.cam.x, y: X.cam.y, z: X.cam.z - 1 } } } };
      this.dispatchEvent(e);
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
