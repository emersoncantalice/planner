import type { DrawShape } from './drawing-panel.component';

export interface ExportShape extends DrawShape { vector?: string; }
const xml = (value: unknown) => String(value).replace(/[&<>"'\n\r\t]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\n': '&#10;', '\r': '&#13;', '\t': '&#9;' })[c]!);
const bounds = (s: DrawShape) => ({ x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), width: Math.abs(s.w), height: Math.abs(s.h) });
const fill = (s: DrawShape) => s.type === 'sticky' ? s.stickyBg || '#fef08a' : s.fill;
const imageSource = (s: ExportShape) => s.vector ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(s.vector)))}` : s.src;

/** Uncompressed draw.io XML; text stays plain to avoid interpreting user HTML. */
export function toDrawio(shapes: ExportShape[], name: string, background: string): string {
  const cells = shapes.map((s, i) => {
    const b = bounds(s);
    const source = imageSource(s);
    const edge = s.type === 'arrow' || s.type === 'line' || s.type === 'pen';
    const style = [
      'html=0', 'whiteSpace=wrap', `strokeColor=${s.stroke}`, `fillColor=${fill(s) === 'transparent' ? 'none' : fill(s)}`,
      `strokeWidth=${s.lw}`, `opacity=${s.opacity * 100}`, `rotation=${s.rot || 0}`,
      `fontColor=${s.stroke}`, `fontSize=${s.fontSize || 16}`, `fontStyle=${(s.bold ? 1 : 0) + (s.italic ? 2 : 0)}`,
      `align=${s.align || (s.type === 'sticky' || s.type === 'text' ? 'left' : 'center')}`,
      `verticalAlign=${s.valign === 'middle' ? 'middle' : s.valign || (s.type === 'text' || s.type === 'sticky' ? 'top' : 'middle')}`,
      s.dash && s.dash !== 'solid' ? `dashed=1;dashPattern=${s.dash === 'dotted' ? '1 3' : '6 4'}` : '',
      source ? `shape=image;image=${source.replace(';base64,', ',')};imageAspect=0` :
        s.type === 'ellipse' ? 'shape=ellipse' : s.type === 'diamond' ? 'shape=rhombus' :
        s.type === 'text' ? 'shape=text;strokeColor=none;fillColor=none' :
        s.type === 'roundRect' ? 'rounded=1' : 'rounded=0',
      edge ? `endArrow=${s.type === 'arrow' ? 'classic' : 'none'};startArrow=none` : '',
      s.locked ? 'movable=0;resizable=0;rotatable=0' : ''
    ].join(';') + ';';
    let geometry = `<mxGeometry x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" as="geometry"/>`;
    if (edge) {
      const pts = s.type === 'pen' && s.pts?.length ? s.pts : [s.x, s.y, s.x + s.w, s.y + s.h];
      const point = (j: number, as = '') => `<mxPoint x="${pts[j]}" y="${pts[j + 1]}"${as ? ` as="${as}"` : ''}/>`;
      geometry = `<mxGeometry relative="1" as="geometry">${point(0, 'sourcePoint')}${point(pts.length - 2, 'targetPoint')}<Array as="points">${Array.from({ length: Math.max(0, pts.length / 2 - 2) }, (_, j) => point((j + 1) * 2)).join('')}</Array></mxGeometry>`;
    }
    return `<mxCell id="shape-${i}" value="${xml(s.text || '')}" style="${xml(style)}" ${edge ? 'edge' : 'vertex'}="1" parent="1">${geometry}</mxCell>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><mxfile host="Planner"><diagram id="page-1" name="${xml(name)}"><mxGraphModel background="${xml(background)}"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;
}

/** Native Excalidraw scene, with embedded SVGs for unsupported shapes. */
export function toExcalidraw(shapes: ExportShape[], background: string): string {
  const elements: Record<string, unknown>[] = [];
  const files: Record<string, unknown> = {};
  const now = Date.now();
  shapes.forEach((s, i) => {
    const b = bounds(s);
    const base = {
      id: `shape-${i}`, ...b, angle: (s.rot || 0) * Math.PI / 180,
      strokeColor: s.stroke, backgroundColor: fill(s), fillStyle: 'solid',
      strokeWidth: s.lw, strokeStyle: s.dash || 'solid', roughness: 0, opacity: s.opacity * 100,
      groupIds: s.groupId ? [s.groupId] : [], frameId: null, roundness: s.type === 'roundRect' ? { type: 3 } : null,
      seed: i + 1, version: 1, versionNonce: 0, isDeleted: false, boundElements: null,
      updated: now, link: null, locked: !!s.locked
    };
    const source = imageSource(s);
    if (source) {
      const fileId = `file-${i}`;
      files[fileId] = { id: fileId, mimeType: source.match(/^data:([^;,]+)/)?.[1] || 'image/png', dataURL: source, created: now };
      elements.push({ ...base, type: 'image', fileId, status: 'saved', scale: [1, 1], crop: null });
    } else if (s.type === 'arrow' || s.type === 'line' || s.type === 'pen') {
      const pts = s.type === 'pen' && s.pts?.length ? s.pts : [s.x, s.y, s.x + s.w, s.y + s.h];
      const points = Array.from({ length: pts.length / 2 }, (_, j) => [pts[j * 2] - pts[0], pts[j * 2 + 1] - pts[1]]);
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      elements.push({ ...base, type: s.type === 'pen' ? 'freedraw' : s.type,
        x: pts[0], y: pts[1], width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
        points, pressures: [], simulatePressure: true, lastCommittedPoint: null,
        startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: s.type === 'arrow' ? 'arrow' : null });
    } else if (s.type !== 'text') {
      elements.push({ ...base, type: s.type === 'ellipse' || s.type === 'diamond' ? s.type : 'rectangle' });
    }
    if (s.text) {
      const fontSize = s.fontSize || 16;
      const height = s.text.split('\n').length * fontSize * 1.25;
      const valign = s.valign || (s.type === 'text' || s.type === 'sticky' ? 'top' : 'middle');
      elements.push({ ...base, id: `text-${i}`, type: 'text', backgroundColor: 'transparent',
        y: b.y + (valign === 'bottom' ? b.height - height : valign === 'middle' ? (b.height - height) / 2 : 0),
        height, text: s.text, originalText: s.text, fontSize, fontFamily: 2,
        textAlign: s.align || (s.type === 'text' || s.type === 'sticky' ? 'left' : 'center'),
        verticalAlign: 'top', containerId: null, autoResize: false, lineHeight: 1.25 });
    }
  });
  return JSON.stringify({ type: 'excalidraw', version: 2, source: 'https://excalidraw.com', elements,
    appState: { viewBackgroundColor: background, gridSize: null }, files }, null, 2);
}
