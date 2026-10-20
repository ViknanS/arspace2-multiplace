export function renderFooter(root) {
  root.innerHTML = `
    <div class="footer">
      <div class="footer__brand">
        <span class="brand__mark" aria-hidden="true"></span>
        <div>
          <p class="footer__name">ARSpace</p>
          <p class="footer__note">An interactive augmented reality room and object visualization application. B.Tech CSE AR/VR project.</p>
        </div>
      </div>
      <div class="footer__cols">
        <div>
          <p class="footer__heading">Explore</p>
          <ul>
            <li><a href="#/collection">Full collection</a></li>
            <li><a href="#/collection?category=seating">Seating</a></li>
            <li><a href="#/collection?category=tables">Tables</a></li>
            <li><a href="#/collection?category=storage">Storage</a></li>
            <li><a href="#/collection?category=lighting">Lighting</a></li>
            <li><a href="#/collection?category=decor">Decor</a></li>
            <li><a href="#/how-it-works">How AR works</a></li>
          </ul>
        </div>
        <div>
          <p class="footer__heading">Built with</p>
          <ul>
            <li><a href="https://modelviewer.dev/" target="_blank" rel="noopener">Google model-viewer</a></li>
            <li><a href="https://immersiveweb.dev/" target="_blank" rel="noopener">WebXR Device API</a></li>
            <li><a href="https://github.com/KhronosGroup/glTF-Sample-Assets" target="_blank" rel="noopener">Khronos glTF sample assets</a></li>
          </ul>
        </div>
      </div>
      <p class="footer__legal">3D models by Eric Chadwick, Wayfair LLC, Rico Cilliers and Darmstadt Graphics Group (CC0 and CC BY 4.0), plus ARSpace's own procedural models (CC0). Full credits in ATTRIBUTIONS.md.</p>
    </div>`;
}
