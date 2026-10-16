import { describe, expect, it } from 'vitest';
import { ExportShape, toDrawio, toExcalidraw } from './drawing-export';

const shape: ExportShape = { id: 'a', type: 'rect', x: 100, y: 80, w: 120, h: 60,
  stroke: '#123456', fill: 'transparent', lw: 2, opacity: 0.5, text: 'A & B <C>\nOlá' };

describe('drawing exports', () => {
  it('creates parseable draw.io XML with literal labels and page names', () => {
    const doc = new DOMParser().parseFromString(toDrawio([shape], 'A & B', '#ffffff'), 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('diagram')?.getAttribute('name')).toBe('A & B');
    expect(doc.querySelector('[id="shape-0"]')?.getAttribute('value')).toBe(shape.text);
    expect(doc.querySelectorAll('mxCell').length).toBe(3);
  });

  it('preserves reverse arrows and pen waypoints', () => {
    const arrow: ExportShape = { ...shape, type: 'arrow', w: -50, h: -40, text: '' };
    const pen: ExportShape = { ...shape, type: 'pen', pts: [10, 20, 30, 50, 60, 10], text: '' };
    const scene = JSON.parse(toExcalidraw([arrow, pen], '#abcdef'));
    expect(scene.elements[0].points).toEqual([[0, 0], [-50, -40]]);
    expect(scene.elements[0].width).toBe(50);
    expect(scene.elements[0].endArrowhead).toBe('arrow');
    expect(scene.elements[1].points).toEqual([[0, 0], [20, 30], [50, -10]]);
    expect(scene.appState.viewBackgroundColor).toBe('#abcdef');
    const doc = new DOMParser().parseFromString(toDrawio([pen], 'A', '#fff'), 'application/xml');
    expect(doc.querySelector('Array mxPoint')?.getAttribute('x')).toBe('30');
  });

  it('embeds images and exports text as editable elements without changing input', () => {
    const image: ExportShape = { ...shape, type: 'image', src: 'data:image/png;base64,AAAA', text: '' };
    const before = JSON.stringify([shape, image]);
    const scene = JSON.parse(toExcalidraw([shape, image], '#ffffff'));
    expect(scene.type).toBe('excalidraw');
    expect(scene.version).toBe(2);
    expect(scene.elements.find((e: { type: string }) => e.type === 'text').text).toBe(shape.text);
    expect(scene.files['file-1'].dataURL).toBe(image.src);
    expect(scene.elements[0].opacity).toBe(50);
    expect(JSON.stringify([shape, image])).toBe(before);
  });
});
