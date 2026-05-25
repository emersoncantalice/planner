import {
  ChangeDetectorRef,
  Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, EventEmitter,
  inject, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { dateToYmd } from '../../core/business-days';
import { FeriadosService } from '../../core/feriados.service';

  // ---
type GStatus = 'PLANEJADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'ATRASADO' | 'BLOQUEADO';
type DragType = 'move' | 'resize-left' | 'resize-right';

export interface Etapa {
  id: string;
  label: string;
  done: boolean;
}

interface DragState {
  type: DragType;
  item: any;
  startX: number;
  origStart: Date;
  origEnd: Date;
}

interface DragPreview {
  itemId: string;
  start: Date;
  end: Date;
}
interface TimelineMarker {
  id: string;
  label: string;
  date: string; // yyyy-mm-dd
  description?: string;
}
type TimelineHeader = { label: string; left: number; width: number; isFirst: boolean; showLabel?: boolean; isMonthStart?: boolean; isoDate?: string };

@Component({
  selector: 'app-gantt-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './gantt-panel.component.html',
  styleUrl: './gantt-panel.component.scss'
})
export class GanttPanelComponent implements OnChanges, OnDestroy {
  private feriados = inject(FeriadosService);
  private cdr      = inject(ChangeDetectorRef);
  private zone     = inject(NgZone);

  @Input() resumo: any[] = [];
  @Input() projetoSelecionado: any = null;
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() embedded = false;

  @Output() selectProject      = new EventEmitter<string>();
  @Output() addScheduleItem    = new EventEmitter<{ titulo: string; descricao: string; inicioPlanejado: string | null; fimPlanejado: string | null; permiteParalelo: boolean }>();
  @Output() updateScheduleItem = new EventEmitter<{ itemId: string; titulo?: string; descricao?: string; inicioPlanejado?: string | null; fimPlanejado?: string | null; permiteParalelo?: boolean; status?: string }>();
  @Output() deleteScheduleItem = new EventEmitter<string>();
  @Output() logReplanejamento  = new EventEmitter<{
    scheduleItemId: string;
    scheduleItemTitulo: string;
    tipoAlteracao: string;
    inicioAnterior: string;
    fimAnterior: string;
    inicioNovo: string;
    fimNovo: string;
  }>();

  // ---
  projetoId        = '';
  formVisible      = false;
  editingItem: any  = null;
  confirmDeleteId   = '';
  formError         = '';
  dateWarning       = '';

  timelineScale: 'DIA' | 'SEMANA' | 'MES' = 'DIA';
  private readonly basePxPerDay = 26;
  private readonly zoomLevels = [0.75, 0.9, 1, 1.15, 1.3, 1.5];
  private _zoomIndex = 2;
  get zoomIndex(): number { return this._zoomIndex; }
  get PX_PER_DAY(): number { return Math.round(this.basePxPerDay * this.zoomLevels[this._zoomIndex]); }
  readonly LEFT_W     = 420;

  novaAtividade = this.emptyForm();
  editForm      = this.emptyForm();

  readonly barColors: { value: string; label: string }[] = [
    { value: '#1d63da', label: 'Azul' },
    { value: '#16a34a', label: 'Verde' },
    { value: '#dc2626', label: 'Vermelho' },
    { value: '#d97706', label: 'Âmbar' },
    { value: '#7c3aed', label: 'Roxo' },
    { value: '#0ea5e9', label: 'Céu' },
    { value: '#db2777', label: 'Rosa' },
    { value: '#64748b', label: 'Cinza' },
    { value: '#ea580c', label: 'Laranja' },
    { value: '#0d9488', label: 'Verde-água' },
  ];
  markerDate = '';
  markerLabel = '';
  markerDescription = '';
  timelineMarkers: TimelineMarker[] = [];
  markerMessage = '';
  dayActionOpen = false;
  dayActionDate = '';
  dayActionLeft = 0;
  /** Viewport-relative coordinates for the fixed popup */
  dayActionFixedLeft = 0;
  dayActionFixedTop  = 0;

  exportandoImagem = false;
  @ViewChild('ganttTable') private ganttTableRef?: ElementRef<HTMLElement>;
  timelineHovered = false;
  selectedTimelineDate = '';

  // ---
  dragState:   DragState   | null = null;
  dragPreview: DragPreview | null = null;
  private _justDragged = false;

  /** Element references captured at drag-start for direct DOM updates during drag */
  private _dragBarEl:     HTMLElement | null = null;
  private _dragTooltipEl: HTMLElement | null = null;

  private readonly _onMouseMoveBound = (e: MouseEvent) => this._onMouseMove(e);
  private readonly _onMouseUpBound   = (e: MouseEvent) => this._onMouseUp(e);
  private readonly DAY_MS = 86_400_000;

  ngOnChanges(c: SimpleChanges) {
    if (c['projetoSelecionado'] && this.projetoSelecionado) {
      this.projetoId = this.projetoSelecionado.id ?? this.projetoId;
      this.loadMarkers();
    }
  }

  ngOnDestroy() {
    this._removeListeners();
  }

  // ---
  onBarMouseDown(event: MouseEvent, item: any, type: DragType) {
    event.preventDefault();
    event.stopPropagation(); // don't trigger row click / startEdit

    if (!item.inicioPlanejado || !item.fimPlanejado) return;

    const origStart = new Date(item.inicioPlanejado); origStart.setHours(0, 0, 0, 0);
    const origEnd   = new Date(item.fimPlanejado);   origEnd.setHours(0, 0, 0, 0);

    this.dragState   = { type, item, startX: event.clientX, origStart, origEnd };
    this.dragPreview = { itemId: item.id, start: new Date(origStart), end: new Date(origEnd) };

    // Capture the bar element now so _onMouseMove can update it directly
    this._dragBarEl     = (event.target as HTMLElement).closest('.gp-bar') as HTMLElement | null;
    this._dragTooltipEl = null; // resolved lazily on first mousemove (tooltip rendered after CD)

  // ---
    this.zone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this._onMouseMoveBound);
      document.addEventListener('mouseup',   this._onMouseUpBound);
    });
  }

  private _onMouseMove(event: MouseEvent) {
    if (!this.dragState) return;

    const deltaX    = event.clientX - this.dragState.startX;
    const deltaDays = deltaX / this.PX_PER_DAY;
    const dayMs = 86_400_000;

    const { type, origStart, origEnd } = this.dragState;
    let newStart = new Date(origStart.getTime());
    let newEnd   = new Date(origEnd.getTime());

    if (type === 'move') {
      newStart = new Date(origStart.getTime() + deltaDays * dayMs);
      newEnd   = new Date(origEnd.getTime()   + deltaDays * dayMs);
    } else if (type === 'resize-left') {
      newStart = new Date(origStart.getTime() + deltaDays * dayMs);
      if (newStart >= newEnd) newStart = new Date(newEnd.getTime() - dayMs);
    } else {
      newEnd = new Date(origEnd.getTime() + deltaDays * dayMs);
      if (newEnd <= newStart) newEnd = new Date(newStart.getTime() + dayMs);
    }

    // Keep model in sync for mouseup
    this.dragPreview = { itemId: this.dragState.item.id, start: newStart, end: newEnd };

    // --- Direct DOM update: bypasses Angular CD entirely → frame-perfect response ---
    const r = this.dateRange();
    if (r && this._dragBarEl) {
      const left     = Math.max(0, (newStart.getTime() - r.min.getTime()) / dayMs * this.PX_PER_DAY);
      const rawDays  = (newEnd.getTime() - newStart.getTime()) / dayMs + 1;
      const width    = Math.max(this.PX_PER_DAY * 0.6, rawDays * this.PX_PER_DAY);

      this._dragBarEl.style.left  = `${left}px`;
      this._dragBarEl.style.width = `${width}px`;

      // Tooltip is rendered by Angular after mousedown CD — find it lazily
      if (!this._dragTooltipEl) {
        this._dragTooltipEl =
          this._dragBarEl.parentElement?.querySelector('.gp-drag-tooltip') as HTMLElement | null;
      }
      if (this._dragTooltipEl) {
        this._dragTooltipEl.style.left  = `${left}px`;
        this._dragTooltipEl.style.width = `${width}px`;
        this._dragTooltipEl.textContent =
          `${newStart.toLocaleDateString('pt-BR')} → ${newEnd.toLocaleDateString('pt-BR')}`;
      }
    }
  }

  private _onMouseUp(event: MouseEvent) {
    this._removeListeners();
    this._dragBarEl     = null;
    this._dragTooltipEl = null;

    if (!this.dragState || !this.dragPreview) {
      this.dragState   = null;
      this.dragPreview = null;
      this.zone.run(() => this.cdr.detectChanges());
      return;
    }

    const { item, origStart, origEnd, type: dragType } = this.dragState;
    let { start, end } = this.dragPreview;

  // ---
    const deltaX    = event.clientX - this.dragState.startX;
    const moved     = Math.abs(deltaX) >= 2;

    this.dragState   = null;
    this.dragPreview = null;

    if (moved) {
      this._justDragged = true;

  // ---
      const fixed = this.normalizeRangeToBusinessDays(start, end);
      start = fixed.start;
      end   = fixed.end;

      const conflito = this.validarConflitoParalelismo(
        `${dateToYmd(start)}T12:00:00Z`,
        `${dateToYmd(end)}T12:00:00Z`,
        !!item.permiteParalelo,
        item.id
      );
      if (conflito) {
        this.zone.run(() => {
          this.dateWarning = conflito;
          this.cdr.detectChanges();
        });
        return;
      }

      const tipoAlteracao =
        dragType === 'move'         ? 'MOVER'
        : dragType === 'resize-left'  ? 'REDIMENSIONAR_INICIO'
        : 'REDIMENSIONAR_FIM';

      this.zone.run(() => {
  // ---
  // ---
        this.updateScheduleItem.emit({
          itemId:          item.id,
          inicioPlanejado: `${dateToYmd(start)}T12:00:00Z`,
          fimPlanejado:    `${dateToYmd(end)}T12:00:00Z`,
          permiteParalelo: !!item.permiteParalelo,
          _replanejamento: {
            scheduleItemId:     item.id,
            scheduleItemTitulo: item.titulo ?? '',
            tipoAlteracao,
            inicioAnterior: `${dateToYmd(origStart)}T12:00:00Z`,
            fimAnterior:    `${dateToYmd(origEnd)}T12:00:00Z`,
            inicioNovo:     `${dateToYmd(start)}T12:00:00Z`,
            fimNovo:        `${dateToYmd(end)}T12:00:00Z`,
          },
        } as any);
        this.cdr.detectChanges();
      });
    } else {
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  private _removeListeners() {
    document.removeEventListener('mousemove', this._onMouseMoveBound);
    document.removeEventListener('mouseup',   this._onMouseUpBound);
  }

  /** Returns live (drag-adjusted) dates for a given item. */
  private _effectiveDates(item: any): { start: Date; end: Date } | null {
    if (!item.inicioPlanejado || !item.fimPlanejado) return null;
    const preview = this.dragPreview;
    if (preview && preview.itemId === item.id) {
      return { start: preview.start, end: preview.end };
    }
    const s = new Date(item.inicioPlanejado); s.setHours(0, 0, 0, 0);
    const e = new Date(item.fimPlanejado);   e.setHours(0, 0, 0, 0);
    return { start: s, end: e };
  }

  /** Text shown in the drag tooltip (date range). */
  dragTooltipFor(item: any): string {
    const preview = this.dragPreview;
    if (!preview || preview.itemId !== item.id) return '';
    return `${preview.start.toLocaleDateString('pt-BR')} → ${preview.end.toLocaleDateString('pt-BR')}`;
  }

  // ---
  onRowClick(item: any) {
    if (this._justDragged) { this._justDragged = false; return; }
    this.startEdit(item);
  }

  // ---
  // ---
  // ---

  private emptyForm() {
    return {
      titulo: '', descricao: '', inicioPlanejado: '', fimPlanejado: '',
      status: 'PLANEJADO' as GStatus, responsavel: '', pct: 0,
      permiteParalelo: false, predecessorId: '', perfilId: '',
      etapas: [] as Etapa[], newEtapaLabel: '',
      cor: ''
    };
  }

  // ---
  private readonly ET_TAG     = '##ETAPAS:';
  private readonly ET_TAG_END = '##';

  private extractEtapas(descricao?: string | null): Etapa[] {
    const raw = String(descricao ?? '');
    const idx = raw.indexOf(this.ET_TAG);
    if (idx < 0) return [];
    const rest   = raw.slice(idx + this.ET_TAG.length);
    const endIdx = rest.indexOf(this.ET_TAG_END);
    if (endIdx < 0) return [];
    try { return JSON.parse(rest.slice(0, endIdx)); } catch { return []; }
  }

  private encodeEtapas(etapas: Etapa[]): string {
    return etapas.length ? `${this.ET_TAG}${JSON.stringify(etapas)}${this.ET_TAG_END}` : '';
  }

  etapasProgress(item: any): { done: number; total: number } | null {
    const e = this.extractEtapas(item.descricao);
    return e.length ? { done: e.filter((x: Etapa) => x.done).length, total: e.length } : null;
  }

  etapasDoneCount(etapas: Etapa[]): number { return etapas.filter(e => e.done).length; }
  toggleEtapa(etapa: Etapa)                { etapa.done = !etapa.done; }

  addNewEtapa() {
    const label = this.editForm.newEtapaLabel.trim();
    if (!label) return;
    this.editForm.etapas.push({ id: crypto.randomUUID(), label, done: false });
    this.editForm.newEtapaLabel = '';
  }

  removeEtapa(etapa: Etapa) {
    this.editForm.etapas = this.editForm.etapas.filter(e => e.id !== etapa.id);
  }

  // ---
  validateDate(form: any, field: 'inicioPlanejado' | 'fimPlanejado') {
    this.dateWarning = '';
    const v = form[field];
    if (!v) return;
    const d      = new Date(v + 'T12:00:00');
    const reason = this.feriados.nonWorkingReason(d);
    if (reason) {
      const next  = this.feriados.nextBusinessDay(d);
      form[field] = dateToYmd(next);
      this.dateWarning = `Era ${reason} — data ajustada para o próximo dia útil: ${next.toLocaleDateString('pt-BR')}`;
    }
  }

  private normalizeRangeToBusinessDays(start: Date, end: Date): { start: Date; end: Date } {
    let s = this.feriados.nextBusinessDay(start);
    let e = this.feriados.nextBusinessDay(end);
    if (e < s) e = new Date(s);
    return { start: s, end: e };
  }

  // ---
  onProjetoChange(id: string) {
    this.projetoId   = id;
    this.editingItem = null;
    this.formVisible = false;
    if (id) this.selectProject.emit(id);
  }

  atividades(): any[]         { return this.projetoSelecionado?.cronograma ?? []; }
  atividadesComDatas(): any[] { return this.atividades().filter((a: any) => a.inicioPlanejado && a.fimPlanejado); }

  // ---
  dateRange(): { min: Date; max: Date; totalDays: number } | null {
    const itens  = this.atividadesComDatas();
    if (!itens.length) return null;
    const starts = itens.map((a: any) => new Date(a.inicioPlanejado).getTime()).filter(isFinite);
    const ends   = itens.map((a: any) => new Date(a.fimPlanejado).getTime()).filter(isFinite);
    if (!starts.length || !ends.length) return null;
    const minD = new Date(Math.min(...starts)); minD.setHours(0, 0, 0, 0);
    const maxD = new Date(Math.max(...ends));   maxD.setHours(23, 59, 59, 999);
    minD.setDate(minD.getDate() - 2);
    maxD.setDate(maxD.getDate() + 2);
    const totalDays = Math.max(1, Math.ceil((maxD.getTime() - minD.getTime()) / 86_400_000));
    return { min: minD, max: maxD, totalDays };
  }

  timelineWidth(): number { const r = this.dateRange(); return r ? r.totalDays * this.PX_PER_DAY : 700; }
  totalWidth(): number    { return this.LEFT_W + this.timelineWidth(); }

  get zoomLevelCount(): number { return this.zoomLevels.length; }

  zoomIn()  { if (this._zoomIndex < this.zoomLevels.length - 1) this._zoomIndex++; }
  zoomOut() { if (this._zoomIndex > 0) this._zoomIndex--; }
  setZoomIndex(v: number) { this._zoomIndex = Math.max(0, Math.min(this.zoomLevels.length - 1, v)); }
  zoomLabel(): string { return `${Math.round(this.zoomLevels[this._zoomIndex] * 100)}%`; }
  canZoomIn(): boolean { return this._zoomIndex < this.zoomLevels.length - 1; }
  canZoomOut(): boolean { return this._zoomIndex > 0; }

  onTimelineMouseEnter() { this.timelineHovered = true; }
  onTimelineMouseLeave() { this.timelineHovered = false; }

  onWindowKeydown(event: KeyboardEvent) {
    if (!this.timelineHovered || !event.ctrlKey) return;
    const key = event.key;
    if (key === '+' || key === '=' || key === 'Add') {
      event.preventDefault();
      this.zoomIn();
      return;
    }
    if (key === '-' || key === '_' || key === 'Subtract') {
      event.preventDefault();
      this.zoomOut();
    }
  }

  // ---
  dayHeaders(): TimelineHeader[] {
    const r = this.dateRange();
    if (!r) return [];
    const out: TimelineHeader[] = [];
    const cur = new Date(r.min);
    let first = true;
    const labelStep = 1;
    let idx = 0;
    while (cur <= r.max) {
      const dayStart = new Date(cur); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(cur); dayEnd.setHours(23, 59, 59, 999);
      const clampS = new Date(Math.max(dayStart.getTime(), r.min.getTime()));
      const clampE = new Date(Math.min(dayEnd.getTime(),   r.max.getTime()));
      const left   = Math.floor((clampS.getTime() - r.min.getTime()) / this.DAY_MS) * this.PX_PER_DAY;
      const daysInBand = Math.floor((clampE.getTime() - clampS.getTime()) / this.DAY_MS) + 1;
      const width  = Math.max(1, daysInBand) * this.PX_PER_DAY;
      const label  = dayStart.toLocaleDateString('pt-BR', { day: '2-digit' });
      const isMonthStart = dayStart.getDate() === 1;
      const showLabel = isMonthStart || (idx % labelStep === 0);
      out.push({ label, left, width, isFirst: first, showLabel, isMonthStart, isoDate: dateToYmd(dayStart) });
      first = false;
      idx++;
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  weekHeaders(): TimelineHeader[] {
    const r = this.dateRange();
    if (!r) return [];
    const out: TimelineHeader[] = [];
    const cur = new Date(r.min);
    cur.setHours(0, 0, 0, 0);
    const dow = cur.getDay();
    if (dow !== 1) cur.setDate(cur.getDate() - ((dow + 6) % 7));
    let first = true;
    while (cur <= r.max) {
      const weekStart = new Date(cur); weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(cur); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
      const clampS = new Date(Math.max(weekStart.getTime(), r.min.getTime()));
      const clampE = new Date(Math.min(weekEnd.getTime(),   r.max.getTime()));
      if (clampE >= clampS) {
        const left = Math.floor((clampS.getTime() - r.min.getTime()) / this.DAY_MS) * this.PX_PER_DAY;
        const daysInBand = Math.floor((clampE.getTime() - clampS.getTime()) / this.DAY_MS) + 1;
        const width = Math.max(1, daysInBand) * this.PX_PER_DAY;
        const label = `${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
        out.push({ label, left, width, isFirst: first });
        first = false;
      }
      cur.setDate(cur.getDate() + 7);
    }
    return out;
  }

  monthHeaders(): TimelineHeader[] {
    const r = this.dateRange();
    if (!r) return [];
    const out: TimelineHeader[] = [];
    const cur = new Date(r.min.getFullYear(), r.min.getMonth(), 1);
    let first = true;
    while (cur <= r.max) {
      const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
      const clampS = new Date(Math.max(monthStart.getTime(), r.min.getTime()));
      const clampE = new Date(Math.min(monthEnd.getTime(),   r.max.getTime()));
      if (clampE >= clampS) {
        const left = Math.floor((clampS.getTime() - r.min.getTime()) / this.DAY_MS) * this.PX_PER_DAY;
        const daysInBand = Math.floor((clampE.getTime() - clampS.getTime()) / this.DAY_MS) + 1;
        const width = Math.max(1, daysInBand) * this.PX_PER_DAY;
        const label = monthStart.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
        out.push({ label, left, width, isFirst: first });
        first = false;
      }
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }

  timelineHeaders(): TimelineHeader[] {
    if (this.timelineScale === 'SEMANA') return this.weekHeaders();
    if (this.timelineScale === 'MES') return this.monthHeaders();
    return this.dayHeaders();
  }

  // ---
  nonWorkingBands(): Array<{ left: number; isHoliday: boolean }> {
    const r = this.dateRange();
    if (!r) return [];
    return this.feriados.nonWorkingDatesInRange(r.min, r.max).map(({ ymd, isHoliday }) => {
      const d    = new Date(ymd + 'T12:00:00');
      const left = Math.floor((d.getTime() - r.min.getTime()) / 86_400_000) * this.PX_PER_DAY;
      return { left, isHoliday };
    });
  }

  // ---
  weekTicks(): Array<{ left: number; label: string }> {
    const r = this.dateRange();
    if (!r) return [];
    const ticks: Array<{ left: number; label: string }> = [];
    const cur = new Date(r.min);
    const dow = cur.getDay();
    if (dow !== 1) cur.setDate(cur.getDate() + ((8 - dow) % 7));
    while (cur <= r.max) {
      const left = Math.floor((cur.getTime() - r.min.getTime()) / 86_400_000) * this.PX_PER_DAY;
      ticks.push({ left, label: cur.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) });
      cur.setDate(cur.getDate() + 7);
    }
    return ticks;
  }

  // ---
  todayLeft(): number {
    const r = this.dateRange();
    if (!r) return -1;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days  = (today.getTime() - r.min.getTime()) / 86_400_000;
    if (days < 0 || days > r.totalDays) return -1;
    return days * this.PX_PER_DAY;
  }

  private markersKey() {
    return `planner_gantt_markers_${this.projetoSelecionado?.id ?? 'x'}`;
  }

  loadMarkers() {
    try {
      const raw = localStorage.getItem(this.markersKey());
      const items = raw ? JSON.parse(raw) : [];
      this.timelineMarkers = Array.isArray(items) ? items : [];
    } catch {
      this.timelineMarkers = [];
    }
  }

  saveMarkers() {
    localStorage.setItem(this.markersKey(), JSON.stringify(this.timelineMarkers));
  }

  addMarker() {
    if (!this.projetoSelecionado?.id) {
      this.markerMessage = 'Selecione um projeto para adicionar marcador.';
      return;
    }
    if (!this.markerDate) {
      this.markerMessage = 'Informe uma data para o marcador.';
      return;
    }
    const label = this.markerLabel.trim() || 'Marco';
    const description = this.markerDescription.trim();
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`);
    const exists = this.timelineMarkers.some(m => m.date === this.markerDate && m.label.toLowerCase() === label.toLowerCase());
    if (exists) {
      this.markerMessage = 'Marcador já existe para esta data.';
      return;
    }
    this.timelineMarkers.push({ id, label, date: this.markerDate, description });
    this.timelineMarkers.sort((a, b) => a.date.localeCompare(b.date));
    this.saveMarkers();
    const visible = this.markerLeft(this.markerDate) >= 0;
    this.markerMessage = visible
      ? 'Marcador adicionado.'
      : 'Marcador adicionado fora do período visível da timeline.';
    this.markerDate = '';
    this.markerLabel = '';
    this.markerDescription = '';
  }

  onTimelineDayClick(event: MouseEvent, day: TimelineHeader) {
    if (!day.isoDate) return;
    this.selectedTimelineDate = day.isoDate;
    this.markerDate = day.isoDate;
    this.dayActionDate = day.isoDate;
    this.dayActionLeft = day.left; // kept for internal use

  // ---
    const POP_W = 240;
    const POP_H = 180;
    this.dayActionFixedLeft = Math.min(event.clientX - 12, window.innerWidth  - POP_W - 8);
    this.dayActionFixedTop  = Math.min(event.clientY + 12, window.innerHeight - POP_H - 8);
    this.dayActionOpen = true;
    event.stopPropagation();
  }

  closeDayAction() {
    this.dayActionOpen = false;
  }

  openCreateActivityFromDay() {
    if (!this.dayActionDate) return;
    this.formVisible = true;
    this.editingItem = null;
    this.novaAtividade.inicioPlanejado = this.dayActionDate;
    this.novaAtividade.fimPlanejado = this.dayActionDate;
    this.closeDayAction();
  }

  addMarkerFromDayAction() {
    if (!this.dayActionDate) return;
    this.markerDate = this.dayActionDate;
    this.addMarker();
    this.closeDayAction();
  }

  // ---
  async exportarImagem(): Promise<void> {
    if (!this.projetoSelecionado || this.atividades().length === 0) return;
    if (this.exportandoImagem) return;

    this.exportandoImagem = true;
    this.cdr.detectChanges();

    try {
      const { default: html2canvas } = await import('html2canvas');

      const tableEl = this.ganttTableRef?.nativeElement;
      if (!tableEl) return;

      const W = tableEl.scrollWidth;
      const H = tableEl.scrollHeight;

  // ---
  // ---
      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        position:  'fixed',
        top:       '-99999px',
        left:      '-99999px',
        width:     `${W}px`,
        height:    `${H}px`,
        overflow:  'visible',
        zIndex:    '-1',
        pointerEvents: 'none',
      });

      const clone = tableEl.cloneNode(true) as HTMLElement;
      Object.assign(clone.style, {
        position: 'relative',
        width:    `${W}px`,
        minWidth: `${W}px`,
        height:   `${H}px`,
      });

  // ---
  // ---
      clone.querySelectorAll<HTMLElement>(
        '.gp-gantt-header, .gp-lcol, .gp-today-label-row'
      ).forEach(el => {
        el.style.position = 'relative';
        el.style.top  = 'auto';
        el.style.left = 'auto';
      });

      wrap.appendChild(clone);
      document.body.appendChild(wrap);

      const canvas = await html2canvas(clone, {
        scale:           2,           // 2× = retina quality
        useCORS:         true,
        allowTaint:      false,
        backgroundColor: '#ffffff',
        logging:         false,
        width:           W,
        height:          H,
      });

      document.body.removeChild(wrap);

  // ---
      const nome = (this.projetoSelecionado as any)?.nome ?? 'cronograma';
  // ---
      const safe = nome
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim().replace(/\s+/g, '_') || 'cronograma';

      const link = document.createElement('a');
      link.download = `${safe}_cronograma.png`;
      link.href     = canvas.toDataURL('image/png');
      link.click();

    } catch (err) {
      console.error('[Gantt] Falha ao exportar imagem:', err);
    } finally {
      this.exportandoImagem = false;
      this.cdr.detectChanges();
    }
  }

  isSelectedTimelineDay(day: TimelineHeader): boolean {
    return !!day.isoDate && day.isoDate === this.selectedTimelineDate;
  }

  isBlockedTimelineDay(day: TimelineHeader): boolean {
    if (!day.isoDate) return false;
    const d = new Date(`${day.isoDate}T12:00:00`);
    return !!this.feriados.nonWorkingReason(d);
  }

  blockedTimelineDayReason(day: TimelineHeader): string {
    if (!day.isoDate) return '';
    const d = new Date(`${day.isoDate}T12:00:00`);
    const reason = this.feriados.nonWorkingDetail(d) || this.feriados.nonWorkingReason(d);
    if (!reason) return '';
    if (reason === 'feriado') return 'Bloqueado: Feriado';
    if (reason.startsWith('feriado:')) return `Bloqueado: ${reason.replace('feriado:', 'Feriado -').trim()}`;
    return `Bloqueado: ${reason}`;
  }

  removeMarker(markerId: string) {
    this.timelineMarkers = this.timelineMarkers.filter(m => m.id !== markerId);
    this.saveMarkers();
    this.markerMessage = 'Marcador removido.';
  }

  markerLeft(date: string): number {
    const r = this.dateRange();
    if (!r || !date) return -1;
    const d = new Date(`${date}T00:00:00`);
    if (!isFinite(d.getTime())) return -1;
    const days = (d.getTime() - r.min.getTime()) / 86_400_000;
    if (days < 0 || days > r.totalDays) return -1;
  // ---
    return (days + 1) * this.PX_PER_DAY;
  }

  // ---
  barLeft(item: any): number {
    const r = this.dateRange();
    if (!r) return 0;
    const dates = this._effectiveDates(item);
    if (!dates) return 0;
    const rawDays = (dates.start.getTime() - r.min.getTime()) / 86_400_000;
    return Math.max(0, rawDays * this.PX_PER_DAY);
  }

  barWidth(item: any): number {
    const dates = this._effectiveDates(item);
    if (!dates) return this.PX_PER_DAY * 3;
    const rawDays = ((dates.end.getTime() - dates.start.getTime()) / 86_400_000) + 1;
    return Math.max(this.PX_PER_DAY * 0.6, rawDays * this.PX_PER_DAY);
  }

  isDragging(item: any): boolean {
    return this.dragPreview?.itemId === item.id;
  }

  // ---
  isAtrasado(item: any): boolean {
    if (!item.fimPlanejado) return false;
    if ((item.status || '').toUpperCase() === 'CONCLUIDO') return false;
    return new Date(item.fimPlanejado) < new Date();
  }

  effectiveStatus(item: any): string {
    return this.isAtrasado(item) ? 'ATRASADO' : (item.status || 'PLANEJADO');
  }

  statusColor(s: string): string {
    const st = s.toUpperCase();
    if (st === 'CONCLUIDO')    return 'green';
    if (st === 'EM_ANDAMENTO') return 'blue';
    if (st === 'ATRASADO')     return 'red';
    if (st === 'BLOQUEADO')    return 'gray';
    return 'sky';
  }

  statusLabel(s: string): string {
    return ({ PLANEJADO: 'Planejado', EM_ANDAMENTO: 'Em andamento', CONCLUIDO: 'Concluído', ATRASADO: 'Atrasado', BLOQUEADO: 'Bloqueado' } as any)[s.toUpperCase()] || s;
  }

  allStatuses: GStatus[] = ['PLANEJADO','EM_ANDAMENTO','CONCLUIDO','ATRASADO','BLOQUEADO'];

  // ---
  private metaKey(itemId: string) { return `planner_gantt_${this.projetoSelecionado?.id ?? 'x'}_${itemId}`; }

  pessoasAtivas() {
    return this.pessoas.filter((p: any) => p.ativo !== false);
  }

  getMeta(itemId: string): { responsavel: string; pct: number } {
    try {
      const r = localStorage.getItem(this.metaKey(itemId));
      return r ? JSON.parse(r) : { responsavel: '', pct: 0 };
    } catch { return { responsavel: '', pct: 0 }; }
  }

  setMeta(itemId: string, meta: Partial<{ responsavel: string; pct: number }>) {
    localStorage.setItem(this.metaKey(itemId), JSON.stringify({ ...this.getMeta(itemId), ...meta }));
  }

  // ---
  private predecessorTag(itemId: string) { return `##PRED:${itemId}##`; }
  private readonly perfilTagPrefix = '##PERFILID:';
  private readonly perfilTagRegex  = /##PERFILID:([a-zA-Z0-9\-]+)##/;

  private extractPredecessorId(descricao?: string | null): string {
    const m = String(descricao ?? '').match(/##PRED:([a-zA-Z0-9\-]+)##/);
    return m?.[1] ?? '';
  }

  private extractPerfilId(descricao?: string | null): string {
    const m = String(descricao ?? '').match(this.perfilTagRegex);
    return m?.[1] ?? '';
  }

  private cleanDescricao(descricao?: string | null): string {
    let s = String(descricao ?? '');
    s = s.replace(/##PRED:[a-zA-Z0-9\-]+##/g, '');
    s = s.replace(this.perfilTagRegex, '');
    const etIdx = s.indexOf(this.ET_TAG);
    if (etIdx >= 0) s = s.slice(0, etIdx);
    return s.trim();
  }

  private composeDescricaoComPerfil(descricao: string, predecessorId: string, perfilId: string, etapas: Etapa[]): string {
    let result = this.cleanDescricao(descricao);
    if (predecessorId) result = `${result}\n${this.predecessorTag(predecessorId)}`.trim();
    if (perfilId)      result = `${result}\n${this.perfilTagPrefix}${perfilId}##`.trim();
    const enc = this.encodeEtapas(etapas);
    if (enc)           result = `${result}\n${enc}`.trim();
    return result;
  }

  perfilNome(item: any): string {
    const perfilId = this.extractPerfilId(item?.descricao || '');
    if (!perfilId) return '';
    return this.perfis.find((p: any) => p?.id === perfilId)?.nomePerfil || '';
  }

  private normalizeParaleloByDependency(form: any) {
    if (form.predecessorId) form.permiteParalelo = false;
  }

  onPredecessorChange(mode: 'nova' | 'edit') {
    if (mode === 'nova') this.normalizeParaleloByDependency(this.novaAtividade);
    else                 this.normalizeParaleloByDependency(this.editForm);
  }

  predecessorasDisponiveis(currentItemId = ''): any[] {
    return this.atividades().filter((a: any) => a.id !== currentItemId);
  }

  private findById(itemId: string): any | null {
    return this.atividades().find((a: any) => a.id === itemId) ?? null;
  }

  private validarDependencia(predecessorId: string, inicioPlanejado: string, currentItemId = ''): string {
    if (!predecessorId) return '';
    if (currentItemId && predecessorId === currentItemId) return 'A predecessora não pode ser a própria atividade.';
    const pred = this.findById(predecessorId);
    if (!pred)             return 'Predecessora não encontrada.';
    if (!pred.fimPlanejado) return 'A predecessora precisa ter data de fim.';
    if (!inicioPlanejado)   return 'Informe a data de início da atividade.';
    const predFim     = new Date(pred.fimPlanejado); predFim.setHours(0, 0, 0, 0);
    const inicioAtual = new Date(inicioPlanejado);   inicioAtual.setHours(0, 0, 0, 0);
    if (inicioAtual.getTime() <= predFim.getTime()) {
      return `Início deve ser após o fim da predecessora (${this.fmt(pred.fimPlanejado)}).`;
    }
    return '';
  }

  private rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
  }

  private validarConflitoParalelismo(
    inicioPlanejado: string | null,
    fimPlanejado: string | null,
    permiteParalelo: boolean,
    currentItemId = ''
  ): string {
    if (!inicioPlanejado || !fimPlanejado) return '';
    const start = new Date(inicioPlanejado); start.setHours(0, 0, 0, 0);
    const end = new Date(fimPlanejado); end.setHours(0, 0, 0, 0);
    if (!isFinite(start.getTime()) || !isFinite(end.getTime())) return '';

    const conflicting = this.atividades().find((a: any) => {
      if (!a || !a.id || a.id === currentItemId) return false;
      if (!a.inicioPlanejado || !a.fimPlanejado) return false;
      const oStart = new Date(a.inicioPlanejado); oStart.setHours(0, 0, 0, 0);
      const oEnd = new Date(a.fimPlanejado); oEnd.setHours(0, 0, 0, 0);
      if (!isFinite(oStart.getTime()) || !isFinite(oEnd.getTime())) return false;
      if (!this.rangesOverlap(start, end, oStart, oEnd)) return false;
      const otherParallel = !!a.permiteParalelo;
  // ---
      return !permiteParalelo || !otherParallel;
    });

    if (!conflicting) return '';
    return `Conflito de período com "${conflicting.titulo}". Atividades não paralelas não podem sobrepor datas.`;
  }

  // ---
  stats() {
    const all  = this.atividades();
    const st   = all.filter((a: any) => this.effectiveStatus(a) === 'EM_ANDAMENTO').length;
    const ok   = all.filter((a: any) => (a.status || '').toUpperCase() === 'CONCLUIDO').length;
    const late = all.filter((a: any) => this.isAtrasado(a)).length;
    return { total: all.length, andamento: st, concluidas: ok, atrasadas: late };
  }

  avgPct(): number {
    const all = this.atividades();
    if (!all.length) return 0;
    return Math.round(all.reduce((acc: number, a: any) => acc + this.getMeta(a.id).pct, 0) / all.length);
  }

  // ---
  toggleForm() {
    this.formVisible = !this.formVisible;
    this.formError   = '';
    this.dateWarning = '';
    if (this.formVisible) this.editingItem = null;
  }

  submitNova() {
    if (!this.novaAtividade.titulo.trim()) return;
    this.normalizeParaleloByDependency(this.novaAtividade);
    this.formError = this.validarDependencia(this.novaAtividade.predecessorId, this.novaAtividade.inicioPlanejado);
    if (this.formError) return;
    const inicioNorm = this.novaAtividade.inicioPlanejado ? `${dateToYmd(this.feriados.nextBusinessDay(new Date(this.novaAtividade.inicioPlanejado + 'T12:00:00')))}T12:00:00Z` : null;
    const fimNorm = this.novaAtividade.fimPlanejado ? `${dateToYmd(this.feriados.nextBusinessDay(new Date(this.novaAtividade.fimPlanejado + 'T12:00:00')))}T12:00:00Z` : null;
    this.formError = this.validarConflitoParalelismo(inicioNorm, fimNorm, this.novaAtividade.permiteParalelo);
    if (this.formError) return;
    this.addScheduleItem.emit({
      titulo:          this.novaAtividade.titulo.trim(),
      descricao:       this.composeDescricaoComPerfil(this.novaAtividade.descricao.trim(), this.novaAtividade.predecessorId, this.novaAtividade.perfilId, []),
      inicioPlanejado: inicioNorm,
      fimPlanejado:    fimNorm,
      permiteParalelo: this.novaAtividade.permiteParalelo,
      cor:             this.novaAtividade.cor || undefined,
      responsavel:     this.novaAtividade.responsavel || undefined,
    } as any);
    this.novaAtividade = this.emptyForm();
    this.formVisible   = false;
    this.dateWarning   = '';
  }

  // ---
  startEdit(item: any) {
    if (this.editingItem?.id === item.id) { this.editingItem = null; return; }
    this.formVisible = false;
    this.formError   = '';
    this.dateWarning = '';
    this.editingItem = item;
    const meta = this.getMeta(item.id);
    this.editForm = {
      titulo:          item.titulo || '',
      descricao:       this.cleanDescricao(item.descricao || ''),
      inicioPlanejado: this.toDateInput(item.inicioPlanejado),
      fimPlanejado:    this.toDateInput(item.fimPlanejado),
      status:          (item.status || 'PLANEJADO') as GStatus,
      responsavel:     item.responsavel || meta.responsavel || '',
      pct:             meta.pct,
      permiteParalelo: !!item.permiteParalelo,
      predecessorId:   this.extractPredecessorId(item.descricao || ''),
      perfilId:        this.extractPerfilId(item.descricao || ''),
      etapas:          this.extractEtapas(item.descricao || ''),
      newEtapaLabel:   '',
      cor:             item.cor || '',
    };
    this.normalizeParaleloByDependency(this.editForm);
  }

  saveEdit() {
    if (!this.editingItem) return;
    this.normalizeParaleloByDependency(this.editForm);
    this.formError = this.validarDependencia(this.editForm.predecessorId, this.editForm.inicioPlanejado, this.editingItem.id);
    if (this.formError) return;
    let inicio = this.editForm.inicioPlanejado || null;
    let fim = this.editForm.fimPlanejado || null;
    if (inicio) inicio = `${dateToYmd(this.feriados.nextBusinessDay(new Date(inicio + 'T12:00:00')))}T12:00:00Z`;
    if (fim) fim = `${dateToYmd(this.feriados.nextBusinessDay(new Date(fim + 'T12:00:00')))}T12:00:00Z`;
    this.formError = this.validarConflitoParalelismo(inicio, fim, this.editForm.permiteParalelo, this.editingItem.id);
    if (this.formError) return;
    this.updateScheduleItem.emit({
      itemId:          this.editingItem.id,
      titulo:          this.editForm.titulo,
      descricao:       this.composeDescricaoComPerfil(this.editForm.descricao, this.editForm.predecessorId, this.editForm.perfilId, this.editForm.etapas),
      inicioPlanejado: inicio,
      fimPlanejado:    fim,
      permiteParalelo: this.editForm.permiteParalelo,
      status:          this.editForm.status,
      cor:             this.editForm.cor || undefined,
      responsavel:     this.editForm.responsavel || undefined,
    } as any);
    this.setMeta(this.editingItem.id, { responsavel: this.editForm.responsavel, pct: this.editForm.pct });
    this.editingItem = null;
  }

  cancelEdit() { this.editingItem = null; this.formError = ''; this.dateWarning = ''; }

  quickStatus(item: any, status: string) {
    this.updateScheduleItem.emit({ itemId: item.id, status, permiteParalelo: !!item.permiteParalelo });
  }

  askDelete(item: any)     { this.confirmDeleteId = item.id; }
  cancelDelete()            { this.confirmDeleteId = ''; }
  confirmDelete(item: any) {
    this.deleteScheduleItem.emit(item.id);
    this.confirmDeleteId = '';
    if (this.editingItem?.id === item.id) this.editingItem = null;
  }

  // ---
  fmt(d: string | null): string {
    if (!d) return '—';
    const dt = new Date(d);
    return isFinite(dt.getTime()) ? dt.toLocaleDateString('pt-BR') : '—';
  }

  private toDateInput(d: string | null): string {
    if (!d) return '';
    const dt = new Date(d);
    if (!isFinite(dt.getTime())) return '';
    return dateToYmd(dt);
  }

  duracao(item: any): string {
    if (!item.inicioPlanejado || !item.fimPlanejado) return '—';
    const s = new Date(item.inicioPlanejado); s.setHours(0, 0, 0, 0);
    const e = new Date(item.fimPlanejado);   e.setHours(0, 0, 0, 0);
    const d = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
    return d > 0 ? `${d}d` : '—';
  }
}



