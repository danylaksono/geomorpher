import L from 'npm:leaflet';
import * as d3 from 'npm:d3';
import {
  GeoMorpher,
  createLeafletMorphLayers,
} from '../../src/index.js';

// Simple number formatter
const formatStat = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

async function fetchJSON(fileName) {
  const url = new URL(`../../data/${fileName}`, import.meta.url);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${fileName}: ${resp.status}`);
  return resp.json();
}

class CanvasGlyphLayer extends L.Layer {
  constructor({ morpher, categories, morphFactor = 0, pane = 'overlayPane', radius = 18 } = {}) {
    super();
    this.morpher = morpher;
    this.categories = categories;
    this.morphFactor = morphFactor;
    this.pane = pane;
    this.radius = radius;
    this.pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  }

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-glyphs');
    this._ctx = this._canvas.getContext('2d');
    this._map.getPane(this.pane).appendChild(this._canvas);
    this._reset();
    this._map.on('move resize zoomend viewreset', this._reset, this);
  }

  onRemove(map) {
    this._map.off('move resize zoomend viewreset', this._reset, this);
    if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
    this._ctx = null;
  }

  setMorphFactor(f) {
    this.morphFactor = f;
    this._draw();
  }

  _reset() {
    const size = this._map.getSize();
    const ratio = this.pixelRatio;
    this._canvas.width = Math.max(1, Math.floor(size.x * ratio));
    this._canvas.height = Math.max(1, Math.floor(size.y * ratio));
    this._canvas.style.width = size.x + 'px';
    this._canvas.style.height = size.y + 'px';
    // position canvas
    L.DomUtil.setPosition(this._canvas, L.point(0,0));
    this._ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // scale drawing ops for DPR
    this._draw();
  }

  _getRenderPoints() {
    // We'll render one glyph per regular feature, using the morpher to get interpolated centroid
    const features = this.morpher.getRegularFeatureCollection().features;
    const points = [];
    for (const feat of features) {
      // morpher.lookupById or getInterpolatedPoint may not exist; use morpher.interpolateFeatureCentroid
      // We'll try a few known method names via safe lookup
      let pt = null;
      if (typeof this.morpher.getInterpolatedCentroid === 'function') {
        pt = this.morpher.getInterpolatedCentroid(feat.properties.code, this.morphFactor);
      } else if (typeof this.morpher.getInterpolatedPoint === 'function') {
        pt = this.morpher.getInterpolatedPoint(feat.properties.code, this.morphFactor);
      } else if (typeof this.morpher.interpolateFeatureCentroid === 'function') {
        pt = this.morpher.interpolateFeatureCentroid(feat.properties.code, this.morphFactor);
      }
      // As a fallback, use the regular feature's centroid (approx via bbox center)
      if (!pt) {
        const coords = feat.geometry.coordinates;
        // handle Polygon
        if (feat.geometry.type === 'Polygon') {
          const ring = coords[0];
          const x = ring.reduce((s,c)=>s+c[0],0)/ring.length;
          const y = ring.reduce((s,c)=>s+c[1],0)/ring.length;
          pt = [x,y];
        } else if (feat.geometry.type === 'MultiPolygon') {
          const ring = coords[0][0];
          const x = ring.reduce((s,c)=>s+c[0],0)/ring.length;
          const y = ring.reduce((s,c)=>s+c[1],0)/ring.length;
          pt = [x,y];
        } else {
          continue;
        }
      }
      const latlng = L.latLng(pt[1], pt[0]);
      const pixel = this._map.latLngToContainerPoint(latlng);
      points.push({ pixel, properties: feat.properties });
    }
    return points;
  }

  _draw() {
    if (!this._ctx) return;
    const ctx = this._ctx;
    const w = this._canvas.width / this.pixelRatio;
    const h = this._canvas.height / this.pixelRatio;
    ctx.clearRect(0, 0, w, h);
    ctx.save();

    const points = this._getRenderPoints();
    const radius = this.radius;

    // d3 pie generator based on category values
    const pie = d3.pie().value(d => d.value).sort(null);

    for (const p of points) {
      const center = p.pixel;
      // Build slices
      const slices = this.categories.map(c => ({ key: c.key, color: c.color, value: Number(p.properties?.[c.key] ?? 0) })).filter(s=>s.value>0);
      if (slices.length===0) continue;
      const arcs = pie(slices);
      // draw each arc on canvas
      for (const arc of arcs) {
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        const startAngle = arc.startAngle - Math.PI/2;
        const endAngle = arc.endAngle - Math.PI/2;
        ctx.fillStyle = arc.data.color;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.arc(center.x, center.y, radius, startAngle, endAngle);
        ctx.lineTo(center.x, center.y);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

async function bootstrap() {
  const regular = await fetchJSON('oxford_lsoas_regular.json');
  const carto = await fetchJSON('oxford_lsoas_cartogram.json');

  const aggregations = { population: 'sum', households: 'sum' };
  const sampleData = regular.features.map(feature => ({
    lsoa: feature.properties.code,
    population: Number(feature.properties.population ?? 0),
    households: Number(feature.properties.households ?? 0),
  }));

  const morpher = new GeoMorpher({ regularGeoJSON: regular, cartogramGeoJSON: carto, data: sampleData, aggregations });
  await morpher.prepare();

  const map = L.map('map', { preferCanvas: true }).setView([51.752, -1.2577], 12);
  const basemap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);

  const initialFactor = 0;

  const categories = [
    { key: 'population', label: 'Population', color: '#4e79a7' },
    { key: 'households', label: 'Households', color: '#f28e2c' },
  ];

  // Create morph layers using helper to show regular/tween/cartogram
  const { group, regularLayer, tweenLayer, cartogramLayer, updateMorphFactor } = await createLeafletMorphLayers({
    morpher,
    L,
    morphFactor: initialFactor,
    regularStyle: () => ({ color: '#1f77b4', weight: 1, fillOpacity: 0.15 }),
    cartogramStyle: () => ({ color: '#ff7f0e', weight: 1, fillOpacity: 0.15 }),
    tweenStyle: () => ({ color: '#22c55e', weight: 2, fillOpacity: 0 }),
  });
  group.addTo(map);
  map.fitBounds(regularLayer.getBounds(), { padding: [20,20] });

  // add legend
  const glyphLegendEl = document.getElementById('glyphLegend');
  glyphLegendEl.innerHTML = '';
  for (const {key,label,color} of categories) {
    const li = document.createElement('li'); li.className='legend-item';
    li.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span>${label}</span>`;
    glyphLegendEl.appendChild(li);
  }

  // Create canvas glyph layer and add to map
  const canvasGlyphLayer = new CanvasGlyphLayer({ morpher, categories, morphFactor: initialFactor, pane: 'overlayPane', radius: 18 });
  canvasGlyphLayer.addTo(map);

  // wire slider
  const slider = document.getElementById('morphFactor');
  const factorValue = document.getElementById('factorValue');
  factorValue.textContent = initialFactor.toFixed(2);
  slider.addEventListener('input', (e)=>{
    const v = Number(e.target.value);
    factorValue.textContent = v.toFixed(2);
    updateMorphFactor(v);
    canvasGlyphLayer.setMorphFactor(v);
  });

  // expose counts in console
  console.log('regular count', morpher.getRegularFeatureCollection().features.length);
  console.log('cartogram count', morpher.getCartogramFeatureCollection().features.length);
}

bootstrap().catch(err=>{ console.error(err); alert('Failed to start canvas glyphs example: '+err.message); });
