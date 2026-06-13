import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef,
  HostListener, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlannerApiService } from '../../core/planner-api.service';
import { ToastService } from '../../core/toast.service';
import { uid as genUid } from '../../core/uid';

export type Tool = 'select' | 'pen' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'sticky' | 'line' | 'triangle' | 'diamond' | 'star' | 'image';
type AnchorId = 'top' | 'right' | 'bottom' | 'left';

export interface DrawShape {
  id: string;
  type: Tool;
  x: number; y: number; w: number; h: number;
  fromId?: string;
  toId?: string;
  fromAnchor?: AnchorId;
  toAnchor?: AnchorId;
  pts?: number[];     // flat [x0,y0,...] for pen
  stroke: string;
  fill: string;
  lw: number;
  opacity: number;
  text?: string;
  fontSize?: number;
  bold?: boolean;
  stickyBg?: string;
  groupId?: string;
  src?: string;        // data URL for image shapes
  linkTabId?: string;  // navigates to this tab when its link badge is clicked
}

interface DrawingTab { id: string; nome: string; shapes: DrawShape[]; background: string; }
interface DrawingRecord { id: string; nome: string; data: string; pasta?: string; atualizadoEm?: string; }
interface Point { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }
interface DragOrigin extends Rect { pts?: number[]; }
interface DrawingFolderGroup { path: string; label: string; drawings: DrawingRecord[]; }
interface CanvasContextMenu { x: number; y: number; }
interface DrawingContextMenu { drawing: DrawingRecord; x: number; y: number; }
interface AlignmentGuide { axis: 'x' | 'y'; value: number; from: number; to: number; }

const HANDLE_SIZE = 8;
const MIN_SIZE    = 10;

@Component({
  selector: 'app-drawing-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './drawing-panel.component.html',
  styleUrl: './drawing-panel.component.scss'
})
export class DrawingPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('svgEl')      svgRef!:        ElementRef<SVGSVGElement>;
  @ViewChild('shapesLayer') shapesLayerRef!: ElementRef<SVGGElement>;
  @ViewChild('textArea') taRef!:    ElementRef<HTMLTextAreaElement>;
  @Input() token = '';

  private api   = inject(PlannerApiService);
  private toast = inject(ToastService);
  cdr = inject(ChangeDetectorRef);

  // ── Drawings list ─────────────────────────────────────────────────────────
  drawings:       DrawingRecord[] = [];
  current:        DrawingRecord | null = null;
  showList        = true;
  showNewModal    = false;
  newName         = '';
  newFolder       = '';
  drawingSearch   = '';
  folderDraft     = '';
  expandedFolders = new Set<string>();
  drawingContextMenu: DrawingContextMenu | null = null;
  contextMoveFolder = '';
  saving          = false;
  renaming        = false;
  renameVal       = '';

  // ── Canvas state ──────────────────────────────────────────────────────────
  shapes:     DrawShape[]   = [];
  background  = '#ffffff';

  // ── Abas (páginas) do desenho ──────────────────────────────────────────────
  tabs:         DrawingTab[] = [];
  activeTabId   = '';
  renamingTabId = '';
  renameTabVal  = '';
  tool:       Tool          = 'select';
  zoom        = 1;
  panX        = 0;
  panY        = 0;
  vw  = 1200;
  vh  = 800;
  gridEnabled = true;
  readonly gridSize = 20;

  // ── Interaction ───────────────────────────────────────────────────────────
  private isDrawing   = false;
  private isPanning   = false;
  private spaceDown   = false;
  private drawPts:    number[]   = [];
  private drawId      = '';
  private activeDrawTool: Tool | null = null;
  private startPt     = { x: 0, y: 0 };
  private arrowStartShapeId: string | null = null;
  private arrowStartAnchor: AnchorId | null = null;
  private panStart    = { sx: 0, sy: 0, px: 0, py: 0 };

  // ── Selection / drag ─────────────────────────────────────────────────────
  selectedId:           string | null = null;
  selectedIds:          string[] = [];
  private isDragging    = false;
  private dragPt        = { x: 0, y: 0 };
  private dragOrig      = { x: 0, y: 0, w: 0, h: 0 };
  private dragOrigins   = new Map<string, DragOrigin>();
  private activeHandle  = '';
  isMultiSelecting      = false;
  selectionRect: Rect | null = null;
  alignmentGuides: AlignmentGuide[] = [];
  private selectionStart = { x: 0, y: 0 };
  private selectionAdditive = false;
  private selectionBaseIds: string[] = [];

  // ── Text editing ──────────────────────────────────────────────────────────
  editingId: string | null = null;
  editStyle: Record<string, string> = {};

  // ── Style defaults ────────────────────────────────────────────────────────
  strokeColor = '#1e293b';
  fillColor   = 'transparent';
  lineWidth   = 2;
  fontSize    = 16;
  stickyBg    = '#fef08a';
  opacity     = 1;
  // ── Color modal (como o painel de atalhos) ────────────────────────────────
  showColorModal   = false;
  colorModalTab: 'stroke' | 'fill' = 'stroke';
  showShortcuts    = false;

  openColorModal(tab: 'stroke' | 'fill') {
    this.colorModalTab = tab;
    this.showColorModal = !this.showColorModal || this.colorModalTab !== tab
      ? (this.colorModalTab = tab, true)
      : false;
    this.showShortcuts = false;
    this.cdr.markForCheck();
  }

  setStroke(color: string) {
    this.strokeColor = color;
    if (this.sel) this.updateSelProp({ stroke: color });
    else this.cdr.markForCheck();
  }

  setFill(color: string) {
    this.fillColor = color;
    if (this.sel) this.updateSelProp({ fill: color });
    else this.cdr.markForCheck();
  }

  onCustomStrokeColorChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    this.setStroke(input.value);
    this.showColorModal = false;
    this.cdr.markForCheck();
  }

  onCustomFillColorChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    this.setFill(input.value);
    this.showColorModal = false;
    this.cdr.markForCheck();
  }

  setLineWidth(lw: number) {
    this.lineWidth = lw;
    if (this.sel) this.updateSelProp({ lw });
    else this.cdr.markForCheck();
  }

  setStickyBg(color: string) {
    this.stickyBg = color;
    if (this.sel?.type === 'sticky') this.updateSelProp({ stickyBg: color });
    else this.cdr.markForCheck();
  }

  readonly Math = Math;
  readonly toolsList: Tool[] = ['select','pen','rect','ellipse','arrow','text','sticky','line','triangle','diamond','star'];
  readonly strokePresets = ['#1e293b','#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#ffffff','#94a3b8'];
  readonly fillPresets   = ['transparent','#ffffff','#fef08a','#dbeafe','#dcfce7','#fee2e2','#ede9fe','#fce7f3'];
  readonly stickyColors  = ['#fef08a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa'];
  readonly lineWidths    = [1, 2, 4, 8];

  // ── History ───────────────────────────────────────────────────────────────
  private history:    string[] = [];
  private historyIdx  = -1;

  // ── Auto-save ─────────────────────────────────────────────────────────────
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Computed ──────────────────────────────────────────────────────────────
  get sel()     { return this.shapes.find(s => s.id === this.selectedId) ?? null; }
  get viewBox() { return `${this.panX} ${this.panY} ${this.vw / this.zoom} ${this.vh / this.zoom}`; }

  handles = ['tl','tc','tr','ml','mr','bl','bc','br'] as const;

  handleX(h: string, s: DrawShape): number {
    if (h === 'tl' || h === 'bl' || h === 'ml') return s.x - HANDLE_SIZE / 2;
    if (h === 'tc' || h === 'bc') return s.x + s.w / 2 - HANDLE_SIZE / 2;
    return s.x + s.w - HANDLE_SIZE / 2;
  }

  handleY(h: string, s: DrawShape): number {
    if (h === 'tl' || h === 'tr' || h === 'tc') return s.y - HANDLE_SIZE / 2;
    if (h === 'ml' || h === 'mr') return s.y + s.h / 2 - HANDLE_SIZE / 2;
    return s.y + s.h - HANDLE_SIZE / 2;
  }

  handleCursor(h: string): string {
    const map: Record<string, string> = {
      tl: 'nw-resize', tc: 'n-resize', tr: 'ne-resize',
      ml: 'w-resize', mr: 'e-resize',
      bl: 'sw-resize', bc: 's-resize', br: 'se-resize'
    };
    return map[h] ?? 'pointer';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnChanges(c: SimpleChanges) {
    if (c['token'] && this.token) this.loadDrawings();
  }

  ngAfterViewInit() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  ngOnDestroy() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    window.removeEventListener('resize', () => this.resize());
  }

  private resize() {
    const r = this.svgRef?.nativeElement?.getBoundingClientRect();
    if (!r) return;
    this.vw = r.width  || 1200;
    this.vh = r.height || 800;
    this.cdr.markForCheck();
  }

  // ── API ───────────────────────────────────────────────────────────────────
  loadDrawings() {
    if (!this.token) return;
    this.api.listDrawings(this.token).subscribe({
      next: (list: any[]) => {
        this.drawings = (list || []).map(d => ({ ...d, pasta: this.normalizeFolder(d.pasta) }));
        if (this.drawings.length && !this.current) this.open(this.drawings[0]);
        this.cdr.markForCheck();
      }
    });
  }

  open(d: DrawingRecord) {
    this.closeDrawingContextMenu();
    this.current   = d;
    this.folderDraft = this.normalizeFolder(d.pasta);
    this.editingId = null;
    this.renamingTabId = '';
    this.clearSelection();
    let parsed: any = {};
    try { parsed = JSON.parse(d.data || '{}'); } catch { parsed = {}; }
    // Compatibilidade: desenhos antigos têm apenas { shapes, background }.
    if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
      this.tabs = parsed.tabs.map((t: any) => ({
        id: t.id || this.uid(),
        nome: t.nome || 'Aba',
        shapes: Array.isArray(t.shapes) ? t.shapes : [],
        background: t.background || '#ffffff'
      }));
    } else {
      this.tabs = [{ id: this.uid(), nome: 'Aba 1', shapes: parsed.shapes || [], background: parsed.background || '#ffffff' }];
    }
    this.activeTabId = this.tabs[0].id;
    this.loadActiveTab();
    this.cdr.markForCheck();
  }

  private loadActiveTab() {
    const t = this.tabs.find(x => x.id === this.activeTabId) || this.tabs[0];
    if (!t) { this.shapes = []; this.background = '#ffffff'; this.resetHistory(); return; }
    this.activeTabId = t.id;
    this.shapes      = t.shapes;
    this.background  = t.background;
    this.clearSelection();
    this.resetHistory();
  }

  /** Salva o estado atual do canvas de volta na aba ativa. */
  private syncActiveTab() {
    const t = this.tabs.find(x => x.id === this.activeTabId);
    if (t) { t.shapes = this.shapes; t.background = this.background; }
  }

  get activeTab(): DrawingTab | null {
    return this.tabs.find(x => x.id === this.activeTabId) ?? null;
  }

  switchTab(id: string) {
    if (id === this.activeTabId) return;
    if (!this.tabs.some(t => t.id === id)) return;
    if (this.editingId) this.commitText();
    this.syncActiveTab();
    this.activeTabId = id;
    this.loadActiveTab();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  addTab() {
    this.syncActiveTab();
    const tab: DrawingTab = { id: this.uid(), nome: `Aba ${this.tabs.length + 1}`, shapes: [], background: '#ffffff' };
    this.tabs = [...this.tabs, tab];
    this.activeTabId = tab.id;
    this.loadActiveTab();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  deleteTab(id: string) {
    if (this.tabs.length <= 1) {
      this.toast.show('O desenho precisa ter ao menos uma aba.', 'info', 3500);
      return;
    }
    const idx = this.tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    // Remove vínculos que apontavam para a aba excluída.
    for (const t of this.tabs) {
      for (const s of t.shapes) if (s.linkTabId === id) s.linkTabId = undefined;
    }
    this.tabs = this.tabs.filter(t => t.id !== id);
    if (this.activeTabId === id) {
      this.activeTabId = this.tabs[Math.max(0, idx - 1)].id;
      this.loadActiveTab();
    }
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  startRenameTab(t: DrawingTab) {
    this.renamingTabId = t.id;
    this.renameTabVal  = t.nome;
    this.cdr.markForCheck();
  }

  commitRenameTab() {
    const t = this.tabs.find(x => x.id === this.renamingTabId);
    if (t) t.nome = this.renameTabVal.trim() || t.nome;
    this.renamingTabId = '';
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  // ── Vínculos entre abas ─────────────────────────────────────────────────────
  setSelLink(tabId: string) {
    if (!this.sel) return;
    this.updateShape(this.sel.id, { linkTabId: tabId || undefined });
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  linkTabName(tabId: string | undefined): string {
    return this.tabs.find(t => t.id === tabId)?.nome ?? '';
  }

  onLinkBadgeMouseDown(e: MouseEvent, s: DrawShape) {
    e.stopPropagation();
    e.preventDefault();
    if (s.linkTabId) this.switchTab(s.linkTabId);
  }

  createDrawing() {
    const nome = this.newName.trim() || 'Novo desenho';
    const pasta = this.normalizeFolder(this.newFolder);
    this.api.createDrawing(this.token, nome, pasta).subscribe({
      next: (d: any) => {
        d.pasta = this.normalizeFolder(d.pasta);
        this.drawings = [d, ...this.drawings];
        this.open(d);
        this.showNewModal = false;
        this.newName      = '';
        this.newFolder    = '';
        this.cdr.markForCheck();
      }
    });
  }

  deleteCurrent() {
    if (!this.current) return;
    this.deleteDrawingRecord(this.current);
  }

  deleteDrawingRecord(drawing: DrawingRecord) {
    const nome = drawing.nome;
    this.api.deleteDrawing(this.token, drawing.id).subscribe({
      next: () => {
        this.drawings = this.drawings.filter(d => d.id !== drawing.id);
        if (this.current?.id === drawing.id) {
          this.current = null;
          this.shapes = [];
          if (this.drawings.length) this.open(this.drawings[0]);
        }
        this.closeDrawingContextMenu?.();
        this.toast.show(`Desenho "${nome}" excluído.`, 'success', 4000);
        this.cdr.markForCheck();
      },
      error: () => this.toast.show(`Falha ao excluir "${nome}".`, 'error', 5000)
    });
  }

  saveRename() {
    if (!this.current || !this.renameVal.trim()) { this.renaming = false; return; }
    this.api.updateDrawing(this.token, this.current.id, this.renameVal.trim(), this.current.data, this.current.pasta || '').subscribe({
      next: (d: any) => {
        d.pasta = this.normalizeFolder(d.pasta);
        this.current = d;
        this.drawings = this.drawings.map(x => x.id === d.id ? d : x);
        this.renaming = false;
        this.cdr.markForCheck();
      }
    });
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), 1500);
  }

  /** Serializa abas + (para compatibilidade) shapes/background da aba ativa. */
  private serializeData(): string {
    this.syncActiveTab();
    const active = this.activeTab;
    return JSON.stringify({
      tabs: this.tabs,
      shapes: active?.shapes ?? this.shapes,
      background: active?.background ?? this.background
    });
  }

  persistNow() {
    if (!this.current || !this.token) return;
    this.saving = true;
    const data  = this.serializeData();
    this.api.updateDrawing(this.token, this.current.id, this.current.nome, data, this.current.pasta || '').subscribe({
      next: (d: any) => {
        d.pasta = this.normalizeFolder(d.pasta);
        this.current = d;
        this.drawings = this.drawings.map(x => x.id === d.id ? d : x);
        this.saving   = false;
        this.cdr.markForCheck();
      },
      error: () => { this.saving = false; this.cdr.markForCheck(); }
    });
  }

  // ── Coordinates ───────────────────────────────────────────────────────────
  filteredDrawings(): DrawingRecord[] {
    const q = this.drawingSearch.trim().toLowerCase();
    if (!q) return this.drawings;
    return this.drawings.filter(d =>
      d.nome.toLowerCase().includes(q) || this.normalizeFolder(d.pasta).toLowerCase().includes(q)
    );
  }

  drawingFolderGroups(): DrawingFolderGroup[] {
    const map = new Map<string, DrawingRecord[]>();
    for (const drawing of this.filteredDrawings()) {
      const path = this.normalizeFolder(drawing.pasta);
      map.set(path, [...(map.get(path) || []), drawing]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => this.folderLabel(a).localeCompare(this.folderLabel(b), 'pt-BR'))
      .map(([path, drawings]) => ({ path, label: this.folderLabel(path), drawings }));
  }

  folderLabel(path: string): string {
    return path || 'Sem pasta';
  }

  folderDepth(path: string): number {
    return path ? path.split('/').length - 1 : 0;
  }

  isFolderOpen(path: string): boolean {
    return !!this.drawingSearch.trim() || this.expandedFolders.has(path);
  }

  toggleFolder(path: string) {
    if (this.expandedFolders.has(path)) this.expandedFolders.delete(path);
    else this.expandedFolders.add(path);
    this.cdr.markForCheck();
  }

  folderOptions(): string[] {
    const folders = new Set(this.drawings.map(d => this.normalizeFolder(d.pasta)).filter(Boolean));
    return ['', ...[...folders].sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }

  openDrawingContextMenu(event: MouseEvent, drawing: DrawingRecord) {
    event.preventDefault();
    event.stopPropagation();
    this.drawingContextMenu = { drawing, x: event.clientX, y: event.clientY };
    this.contextMoveFolder = this.normalizeFolder(drawing.pasta);
    this.cdr.markForCheck();
  }

  closeDrawingContextMenu() {
    this.drawingContextMenu = null;
  }

  moveDrawingTo(drawing: DrawingRecord, folder: string) {
    const pasta = this.normalizeFolder(folder);
    this.api.updateDrawing(this.token, drawing.id, drawing.nome, drawing.data, pasta).subscribe({
      next: (d: any) => {
        d.pasta = this.normalizeFolder(d.pasta);
        this.drawings = this.drawings.map(x => x.id === d.id ? d : x);
        if (this.current?.id === d.id) {
          this.current = d;
          this.folderDraft = d.pasta || '';
        }
        this.closeDrawingContextMenu();
        this.cdr.markForCheck();
      }
    });
  }

  saveCurrentFolder() {
    if (!this.current) return;
    const pasta = this.normalizeFolder(this.folderDraft);
    if (pasta === this.normalizeFolder(this.current.pasta)) return;
    const data = this.serializeData();
    this.api.updateDrawing(this.token, this.current.id, this.current.nome, data, pasta).subscribe({
      next: (d: any) => {
        d.pasta = this.normalizeFolder(d.pasta);
        this.current = d;
        this.folderDraft = d.pasta || '';
        this.drawings = this.drawings.map(x => x.id === d.id ? d : x);
        this.cdr.markForCheck();
      }
    });
  }

  normalizeFolder(folder: string | undefined | null): string {
    return (folder || '').trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  }

  private pt(e: MouseEvent): { x: number; y: number } {
    const svg = this.svgRef.nativeElement;
    const r   = svg.getBoundingClientRect();
    const vb  = svg.viewBox.baseVal;
    return {
      x: vb.x + (e.clientX - r.left) / r.width  * vb.width,
      y: vb.y + (e.clientY - r.top)  / r.height * vb.height
    };
  }

  private uid() { return genUid(); }

  // ── Zoom / Pan ────────────────────────────────────────────────────────────
  onWheel(e: WheelEvent) {
    e.preventDefault();
    const p       = this.pt(e as any);
    const delta   = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(8, Math.max(0.1, this.zoom * delta));
    this.panX     = p.x - (p.x - this.panX) * (this.zoom / newZoom);
    this.panY     = p.y - (p.y - this.panY) * (this.zoom / newZoom);
    this.zoom     = newZoom;
    this.cdr.markForCheck();
  }

  resetZoom() {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.cdr.markForCheck();
  }

  fitContent() {
    if (!this.shapes.length) { this.resetZoom(); return; }
    const xs = this.shapes.flatMap(s => [s.x, s.x + s.w]);
    const ys = this.shapes.flatMap(s => [s.y, s.y + s.h]);
    const minX = Math.min(...xs) - 40; const maxX = Math.max(...xs) + 40;
    const minY = Math.min(...ys) - 40; const maxY = Math.max(...ys) + 40;
    const cw   = maxX - minX;         const ch   = maxY - minY;
    const z    = Math.min(this.vw / cw, this.vh / ch, 2);
    this.zoom  = z;
    this.panX  = minX - (this.vw / z - cw) / 2;
    this.panY  = minY - (this.vh / z - ch) / 2;
    this.cdr.markForCheck();
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  onSvgMouseDown(e: MouseEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    const p = this.pt(e);

    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      e.preventDefault();
      this.isPanning = true;
      this.panStart  = { sx: e.clientX, sy: e.clientY, px: this.panX, py: this.panY };
      return;
    }
    if (this.editingId) { this.commitText(); return; }
    if (this.tool === 'select') {
      this.beginMarqueeSelection(p, e.shiftKey || e.ctrlKey || e.metaKey);
      this.cdr.markForCheck();
      return;
    }

    this.isDrawing = true;
    this.activeDrawTool = this.tool;
    this.startPt   = p;
    this.drawId    = this.uid();
    this.arrowStartShapeId = this.tool === 'arrow' ? this.shapeAtPoint(p)?.id ?? null : null;
    this.arrowStartAnchor = null;

    if (this.tool === 'pen') {
      this.drawPts = [p.x, p.y];
      const s = this.makeShape('pen', p.x, p.y, 0, 0);
      s.id = this.drawId; s.pts = this.drawPts;
      this.shapes = [...this.shapes, s];
    } else {
      // Create shape at click point immediately — size will update on mousemove
      const s = this.makeShape(this.tool, p.x, p.y, 1, 1);
      s.id = this.drawId;
      if (this.tool === 'arrow' && this.arrowStartShapeId) s.fromId = this.arrowStartShapeId;
      this.shapes = [...this.shapes, s];
    }
    this.cdr.markForCheck();
  }

  onShapeMouseDown(e: MouseEvent, shape: DrawShape) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (this.spaceDown) { this.onSvgMouseDown(e); return; }
    if (this.tool !== 'select') { this.onSvgMouseDown(e); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (this.isSelected(shape.id)) {
        this.setSelection(this.selectedIds.filter(id => id !== shape.id));
      } else {
        this.setSelection([...this.selectedIds, shape.id]);
      }
      this.cdr.markForCheck();
      return;
    } else if (!this.isSelected(shape.id)) {
      this.setSelection([shape.id]);
    } else {
      this.syncPrimarySelection(shape.id);
    }
    this.isDragging   = true;
    this.dragPt       = this.pt(e);
    this.dragOrig     = { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    this.captureDragOrigins();
    this.activeHandle = '';
    this.cdr.markForCheck();
  }

  onHandleMouseDown(e: MouseEvent, handle: string) {
    e.stopPropagation();
    if (!this.sel) return;
    this.activeHandle = handle;
    this.isDragging   = true;
    this.dragPt       = this.pt(e);
    this.dragOrig     = { x: this.sel.x, y: this.sel.y, w: this.sel.w, h: this.sel.h };
    this.captureDragOrigins([this.sel.id]);
  }

  onAnchorMouseDown(e: MouseEvent, shape: DrawShape, anchor: AnchorId) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (this.editingId) this.commitText();

    const start = this.anchorPoint(shape, anchor);
    const arrow = this.makeShape('arrow', start.x, start.y, 1, 1);
    arrow.id = this.uid();
    arrow.fromId = shape.id;
    arrow.fromAnchor = anchor;

    this.isDrawing = true;
    this.activeDrawTool = 'arrow';
    this.startPt = start;
    this.drawId = arrow.id;
    this.arrowStartShapeId = shape.id;
    this.arrowStartAnchor = anchor;
    this.clearSelection();
    this.shapes = [...this.shapes, arrow];
    this.cdr.markForCheck();
  }

  onMouseMove(e: MouseEvent) {
  if (this.isPanning) {
      const svg = this.svgRef.nativeElement;
      const r   = svg.getBoundingClientRect();
      this.panX = this.panStart.px - (e.clientX - this.panStart.sx) * (this.vw / this.zoom) / r.width;
      this.panY = this.panStart.py - (e.clientY - this.panStart.sy) * (this.vh / this.zoom) / r.height;
      this.alignmentGuides = [];
      this.cdr.markForCheck();
      return;
    }

    const p = this.pt(e);

    if (this.isMultiSelecting) {
      this.selectionRect = this.normalizeRect(this.selectionStart, p);
      this.alignmentGuides = [];
      this.cdr.markForCheck();
      return;
    }

    if (this.isDrawing) {
      const drawTool = this.activeDrawTool ?? this.tool;
      const idx = this.shapes.findIndex(s => s.id === this.drawId);
      if (idx < 0) return;

      if (drawTool === 'pen') {
        this.drawPts.push(p.x, p.y);
        const pts = [...this.drawPts];
        const xs  = pts.filter((_, i) => i % 2 === 0);
        const ys  = pts.filter((_, i) => i % 2 === 1);
        const nx  = Math.min(...xs); const ny = Math.min(...ys);
        const s   = { ...this.shapes[idx], pts, x: nx, y: ny, w: Math.max(...xs) - nx, h: Math.max(...ys) - ny };
        this.shapes = [...this.shapes.slice(0, idx), s, ...this.shapes.slice(idx + 1)];
      } else {
        let s = { ...this.shapes[idx] };
        if (drawTool === 'arrow') {
          const fromShape = s.fromId ? this.findShape(s.fromId) : null;
          const start = fromShape && s.fromAnchor ? this.anchorPoint(fromShape, s.fromAnchor) : fromShape ? this.edgePoint(fromShape, p) : this.startPt;
          s.x = start.x; s.y = start.y;
          s.w = p.x - start.x; s.h = p.y - start.y;
        } else if (drawTool === 'line') {
          s.x = this.startPt.x; s.y = this.startPt.y;
          s.w = p.x - this.startPt.x; s.h = p.y - this.startPt.y;
        } else {
          s.x = Math.min(this.startPt.x, p.x);
          s.y = Math.min(this.startPt.y, p.y);
          s.w = Math.max(MIN_SIZE, Math.abs(p.x - this.startPt.x));
          s.h = Math.max(MIN_SIZE, Math.abs(p.y - this.startPt.y));
        }
        this.shapes = [...this.shapes.slice(0, idx), s, ...this.shapes.slice(idx + 1)];
      }
      const created = this.shapes.find(shape => shape.id === this.drawId);
      this.alignmentGuides = created ? this.computeAlignmentGuides(this.selectionHandleBounds(created), new Set([created.id])) : [];
      this.cdr.markForCheck();
      return;
    }

    // drag / resize — only when mouse button is held (isDragging flag)
    if (!this.isDragging || !this.sel) return;

    const dx = p.x - this.dragPt.x;
    const dy = p.y - this.dragPt.y;

    if (!this.activeHandle && (this.selectedIds.length > 1 || this.sel.type === 'pen')) {
      this.moveSelectedBy(dx, dy);
      this.updateAlignmentGuidesForCurrentSelection();
    } else if (!this.activeHandle) {
      this.updateShape(this.sel.id, {
        x: this.dragOrig.x + dx,
        y: this.dragOrig.y + dy,
        fromId: this.sel.type === 'arrow' ? undefined : this.sel.fromId,
        toId: this.sel.type === 'arrow' ? undefined : this.sel.toId,
        fromAnchor: this.sel.type === 'arrow' ? undefined : this.sel.fromAnchor,
        toAnchor: this.sel.type === 'arrow' ? undefined : this.sel.toAnchor
      });
      const moved = this.findShape(this.sel.id);
      this.alignmentGuides = moved ? this.computeAlignmentGuides(this.selectionHandleBounds(moved), new Set([moved.id])) : [];
    } else if (this.sel.type === 'line') {
      if (this.activeHandle === 'line-start') {
        const endX = this.dragOrig.x + this.dragOrig.w;
        const endY = this.dragOrig.y + this.dragOrig.h;
        const x = this.dragOrig.x + dx;
        const y = this.dragOrig.y + dy;
        this.updateShape(this.sel.id, { x, y, w: endX - x, h: endY - y });
      } else if (this.activeHandle === 'line-end') {
        this.updateShape(this.sel.id, { w: this.dragOrig.w + dx, h: this.dragOrig.h + dy });
      }
      const resized = this.findShape(this.sel.id);
      this.alignmentGuides = resized ? this.computeAlignmentGuides(this.selectionHandleBounds(resized), new Set([resized.id])) : [];
    } else {
      let { x, y, w, h } = this.dragOrig;
      const hnd = this.activeHandle;
      if (hnd.includes('l')) { x += dx; w -= dx; }
      if (hnd.includes('r')) { w += dx; }
      if (hnd.includes('t')) { y += dy; h -= dy; }
      if (hnd.includes('b')) { h += dy; }
      if (w < MIN_SIZE) { if (hnd.includes('l')) x = this.dragOrig.x + this.dragOrig.w - MIN_SIZE; w = MIN_SIZE; }
      if (h < MIN_SIZE) { if (hnd.includes('t')) y = this.dragOrig.y + this.dragOrig.h - MIN_SIZE; h = MIN_SIZE; }
      this.updateShape(this.sel.id, { x, y, w, h });
      const resized = this.findShape(this.sel.id);
      this.alignmentGuides = resized ? this.computeAlignmentGuides(this.selectionHandleBounds(resized), new Set([resized.id])) : [];
    }
    this.cdr.markForCheck();
  }

  onMouseUp(e: MouseEvent) {
    const wasDragging  = this.isDragging;
    const wasDrawing   = this.isDrawing;
    const wasPanning   = this.isPanning;
    const wasSelecting = this.isMultiSelecting;
    this.isDragging    = false;
    this.isPanning     = false;
    this.isMultiSelecting = false;
    this.alignmentGuides = [];

    if (wasPanning) { this.cdr.markForCheck(); return; }

    if (wasSelecting) {
      this.finishMarqueeSelection();
      this.selectionRect = null;
      this.cdr.markForCheck();
      return;
    }

    if (wasDrawing) {
      const drawTool = this.activeDrawTool ?? this.tool;
      const s = this.shapes.find(s => s.id === this.drawId);
      const tooSmall = s
        ? (drawTool === 'pen'
          ? (s.pts?.length ?? 0) < 4
          : (drawTool === 'arrow' || drawTool === 'line')
            ? Math.hypot(s.w, s.h) <= MIN_SIZE
            : (s.w <= MIN_SIZE && s.h <= MIN_SIZE))
        : true;
      if (tooSmall) {
        this.shapes = this.shapes.filter(x => x.id !== this.drawId);
      } else if (s) {
        if (drawTool === 'arrow') {
          const end = this.pt(e);
          const targetAnchor = this.anchorAtPoint(end, s.id);
          const toShape = targetAnchor?.shape ?? this.shapeAtPoint(end, s.id);
          const fromShape = s.fromId ? this.findShape(s.fromId) : null;
          const start = fromShape && s.fromAnchor ? this.anchorPoint(fromShape, s.fromAnchor) : fromShape ? this.edgePoint(fromShape, toShape ? this.centerOf(toShape) : end) : { x: s.x, y: s.y };
          const finish = targetAnchor ? this.anchorPoint(targetAnchor.shape, targetAnchor.anchor) : toShape ? this.edgePoint(toShape, start) : end;
          this.updateShape(s.id, {
            toId: toShape?.id,
            toAnchor: targetAnchor?.anchor,
            x: start.x,
            y: start.y,
            w: finish.x - start.x,
            h: finish.y - start.y
          });
        }
        if (drawTool === 'text' || drawTool === 'sticky') {
          this.setSelection([s.id]);
          this.startEdit(s);
        } else {
          this.setSelection([s.id]);
        }
        this.pushHistory();
        this.scheduleSave();
      }
      this.isDrawing = false;
      this.drawId    = '';
      this.activeDrawTool = null;
      this.arrowStartShapeId = null;
      this.arrowStartAnchor = null;
      this.cdr.markForCheck();
      return;
    }

    if (wasDragging && this.sel) {
      const p  = this.pt(e);
      const dx = Math.abs(p.x - this.dragPt.x);
      const dy = Math.abs(p.y - this.dragPt.y);
      if (dx > 1 || dy > 1) {
        this.pushHistory();
        this.scheduleSave();
      }
    }
    this.activeHandle = '';
    this.dragOrigins.clear();
    this.cdr.markForCheck();
  }

  onShapeDblClick(e: MouseEvent, shape: DrawShape) {
    e.stopPropagation();
    // Permite escrever texto dentro de qualquer elemento (exceto caneta livre)
    if (shape.type === 'pen') return;
    this.setSelection([shape.id]);
    this.startEdit(shape);
  }

  // ── Text editing ──────────────────────────────────────────────────────────
  private startEdit(s: DrawShape) {
    this.editingId = s.id;
    this.recalcEditStyle(s);
    this.cdr.markForCheck();
    setTimeout(() => this.taRef?.nativeElement?.focus(), 30);
  }

  private recalcEditStyle(s: DrawShape) {
    const svg = this.svgRef.nativeElement;
    const r   = svg.getBoundingClientRect();
    const vb  = svg.viewBox.baseVal;
    const arrowBox = s.type === 'arrow' ? this.arrowBounds(s) : null;
    const x = arrowBox?.x ?? s.x;
    const y = arrowBox?.y ?? s.y;
    const w = arrowBox?.w ?? s.w;
    const h = arrowBox?.h ?? s.h;
    const sx  = r.left + (x - vb.x) / vb.width  * r.width;
    const sy  = r.top  + (y - vb.y) / vb.height * r.height;
    const sw  = w / vb.width  * r.width;
    const sh  = h / vb.height * r.height;
    const isArrow = s.type === 'arrow';
    this.editStyle = {
      position: 'fixed',
      top: `${isArrow ? sy + sh / 2 - 18 : sy}px`, left: `${isArrow ? sx + sw / 2 - 80 : sx}px`,
      width: `${isArrow ? 160 : sw}px`, height: `${isArrow ? 36 : sh}px`,
      fontSize: `${(s.fontSize || 16) * (r.width / vb.width)}px`,
      background: isArrow ? 'rgba(255,255,255,0.96)' : s.stickyBg || 'rgba(255,255,255,0.95)',
      color: s.stroke,
      border: '2px solid #3b82f6',
      borderRadius: '4px',
      padding: '4px',
      resize: 'none',
      outline: 'none',
      overflow: 'hidden',
      zIndex: '9999',
      boxSizing: 'border-box',
    };
  }

  commitText() {
    const s = this.shapes.find(s => s.id === this.editingId);
    if (s && this.taRef?.nativeElement) {
      this.updateShape(s.id, { text: this.taRef.nativeElement.value });
      this.pushHistory();
      this.scheduleSave();
    }
    this.editingId = null;
    this.cdr.markForCheck();
  }

  // ── Shape helpers ─────────────────────────────────────────────────────────
  private makeShape(type: Tool, x: number, y: number, w: number, h: number): DrawShape {
    return {
      id: this.uid(), type,
      x, y, w: w || 120, h: h || (type === 'text' ? 40 : type === 'sticky' ? 120 : 80),
      stroke: this.strokeColor,
      fill:   type === 'rect' || type === 'ellipse' ? this.fillColor : 'transparent',
      lw:     this.lineWidth,
      opacity: this.opacity,
      text:   '',
      fontSize: this.fontSize,
      stickyBg: type === 'sticky' ? this.stickyBg : undefined,
      pts:    type === 'pen' ? [] : undefined,
    };
  }

  private updateShape(id: string, patch: Partial<DrawShape>) {
    const idx = this.shapes.findIndex(s => s.id === id);
    if (idx < 0) return;
    this.shapes = [
      ...this.shapes.slice(0, idx),
      { ...this.shapes[idx], ...patch },
      ...this.shapes.slice(idx + 1)
    ];
  }

  private setSelection(ids: string[]) {
    const expanded = this.expandGroups(ids);
    const validIds = expanded.filter((id, index, arr) => arr.indexOf(id) === index && this.shapes.some(s => s.id === id));
    this.selectedIds = validIds;
    this.selectedId = validIds.length ? validIds[validIds.length - 1] : null;
  }

  // Expande a seleção para incluir todos os membros dos grupos selecionados
  private expandGroups(ids: string[]): string[] {
    const groups = new Set<string>();
    for (const id of ids) {
      const s = this.shapes.find(sh => sh.id === id);
      if (s?.groupId) groups.add(s.groupId);
    }
    if (!groups.size) return ids;
    const result = [...ids];
    for (const s of this.shapes) {
      if (s.groupId && groups.has(s.groupId) && !result.includes(s.id)) result.push(s.id);
    }
    return result;
  }

  private syncPrimarySelection(id: string) {
    if (!this.isSelected(id)) this.selectedIds = [...this.selectedIds, id];
    this.selectedId = id;
  }

  private clearSelection() {
    this.selectedId = null;
    this.selectedIds = [];
    this.alignmentGuides = [];
  }

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  // ── Agrupar / desagrupar ──────────────────────────────────────────────────
  canvasContextMenu: CanvasContextMenu | null = null;

  onCanvasContextMenu(e: MouseEvent) {
    const p = this.pt(e);
    const hit = this.shapeAtPoint(p);
    // Se clicou sobre uma forma que não está selecionada, seleciona-a (e seu grupo)
    if (hit && !this.isSelected(hit.id)) {
      this.setSelection([hit.id]);
    }
    if (!this.selectedIds.length) { this.canvasContextMenu = null; return; }
    e.preventDefault();
    e.stopPropagation();
    this.canvasContextMenu = { x: e.clientX, y: e.clientY };
    this.cdr.markForCheck();
  }

  closeCanvasContextMenu() {
    if (this.canvasContextMenu) {
      this.canvasContextMenu = null;
      this.cdr.markForCheck();
    }
  }

  canGroup(): boolean {
    // pode agrupar se há 2+ formas e elas não formam já um único grupo
    if (this.selectedIds.length < 2) return false;
    const groupIds = new Set(this.selectedShapes().map(s => s.groupId || ''));
    return !(groupIds.size === 1 && !groupIds.has(''));
  }

  canUngroup(): boolean {
    return this.selectedShapes().some(s => !!s.groupId);
  }

  groupSelection() {
    if (!this.canGroup()) return;
    const gid = this.uid();
    for (const id of this.selectedIds) {
      this.updateShape(id, { groupId: gid });
    }
    this.closeCanvasContextMenu();
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  ungroupSelection() {
    if (!this.canUngroup()) return;
    for (const id of this.selectedIds) {
      this.updateShape(id, { groupId: undefined });
    }
    this.closeCanvasContextMenu();
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  private beginMarqueeSelection(point: Point, additive = false) {
    if (this.editingId) this.commitText();
    this.isMultiSelecting = true;
    this.selectionAdditive = additive;
    this.selectionBaseIds = additive ? [...this.selectedIds] : [];
    this.selectionStart = point;
    this.selectionRect = { x: point.x, y: point.y, w: 0, h: 0 };
  }

  private finishMarqueeSelection() {
    if (!this.selectionRect || (this.selectionRect.w < 3 && this.selectionRect.h < 3)) {
      if (!this.selectionAdditive) this.clearSelection();
      this.selectionAdditive = false;
      this.selectionBaseIds = [];
      return;
    }
    const selected = this.shapes
      .filter(shape => this.rectsIntersect(this.selectionHandleBounds(shape), this.selectionRect!))
      .map(shape => shape.id);
    this.setSelection(this.selectionAdditive ? [...this.selectionBaseIds, ...selected] : selected);
    this.selectionAdditive = false;
    this.selectionBaseIds = [];
  }

  private normalizeRect(a: Point, b: Point): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  private rectsIntersect(a: Rect, b: Rect): boolean {
    return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
  }

  private captureDragOrigins(ids = this.selectedIds) {
    this.dragOrigins.clear();
    for (const id of ids) {
      const shape = this.findShape(id);
      if (!shape) continue;
      this.dragOrigins.set(id, {
        x: shape.x,
        y: shape.y,
        w: shape.w,
        h: shape.h,
        pts: shape.pts ? [...shape.pts] : undefined
      });
    }
  }

  private moveSelectedBy(dx: number, dy: number) {
    const ids = new Set(this.selectedIds.length ? this.selectedIds : this.selectedId ? [this.selectedId] : []);
    this.shapes = this.shapes.map(shape => {
      if (!ids.has(shape.id)) return shape;
      const origin = this.dragOrigins.get(shape.id);
      if (!origin) return shape;
      return {
        ...shape,
        x: origin.x + dx,
        y: origin.y + dy,
        pts: origin.pts ? origin.pts.map((value, index) => value + (index % 2 === 0 ? dx : dy)) : shape.pts
      };
    });
  }

  private updateAlignmentGuidesForCurrentSelection() {
    const selected = this.selectedShapes();
    if (!selected.length && this.sel) selected.push(this.sel);
    if (!selected.length) {
      this.alignmentGuides = [];
      return;
    }
    const bounds = selected.map(shape => this.selectionHandleBounds(shape));
    const minX = Math.min(...bounds.map(b => b.x));
    const minY = Math.min(...bounds.map(b => b.y));
    const maxX = Math.max(...bounds.map(b => b.x + b.w));
    const maxY = Math.max(...bounds.map(b => b.y + b.h));
    this.alignmentGuides = this.computeAlignmentGuides(
      { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      new Set(selected.map(shape => shape.id))
    );
  }

  private computeAlignmentGuides(activeBounds: Rect, activeIds: Set<string>): AlignmentGuide[] {
    const tolerance = 2.5 / Math.max(this.zoom, 0.25);
    const activeX = [activeBounds.x, activeBounds.x + activeBounds.w / 2, activeBounds.x + activeBounds.w];
    const activeY = [activeBounds.y, activeBounds.y + activeBounds.h / 2, activeBounds.y + activeBounds.h];
    const guides: AlignmentGuide[] = [];
    for (const shape of this.shapes) {
      if (activeIds.has(shape.id)) continue;
      const bounds = this.selectionHandleBounds(shape);
      const targetX = [bounds.x, bounds.x + bounds.w / 2, bounds.x + bounds.w];
      const targetY = [bounds.y, bounds.y + bounds.h / 2, bounds.y + bounds.h];
      for (const value of activeX) {
        const match = targetX.find(target => Math.abs(target - value) <= tolerance);
        if (match !== undefined) {
          guides.push({
            axis: 'x',
            value: match,
            from: Math.min(activeBounds.y, bounds.y) - 40,
            to: Math.max(activeBounds.y + activeBounds.h, bounds.y + bounds.h) + 40
          });
          break;
        }
      }
      for (const value of activeY) {
        const match = targetY.find(target => Math.abs(target - value) <= tolerance);
        if (match !== undefined) {
          guides.push({
            axis: 'y',
            value: match,
            from: Math.min(activeBounds.x, bounds.x) - 40,
            to: Math.max(activeBounds.x + activeBounds.w, bounds.x + bounds.w) + 40
          });
          break;
        }
      }
      if (guides.length >= 2) break;
    }
    return guides;
  }

  selectedShapes(): DrawShape[] {
    const ids = new Set(this.selectedIds);
    return this.shapes.filter(shape => ids.has(shape.id));
  }

  selectionBounds(): Rect | null {
    const selected = this.selectedShapes();
    if (selected.length <= 1) return null;
    const bounds = selected.map(shape => this.shapeBounds(shape));
    const minX = Math.min(...bounds.map(b => b.x));
    const minY = Math.min(...bounds.map(b => b.y));
    const maxX = Math.max(...bounds.map(b => b.x + b.w));
    const maxY = Math.max(...bounds.map(b => b.y + b.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  selectionHandleBounds(s: DrawShape): Rect {
    if (s.type === 'arrow') return this.arrowBounds(s);
    if (s.type === 'line') return this.lineBounds(s);
    return this.shapeBounds(s);
  }

  deleteSelected() {
    const deletingIds = this.selectedIds.length ? this.selectedIds : this.selectedId ? [this.selectedId] : [];
    if (!deletingIds.length) return;
    const deleting = new Set(deletingIds);
    this.shapes = this.shapes.filter(s => !deleting.has(s.id) && !deleting.has(s.fromId || '') && !deleting.has(s.toId || ''));
    this.clearSelection();
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  duplicateSelected() {
    const selected = this.selectedShapes();
    if (!selected.length && this.sel) selected.push(this.sel);
    if (!selected.length) return;
    const copies = selected.map(shape => ({
      ...shape,
      id: this.uid(),
      x: shape.x + 20,
      y: shape.y + 20,
      fromId: undefined,
      toId: undefined,
      fromAnchor: undefined,
      toAnchor: undefined,
      pts: shape.pts ? shape.pts.map((value, index) => value + (index % 2 === 0 ? 20 : 20)) : undefined
    }));
    this.shapes = [...this.shapes, ...copies];
    this.setSelection(copies.map(copy => copy.id));
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  bringForward() {
    const idx = this.shapes.findIndex(s => s.id === this.selectedId);
    if (idx < 0 || idx === this.shapes.length - 1) return;
    const arr = [...this.shapes];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    this.shapes = arr;
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  sendBackward() {
    const idx = this.shapes.findIndex(s => s.id === this.selectedId);
    if (idx <= 0) return;
    const arr = [...this.shapes];
    [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
    this.shapes = arr;
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  clearCanvas() {
    this.shapes     = [];
    this.clearSelection();
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  // ── Prop updates (when props panel changes) ───────────────────────────────
  updateSelProp(patch: Partial<DrawShape>) {
    if (!this.sel) return;
    this.updateShape(this.sel.id, patch);
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  // ── SVG path generators ───────────────────────────────────────────────────
  penPath(pts: number[] | undefined): string {
    if (!pts || pts.length < 4) return pts ? `M${pts[0]} ${pts[1]}` : '';
    let d = `M${pts[0]} ${pts[1]}`;
    for (let i = 2; i < pts.length - 2; i += 2) {
      const mx = (pts[i] + pts[i + 2]) / 2;
      const my = (pts[i + 1] + pts[i + 3]) / 2;
      d += ` Q${pts[i]} ${pts[i + 1]} ${mx} ${my}`;
    }
    d += ` L${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
    return d;
  }

  arrowPath(s: DrawShape): string {
    const { start, end } = this.arrowEndpoints(s);
    const w = end.x - start.x; const h = end.y - start.y;
    const len = Math.sqrt(w * w + h * h);
    if (len < 1) return '';
    const ux = w / len; const uy = h / len;
    const hw = Math.max(8, s.lw * 3); const hl = Math.max(12, s.lw * 5);
    const bx = end.x - ux * hl; const by = end.y - uy * hl;
    const px = -uy * hw / 2; const py = ux * hw / 2;
    return `M${start.x} ${start.y} L${end.x} ${end.y} M${bx + px} ${by + py} L${end.x} ${end.y} L${bx - px} ${by - py}`;
  }

  arrowHitPath(s: DrawShape): string {
    const { start, end } = this.arrowEndpoints(s);
    return `M${start.x} ${start.y} L${end.x} ${end.y}`;
  }

  arrowLabelPoint(s: DrawShape): Point {
    const { start, end } = this.arrowEndpoints(s);
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }

  arrowBounds(s: DrawShape): { x: number; y: number; w: number; h: number } {
    const { start, end } = this.arrowEndpoints(s);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    return { x, y, w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
  }

  lineBounds(s: DrawShape): { x: number; y: number; w: number; h: number } {
    const x = Math.min(s.x, s.x + s.w);
    const y = Math.min(s.y, s.y + s.h);
    return { x, y, w: Math.abs(s.w), h: Math.abs(s.h) };
  }

  lineHandleX(handle: 'line-start' | 'line-end', s: DrawShape): number {
    return (handle === 'line-start' ? s.x : s.x + s.w) - HANDLE_SIZE / 2;
  }

  lineHandleY(handle: 'line-start' | 'line-end', s: DrawShape): number {
    return (handle === 'line-start' ? s.y : s.y + s.h) - HANDLE_SIZE / 2;
  }

  arrowEndpoints(s: DrawShape): { start: Point; end: Point } {
    const fromShape = s.fromId ? this.findShape(s.fromId) : null;
    const toShape = s.toId ? this.findShape(s.toId) : null;
    const freeStart = { x: s.x, y: s.y };
    const freeEnd = { x: s.x + s.w, y: s.y + s.h };

    if (fromShape && toShape) {
      const fromCenter = this.centerOf(fromShape);
      const toCenter = this.centerOf(toShape);
      const start = s.fromAnchor ? this.anchorPoint(fromShape, s.fromAnchor) : this.edgePoint(fromShape, toCenter);
      const end = s.toAnchor ? this.anchorPoint(toShape, s.toAnchor) : this.edgePoint(toShape, fromCenter);
      return { start, end };
    }

    if (fromShape) {
      const start = s.fromAnchor ? this.anchorPoint(fromShape, s.fromAnchor) : this.edgePoint(fromShape, freeEnd);
      return { start, end: freeEnd };
    }

    if (toShape) {
      const end = s.toAnchor ? this.anchorPoint(toShape, s.toAnchor) : this.edgePoint(toShape, freeStart);
      return { start: freeStart, end };
    }

    return { start: freeStart, end: freeEnd };
  }

  updateArrowLabel(value: string) {
    if (this.sel?.type !== 'arrow') return;
    this.updateSelProp({ text: value });
  }

  private findShape(id: string): DrawShape | null {
    return this.shapes.find(s => s.id === id) ?? null;
  }

  connectableShapes(): DrawShape[] {
    return this.shapes.filter(s => s.type !== 'arrow' && s.type !== 'line');
  }

  anchorIds(): AnchorId[] {
    return ['top', 'right', 'bottom', 'left'];
  }

  anchorPoint(s: DrawShape, anchor: AnchorId): Point {
    const bounds = this.shapeBounds(s);
    if (anchor === 'top') return { x: bounds.x + bounds.w / 2, y: bounds.y };
    if (anchor === 'right') return { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 };
    if (anchor === 'bottom') return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h };
    return { x: bounds.x, y: bounds.y + bounds.h / 2 };
  }

  anchorCursor(anchor: AnchorId): string {
    return anchor === 'top' || anchor === 'bottom' ? 'ns-resize' : 'ew-resize';
  }

  private shapeAtPoint(p: Point, excludeId?: string): DrawShape | null {
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      if (s.id === excludeId || s.type === 'arrow' || s.type === 'line') continue;
      const bounds = this.shapeBounds(s);
      if (p.x >= bounds.x && p.x <= bounds.x + bounds.w && p.y >= bounds.y && p.y <= bounds.y + bounds.h) return s;
    }
    return null;
  }

  private anchorAtPoint(p: Point, excludeId?: string): { shape: DrawShape; anchor: AnchorId } | null {
    const radius = 12 / Math.max(this.zoom, 0.2);
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const shape = this.shapes[i];
      if (shape.id === excludeId || shape.type === 'arrow' || shape.type === 'line') continue;
      for (const anchor of this.anchorIds()) {
        const point = this.anchorPoint(shape, anchor);
        if (Math.hypot(point.x - p.x, point.y - p.y) <= radius) return { shape, anchor };
      }
    }
    return null;
  }

  private centerOf(s: DrawShape): Point {
    const bounds = this.shapeBounds(s);
    return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
  }

  private edgePoint(s: DrawShape, target: Point): Point {
    const bounds = this.shapeBounds(s);
    const center = { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 };
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (dx === 0 && dy === 0) return center;

    const halfW = Math.max(1, Math.abs(bounds.w) / 2);
    const halfH = Math.max(1, Math.abs(bounds.h) / 2);
    const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
    return { x: center.x + dx * scale, y: center.y + dy * scale };
  }

  private shapeBounds(s: DrawShape): { x: number; y: number; w: number; h: number } {
    if (s.type === 'pen' && s.pts?.length) {
      const xs = s.pts.filter((_, i) => i % 2 === 0);
      const ys = s.pts.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(1, Math.max(...xs) - minX), h: Math.max(1, Math.max(...ys) - minY) };
    }
    return { x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
  }

  stickyLines(s: DrawShape): string[] {
    const txt = s.text || '';
    if (!txt) return [];
    const fs = s.fontSize || 14;
    const cw = Math.max(1, Math.floor(s.w / (fs * 0.6)));
    const words = txt.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > cw) { if (cur) lines.push(cur); cur = w; }
      else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Texto centralizado dentro de formas geométricas
  shapeTextLines(s: DrawShape): string[] {
    const txt = s.text || '';
    if (!txt) return [];
    const fs = s.fontSize || 14;
    const cw = Math.max(1, Math.floor(Math.abs(s.w) / (fs * 0.62)));
    const lines: string[] = [];
    for (const rawLine of txt.split('\n')) {
      const words = rawLine.split(' ');
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length > cw) { if (cur) lines.push(cur); cur = w; }
        else cur = cur ? cur + ' ' + w : w;
      }
      lines.push(cur);
    }
    return lines;
  }

  shapeTextY(s: DrawShape, index: number, total: number): number {
    const fs = s.fontSize || 14;
    const cy = Math.min(s.y, s.y + s.h) + Math.abs(s.h) / 2;
    const offset = (index - (total - 1) / 2) * (fs * 1.2);
    return cy + offset + fs * 0.34;
  }

  shapeCenterX(s: DrawShape): number {
    return Math.min(s.x, s.x + s.w) + Math.abs(s.w) / 2;
  }

  // ── Geometric shape path generators ──────────────────────────────────────
  trianglePts(s: DrawShape): string {
    return `${s.x + s.w / 2},${s.y} ${s.x + s.w},${s.y + s.h} ${s.x},${s.y + s.h}`;
  }

  diamondPts(s: DrawShape): string {
    return `${s.x + s.w / 2},${s.y} ${s.x + s.w},${s.y + s.h / 2} ${s.x + s.w / 2},${s.y + s.h} ${s.x},${s.y + s.h / 2}`;
  }

  starPts(s: DrawShape): string {
    const cx = s.x + s.w / 2; const cy = s.y + s.h / 2;
    const ro = Math.min(s.w, s.h) / 2; const ri = ro * 0.42;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? ro : ri;
      const a = (Math.PI * i / 5) - Math.PI / 2;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    return pts.join(' ');
  }

  // ── History ───────────────────────────────────────────────────────────────
  private resetHistory() {
    this.history    = [JSON.stringify(this.shapes)];
    this.historyIdx = 0;
  }

  private pushHistory() {
    this.history    = [...this.history.slice(0, this.historyIdx + 1), JSON.stringify(this.shapes)];
    this.historyIdx = this.history.length - 1;
    if (this.history.length > 50) {
      this.history.shift();
      this.historyIdx--;
    }
  }

  undo() {
    if (this.historyIdx <= 0) return;
    this.historyIdx--;
    this.shapes     = JSON.parse(this.history[this.historyIdx]);
    this.clearSelection();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  redo() {
    if (this.historyIdx >= this.history.length - 1) return;
    this.historyIdx++;
    this.shapes     = JSON.parse(this.history[this.historyIdx]);
    this.clearSelection();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  get canUndo() { return this.historyIdx > 0; }
  get canRedo() { return this.historyIdx < this.history.length - 1; }

  // ── Export ────────────────────────────────────────────────────────────────
  // Monta um SVG limpo contendo apenas as formas (sem grade, âncoras, seleção),
  // recortado no bounding box do conteúdo — usado por PNG e SVG.
  private buildCleanSvg(padding = 24): { serial: string; width: number; height: number } | null {
    const layer = this.shapesLayerRef?.nativeElement;
    if (!layer || !this.shapes.length) return null;

    let box: { x: number; y: number; width: number; height: number };
    try {
      const bb = layer.getBBox();
      box = { x: bb.x, y: bb.y, width: bb.width, height: bb.height };
    } catch {
      return null;
    }
    if (box.width <= 0 || box.height <= 0) return null;

    const x = box.x - padding;
    const y = box.y - padding;
    const w = box.width  + padding * 2;
    const h = box.height + padding * 2;

    const svgNs = 'http://www.w3.org/2000/svg';
    const out = document.createElementNS(svgNs, 'svg');
    out.setAttribute('xmlns', svgNs);
    out.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    out.setAttribute('width', String(w));
    out.setAttribute('height', String(h));

    // Fundo
    const bg = document.createElementNS(svgNs, 'rect');
    bg.setAttribute('x', String(x));
    bg.setAttribute('y', String(y));
    bg.setAttribute('width', String(w));
    bg.setAttribute('height', String(h));
    bg.setAttribute('fill', this.background || '#ffffff');
    out.appendChild(bg);

    // Apenas a camada de formas (clonada, sem handlers/UI)
    out.appendChild(layer.cloneNode(true));

    return { serial: new XMLSerializer().serializeToString(out), width: w, height: h };
  }

  exportPng() {
    const clean = this.buildCleanSvg();
    if (!clean) { this.toast.show('Nada para exportar.', 'info', 3000); return; }
    const blob = new Blob([clean.serial], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      const scale   = 2;
      const canvas  = document.createElement('canvas');
      canvas.width  = clean.width  * scale;
      canvas.height = clean.height * scale;
      const ctx     = canvas.getContext('2d')!;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.drawImage(img, 0, 0, clean.width, clean.height);
      URL.revokeObjectURL(url);
      const a  = document.createElement('a');
      a.href   = canvas.toDataURL('image/png');
      a.download = `${this.current?.nome || 'desenho'}.png`;
      a.click();
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.toast.show('Falha ao gerar PNG.', 'error', 4000); };
    img.src = url;
  }

  exportSvg() {
    const clean = this.buildCleanSvg();
    if (!clean) { this.toast.show('Nada para exportar.', 'info', 3000); return; }
    const blob = new Blob([clean.serial], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.current?.nome || 'desenho'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Export / Import JSON ──────────────────────────────────────────────────
  exportJson() {
    if (!this.current) return;
    const payload = {
      nome:       this.current.nome,
      data:       this.current.data,
      exportedAt: new Date().toISOString(),
      source:     'planner-drawing'
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${this.current.nome || 'desenho'}.planner-drawing.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.show(`Desenho "${this.current.nome}" exportado.`, 'success', 3000);
  }

  importJson() {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json,.planner-drawing.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file || !this.token) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (parsed.source !== 'planner-drawing' || !parsed.data) {
            this.toast.show('Arquivo inválido. Use um arquivo .planner-drawing.json.', 'error', 5000);
            return;
          }
          const nome = parsed.nome || file.name.replace(/\.planner-drawing\.json$/, '').replace(/\.json$/, '');
          this.api.createDrawing(this.token, nome).subscribe({
            next: (d: any) => {
              this.api.updateDrawing(this.token, d.id, nome, parsed.data).subscribe({
                next: (updated: any) => {
                  this.drawings = [updated, ...this.drawings];
                  this.open(updated);
                  this.toast.show(`Desenho "${nome}" importado.`, 'success', 4000);
                  this.cdr.markForCheck();
                }
              });
            }
          });
        } catch {
          this.toast.show('Erro ao ler o arquivo JSON.', 'error', 5000);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  @HostListener('keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || this.editingId) {
      if (e.key === ' ') return; // allow space in inputs
      // still handle Escape
      if (e.key === 'Escape') { this.editingId && this.commitText(); }
      return;
    }

    // ── Pan ──
    if (e.key === ' ') { e.preventDefault(); this.spaceDown = true; return; }

    // ── History ──
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }

    // ── Selection actions ──
    if ((e.key === 'Delete' || e.key === 'Backspace') && (this.selectedId || this.selectedIds.length)) { e.preventDefault(); this.deleteSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); this.duplicateSelected(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); this.selectAll(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G') && e.shiftKey) { e.preventDefault(); this.ungroupSelection(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); this.groupSelection(); return; }
    if (e.key === 'Escape') { this.clearSelection(); this.showColorModal = false; this.showShortcuts = false; this.closeDrawingContextMenu(); this.closeCanvasContextMenu(); this.cdr.markForCheck(); return; }

    // ── Tool shortcuts ──
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const toolMap: Record<string, Tool> = {
        v: 'select', s: 'select',
        p: 'pen',
        r: 'rect',
        e: 'ellipse', o: 'ellipse',
        a: 'arrow',
        l: 'line',
        t: 'text',
        n: 'sticky',
      };
      const tool = toolMap[e.key.toLowerCase()];
      if (tool) { e.preventDefault(); this.setTool(tool); return; }
    }

    // ── Zoom ──
    if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomIn(); return; }
    if (e.key === '-')                   { e.preventDefault(); this.zoomOut(); return; }
    if (e.key === '0')                   { e.preventDefault(); this.resetZoom(); return; }
    if (e.key === 'f' || e.key === 'F')  { e.preventDefault(); this.fitContent(); return; }

    // ── Arrow-key nudge ──
    if ((this.selectedIds.length || this.sel) && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
      this.captureDragOrigins(this.selectedIds.length ? this.selectedIds : this.sel ? [this.sel.id] : []);
      this.moveSelectedBy(dx, dy);
      this.dragOrigins.clear();
      this.scheduleSave();
      this.cdr.markForCheck();
    }
  }

  @HostListener('keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    if (e.key === ' ') this.spaceDown = false;
  }

  selectAll() {
    if (!this.shapes.length) return;
    this.setTool('select');
    this.setSelection(this.shapes.map(shape => shape.id));
    this.cdr.markForCheck();
  }

  // ── UI helpers ────────────────────────────────────────────────────────────
  setTool(t: Tool) {
    this.tool = t;
    if (t !== 'select') this.clearSelection();
  }

  zoomIn()  { this.zoom = Math.min(8, this.zoom + 0.1); this.cdr.markForCheck(); }
  zoomOut() { this.zoom = Math.max(0.1, this.zoom - 0.1); this.cdr.markForCheck(); }

  toolLabel(t: Tool): string {
    const m: Record<Tool, string> = {
      select: 'Selecionar (V)', pen: 'Caneta (P)', rect: 'Retângulo (R)',
      ellipse: 'Elipse (E)', arrow: 'Seta (A)', text: 'Texto (T)', sticky: 'Nota (S)',
      line: 'Linha (L)', triangle: 'Triângulo', diamond: 'Losango', star: 'Estrela',
      image: 'Imagem'
    };
    return m[t];
  }

  // ── Upload de imagem ────────────────────────────────────────────────────────
  addImage() {
    if (!this.current) return;
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.toast.show('Selecione um arquivo de imagem.', 'error', 4000);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 400;
          let w = img.naturalWidth  || 300;
          let h = img.naturalHeight || 200;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          // Centraliza na área visível atual do canvas.
          const cx = this.panX + (this.vw / this.zoom) / 2;
          const cy = this.panY + (this.vh / this.zoom) / 2;
          const shape = this.makeShape('image', cx - w / 2, cy - h / 2, w, h);
          shape.src  = src;
          shape.fill = 'transparent';
          this.shapes = [...this.shapes, shape];
          this.setTool('select');
          this.setSelection([shape.id]);
          this.pushHistory();
          this.scheduleSave();
          this.cdr.markForCheck();
        };
        img.onerror = () => this.toast.show('Falha ao carregar a imagem.', 'error', 4000);
        img.src = src;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  svgCursor(): string {
    if (this.spaceDown || this.isPanning) return 'grabbing';
    if (this.tool === 'select') return 'default';
    return 'crosshair';
  }
}
