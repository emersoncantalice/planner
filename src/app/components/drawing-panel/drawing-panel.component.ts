import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef,
  HostListener, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlannerApiService } from '../../core/planner-api.service';
import { ToastService } from '../../core/toast.service';
import { uid as genUid } from '../../core/uid';

export type Tool =
  | 'select' | 'pen' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'sticky' | 'line' | 'image'
  // Formas geométricas (desenhadas por path — ver shapePathFor)
  | 'triangle' | 'diamond' | 'star' | 'roundRect' | 'rightTriangle'
  | 'pentagon' | 'hexagon' | 'octagon' | 'trapezoid' | 'parallelogram'
  | 'cross' | 'chevron' | 'arrowBlock' | 'cylinder' | 'cloud'
  | 'speech' | 'heart' | 'document'
  // Componentes de arquitetura (ver archPathFor)
  | 'archZone' | 'archUser' | 'archBrowser' | 'archMobile' | 'archServer'
  | 'archComponent' | 'archDatabase' | 'archStorage' | 'archQueue' | 'archCache'
  | 'archApi' | 'archBalancer' | 'archFirewall' | 'archNetwork' | 'archFunction';
/**
 * Pontos de conexão de uma forma. Os quatro primeiros são os originais (e os
 * únicos gravados em desenhos antigos); os demais dão mais destinos para a seta.
 */
type AnchorId =
  | 'top' | 'right' | 'bottom' | 'left'
  | 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'
  | 'topQ1' | 'topQ3' | 'rightQ1' | 'rightQ3'
  | 'bottomQ1' | 'bottomQ3' | 'leftQ1' | 'leftQ3';

/** Posição de cada âncora como fração da caixa da forma. */
const ANCHOR_FRACTIONS: Record<AnchorId, { fx: number; fy: number }> = {
  top:         { fx: 0.5,  fy: 0    },
  right:       { fx: 1,    fy: 0.5  },
  bottom:      { fx: 0.5,  fy: 1    },
  left:        { fx: 0,    fy: 0.5  },
  topLeft:     { fx: 0,    fy: 0    },
  topRight:    { fx: 1,    fy: 0    },
  bottomRight: { fx: 1,    fy: 1    },
  bottomLeft:  { fx: 0,    fy: 1    },
  topQ1:       { fx: 0.25, fy: 0    },
  topQ3:       { fx: 0.75, fy: 0    },
  rightQ1:     { fx: 1,    fy: 0.25 },
  rightQ3:     { fx: 1,    fy: 0.75 },
  bottomQ1:    { fx: 0.25, fy: 1    },
  bottomQ3:    { fx: 0.75, fy: 1    },
  leftQ1:      { fx: 0,    fy: 0.25 },
  leftQ3:      { fx: 0,    fy: 0.75 },
};

/** Sempre visíveis; as demais aparecem na forma sob o cursor. */
const PRIMARY_ANCHORS: AnchorId[] = ['top', 'right', 'bottom', 'left'];
const ALL_ANCHORS = Object.keys(ANCHOR_FRACTIONS) as AnchorId[];

export type TextAlign  = 'left' | 'center' | 'right';
export type TextVAlign = 'top' | 'middle' | 'bottom';
export type DashStyle = 'solid' | 'dashed' | 'dotted';

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
  italic?: boolean;
  fontFamily?: string;
  align?: TextAlign;    // alinhamento horizontal do texto na caixa
  valign?: TextVAlign;  // alinhamento vertical do texto na caixa
  dash?: DashStyle;
  rot?: number;        // graus, rotação em torno do centro
  locked?: boolean;    // posição/tamanho travados
  stickyBg?: string;
  groupId?: string;
  src?: string;        // data URL for image shapes
  linkTabId?: string;  // navigates to this tab when its link badge is clicked
}

export type PropSection = 'estilo' | 'texto' | 'elemento' | 'alinhar' | 'pagina';

interface TabView { zoom: number; panX: number; panY: number; }
interface DrawingTab { id: string; nome: string; shapes: DrawShape[]; background: string; view?: TabView; }
interface DrawingRecord { id: string; nome: string; data: string; pasta?: string; atualizadoEm?: string; }
interface Point { x: number; y: number; }
interface Rect { x: number; y: number; w: number; h: number; }
interface DragOrigin extends Rect { pts?: number[]; }
/** Nó da árvore de pastas montada a partir dos caminhos (`pasta`) dos desenhos. */
interface DrawingFolderGroup {
  path: string;          // caminho completo, ex: 'Arquitetura/API'
  label: string;         // só o último segmento, ex: 'API'
  depth: number;         // nível de indentação
  drawings: DrawingRecord[];  // desenhos diretamente nesta pasta
  total: number;         // desenhos nesta pasta e em todas as subpastas
  hasChildren: boolean;
}
interface CanvasContextMenu { x: number; y: number; }
interface DrawingContextMenu { drawing: DrawingRecord; x: number; y: number; }
interface FolderContextMenu { path: string; x: number; y: number; }
interface AlignmentGuide { axis: 'x' | 'y'; value: number; from: number; to: number; }

const HANDLE_SIZE = 8;
const MIN_SIZE    = 10;

/** Formas geométricas desenhadas por um único <path> (ver shapePathFor). */
const GEO_SHAPES: Tool[] = [
  'triangle', 'rightTriangle', 'diamond', 'roundRect', 'pentagon', 'hexagon', 'octagon',
  'trapezoid', 'parallelogram', 'star', 'cross', 'chevron', 'arrowBlock',
  'cylinder', 'cloud', 'speech', 'heart', 'document'
];

/**
 * Componentes de diagrama de arquitetura: um glifo no topo da caixa e o rótulo
 * logo abaixo (ver archPathFor / TEXT_OFFSET).
 */
const ARCH_SHAPES: Tool[] = [
  'archZone', 'archUser', 'archBrowser', 'archMobile', 'archServer',
  'archComponent', 'archDatabase', 'archStorage', 'archQueue', 'archCache',
  'archApi', 'archBalancer', 'archFirewall', 'archNetwork', 'archFunction'
];

const PATH_SHAPES: Tool[] = [...GEO_SHAPES, ...ARCH_SHAPES];

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
  /**
   * Pastas criadas pelo usuário. O backend só guarda o caminho (`pasta`) de cada
   * desenho, então uma pasta vazia — recém-criada — só existe aqui; fica no
   * localStorage para sobreviver ao reload.
   */
  customFolders: Set<string> = this.loadCustomFolders();
  folderContextMenu: FolderContextMenu | null = null;
  /** Caminho da pasta cujo campo "nova subpasta" está aberto no menu. */
  subfolderParent: string | null = null;
  subfolderName   = '';
  renamingFolder  = '';
  folderRenameVal = '';
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
  /** Q: mantém a ferramenta ativa após criar um elemento (padrão: volta para Selecionar). */
  lockTool    = false;
  zoom        = 1;
  panX        = 0;
  panY        = 0;
  vw  = 1200;
  vh  = 800;
  gridEnabled = true;
  snapEnabled = false;
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
  /** Última posição do ponteiro em coordenadas do canvas (usada para colar no cursor). */
  private lastPt      = { x: 0, y: 0 };
  private pointerInside = false;
  /** Forma sob o cursor: revela o conjunto completo de âncoras só onde importa. */
  hoverShapeId: string | null = null;
  /** Mostrar medidas (largura/altura/posição) enquanto se desenha ou move. */
  showMeasures = true;
  /** Mostrar os pontos de ancoragem das formas (destinos da seta). */
  showAnchors = true;

  // ── Clipboard ─────────────────────────────────────────────────────────────
  private clipboard: DrawShape[] = [];
  private styleClipboard: Partial<DrawShape> | null = null;
  private pasteCount = 0;
  get hasClipboard() { return this.clipboard.length > 0; }
  get hasStyleClipboard() { return !!this.styleClipboard; }

  // ── Rotação ───────────────────────────────────────────────────────────────
  private rotStart = { cx: 0, cy: 0, angle: 0, rot: 0 };

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
  dashStyle: DashStyle = 'solid';
  fontFamily  = 'Inter, system-ui, sans-serif';
  // ── Painéis ───────────────────────────────────────────────────────────────
  showShortcuts = false;
  /** Galeria de formas extras — evita lotar a barra de ferramentas. */
  showShapeMenu = false;
  /** Posição da galeria: ancorada ao botão que a abriu (coordenadas de viewport). */
  shapeMenuPos: { x: number; y: number } = { x: 12, y: 96 };
  /** Filtro por nome dentro da galeria. */
  shapeSearch = '';
  /** Menu lateral de opções (substitui os controles que lotavam a barra). */
  showProps     = true;
  /** Seções abertas do menu lateral. */
  openSections  = new Set<PropSection>(['estilo', 'texto', 'elemento']);

  private closePopovers() {
    this.showShortcuts = false;
    this.showShapeMenu = false;
  }

  toggleShapeMenu(event?: MouseEvent) {
    this.showShapeMenu = !this.showShapeMenu;
    if (this.showShapeMenu) {
      this.showShortcuts = false;
      this.shapeSearch   = '';
      // Abre logo abaixo do botão — a barra quebra em duas linhas, então uma
      // posição fixa acabaria cobrindo a própria barra.
      const btn = (event?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
      if (btn) {
        this.shapeMenuPos = {
          x: Math.max(8, Math.min(btn.left, window.innerWidth - 350)),
          y: btn.bottom + 6
        };
      }
    }
    this.cdr.markForCheck();
  }

  /** A ferramenta ativa é uma das formas do menu (mantém o botão destacado). */
  isExtraShapeActive(): boolean {
    return this.shapeGroups.some(g => g.items.includes(this.tool));
  }

  /** Grupos da galeria filtrados pela busca (grupos vazios somem). */
  filteredShapeGroups(): { label: string; hint: string; items: Tool[] }[] {
    const q = this.shapeSearch.trim().toLowerCase();
    if (!q) return this.shapeGroups;
    return this.shapeGroups
      .map(g => ({ ...g, items: g.items.filter(t => this.toolLabel(t).toLowerCase().includes(q)) }))
      .filter(g => g.items.length);
  }

  pickShape(t: Tool) {
    this.setTool(t);
    this.showShapeMenu = false;
    this.cdr.markForCheck();
  }

  toggleProps() {
    this.showProps = !this.showProps;
    this.cdr.markForCheck();
    // A largura do canvas muda: recalcula o viewBox depois do reflow.
    setTimeout(() => this.resize(), 0);
  }

  toggleShortcuts() {
    this.showShortcuts = !this.showShortcuts;
    this.cdr.markForCheck();
  }

  isSectionOpen(id: PropSection) { return this.openSections.has(id); }

  toggleSection(id: PropSection) {
    if (this.openSections.has(id)) this.openSections.delete(id);
    else this.openSections.add(id);
    this.cdr.markForCheck();
  }

  /** Abre o menu lateral já na seção pedida (usado pelo menu de contexto). */
  openSection(id: PropSection) {
    this.showProps = true;
    this.openSections.add(id);
    this.cdr.markForCheck();
  }

  setStroke(color: string) {
    this.strokeColor = color;
    this.applyToSelection({ stroke: color });
  }

  setFill(color: string) {
    this.fillColor = color;
    this.applyToSelection({ fill: color });
  }

  /** Aplica um patch de estilo em todos os elementos selecionados. */
  applyToSelection(patch: Partial<DrawShape>) {
    const ids = this.selectedIds.length ? this.selectedIds : this.selectedId ? [this.selectedId] : [];
    if (!ids.length) { this.cdr.markForCheck(); return; }
    for (const id of ids) this.updateShape(id, patch);
    if (this.editingId) {
      const editing = this.findShape(this.editingId);
      if (editing) this.recalcEditStyle(editing);
    }
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  /**
   * O seletor nativo dispara `input` assim que uma cor é escolhida na paleta e
   * `change` só ao confirmar (OK/Enter). Aplicamos no `input` para valer já no
   * clique, sem gravar histórico a cada tom percorrido; o `change` confirma.
   */
  onCustomStrokeColorInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    this.strokeColor = input.value;
    for (const s of this.selectedShapes()) this.updateShape(s.id, { stroke: input.value });
    this.cdr.markForCheck();
  }

  onCustomStrokeColorChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    this.setStroke(input.value);
    this.cdr.markForCheck();
  }

  onCustomFillColorInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    this.fillColor = input.value;
    for (const s of this.selectedShapes()) this.updateShape(s.id, { fill: input.value });
    this.cdr.markForCheck();
  }

  onCustomFillColorChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;
    this.setFill(input.value);
    this.cdr.markForCheck();
  }

  setLineWidth(lw: number) {
    this.lineWidth = Math.max(1, Number(lw) || 1);
    if (!this.shapes.length) {
      this.cdr.markForCheck();
      return;
    }
    this.shapes = this.shapes.map(shape => ({ ...shape, lw: this.lineWidth }));
    if (this.editingId) {
      const editing = this.findShape(this.editingId);
      if (editing) this.recalcEditStyle(editing);
    }
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  setDashStyle(dash: DashStyle) {
    this.dashStyle = dash;
    this.applyToSelection({ dash });
  }

  /** Feedback ao vivo enquanto o slider é arrastado (sem gravar no histórico). */
  previewOpacity(value: number | string) {
    const opacity = Math.min(1, Math.max(0.1, Number(value) || 1));
    this.opacity = opacity;
    for (const s of this.selectedShapes()) this.updateShape(s.id, { opacity });
    this.cdr.markForCheck();
  }

  setOpacity(value: number | string) {
    const opacity = Math.min(1, Math.max(0.1, Number(value) || 1));
    this.opacity = opacity;
    this.applyToSelection({ opacity });
  }

  previewRotation(value: number | string) {
    const rot = ((Math.round(Number(value) || 0) % 360) + 360) % 360;
    for (const s of this.selectedShapes()) {
      if (this.canRotate(s) && !s.locked) this.updateShape(s.id, { rot: rot || undefined });
    }
    this.cdr.markForCheck();
  }

  setFontFamily(family: string) {
    this.fontFamily = family;
    this.applyToSelection({ fontFamily: family });
  }

  setStickyBg(color: string) {
    this.stickyBg = color;
    const ids = this.selectedShapes().filter(s => s.type === 'sticky').map(s => s.id);
    if (!ids.length) { this.cdr.markForCheck(); return; }
    for (const id of ids) this.updateShape(id, { stickyBg: color });
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  // ── Tamanho da fonte ───────────────────────────────────────────────────────
  setFontSize(size: number | string) {
    const fs = Math.min(160, Math.max(6, Math.round(Number(size) || 16)));
    this.fontSize = fs;
    this.applyToSelection({ fontSize: fs });
  }

  /** Aumenta/diminui a fonte dos elementos selecionados (ou o padrão, se nada selecionado). */
  bumpFontSize(delta: number) {
    const targets = this.selectedShapes();
    if (!targets.length) { this.setFontSize(this.fontSize + delta); return; }
    for (const s of targets) {
      const next = Math.min(160, Math.max(6, (s.fontSize || 16) + delta));
      this.updateShape(s.id, { fontSize: next });
    }
    this.fontSize = Math.min(160, Math.max(6, (this.sel?.fontSize || this.fontSize) + delta));
    if (this.editingId) {
      const editing = this.findShape(this.editingId);
      if (editing) this.recalcEditStyle(editing);
    }
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  toggleBold()   { this.applyToSelection({ bold:   !(this.sel?.bold) }); }
  toggleItalic() { this.applyToSelection({ italic: !(this.sel?.italic) }); }

  /** Font-size mostrado na barra: o do elemento selecionado, ou o padrão. */
  get currentFontSize(): number { return this.sel?.fontSize ?? this.fontSize; }
  get currentOpacity(): number  { return this.sel?.opacity ?? this.opacity; }
  get currentDash(): DashStyle  { return this.sel?.dash ?? this.dashStyle; }

  readonly Math = Math;
  readonly toolsList: Tool[] = [
    'select','pen','rect','ellipse','arrow','text','sticky','line',
    ...PATH_SHAPES
  ];
  /** Formas do menu "mais formas" — a galeria lista todas, inclusive as da barra. */
  readonly extraShapes: Tool[] = GEO_SHAPES;
  /** Seções da galeria de formas. */
  readonly shapeGroups: { label: string; hint: string; items: Tool[] }[] = [
    { label: 'Formas',      hint: 'Geometria e fluxogramas', items: this.extraShapes },
    { label: 'Arquitetura', hint: 'Componentes de sistema e infraestrutura', items: ARCH_SHAPES }
  ];
  readonly strokePresets = ['#1e293b','#dc2626','#2563eb','#16a34a','#d97706','#7c3aed','#0891b2','#ffffff','#94a3b8'];
  readonly fillPresets   = ['transparent','#ffffff','#fef08a','#dbeafe','#dcfce7','#fee2e2','#ede9fe','#fce7f3'];
  readonly stickyColors  = ['#fef08a','#bbf7d0','#bfdbfe','#fecaca','#e9d5ff','#fed7aa'];
  readonly lineWidths    = [1, 2, 4, 8];
  readonly fontSizes     = [10, 12, 14, 16, 20, 24, 32, 40, 56, 72];
  readonly dashStyles: { id: DashStyle; label: string }[] = [
    { id: 'solid',  label: 'Traço contínuo' },
    { id: 'dashed', label: 'Tracejado' },
    { id: 'dotted', label: 'Pontilhado' }
  ];
  readonly fontFamilies = [
    { id: 'Inter, system-ui, sans-serif', label: 'Sans (padrão)' },
    { id: 'Georgia, "Times New Roman", serif', label: 'Serif' },
    { id: 'ui-monospace, Consolas, monospace', label: 'Mono' },
    { id: '"Comic Sans MS", "Segoe Print", cursive', label: 'Manuscrito' }
  ];
  readonly pageColors = ['#ffffff','#f8fafc','#f1f5f9','#fefce8','#eff6ff','#f0fdf4','#fdf2f8','#1e293b'];

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

  resize() {
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
        background: t.background || '#ffffff',
        view: this.normalizeView(t.view)
      }));
    } else {
      this.tabs = [{ id: this.uid(), nome: 'Aba 1', shapes: parsed.shapes || [], background: parsed.background || '#ffffff', view: this.normalizeView(parsed.view) }];
    }
    this.activeTabId = this.tabs[0].id;
    this.loadActiveTab();
    this.cdr.markForCheck();
  }

  private normalizeView(view: any): TabView | undefined {
    if (!view || typeof view !== 'object') return undefined;
    const zoom = Number(view.zoom);
    const panX = Number(view.panX);
    const panY = Number(view.panY);
    if (!isFinite(zoom) || !isFinite(panX) || !isFinite(panY)) return undefined;
    return { zoom: Math.min(8, Math.max(0.1, zoom)), panX, panY };
  }

  private loadActiveTab() {
    const t = this.tabs.find(x => x.id === this.activeTabId) || this.tabs[0];
    if (!t) { this.shapes = []; this.background = '#ffffff'; this.resetHistory(); return; }
    this.activeTabId = t.id;
    this.shapes      = t.shapes;
    this.background  = t.background;
    // Restaura o posicionamento salvo (zoom + pan) da aba.
    if (t.view) { this.zoom = t.view.zoom; this.panX = t.view.panX; this.panY = t.view.panY; }
    else        { this.zoom = 1; this.panX = 0; this.panY = 0; }
    this.clearSelection();
    this.resetHistory();
  }

  /** Salva o estado atual do canvas (formas, fundo e posicionamento) de volta na aba ativa. */
  private syncActiveTab() {
    const t = this.tabs.find(x => x.id === this.activeTabId);
    if (t) {
      t.shapes = this.shapes;
      t.background = this.background;
      t.view = { zoom: this.zoom, panX: this.panX, panY: this.panY };
    }
  }

  /** Grava zoom/pan atuais como posicionamento padrão da aba. */
  saveViewPosition() {
    if (!this.current) return;
    this.syncActiveTab();
    this.persistNow();
    this.toast.show('Posicionamento da vista salvo nesta aba.', 'success', 3000);
  }

  setBackground(color: string) {
    this.background = color;
    this.syncActiveTab();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  onBackgroundInput(event: Event) {
    const input = event.target as HTMLInputElement | null;
    if (input) this.setBackground(input.value);
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

  /**
   * Todos os caminhos de pasta conhecidos: os que aparecem em algum desenho, os
   * criados à mão (`customFolders`) e — para que a árvore não tenha buracos — os
   * ancestrais de ambos. 'Arquitetura/API' implica 'Arquitetura'.
   */
  allFolderPaths(): string[] {
    const all = new Set<string>();
    const add = (path: string) => {
      const parts = this.normalizeFolder(path).split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) all.add(parts.slice(0, i).join('/'));
    };
    for (const d of this.drawings) add(d.pasta || '');
    for (const f of this.customFolders) add(f);
    return [...all].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /**
   * Árvore achatada em ordem de exibição (DFS alfabético). Subpastas de uma
   * pasta recolhida ficam de fora, então o template só itera e indenta.
   */
  drawingFolderGroups(): DrawingFolderGroup[] {
    const visible = this.filteredDrawings();
    const direct = new Map<string, DrawingRecord[]>();
    for (const drawing of visible) {
      const path = this.normalizeFolder(drawing.pasta);
      direct.set(path, [...(direct.get(path) || []), drawing]);
    }

    const paths = this.allFolderPaths();
    const childrenOf = (parent: string) =>
      paths.filter(p => this.parentFolder(p) === parent && p !== parent);

    const searching = !!this.drawingSearch.trim();
    const groups: DrawingFolderGroup[] = [];
    const push = (path: string, depth: number) => {
      const drawings = direct.get(path) || [];
      const children = childrenOf(path);
      // Durante a busca, pastas sem nenhum resultado na subárvore somem.
      if (searching && !this.folderTotal(path, visible)) return;
      groups.push({
        path,
        label: this.folderLabel(path),
        depth,
        drawings,
        total: this.folderTotal(path, visible),
        hasChildren: children.length > 0
      });
      if (!this.isFolderOpen(path)) return;
      for (const child of children) push(child, depth + 1);
    };

    // Raiz ("Sem pasta") só aparece quando há desenhos soltos.
    if ((direct.get('') || []).length) push('', 0);
    for (const top of childrenOf('')) push(top, 0);
    return groups;
  }

  /** Desenhos na pasta e em toda a sua subárvore. */
  private folderTotal(path: string, pool: DrawingRecord[]): number {
    if (!path) return pool.filter(d => !this.normalizeFolder(d.pasta)).length;
    const prefix = path + '/';
    return pool.filter(d => {
      const p = this.normalizeFolder(d.pasta);
      return p === path || p.startsWith(prefix);
    }).length;
  }

  /** Caminho da pasta-mãe ('' para as de primeiro nível). */
  parentFolder(path: string): string {
    const idx = this.normalizeFolder(path).lastIndexOf('/');
    return idx < 0 ? '' : path.slice(0, idx);
  }

  folderLabel(path: string): string {
    if (!path) return 'Sem pasta';
    return path.slice(path.lastIndexOf('/') + 1);
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
    return ['', ...this.allFolderPaths()];
  }

  // ── Pastas: criar / renomear / excluir ────────────────────────────────────
  private readonly FOLDERS_KEY = 'planner.drawingFolders';

  private loadCustomFolders(): Set<string> {
    try {
      const raw = localStorage.getItem('planner.drawingFolders');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : []);
    } catch { return new Set<string>(); }
  }

  private saveCustomFolders() {
    try { localStorage.setItem(this.FOLDERS_KEY, JSON.stringify([...this.customFolders])); } catch {}
  }

  openFolderContextMenu(event: MouseEvent, path: string) {
    event.preventDefault();
    event.stopPropagation();
    this.closeDrawingContextMenu();
    this.folderContextMenu = { path, x: event.clientX, y: event.clientY };
    this.subfolderParent = null;
    this.subfolderName   = '';
    this.renamingFolder  = '';
    this.cdr.markForCheck();
  }

  closeFolderContextMenu() {
    this.folderContextMenu = null;
    this.subfolderParent   = null;
    this.renamingFolder    = '';
  }

  closeSidebarMenus() {
    this.closeDrawingContextMenu();
    this.closeFolderContextMenu();
  }

  /** Abre o campo de nome da nova subpasta dentro do menu de contexto. */
  startSubfolder(parent: string) {
    this.subfolderParent = parent;
    this.subfolderName   = '';
    this.renamingFolder  = '';
    this.cdr.markForCheck();
  }

  /** Cria `parent/nome`. A pasta nasce vazia — daí o registro local. */
  createSubfolder(parent: string | null) {
    const name = this.subfolderName.trim().replace(/[\\/]/g, ' ').trim();
    if (parent === null || !name) return;
    const path = this.normalizeFolder(parent ? `${parent}/${name}` : name);
    if (this.allFolderPaths().includes(path)) {
      this.toast.show(`A pasta "${path}" já existe.`, 'error', 4000);
      return;
    }
    this.customFolders.add(path);
    this.saveCustomFolders();
    // Deixa o caminho todo aberto para a pasta nova ficar à vista.
    for (const p of this.ancestorsOf(path)) this.expandedFolders.add(p);
    this.expandedFolders.add(path);
    this.subfolderName = '';
    this.closeSidebarMenus();
    this.toast.show(`Pasta "${path}" criada.`, 'success', 3000);
    this.cdr.markForCheck();
  }

  private ancestorsOf(path: string): string[] {
    const parts = this.normalizeFolder(path).split('/').filter(Boolean);
    return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
  }

  /** Novo desenho já dentro da pasta clicada. */
  newDrawingInFolder(path: string) {
    this.newFolder   = path;
    this.newName     = '';
    this.showNewModal = true;
    this.closeSidebarMenus();
    this.cdr.markForCheck();
  }

  startRenameFolder(path: string) {
    this.renamingFolder  = path;
    this.folderRenameVal = this.folderLabel(path);
    this.subfolderParent = null;
    this.cdr.markForCheck();
  }

  /**
   * Renomeia o último segmento. Todos os desenhos da subárvore têm o `pasta`
   * reescrito no backend; as pastas locais acompanham o novo prefixo.
   */
  confirmRenameFolder(path: string) {
    const name = this.folderRenameVal.trim().replace(/[\\/]/g, ' ').trim();
    if (!name || name === this.folderLabel(path)) { this.renamingFolder = ''; this.cdr.markForCheck(); return; }
    const parent = this.parentFolder(path);
    const target = this.normalizeFolder(parent ? `${parent}/${name}` : name);
    if (this.allFolderPaths().includes(target)) {
      this.toast.show(`A pasta "${target}" já existe.`, 'error', 4000);
      return;
    }
    const rewrite = (p: string) => (p === path ? target : p.startsWith(path + '/') ? target + p.slice(path.length) : p);

    this.customFolders = new Set([...this.customFolders].map(rewrite));
    this.customFolders.add(target);
    this.saveCustomFolders();
    this.expandedFolders = new Set([...this.expandedFolders].map(rewrite));

    const affected = this.drawings.filter(d => {
      const p = this.normalizeFolder(d.pasta);
      return p === path || p.startsWith(path + '/');
    });
    for (const d of affected) this.applyFolderMove(d, rewrite(this.normalizeFolder(d.pasta)));

    this.renamingFolder = '';
    this.closeFolderContextMenu();
    this.toast.show(`Pasta renomeada para "${name}".`, 'success', 3000);
    this.cdr.markForCheck();
  }

  /**
   * Remove a pasta e as subpastas do registro. Desenhos nunca são apagados aqui:
   * sobem para a pasta-mãe, para nada sumir da lista sem o usuário mandar.
   */
  deleteFolder(path: string) {
    if (!path) return;
    const parent = this.parentFolder(path);
    const affected = this.drawings.filter(d => {
      const p = this.normalizeFolder(d.pasta);
      return p === path || p.startsWith(path + '/');
    });
    for (const d of affected) this.applyFolderMove(d, parent);

    this.customFolders = new Set(
      [...this.customFolders].filter(p => p !== path && !p.startsWith(path + '/'))
    );
    this.saveCustomFolders();
    this.closeFolderContextMenu();
    this.toast.show(
      affected.length
        ? `Pasta "${this.folderLabel(path)}" removida — ${affected.length} desenho(s) movido(s) para "${this.folderLabel(parent)}".`
        : `Pasta "${this.folderLabel(path)}" removida.`,
      'success', 4000
    );
    this.cdr.markForCheck();
  }

  /** PUT do desenho só trocando a pasta (mantém nome e conteúdo). */
  private applyFolderMove(drawing: DrawingRecord, pasta: string) {
    this.api.updateDrawing(this.token, drawing.id, drawing.nome, drawing.data, this.normalizeFolder(pasta)).subscribe({
      next: (d: any) => {
        d.pasta = this.normalizeFolder(d.pasta);
        this.drawings = this.drawings.map(x => x.id === d.id ? d : x);
        if (this.current?.id === d.id) {
          this.current = d;
          this.folderDraft = d.pasta || '';
        }
        this.cdr.markForCheck();
      },
      error: () => this.toast.show(`Falha ao mover "${drawing.nome}".`, 'error', 5000)
    });
  }

  openDrawingContextMenu(event: MouseEvent, drawing: DrawingRecord) {
    event.preventDefault();
    event.stopPropagation();
    this.closeFolderContextMenu();
    this.drawingContextMenu = { drawing, x: event.clientX, y: event.clientY };
    this.contextMoveFolder = this.normalizeFolder(drawing.pasta);
    this.cdr.markForCheck();
  }

  closeDrawingContextMenu() {
    this.drawingContextMenu = null;
  }

  moveDrawingTo(drawing: DrawingRecord, folder: string) {
    const pasta = this.normalizeFolder(folder);
    // Registra a pasta para ela continuar existindo mesmo se ficar vazia depois.
    if (pasta) { this.customFolders.add(pasta); this.saveCustomFolders(); }
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

  /** Arredonda para a grade quando o snap está ativo. */
  private snapV(v: number): number {
    return this.snapEnabled ? Math.round(v / this.gridSize) * this.gridSize : v;
  }

  private snapPoint(p: Point): Point {
    return this.snapEnabled ? { x: this.snapV(p.x), y: this.snapV(p.y) } : p;
  }

  private rotateVec(v: Point, deg: number): Point {
    const a = deg * Math.PI / 180;
    const cos = Math.cos(a); const sin = Math.sin(a);
    return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
  }

  private rotatePoint(p: Point, center: Point, deg: number): Point {
    const r = this.rotateVec({ x: p.x - center.x, y: p.y - center.y }, deg);
    return { x: center.x + r.x, y: center.y + r.y };
  }

  /** Ponto oposto ao handle arrastado — mantido fixo ao redimensionar formas rotacionadas. */
  private oppositeAnchor(handle: string, r: Rect): Point {
    const x = handle.includes('l') ? r.x + r.w : handle.includes('r') ? r.x : r.x + r.w / 2;
    const y = handle.includes('t') ? r.y + r.h : handle.includes('b') ? r.y : r.y + r.h / 2;
    return { x, y };
  }

  /** Formas que aceitam rotação (as baseadas em path/linha são ignoradas). */
  canRotate(s: DrawShape | null): boolean {
    return !!s && s.type !== 'pen' && s.type !== 'arrow' && s.type !== 'line';
  }

  shapeTransform(s: DrawShape): string | null {
    if (!s.rot || !this.canRotate(s)) return null;
    const b = this.shapeBounds(s);
    return `rotate(${s.rot} ${b.x + b.w / 2} ${b.y + b.h / 2})`;
  }

  dashArray(s: DrawShape): string | null {
    const lw = Math.max(1, s.lw || 1);
    if (s.dash === 'dashed') return `${lw * 4} ${lw * 3}`;
    if (s.dash === 'dotted') return `${lw} ${lw * 2.2}`;
    return null;
  }

  // ── Zoom / Pan ────────────────────────────────────────────────────────────
  onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = this.pt(e as any);

    // Shift/Alt + roda = deslocar a tela; roda pura (ou Ctrl+roda) = zoom.
    if (e.shiftKey || e.altKey) {
      const step = 60 / this.zoom;
      const dir  = e.deltaY > 0 ? 1 : -1;
      if (e.shiftKey) this.panX += dir * step;
      else            this.panY += dir * step;
      this.scheduleViewSave();
      this.cdr.markForCheck();
      return;
    }

    const delta   = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(8, Math.max(0.1, this.zoom * delta));
    this.panX     = p.x - (p.x - this.panX) * (this.zoom / newZoom);
    this.panY     = p.y - (p.y - this.panY) * (this.zoom / newZoom);
    this.zoom     = newZoom;
    this.scheduleViewSave();
    this.cdr.markForCheck();
  }

  /** Guarda o posicionamento da vista na aba e agenda a persistência. */
  private scheduleViewSave() {
    if (!this.current) return;
    this.syncActiveTab();
    this.scheduleSave();
  }

  resetZoom() {
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.scheduleViewSave();
    this.cdr.markForCheck();
  }

  /** Enquadra a seleção atual (ou todo o conteúdo, se nada estiver selecionado). */
  zoomToSelection() {
    const selected = this.selectedShapes();
    if (!selected.length) { this.fitContent(); return; }
    const bounds = selected.map(s => this.outerBounds(s));
    const minX = Math.min(...bounds.map(b => b.x)) - 60;
    const minY = Math.min(...bounds.map(b => b.y)) - 60;
    const maxX = Math.max(...bounds.map(b => b.x + b.w)) + 60;
    const maxY = Math.max(...bounds.map(b => b.y + b.h)) + 60;
    const cw = Math.max(1, maxX - minX); const ch = Math.max(1, maxY - minY);
    const z  = Math.min(this.vw / cw, this.vh / ch, 4);
    this.zoom = z;
    this.panX = minX - (this.vw / z - cw) / 2;
    this.panY = minY - (this.vh / z - ch) / 2;
    this.scheduleViewSave();
    this.cdr.markForCheck();
  }

  fitContent() {
    if (!this.shapes.length) { this.resetZoom(); return; }
    const boxes = this.shapes.map(s => this.outerBounds(s));
    const xs = boxes.flatMap(b => [b.x, b.x + b.w]);
    const ys = boxes.flatMap(b => [b.y, b.y + b.h]);
    const minX = Math.min(...xs) - 40; const maxX = Math.max(...xs) + 40;
    const minY = Math.min(...ys) - 40; const maxY = Math.max(...ys) + 40;
    const cw   = Math.max(1, maxX - minX); const ch = Math.max(1, maxY - minY);
    const z    = Math.min(this.vw / cw, this.vh / ch, 2);
    this.zoom  = z;
    this.panX  = minX - (this.vw / z - cw) / 2;
    this.panY  = minY - (this.vh / z - ch) / 2;
    this.scheduleViewSave();
    this.cdr.markForCheck();
  }

  // ── Centralizar / redimensionar o desenho ─────────────────────────────────

  /** Caixa que envolve todo o conteúdo da aba. */
  private contentBounds(): Rect | null {
    if (!this.shapes.length) return null;
    const boxes = this.shapes.map(s => this.outerBounds(s));
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }

  hasContent(): boolean {
    return this.shapes.length > 0;
  }

  /** Move todo o conteúdo para o centro da área visível (não altera o tamanho). */
  centerDrawing() {
    const box = this.contentBounds();
    if (!box) { this.toast.show('Nada para centralizar nesta aba.', 'info', 3000); return; }
    const viewCx = this.panX + (this.vw / this.zoom) / 2;
    const viewCy = this.panY + (this.vh / this.zoom) / 2;
    const dx = viewCx - (box.x + box.w / 2);
    const dy = viewCy - (box.y + box.h / 2);
    if (!dx && !dy) return;
    this.translateAllShapes(dx, dy);
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
    this.toast.show('Desenho centralizado.', 'success', 2500);
  }

  /**
   * Redimensiona o conteúdo inteiro para caber na área visível e o centraliza.
   * Escala posições, tamanhos, traços e fontes juntos, para o desenho continuar
   * proporcional.
   */
  resizeDrawingToFit() {
    const box = this.contentBounds();
    if (!box) { this.toast.show('Nada para redimensionar nesta aba.', 'info', 3000); return; }
    const margin = 60;
    const availW = Math.max(50, this.vw / this.zoom - margin * 2);
    const availH = Math.max(50, this.vh / this.zoom - margin * 2);
    const scale = Math.min(availW / box.w, availH / box.h);
    if (!isFinite(scale) || scale <= 0) return;

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const viewCx = this.panX + (this.vw / this.zoom) / 2;
    const viewCy = this.panY + (this.vh / this.zoom) / 2;

    this.shapes = this.shapes.map(s => {
      const next: DrawShape = {
        ...s,
        x: viewCx + (s.x - cx) * scale,
        y: viewCy + (s.y - cy) * scale,
        w: s.w * scale,
        h: s.h * scale,
        lw: Math.max(0.5, s.lw * scale),
      };
      if (s.fontSize) next.fontSize = Math.min(160, Math.max(6, Math.round(s.fontSize * scale)));
      if (s.pts?.length) {
        next.pts = s.pts.map((v, i) => i % 2 === 0
          ? viewCx + (v - cx) * scale
          : viewCy + (v - cy) * scale);
      }
      return next;
    });
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
    this.toast.show(`Desenho ajustado (${Math.round(scale * 100)}%) e centralizado.`, 'success', 3000);
  }

  private translateAllShapes(dx: number, dy: number) {
    this.shapes = this.shapes.map(s => ({
      ...s,
      x: s.x + dx,
      y: s.y + dy,
      pts: s.pts?.length ? s.pts.map((v, i) => i % 2 === 0 ? v + dx : v + dy) : s.pts,
    }));
  }

  // ── Mouse events ──────────────────────────────────────────────────────────
  onSvgMouseDown(e: MouseEvent) {
    if (e.button !== 0 && e.button !== 1) return;
    const p = this.pt(e);
    this.closePopovers();

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
    this.startPt   = this.tool === 'pen' ? p : this.snapPoint(p);
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
      const s = this.makeShape(this.tool, this.startPt.x, this.startPt.y, 1, 1);
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
    this.closePopovers();
    // Alt + arrastar = duplicar e arrastar a cópia (padrão de editores gráficos).
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (!this.isSelected(shape.id)) this.setSelection([shape.id]);
      this.duplicateSelected(0, 0);
      const target = this.sel;
      if (target) {
        this.isDragging = true;
        this.dragPt     = this.pt(e);
        this.dragOrig   = { x: target.x, y: target.y, w: target.w, h: target.h };
        this.captureDragOrigins();
        this.activeHandle = '';
      }
      this.cdr.markForCheck();
      return;
    }
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
    if (shape.locked) { this.cdr.markForCheck(); return; }  // travado: seleciona mas não move
    this.isDragging   = true;
    this.dragPt       = this.pt(e);
    this.dragOrig     = { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    this.captureDragOrigins();
    this.activeHandle = '';
    this.cdr.markForCheck();
  }

  onHandleMouseDown(e: MouseEvent, handle: string) {
    e.stopPropagation();
    if (!this.sel || this.sel.locked) return;
    this.activeHandle = handle;
    this.isDragging   = true;
    this.dragPt       = this.pt(e);
    this.dragOrig     = { x: this.sel.x, y: this.sel.y, w: this.sel.w, h: this.sel.h };
    this.captureDragOrigins([this.sel.id]);

    if (handle === 'rotate') {
      const b = this.shapeBounds(this.sel);
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
      const p = this.dragPt;
      this.rotStart = {
        cx, cy,
        angle: Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI,
        rot: this.sel.rot || 0
      };
    }
  }

  // ── Medidas durante o posicionamento ──────────────────────────────────────

  /**
   * Etiqueta com as medidas do que está sendo desenhado, movido ou
   * redimensionado. Fica ancorada acima da caixa, em coordenadas do canvas —
   * o template compensa o zoom para o texto não crescer junto.
   */
  measureBadge(): { x: number; y: number; lines: string[] } | null {
    if (!this.showMeasures || this.isPanning || this.isMultiSelecting) return null;

    if (this.isDrawing && this.drawId) {
      const s = this.findShape(this.drawId);
      if (!s) return null;
      const box = this.selectionHandleBounds(s);
      if (s.type === 'arrow' || s.type === 'line') {
        const len = Math.hypot(s.w, s.h);
        const ang = ((Math.atan2(s.h, s.w) * 180 / Math.PI) + 360) % 360;
        return { ...this.badgeAnchor(box), lines: [`${this.r(len)} px`, `${this.r(ang)}°`] };
      }
      if (s.type === 'pen') return { ...this.badgeAnchor(box), lines: [this.sizeLine(box)] };
      return { ...this.badgeAnchor(box), lines: [this.sizeLine(box), this.posLine(box)] };
    }

    if (!this.isDragging || !this.sel) return null;

    if (this.activeHandle === 'rotate') {
      const box = this.outerBounds(this.sel);
      return { ...this.badgeAnchor(box), lines: [`${this.sel.rot || 0}°`] };
    }

    const multi = this.selectionBounds();
    const box = multi ?? this.selectionHandleBounds(this.sel);
    if (this.activeHandle) {
      return { ...this.badgeAnchor(box), lines: [this.sizeLine(box), this.posLine(box)] };
    }
    // Movendo: posição é o que interessa; o tamanho ajuda a conferir o encaixe.
    return { ...this.badgeAnchor(box), lines: [this.posLine(box), this.sizeLine(box)] };
  }

  private badgeAnchor(box: Rect): { x: number; y: number } {
    return { x: box.x, y: box.y - 12 / Math.max(this.zoom, 0.15) };
  }

  private sizeLine(box: Rect): string {
    return `${this.r(Math.abs(box.w))} × ${this.r(Math.abs(box.h))}`;
  }

  private posLine(box: Rect): string {
    return `x ${this.r(box.x)}  y ${this.r(box.y)}`;
  }

  private r(v: number): number {
    return Math.round(v);
  }

  /** Largura da etiqueta de medidas (aproximada pelo maior texto). */
  measureBadgeWidth(lines: string[]): number {
    return Math.max(...lines.map(l => l.length)) * 6.4 + 16;
  }

  toggleMeasures() {
    this.showMeasures = !this.showMeasures;
    this.cdr.markForCheck();
  }

  /**
   * Liga/desliga os pontos de ancoragem. Com a ferramenta seta ativa eles
   * voltam sozinhos: sem eles não há como escolher onde a seta encosta.
   */
  toggleAnchors() {
    this.showAnchors = !this.showAnchors;
    this.toast.show(
      this.showAnchors
        ? 'Pontos de ancoragem visíveis.'
        : 'Pontos de ancoragem ocultos (voltam ao usar a ferramenta Seta).',
      'info', 2500
    );
    this.cdr.markForCheck();
  }

  /** Posição do handle de rotação (acima do centro superior da forma). */
  rotateHandlePoint(s: DrawShape): Point {
    const b = this.shapeBounds(s);
    return { x: b.x + b.w / 2, y: b.y - 26 / Math.max(this.zoom, 0.15) };
  }

  setRotation(deg: number | string) {
    const rot = ((Math.round(Number(deg) || 0) % 360) + 360) % 360;
    const targets = this.selectedShapes().filter(s => this.canRotate(s) && !s.locked);
    if (!targets.length) return;
    for (const s of targets) this.updateShape(s.id, { rot: rot || undefined });
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  rotateSelection(delta: number) {
    const targets = this.selectedShapes().filter(s => this.canRotate(s) && !s.locked);
    if (!targets.length) return;
    for (const s of targets) {
      const rot = ((((s.rot || 0) + delta) % 360) + 360) % 360;
      this.updateShape(s.id, { rot: rot || undefined });
    }
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
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
    this.lastPt = p;
    this.pointerInside = true;

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
        const q = this.snapPoint(p);
        if (drawTool === 'arrow') {
          const fromShape = s.fromId ? this.findShape(s.fromId) : null;
          const start = fromShape && s.fromAnchor ? this.anchorPoint(fromShape, s.fromAnchor) : fromShape ? this.edgePoint(fromShape, q) : this.startPt;
          const end = e.shiftKey ? this.constrainAngle(start, q) : q;
          s.x = start.x; s.y = start.y;
          s.w = end.x - start.x; s.h = end.y - start.y;
        } else if (drawTool === 'line') {
          const end = e.shiftKey ? this.constrainAngle(this.startPt, q) : q;
          s.x = this.startPt.x; s.y = this.startPt.y;
          s.w = end.x - this.startPt.x; s.h = end.y - this.startPt.y;
        } else {
          let dw = q.x - this.startPt.x;
          let dh = q.y - this.startPt.y;
          // Shift = proporção 1:1 (quadrado / círculo perfeito)
          if (e.shiftKey) {
            const size = Math.max(Math.abs(dw), Math.abs(dh));
            dw = size * (dw < 0 ? -1 : 1);
            dh = size * (dh < 0 ? -1 : 1);
          }
          s.x = Math.min(this.startPt.x, this.startPt.x + dw);
          s.y = Math.min(this.startPt.y, this.startPt.y + dh);
          s.w = Math.max(MIN_SIZE, Math.abs(dw));
          s.h = Math.max(MIN_SIZE, Math.abs(dh));
        }
        this.shapes = [...this.shapes.slice(0, idx), s, ...this.shapes.slice(idx + 1)];
      }
      const created = this.shapes.find(shape => shape.id === this.drawId);
      this.alignmentGuides = created ? this.computeAlignmentGuides(this.selectionHandleBounds(created), new Set([created.id])) : [];
      this.cdr.markForCheck();
      return;
    }

    // drag / resize — only when mouse button is held (isDragging flag)
    if (!this.isDragging || !this.sel) {
      // Ocioso: só marca a forma sob o cursor (revela as âncoras extras).
      const hover = (this.tool === 'select' || this.tool === 'arrow')
        ? this.shapeAtPoint(p)?.id ?? null
        : null;
      if (hover !== this.hoverShapeId) {
        this.hoverShapeId = hover;
        this.cdr.markForCheck();
      }
      return;
    }

    let dx = p.x - this.dragPt.x;
    let dy = p.y - this.dragPt.y;

    // ── Rotação ──
    if (this.activeHandle === 'rotate') {
      const angle = Math.atan2(p.y - this.rotStart.cy, p.x - this.rotStart.cx) * 180 / Math.PI;
      let rot = this.rotStart.rot + (angle - this.rotStart.angle);
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      rot = ((Math.round(rot) % 360) + 360) % 360;
      for (const s of this.selectedShapes()) {
        if (this.canRotate(s) && !s.locked) this.updateShape(s.id, { rot: rot || undefined });
      }
      this.alignmentGuides = [];
      this.cdr.markForCheck();
      return;
    }

    if (!this.activeHandle) {
      // Shift ao mover = trava um eixo; snap alinha à grade.
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (this.snapEnabled) {
        dx = this.snapV(this.dragOrig.x + dx) - this.dragOrig.x;
        dy = this.snapV(this.dragOrig.y + dy) - this.dragOrig.y;
      }
    }

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
        const end = { x: this.dragOrig.x + this.dragOrig.w, y: this.dragOrig.y + this.dragOrig.h };
        let start = this.snapPoint({ x: this.dragOrig.x + dx, y: this.dragOrig.y + dy });
        if (e.shiftKey) start = this.constrainAngle(end, start);
        this.updateShape(this.sel.id, { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y });
      } else if (this.activeHandle === 'line-end') {
        const start = { x: this.dragOrig.x, y: this.dragOrig.y };
        let end = this.snapPoint({ x: start.x + this.dragOrig.w + dx, y: start.y + this.dragOrig.h + dy });
        if (e.shiftKey) end = this.constrainAngle(start, end);
        this.updateShape(this.sel.id, { w: end.x - start.x, h: end.y - start.y });
      }
      const resized = this.findShape(this.sel.id);
      this.alignmentGuides = resized ? this.computeAlignmentGuides(this.selectionHandleBounds(resized), new Set([resized.id])) : [];
    } else {
      const orig = this.dragOrig;
      const rot  = this.sel.rot || 0;
      const hnd  = this.activeHandle;
      // Em formas rotacionadas o delta do mouse precisa voltar ao espaço local.
      const local = rot ? this.rotateVec({ x: dx, y: dy }, -rot) : { x: dx, y: dy };
      let { x, y, w, h } = orig;
      if (hnd.includes('l')) { x += local.x; w -= local.x; }
      if (hnd.includes('r')) { w += local.x; }
      if (hnd.includes('t')) { y += local.y; h -= local.y; }
      if (hnd.includes('b')) { h += local.y; }

      // Shift em handle de canto = manter proporção original.
      const isCorner = /^(tl|tr|bl|br)$/.test(hnd);
      if (e.shiftKey && isCorner && orig.w > 0 && orig.h > 0) {
        const ratio = orig.w / orig.h;
        if (Math.abs(w) / ratio > Math.abs(h)) h = Math.abs(w) / ratio;
        else                                   w = Math.abs(h) * ratio;
        if (hnd.includes('l')) x = orig.x + orig.w - w;
        if (hnd.includes('t')) y = orig.y + orig.h - h;
      }

      if (this.snapEnabled) {
        if (hnd.includes('l')) { const nx = this.snapV(x); w += x - nx; x = nx; }
        if (hnd.includes('r')) { w = this.snapV(x + w) - x; }
        if (hnd.includes('t')) { const ny = this.snapV(y); h += y - ny; y = ny; }
        if (hnd.includes('b')) { h = this.snapV(y + h) - y; }
      }

      if (w < MIN_SIZE) { if (hnd.includes('l')) x = orig.x + orig.w - MIN_SIZE; w = MIN_SIZE; }
      if (h < MIN_SIZE) { if (hnd.includes('t')) y = orig.y + orig.h - MIN_SIZE; h = MIN_SIZE; }

      // Rotação: compensa o deslocamento do centro para o canto oposto ficar fixo.
      if (rot) {
        const fixedOld = this.oppositeAnchor(hnd, orig);
        const fixedNew = this.oppositeAnchor(hnd, { x, y, w, h });
        const worldOld = this.rotatePoint(fixedOld, { x: orig.x + orig.w / 2, y: orig.y + orig.h / 2 }, rot);
        const worldNew = this.rotatePoint(fixedNew, { x: x + w / 2, y: y + h / 2 }, rot);
        x += worldOld.x - worldNew.x;
        y += worldOld.y - worldNew.y;
      }
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
        // A zona envolve outros componentes: vai para o fundo da pilha para
        // não roubar os cliques de quem está dentro dela.
        if (drawTool === 'archZone') this.shapes = [s, ...this.shapes.filter(o => o.id !== s.id)];
        // Criado o elemento, volta para "Selecionar" — a não ser que a
        // ferramenta esteja travada (Q) para desenhar vários seguidos.
        if (!this.lockTool) this.tool = 'select';
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

  /** `align-content` do textarea equivalente ao alinhamento vertical da forma. */
  private editAlignContent(s: DrawShape): string {
    const v = this.textVAlignOf(s);
    return v === 'top' ? 'start' : v === 'bottom' ? 'end' : 'center';
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
      fontFamily: s.fontFamily || 'inherit',
      fontWeight: s.bold ? '700' : '400',
      fontStyle: s.italic ? 'italic' : 'normal',
      transform: s.rot && this.canRotate(s) ? `rotate(${s.rot}deg)` : 'none',
      transformOrigin: 'center center',
      background: isArrow ? 'rgba(255,255,255,0.96)' : s.stickyBg || 'rgba(255,255,255,0.95)',
      color: s.stroke,
      // A caixa de edição usa o mesmo alinhamento do texto renderizado, para o
      // que se vê ao digitar bater com o resultado.
      textAlign: isArrow ? 'center' : this.textAlignOf(s),
      alignContent: isArrow ? 'center' : this.editAlignContent(s),
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
      fill:   type === 'rect' || type === 'ellipse' || this.isPathShape(type) ? this.fillColor : 'transparent',
      lw:     this.lineWidth,
      opacity: this.opacity,
      text:   '',
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      // A zona é um limite (VPC, contexto): nasce tracejada para não competir
      // visualmente com os componentes que ela envolve.
      dash:   type === 'archZone' ? 'dashed' : this.dashStyle === 'solid' ? undefined : this.dashStyle,
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
    // Sem seleção o menu ainda aparece quando há algo para colar.
    if (!this.selectedIds.length && !this.clipboard.length) { this.canvasContextMenu = null; return; }
    this.lastPt = p;
    this.pointerInside = true;
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
      .filter(shape => this.rectsIntersect(this.outerBounds(shape), this.selectionRect!))
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
      if (!ids.has(shape.id) || shape.locked) return shape;
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
    const bounds = selected.map(shape => this.outerBounds(shape));
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
      const bounds = this.outerBounds(shape);
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
    const bounds = selected.map(shape => this.outerBounds(shape));
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

  /** Retângulo envolvente considerando a rotação — usado por marquee, guias e enquadramento. */
  outerBounds(s: DrawShape): Rect {
    const b = this.selectionHandleBounds(s);
    if (!s.rot || !this.canRotate(s)) return b;
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const corners = [
      { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }
    ].map(p => this.rotatePoint(p, c, s.rot!));
    const xs = corners.map(p => p.x); const ys = corners.map(p => p.y);
    const minX = Math.min(...xs); const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }

  /** Trava um segmento em múltiplos de 45° (usado com Shift). */
  private constrainAngle(start: Point, end: Point): Point {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (!len) return end;
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
  }

  deleteSelected() {
    const deletingIds = (this.selectedIds.length ? this.selectedIds : this.selectedId ? [this.selectedId] : [])
      .filter(id => !this.findShape(id)?.locked);
    if (!deletingIds.length) {
      if (this.selectedIds.length) this.toast.show('Elemento travado. Use Ctrl+L para destravar.', 'info', 3000);
      return;
    }
    const deleting = new Set(deletingIds);
    this.shapes = this.shapes.filter(s => !deleting.has(s.id) && !deleting.has(s.fromId || '') && !deleting.has(s.toId || ''));
    this.clearSelection();
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  duplicateSelected(offsetX = 20, offsetY = 20) {
    const selected = this.selectedShapes();
    if (!selected.length && this.sel) selected.push(this.sel);
    if (!selected.length) return;
    const copies = this.cloneShapes(selected, offsetX, offsetY);
    this.shapes = [...this.shapes, ...copies];
    this.setSelection(copies.map(copy => copy.id));
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  /** Clona formas preservando grupos internos e deslocando por (dx, dy). */
  private cloneShapes(source: DrawShape[], dx: number, dy: number): DrawShape[] {
    const groupMap = new Map<string, string>();
    return source.map(shape => {
      let groupId = shape.groupId;
      if (groupId) {
        if (!groupMap.has(groupId)) groupMap.set(groupId, this.uid());
        groupId = groupMap.get(groupId)!;
      }
      return {
        ...shape,
        id: this.uid(),
        groupId,
        x: shape.x + dx,
        y: shape.y + dy,
        lw: this.lineWidth,
        fromId: undefined,
        toId: undefined,
        fromAnchor: undefined,
        toAnchor: undefined,
        pts: shape.pts ? shape.pts.map((v, i) => v + (i % 2 === 0 ? dx : dy)) : undefined
      };
    });
  }

  // ── Copiar / colar ────────────────────────────────────────────────────────
  copySelection(silent = false): boolean {
    const selected = this.selectedShapes();
    if (!selected.length) return false;
    this.clipboard = selected.map(s => ({ ...s, pts: s.pts ? [...s.pts] : undefined }));
    this.pasteCount = 0;
    this.writeSystemClipboard(this.clipboard);
    if (!silent) this.toast.show(`${selected.length} elemento(s) copiado(s).`, 'success', 2000);
    this.cdr.markForCheck();
    return true;
  }

  cutSelection() {
    if (!this.copySelection(true)) return;
    const count = this.selectedShapes().length;
    this.deleteSelected();
    this.toast.show(`${count} elemento(s) recortado(s).`, 'success', 2000);
  }

  /** Cola no cursor (se o ponteiro estiver sobre o canvas) ou com deslocamento em cascata. */
  pasteClipboard(atCursor = true) {
    if (!this.clipboard.length || !this.current) return;
    const boxes = this.clipboard.map(s => this.selectionHandleBounds(s));
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));

    let dx: number; let dy: number;
    if (atCursor && this.pointerInside) {
      const target = this.snapPoint(this.lastPt);
      dx = target.x - minX;
      dy = target.y - minY;
    } else {
      this.pasteCount++;
      dx = 20 * this.pasteCount;
      dy = 20 * this.pasteCount;
    }

    const copies = this.cloneShapes(this.clipboard, dx, dy);
    this.shapes = [...this.shapes, ...copies];
    this.setTool('select');
    this.setSelection(copies.map(c => c.id));
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  /** Espelha as formas no clipboard do sistema, permitindo colar em outra janela do planner. */
  private writeSystemClipboard(shapes: DrawShape[]) {
    try {
      const payload = JSON.stringify({ source: 'planner-drawing-clipboard', shapes });
      navigator.clipboard?.writeText?.(payload).catch(() => {});
    } catch { /* clipboard indisponível — usa apenas o clipboard interno */ }
  }

  // ── Copiar / colar apenas o estilo ────────────────────────────────────────
  copyStyle() {
    const s = this.sel;
    if (!s) return;
    this.styleClipboard = {
      stroke: s.stroke, fill: s.fill, lw: s.lw, opacity: s.opacity,
      dash: s.dash, fontSize: s.fontSize, bold: s.bold, italic: s.italic,
      fontFamily: s.fontFamily, stickyBg: s.stickyBg,
      align: s.align, valign: s.valign
    };
    this.toast.show('Estilo copiado (Ctrl+Alt+V para aplicar).', 'success', 2500);
    this.cdr.markForCheck();
  }

  pasteStyle() {
    if (!this.styleClipboard) return;
    this.applyToSelection({ ...this.styleClipboard });
  }

  // ── Travar posição ────────────────────────────────────────────────────────
  toggleLock() {
    const selected = this.selectedShapes();
    if (!selected.length) return;
    const lock = !selected.every(s => s.locked);
    for (const s of selected) this.updateShape(s.id, { locked: lock || undefined });
    this.pushHistory();
    this.scheduleSave();
    this.toast.show(lock ? 'Posição travada.' : 'Posição destravada.', 'info', 2000);
    this.cdr.markForCheck();
  }

  get selectionLocked(): boolean {
    const selected = this.selectedShapes();
    return selected.length > 0 && selected.every(s => s.locked);
  }

  // ── Ordem das camadas ─────────────────────────────────────────────────────
  private reorder(mode: 'front' | 'back' | 'forward' | 'backward') {
    const ids = new Set(this.selectedIds.length ? this.selectedIds : this.selectedId ? [this.selectedId] : []);
    if (!ids.size) return;
    const moving = this.shapes.filter(s => ids.has(s.id));
    const rest   = this.shapes.filter(s => !ids.has(s.id));

    if (mode === 'front')      this.shapes = [...rest, ...moving];
    else if (mode === 'back')  this.shapes = [...moving, ...rest];
    else {
      const arr = [...this.shapes];
      const indexes = arr.map((s, i) => ids.has(s.id) ? i : -1).filter(i => i >= 0);
      const ordered = mode === 'forward' ? [...indexes].reverse() : indexes;
      for (const i of ordered) {
        const j = mode === 'forward' ? i + 1 : i - 1;
        if (j < 0 || j >= arr.length || ids.has(arr[j].id)) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      this.shapes = arr;
    }
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  bringForward()   { this.reorder('forward'); }
  sendBackward()   { this.reorder('backward'); }
  bringToFront()   { this.reorder('front'); }
  sendToBack()     { this.reorder('back'); }

  // ── Alinhar / distribuir ──────────────────────────────────────────────────
  canAlign(): boolean { return this.selectedShapes().filter(s => !s.locked).length >= 2; }
  canDistribute(): boolean { return this.selectedShapes().filter(s => !s.locked).length >= 3; }

  align(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const targets = this.selectedShapes().filter(s => !s.locked);
    if (targets.length < 2) return;
    const boxes = targets.map(s => this.outerBounds(s));
    const minX = Math.min(...boxes.map(b => b.x));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    targets.forEach((shape, i) => {
      const b = boxes[i];
      let dx = 0; let dy = 0;
      if (mode === 'left')         dx = minX - b.x;
      else if (mode === 'right')   dx = maxX - (b.x + b.w);
      else if (mode === 'hcenter') dx = cx - (b.x + b.w / 2);
      else if (mode === 'top')     dy = minY - b.y;
      else if (mode === 'bottom')  dy = maxY - (b.y + b.h);
      else if (mode === 'vcenter') dy = cy - (b.y + b.h / 2);
      this.translateShape(shape, dx, dy);
    });
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  distribute(axis: 'h' | 'v') {
    const targets = this.selectedShapes().filter(s => !s.locked);
    if (targets.length < 3) return;
    const items = targets
      .map(s => ({ shape: s, box: this.outerBounds(s) }))
      .sort((a, b) => axis === 'h' ? a.box.x - b.box.x : a.box.y - b.box.y);

    const first = items[0].box;
    const last  = items[items.length - 1].box;
    const total = axis === 'h'
      ? (last.x + last.w) - first.x
      : (last.y + last.h) - first.y;
    const used = items.reduce((sum, it) => sum + (axis === 'h' ? it.box.w : it.box.h), 0);
    const gap  = (total - used) / (items.length - 1);

    let cursor = axis === 'h' ? first.x : first.y;
    for (const it of items) {
      const current = axis === 'h' ? it.box.x : it.box.y;
      const delta = cursor - current;
      this.translateShape(it.shape, axis === 'h' ? delta : 0, axis === 'h' ? 0 : delta);
      cursor += (axis === 'h' ? it.box.w : it.box.h) + gap;
    }
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  private translateShape(shape: DrawShape, dx: number, dy: number) {
    if (!dx && !dy) return;
    this.updateShape(shape.id, {
      x: shape.x + dx,
      y: shape.y + dy,
      pts: shape.pts ? shape.pts.map((v, i) => v + (i % 2 === 0 ? dx : dy)) : undefined
    });
  }

  /** Iguala largura/altura de toda a seleção ao elemento principal. */
  matchSize(dimension: 'w' | 'h' | 'both') {
    const ref = this.sel;
    const targets = this.selectedShapes().filter(s => !s.locked && s.id !== ref?.id && s.type !== 'pen');
    if (!ref || !targets.length) return;
    for (const s of targets) {
      this.updateShape(s.id, {
        w: dimension === 'h' ? s.w : ref.w,
        h: dimension === 'w' ? s.h : ref.h
      });
    }
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  clearCanvas() {
    if (this.shapes.length && !confirm(`Limpar todos os ${this.shapes.length} elementos desta aba?`)) return;
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

  /** Todas as âncoras — usada no hit-test da seta e na forma sob o cursor. */
  anchorIds(): AnchorId[] {
    return ALL_ANCHORS;
  }

  /**
   * Âncoras desenhadas para uma forma: as quatro principais em todas, e o
   * conjunto completo na forma sob o cursor — assim a tela não vira um tapete
   * de bolinhas, mas há muito mais destino onde a seta realmente vai encostar.
   */
  anchorsFor(s: DrawShape): AnchorId[] {
    return this.hoverShapeId === s.id || this.isSelected(s.id) ? ALL_ANCHORS : PRIMARY_ANCHORS;
  }

  isPrimaryAnchor(anchor: AnchorId): boolean {
    return PRIMARY_ANCHORS.includes(anchor);
  }

  anchorPoint(s: DrawShape, anchor: AnchorId): Point {
    const bounds = this.shapeBounds(s);
    const frac = ANCHOR_FRACTIONS[anchor] ?? ANCHOR_FRACTIONS.top;
    const local = { x: bounds.x + bounds.w * frac.fx, y: bounds.y + bounds.h * frac.fy };
    if (!s.rot || !this.canRotate(s)) return local;
    return this.rotatePoint(local, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }, s.rot);
  }

  anchorCursor(anchor: AnchorId): string {
    const frac = ANCHOR_FRACTIONS[anchor] ?? ANCHOR_FRACTIONS.top;
    if (frac.fx === 0 || frac.fx === 1) return frac.fy === 0 || frac.fy === 1 ? 'crosshair' : 'ew-resize';
    return 'ns-resize';
  }

  private shapeAtPoint(p: Point, excludeId?: string): DrawShape | null {
    for (let i = this.shapes.length - 1; i >= 0; i--) {
      const s = this.shapes[i];
      if (s.id === excludeId || s.type === 'arrow' || s.type === 'line') continue;
      const bounds = this.shapeBounds(s);
      const q = s.rot && this.canRotate(s)
        ? this.rotatePoint(p, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }, -s.rot)
        : p;
      if (q.x >= bounds.x && q.x <= bounds.x + bounds.w && q.y >= bounds.y && q.y <= bounds.y + bounds.h) return s;
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
    const rot = this.canRotate(s) ? (s.rot || 0) : 0;
    const local = rot ? this.rotatePoint(target, center, -rot) : target;
    const dx = local.x - center.x;
    const dy = local.y - center.y;
    if (dx === 0 && dy === 0) return center;

    const halfW = Math.max(1, Math.abs(bounds.w) / 2);
    const halfH = Math.max(1, Math.abs(bounds.h) / 2);
    const scale = 1 / Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
    const edge = { x: center.x + dx * scale, y: center.y + dy * scale };
    return rot ? this.rotatePoint(edge, center, rot) : edge;
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

  /** Linhas do elemento de texto livre (respeita quebras digitadas). */
  textLines(s: DrawShape): string[] {
    const txt = s.text ?? '';
    return txt ? txt.split('\n') : [''];
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

  // ── Alinhamento do texto dentro da forma ──────────────────────────────────

  /** Formas de caixa (nota, texto solto) começam à esquerda; as demais, centradas. */
  textAlignOf(s: DrawShape | null | undefined): TextAlign {
    if (!s) return 'center';
    return s.align ?? (s.type === 'text' || s.type === 'sticky' ? 'left' : 'center');
  }

  textVAlignOf(s: DrawShape | null | undefined): TextVAlign {
    if (!s) return 'middle';
    return s.valign ?? (s.type === 'text' || s.type === 'sticky' ? 'top' : 'middle');
  }

  svgTextAnchor(s: DrawShape): 'start' | 'middle' | 'end' {
    const a = this.textAlignOf(s);
    return a === 'left' ? 'start' : a === 'right' ? 'end' : 'middle';
  }

  /** X da linha de texto conforme o alinhamento horizontal. */
  boxTextX(s: DrawShape, pad = 6): number {
    const x = Math.min(s.x, s.x + s.w);
    const w = Math.abs(s.w);
    const a = this.textAlignOf(s);
    return a === 'left' ? x + pad : a === 'right' ? x + w - pad : x + w / 2;
  }

  /** Baseline da linha `index` conforme o alinhamento vertical. */
  boxTextY(s: DrawShape, index: number, total: number, pad = 6, lineFactor = 1.2): number {
    const fs = s.fontSize || 14;
    const y = Math.min(s.y, s.y + s.h);
    const h = Math.abs(s.h);
    const lineH = fs * lineFactor;
    const blockH = Math.max(1, total) * lineH;
    const v = this.textVAlignOf(s);
    const top = v === 'top'    ? y + pad
              : v === 'bottom' ? y + h - blockH - pad
                               : y + (h - blockH) / 2;
    return top + index * lineH + fs * 0.95;
  }

  setTextAlign(align: TextAlign) {
    this.applyToSelection({ align });
  }

  setTextVAlign(valign: TextVAlign) {
    this.applyToSelection({ valign });
  }

  shapeTextY(s: DrawShape, index: number, total: number): number {
    return this.boxTextY(s, index, total);
  }

  shapeCenterX(s: DrawShape): number {
    return Math.min(s.x, s.x + s.w) + Math.abs(s.w) / 2;
  }

  // ── Geometric shape path generators ──────────────────────────────────────
  /** Toda forma geométrica é um único <path>: um gerador só serve canvas e ícones. */
  isPathShape(type: Tool): boolean {
    return PATH_SHAPES.includes(type);
  }

  shapePath(s: DrawShape): string {
    const b = this.shapeBounds(s);
    return this.shapePathFor(s.type, b.x, b.y, Math.max(1, b.w), Math.max(1, b.h), this.archLabelHeight(s));
  }

  /** Ícone da forma dentro de um viewBox 0 0 24 24 (usado no menu de formas). */
  shapeIconPath(type: Tool): string {
    return this.shapePathFor(type, 2.5, 3, 19, 18);
  }

  shapePathFor(type: Tool, x: number, y: number, w: number, h: number, labelH = 0): string {
    if (ARCH_SHAPES.includes(type)) return this.archPathFor(type, x, y, w, h, labelH);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const n  = (v: number) => Math.round(v * 100) / 100;
    const poly = (pts: [number, number][]) =>
      'M' + pts.map(([px, py]) => `${n(px)} ${n(py)}`).join(' L') + ' Z';
    // Polígono regular inscrito na caixa; offset gira o primeiro vértice.
    const regular = (sides: number, offset: number) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < sides; i++) {
        const a = offset + (Math.PI * 2 * i) / sides;
        pts.push([cx + (w / 2) * Math.cos(a), cy + (h / 2) * Math.sin(a)]);
      }
      return poly(pts);
    };

    switch (type) {
      case 'triangle':
        return poly([[cx, y], [x + w, y + h], [x, y + h]]);

      case 'rightTriangle':
        return poly([[x, y], [x + w, y + h], [x, y + h]]);

      case 'diamond':
        return poly([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]);

      case 'roundRect': {
        const r = Math.min(w, h) * 0.18;
        return `M${n(x + r)} ${n(y)} L${n(x + w - r)} ${n(y)} A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`
             + ` L${n(x + w)} ${n(y + h - r)} A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`
             + ` L${n(x + r)} ${n(y + h)} A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`
             + ` L${n(x)} ${n(y + r)} A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)} Z`;
      }

      case 'pentagon': return regular(5, -Math.PI / 2);
      case 'hexagon':  return regular(6, 0);
      case 'octagon':  return regular(8, Math.PI / 8);

      case 'trapezoid':
        return poly([[x + w * 0.22, y], [x + w * 0.78, y], [x + w, y + h], [x, y + h]]);

      case 'parallelogram':
        return poly([[x + w * 0.24, y], [x + w, y], [x + w * 0.76, y + h], [x, y + h]]);

      case 'star': {
        const ro = Math.min(w, h) / 2;
        const ri = ro * 0.42;
        const pts: [number, number][] = [];
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? ro : ri;
          const a = (Math.PI * i / 5) - Math.PI / 2;
          pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
        return poly(pts);
      }

      case 'cross': {
        const ax = w * 0.33;
        const ay = h * 0.33;
        return poly([
          [x + ax, y], [x + w - ax, y], [x + w - ax, y + ay], [x + w, y + ay],
          [x + w, y + h - ay], [x + w - ax, y + h - ay], [x + w - ax, y + h], [x + ax, y + h],
          [x + ax, y + h - ay], [x, y + h - ay], [x, y + ay], [x + ax, y + ay]
        ]);
      }

      case 'chevron': {
        const k = Math.min(w * 0.28, h * 0.5);
        return poly([
          [x, y], [x + w - k, y], [x + w, cy], [x + w - k, y + h], [x, y + h], [x + k, cy]
        ]);
      }

      case 'arrowBlock': {
        const head = Math.min(w * 0.42, w - 1);
        const top  = y + h * 0.27;
        const bot  = y + h * 0.73;
        return poly([
          [x, top], [x + w - head, top], [x + w - head, y], [x + w, cy],
          [x + w - head, y + h], [x + w - head, bot], [x, bot]
        ]);
      }

      case 'cylinder': {
        const rx = w / 2;
        const ry = Math.min(h * 0.16, h / 2 - 0.5);
        // Corpo (sentido horário) + a "boca" da frente no mesmo sentido, para
        // que o preenchimento não vire um buraco pela regra nonzero.
        return `M${n(x)} ${n(y + ry)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}`
             + ` L${n(x + w)} ${n(y + h - ry)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + h - ry)} Z`
             + ` M${n(x + w)} ${n(y + ry)} A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + ry)}`;
      }

      case 'cloud':
        return `M${n(x + w * 0.13)} ${n(y + h * 0.95)}`
             + ` A${n(w * 0.18)} ${n(h * 0.27)} 0 0 1 ${n(x + w * 0.15)} ${n(y + h * 0.43)}`
             + ` A${n(w * 0.22)} ${n(h * 0.32)} 0 0 1 ${n(x + w * 0.52)} ${n(y + h * 0.20)}`
             + ` A${n(w * 0.22)} ${n(h * 0.28)} 0 0 1 ${n(x + w * 0.87)} ${n(y + h * 0.46)}`
             + ` A${n(w * 0.16)} ${n(h * 0.26)} 0 0 1 ${n(x + w * 0.89)} ${n(y + h * 0.95)} Z`;

      case 'speech': {
        const bh = y + h * 0.78;
        const r  = Math.min(w, h * 0.78) * 0.16;
        return `M${n(x + r)} ${n(y)} L${n(x + w - r)} ${n(y)} A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`
             + ` L${n(x + w)} ${n(bh - r)} A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(bh)}`
             + ` L${n(x + w * 0.42)} ${n(bh)} L${n(x + w * 0.20)} ${n(y + h)} L${n(x + w * 0.28)} ${n(bh)}`
             + ` L${n(x + r)} ${n(bh)} A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(bh - r)}`
             + ` L${n(x)} ${n(y + r)} A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)} Z`;
      }

      case 'heart':
        return `M${n(cx)} ${n(y + h)}`
             + ` C${n(x)} ${n(y + h * 0.66)} ${n(x)} ${n(y + h * 0.30)} ${n(x + w * 0.25)} ${n(y + h * 0.18)}`
             + ` C${n(x + w * 0.40)} ${n(y + h * 0.10)} ${n(cx)} ${n(y + h * 0.20)} ${n(cx)} ${n(y + h * 0.32)}`
             + ` C${n(cx)} ${n(y + h * 0.20)} ${n(x + w * 0.60)} ${n(y + h * 0.10)} ${n(x + w * 0.75)} ${n(y + h * 0.18)}`
             + ` C${n(x + w)} ${n(y + h * 0.30)} ${n(x + w)} ${n(y + h * 0.66)} ${n(cx)} ${n(y + h)} Z`;

      case 'document':
        return `M${n(x)} ${n(y)} L${n(x + w)} ${n(y)} L${n(x + w)} ${n(y + h * 0.84)}`
             + ` C${n(x + w * 0.72)} ${n(y + h * 1.02)} ${n(x + w * 0.28)} ${n(y + h * 0.64)} ${n(x)} ${n(y + h * 0.84)} Z`;

      default:
        return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    }
  }

  /**
   * Componentes de arquitetura. O glifo é desenhado num quadrado no topo da
   * caixa (assim não distorce em caixas largas) e o rótulo cai logo abaixo.
   *
   * Os detalhes internos são traços abertos (área zero) ou contornos fechados
   * no mesmo sentido do corpo: sob a regra nonzero do SVG, sentidos opostos
   * sobrepostos virariam buraco no preenchimento.
   */
  private archPathFor(type: Tool, x: number, y: number, w: number, h: number, labelH = 0): string {
    // A zona é a própria caixa (agrupa outros componentes), não um ícone.
    if (type === 'archZone') return this.shapePathFor('roundRect', x, y, w, h);

    const n  = (v: number) => Math.round(v * 100) / 100;
    const { gx, gy, g } = this.archGlyphBox(x, y, w, h, labelH);
    const P  = (u: number, v: number) => `${n(gx + u * g)} ${n(gy + v * g)}`;

    /** Traço solto: sem área, então só o contorno aparece. */
    const line = (u1: number, v1: number, u2: number, v2: number) => ` M${P(u1, v1)} L${P(u2, v2)}`;
    /** Polígono no sentido horário (topo→direita→base→esquerda). */
    const poly = (pts: [number, number][], close = true) =>
      ' M' + pts.map(([u, v]) => P(u, v)).join(' L') + (close ? ' Z' : '');
    const rect = (u1: number, v1: number, u2: number, v2: number) =>
      poly([[u1, v1], [u2, v1], [u2, v2], [u1, v2]]);
    const arc = (u1: number, v1: number, ru: number, rv: number, u2: number, v2: number) =>
      ` M${P(u1, v1)} A${n(ru * g)} ${n(rv * g)} 0 0 1 ${P(u2, v2)}`;

    switch (type) {
      case 'archUser':
        // Cabeça + ombros (mesmo sentido horário: senão o encontro vira buraco)
        return (`M${P(0.33, 0.22)} A${n(0.17 * g)} ${n(0.17 * g)} 0 1 1 ${P(0.67, 0.22)}`
              + ` A${n(0.17 * g)} ${n(0.17 * g)} 0 1 1 ${P(0.33, 0.22)} Z`
              + ` M${P(0.08, 0.98)} C${P(0.08, 0.30)} ${P(0.92, 0.30)} ${P(0.92, 0.98)} Z`).trim();

      case 'archBrowser':
        return (rect(0.04, 0.10, 0.96, 0.74)
              + line(0.04, 0.28, 0.96, 0.28)
              + poly([[0.38, 0.74], [0.34, 0.97], [0.66, 0.97], [0.62, 0.74]], false)).trim();

      case 'archMobile':
        return (rect(0.28, 0.03, 0.72, 0.97)
              + line(0.43, 0.13, 0.57, 0.13)
              + line(0.42, 0.88, 0.58, 0.88)).trim();

      case 'archServer':
        return (rect(0.12, 0.05, 0.88, 0.95)
              + line(0.12, 0.35, 0.88, 0.35)
              + line(0.12, 0.65, 0.88, 0.65)
              + line(0.20, 0.20, 0.32, 0.20)
              + line(0.20, 0.50, 0.32, 0.50)
              + line(0.20, 0.80, 0.32, 0.80)).trim();

      case 'archComponent':
        // Componente UML: caixa com as duas abas laterais
        return (rect(0.24, 0.10, 0.98, 0.90)
              + rect(0.02, 0.24, 0.42, 0.40)
              + rect(0.02, 0.60, 0.42, 0.76)).trim();

      case 'archDatabase':
        return (`M${P(0.06, 0.18)} A${n(0.44 * g)} ${n(0.13 * g)} 0 0 1 ${P(0.94, 0.18)}`
              + ` L${P(0.94, 0.82)} A${n(0.44 * g)} ${n(0.13 * g)} 0 0 1 ${P(0.06, 0.82)} Z`
              + arc(0.94, 0.18, 0.44, 0.13, 0.06, 0.18)).trim();

      case 'archStorage':
        // Balde de armazenamento (objetos/arquivos)
        return (poly([[0.10, 0.20], [0.90, 0.20], [0.76, 0.94], [0.24, 0.94]])
              + arc(0.10, 0.20, 0.40, 0.10, 0.90, 0.20)).trim();

      case 'archQueue':
        return (rect(0.04, 0.26, 0.96, 0.74)
              + line(0.36, 0.26, 0.36, 0.74)
              + line(0.68, 0.26, 0.68, 0.74)).trim();

      case 'archCache':
        // Módulo de memória: corpo + pinos
        return (rect(0.06, 0.26, 0.94, 0.66)
              + line(0.22, 0.66, 0.22, 0.86)
              + line(0.41, 0.66, 0.41, 0.86)
              + line(0.59, 0.66, 0.59, 0.86)
              + line(0.78, 0.66, 0.78, 0.86)).trim();

      case 'archApi':
        // Gateway: hexágono com a requisição passando
        return (poly([[0.24, 0.10], [0.76, 0.10], [1, 0.5], [0.76, 0.90], [0.24, 0.90], [0, 0.5]])
              + line(0.26, 0.50, 0.70, 0.50)
              + line(0.70, 0.50, 0.60, 0.40)
              + line(0.70, 0.50, 0.60, 0.60)).trim();

      case 'archBalancer':
        // Entra uma requisição, saem várias
        return (`M${P(0.28, 0.50)} A${n(0.22 * g)} ${n(0.22 * g)} 0 1 1 ${P(0.72, 0.50)}`
              + ` A${n(0.22 * g)} ${n(0.22 * g)} 0 1 1 ${P(0.28, 0.50)} Z`
              + line(0, 0.50, 0.28, 0.50)
              + line(0.72, 0.50, 1, 0.18)
              + line(0.72, 0.50, 1, 0.50)
              + line(0.72, 0.50, 1, 0.82)).trim();

      case 'archFirewall':
        // Parede de tijolos
        return (rect(0.04, 0.16, 0.96, 0.84)
              + line(0.04, 0.39, 0.96, 0.39)
              + line(0.04, 0.61, 0.96, 0.61)
              + line(0.50, 0.16, 0.50, 0.39)
              + line(0.27, 0.39, 0.27, 0.61)
              + line(0.73, 0.39, 0.73, 0.61)
              + line(0.50, 0.61, 0.50, 0.84)).trim();

      case 'archNetwork':
        // Switch com portas para cima e para baixo
        return (rect(0.10, 0.36, 0.90, 0.64)
              + line(0.30, 0.36, 0.30, 0.06)
              + line(0.70, 0.36, 0.70, 0.06)
              + line(0.30, 0.64, 0.30, 0.94)
              + line(0.70, 0.64, 0.70, 0.94)).trim();

      case 'archFunction':
        // Raio: função serverless / evento
        return poly([
          [0.58, 0.04], [0.22, 0.54], [0.46, 0.54], [0.38, 0.96], [0.78, 0.42], [0.52, 0.42]
        ]).trim();

      default:
        return rect(0, 0, 1, 1).trim();
    }
  }

  /**
   * Deslocamento vertical do texto em formas cujo "miolo" não é o centro da
   * caixa (triângulo afunila no topo, balão tem rabicho embaixo, etc.).
   */
  private static readonly TEXT_OFFSET: Partial<Record<Tool, number>> = {
    triangle: 0.18, rightTriangle: 0.14, chevron: 0, cloud: 0.04,
    speech: -0.10, heart: 0.08, document: -0.04, trapezoid: 0.06
  };

  /**
   * Caixa do glifo de um componente de arquitetura.
   *
   * O glifo é sempre quadrado — esticá-lo distorceria o ícone — mas o bloco
   * "glifo + rótulo" fica centralizado na caixa e cresce até preencher a altura
   * disponível. Antes o glifo era fixo em 66% da altura e grudado no topo, o que
   * deixava uma faixa vazia enorme embaixo em caixas altas.
   */
  private archGlyphBox(x: number, y: number, w: number, h: number, labelH = 0) {
    const label = Math.max(0, Math.min(labelH, h * 0.5));
    const g  = Math.max(1, Math.min(w * 0.92, h - label));
    const gx = x + (w - g) / 2;
    const gy = y + Math.max(0, (h - label - g) / 2);
    return { gx, gy, g, label };
  }

  /** Altura reservada ao rótulo de um componente de arquitetura (0 se não há texto). */
  private archLabelHeight(s: DrawShape): number {
    if (!ARCH_SHAPES.includes(s.type) || s.type === 'archZone') return 0;
    const lines = this.shapeTextLines(s).length;
    if (!lines) return 0;
    const fs = s.fontSize || 14;
    return lines * fs * 1.2 + fs * 0.6;
  }

  shapeTextCenterY(s: DrawShape, index: number, total: number): number {
    // Componentes de arquitetura: rótulo colado embaixo do glifo. Numa fração
    // fixa da altura ele descolava do ícone em caixas altas.
    if (ARCH_SHAPES.includes(s.type) && s.type !== 'archZone') {
      const b   = this.shapeBounds(s);
      const fs  = s.fontSize || 14;
      const box = this.archGlyphBox(b.x, b.y, Math.max(1, b.w), Math.max(1, b.h), this.archLabelHeight(s));
      return box.gy + box.g + fs * 1.05 + index * fs * 1.2;
    }
    // Na zona o rótulo fica no topo, para não cobrir o que ela envolve.
    const ratio = s.type === 'archZone' ? -0.38 : DrawingPanelComponent.TEXT_OFFSET[s.type] ?? 0;
    return this.shapeTextY(s, index, total) + Math.abs(s.h) * ratio;
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
  /**
   * Escuta no documento (e não no host) porque o painel só é montado na seção de
   * desenhos: assim atalhos como Ctrl+D/Ctrl+S funcionam mesmo sem foco no canvas,
   * evitando que o navegador abra "adicionar favorito"/"salvar página".
   */
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.current) return;
    const el  = document.activeElement as HTMLElement | null;
    const tag = (el?.tagName ?? '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable === true;

    if (typing || this.editingId) {
      // Durante a edição de texto: só tratamos fonte/negrito/itálico e Escape.
      if (this.editingId && (e.ctrlKey || e.metaKey)) {
        if (this.handleFontShortcuts(e)) return;
      }
      if (e.key === 'Escape' && this.editingId) this.commitText();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // ── Pan ──
    if (e.key === ' ') { e.preventDefault(); this.spaceDown = true; return; }

    // ── Arquivo ──
    if (mod && key === 's') { e.preventDefault(); this.persistNow(); this.toast.show('Desenho salvo.', 'success', 2000); return; }

    // ── History ──
    if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); this.redo(); return; }

    // ── Clipboard ──
    if (mod && e.altKey && key === 'c') { e.preventDefault(); this.copyStyle();  return; }
    if (mod && e.altKey && key === 'v') { e.preventDefault(); this.pasteStyle(); return; }
    if (mod && key === 'c') { e.preventDefault(); this.copySelection(); return; }
    if (mod && key === 'x') { e.preventDefault(); this.cutSelection();  return; }
    if (mod && key === 'v') {
      // Sem clipboard interno deixamos o evento seguir para o handler de paste
      // (permite colar imagens/JSON vindos de fora).
      if (!this.clipboard.length) return;
      e.preventDefault();
      this.pasteClipboard(!e.shiftKey);
      return;
    }

    // ── Fonte / texto ──
    if (mod && this.handleFontShortcuts(e)) return;

    // ── Ordem das camadas ──
    if (mod && (e.key === ']' || key === ']')) { e.preventDefault(); e.shiftKey ? this.bringToFront() : this.bringForward(); return; }
    if (mod && (e.key === '[' || key === '[')) { e.preventDefault(); e.shiftKey ? this.sendToBack()   : this.sendBackward(); return; }

    // ── Seleção ──
    if ((e.key === 'Delete' || e.key === 'Backspace') && (this.selectedId || this.selectedIds.length)) { e.preventDefault(); this.deleteSelected(); return; }
    if (mod && key === 'd') { e.preventDefault(); this.duplicateSelected(); return; }
    if (mod && key === 'a') { e.preventDefault(); this.selectAll(); return; }
    if (mod && key === 'l') { e.preventDefault(); this.toggleLock(); return; }
    if (mod && key === 'g' && e.shiftKey) { e.preventDefault(); this.ungroupSelection(); return; }
    if (mod && key === 'g') { e.preventDefault(); this.groupSelection(); return; }
    if (e.key === 'Escape') {
      this.clearSelection();
      this.closePopovers();
      this.closeSidebarMenus();
      this.closeCanvasContextMenu();
      this.cdr.markForCheck();
      return;
    }

    // ── Rotação: Alt + ← / → (15°, ou 90° com Shift) ──
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const step = e.shiftKey ? 90 : 15;
      this.rotateSelection(e.key === 'ArrowRight' ? step : -step);
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.setRotation(0); return; }

    // ── Ferramentas ──
    if (!mod && !e.altKey && !e.shiftKey) {
      const toolMap: Record<string, Tool> = {
        v: 'select', s: 'select',
        p: 'pen',
        r: 'rect',
        e: 'ellipse', o: 'ellipse',
        a: 'arrow',
        l: 'line',
        t: 'text',
        n: 'sticky',
        d: 'diamond',
        i: 'triangle',
        h: 'hexagon',
      };
      const tool = toolMap[key];
      if (tool) { e.preventDefault(); this.setTool(tool); return; }
    }

    // ── Vista ──
    if (!mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); this.zoomIn(); return; }
    if (!mod && e.key === '-')  { e.preventDefault(); this.zoomOut(); return; }
    if (!mod && e.key === '0')  { e.preventDefault(); this.resetZoom(); return; }
    if (!mod && e.key === '1')  { e.preventDefault(); this.fitContent(); return; }
    if (!mod && e.key === '2')  { e.preventDefault(); this.zoomToSelection(); return; }
    if (!mod && key === 'f')    { e.preventDefault(); e.shiftKey ? this.zoomToSelection() : this.fitContent(); return; }
    if (!mod && key === 'g' && e.shiftKey) { e.preventDefault(); this.gridEnabled = !this.gridEnabled; this.cdr.markForCheck(); return; }
    if (!mod && key === 'a' && e.shiftKey) { e.preventDefault(); this.toggleAnchors(); return; }
    if (!mod && key === 'm')    { e.preventDefault(); this.toggleSnap(); return; }
    if (!mod && key === 'q')    { e.preventDefault(); this.toggleToolLock(); return; }
    if (!mod && (e.key === '?' || (e.key === '/' && e.shiftKey))) { e.preventDefault(); this.toggleShortcuts(); return; }

    // ── Mover com as setas ──
    if (!e.altKey && (this.selectedIds.length || this.sel) && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : this.snapEnabled ? this.gridSize : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
      this.captureDragOrigins(this.selectedIds.length ? this.selectedIds : this.sel ? [this.sel.id] : []);
      this.moveSelectedBy(dx, dy);
      this.dragOrigins.clear();
      this.pushHistory();
      this.scheduleSave();
      this.cdr.markForCheck();
    }
  }

  /** Ctrl+B/I, Ctrl+Shift+> / < — retorna true se o atalho foi consumido. */
  private handleFontShortcuts(e: KeyboardEvent): boolean {
    const key = e.key.toLowerCase();
    if (key === 'b') { e.preventDefault(); this.toggleBold(); return true; }
    if (key === 'i') { e.preventDefault(); this.toggleItalic(); return true; }
    if (e.key === '>' || e.key === '.') { e.preventDefault(); this.bumpFontSize(2); return true; }
    if (e.key === '<' || e.key === ',') { e.preventDefault(); this.bumpFontSize(-2); return true; }
    // Alinhamento do texto: Ctrl+Shift+L / E / R (esquerda, centro, direita)
    if (e.shiftKey && key === 'l') { e.preventDefault(); this.setTextAlign('left');   return true; }
    if (e.shiftKey && key === 'e') { e.preventDefault(); this.setTextAlign('center'); return true; }
    if (e.shiftKey && key === 'r') { e.preventDefault(); this.setTextAlign('right');  return true; }
    return false;
  }

  toggleToolLock() {
    this.lockTool = !this.lockTool;
    this.toast.show(
      this.lockTool
        ? 'Ferramenta travada: continua ativa após desenhar.'
        : 'Ferramenta liberada: volta para Selecionar após desenhar.',
      'info', 2500
    );
    this.cdr.markForCheck();
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    if (this.snapEnabled) this.gridEnabled = true;
    this.toast.show(this.snapEnabled ? 'Alinhar à grade: ativo.' : 'Alinhar à grade: desativado.', 'info', 2000);
    this.cdr.markForCheck();
  }

  /** Colar de fora do app: imagens do sistema ou elementos copiados em outra janela. */
  @HostListener('document:paste', ['$event'])
  onPaste(e: ClipboardEvent) {
    if (!this.current || this.editingId) return;
    const el  = document.activeElement as HTMLElement | null;
    const tag = (el?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;

    const items = e.clipboardData?.items ? [...e.clipboardData.items] : [];
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) { e.preventDefault(); this.insertImageFile(file); return; }
    }

    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (!text) return;
    // Elementos copiados em outra janela do planner
    try {
      const parsed = JSON.parse(text);
      if (parsed?.source === 'planner-drawing-clipboard' && Array.isArray(parsed.shapes) && parsed.shapes.length) {
        e.preventDefault();
        this.clipboard = parsed.shapes;
        this.pasteClipboard(true);
        return;
      }
    } catch { /* texto comum */ }

    // Texto simples vira um elemento de texto no cursor
    e.preventDefault();
    const target = this.pointerInside ? this.lastPt : { x: this.panX + 60, y: this.panY + 60 };
    const width  = Math.max(120, Math.min(600, text.length * (this.fontSize * 0.6)));
    const shape  = this.makeShape('text', target.x, target.y, width, this.fontSize * 1.8);
    shape.text   = text;
    this.shapes  = [...this.shapes, shape];
    this.setTool('select');
    this.setSelection([shape.id]);
    this.pushHistory();
    this.scheduleSave();
    this.cdr.markForCheck();
  }

  @HostListener('document:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    if (e.key === ' ') this.spaceDown = false;
  }

  @HostListener('window:blur')
  onWindowBlur() { this.spaceDown = false; }

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
      select: 'Selecionar (V)', pen: 'Desenho livre (P)', rect: 'Retângulo (R)',
      ellipse: 'Elipse (E)', arrow: 'Seta (A)', text: 'Texto (T)', sticky: 'Nota (S)',
      line: 'Linha (L)', triangle: 'Triângulo (I)', diamond: 'Losango (D)', star: 'Estrela',
      image: 'Imagem',
      roundRect: 'Retângulo arredondado', rightTriangle: 'Triângulo retângulo',
      pentagon: 'Pentágono', hexagon: 'Hexágono (H)', octagon: 'Octógono',
      trapezoid: 'Trapézio', parallelogram: 'Paralelogramo',
      cross: 'Cruz', chevron: 'Chevron (etapa)', arrowBlock: 'Seta em bloco',
      cylinder: 'Cilindro', cloud: 'Nuvem', speech: 'Balão de fala',
      heart: 'Coração', document: 'Documento',
      archZone: 'Zona / limite', archUser: 'Usuário', archBrowser: 'Navegador / web',
      archMobile: 'App mobile', archServer: 'Servidor', archComponent: 'Componente',
      archDatabase: 'Banco de dados', archStorage: 'Armazenamento',
      archQueue: 'Fila de mensagens', archCache: 'Cache', archApi: 'API / gateway',
      archBalancer: 'Balanceador', archFirewall: 'Firewall', archNetwork: 'Rede / switch',
      archFunction: 'Função serverless'
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
      this.insertImageFile(file);
    };
    input.click();
  }

  /** Insere um arquivo de imagem no canvas (upload ou colagem via Ctrl+V). */
  private insertImageFile(file: File, at?: Point) {
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
        // No ponto informado, no cursor, ou centralizado na área visível.
        const center = at ?? (this.pointerInside ? this.lastPt : {
          x: this.panX + (this.vw / this.zoom) / 2,
          y: this.panY + (this.vh / this.zoom) / 2
        });
        const shape = this.makeShape('image', center.x - w / 2, center.y - h / 2, w, h);
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
  }

  onCanvasLeave(e: MouseEvent) {
    this.pointerInside = false;
    this.hoverShapeId = null;
    this.onMouseUp(e);
  }

  /**
   * Modo do cursor do canvas. O crosshair nativo é uma cruz preta de 1px que
   * some sobre a grade e em fundos escuros, então usamos um cursor próprio
   * (com contorno branco) definido no SCSS por classe.
   */
  cursorMode(): 'select' | 'draw' | 'text' | 'grab' | 'grabbing' {
    if (this.isPanning) return 'grabbing';
    if (this.spaceDown) return 'grab';
    if (this.tool === 'select') return 'select';
    if (this.tool === 'text' || this.tool === 'sticky') return 'text';
    return 'draw';
  }

  /** Cursor das formas: null herda o cursor do SVG (pan ou desenho). */
  shapeCursor(): string | null {
    if (this.spaceDown || this.isPanning) return null;
    return this.tool === 'select' ? 'move' : null;
  }
}
