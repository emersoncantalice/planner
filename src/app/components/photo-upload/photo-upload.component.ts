import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, Output, ViewChild } from '@angular/core';

/**
 * Modal reutilizável de inclusão de foto com recorte (crop), zoom e arraste —
 * mesma interação da tela "Minha Conta". Emite a foto final como data URL PNG.
 */
@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (aberto) {
      <div class="pu-backdrop" (click)="onCancel()">
        <div class="pu-modal" (click)="$event.stopPropagation()">
          <header class="pu-head">
            <h3>{{ titulo }}</h3>
            <button type="button" class="pu-x" (click)="onCancel()" aria-label="Fechar">✕</button>
          </header>

          <div class="pu-body">
            <div class="pu-stage">
              @if (sourceImage) {
                <canvas #cropCanvas [width]="canvasSize" [height]="canvasSize"
                        class="pu-canvas"
                        (mousedown)="onDragStart($event)"
                        (mousemove)="onDragMove($event)"
                        (mouseup)="onDragEnd()"
                        (mouseleave)="onDragEnd()"
                        (wheel)="onCanvasWheel($event)"></canvas>
                <input type="range" min="1" max="3" step="0.01" [value]="zoom"
                       (input)="onZoomInput($event)" class="pu-zoom" />
                <small class="pu-hint">Arraste para reposicionar · use a roda do mouse ou o controle para zoom</small>
              } @else if (imagemAtual) {
                <img [src]="imagemAtual" alt="Foto atual" class="pu-preview" />
                <small class="pu-hint">Foto atual</small>
              } @else {
                <div class="pu-placeholder">Sem foto</div>
              }
            </div>

            <label class="pu-file">
              <input type="file" accept="image/*" (change)="onFileSelected($event)" hidden />
              <span>Escolher imagem</span>
            </label>
            <div class="pu-filename">{{ selectedFileName }}</div>
            @if (feedback) { <div class="pu-feedback">{{ feedback }}</div> }
          </div>

          <footer class="pu-foot">
            @if (imagemAtual || sourceImage) {
              <button type="button" class="pu-btn pu-danger" (click)="onRemove()">Remover foto</button>
            }
            <span class="pu-spacer"></span>
            <button type="button" class="pu-btn" (click)="onCancel()">Cancelar</button>
            <button type="button" class="pu-btn pu-primary" [disabled]="!sourceImage" (click)="applyCrop()">Salvar foto</button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .pu-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.55); display:flex; align-items:center; justify-content:center; z-index: 1200; }
    .pu-modal { background:#fff; border-radius:14px; width:min(420px,92vw); box-shadow:0 18px 48px rgba(0,0,0,.28); overflow:hidden; display:flex; flex-direction:column; }
    .pu-head { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #eef2f7; }
    .pu-head h3 { margin:0; font-size:1rem; color:#0f172a; }
    .pu-x { border:none; background:transparent; font-size:1rem; cursor:pointer; color:#64748b; }
    .pu-body { padding:18px; display:flex; flex-direction:column; align-items:center; gap:10px; }
    .pu-stage { display:flex; flex-direction:column; align-items:center; gap:8px; }
    .pu-canvas { width:220px; height:220px; border-radius:50%; border:2px solid #e2e8f0; cursor:grab; background:#f8fafc; touch-action:none; }
    .pu-canvas:active { cursor:grabbing; }
    .pu-preview { width:160px; height:160px; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0; }
    .pu-placeholder { width:160px; height:160px; border-radius:50%; border:2px dashed #cbd5e1; display:flex; align-items:center; justify-content:center; color:#94a3b8; }
    .pu-zoom { width:220px; }
    .pu-hint { color:#94a3b8; font-size:.72rem; text-align:center; }
    .pu-file { background:#eef2ff; color:#3730a3; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:.85rem; font-weight:600; }
    .pu-file:hover { background:#e0e7ff; }
    .pu-filename { font-size:.75rem; color:#64748b; }
    .pu-feedback { font-size:.8rem; color:#047857; }
    .pu-foot { display:flex; align-items:center; gap:8px; padding:14px 18px; border-top:1px solid #eef2f7; }
    .pu-spacer { flex:1; }
    .pu-btn { border:1px solid #cbd5e1; background:#fff; color:#334155; padding:8px 14px; border-radius:8px; cursor:pointer; font-size:.85rem; }
    .pu-btn:hover { background:#f1f5f9; }
    .pu-btn.pu-primary { background:#4f46e5; border-color:#4f46e5; color:#fff; }
    .pu-btn.pu-primary:hover { background:#4338ca; }
    .pu-btn.pu-primary:disabled { opacity:.5; cursor:not-allowed; }
    .pu-btn.pu-danger { border-color:#fecaca; color:#b91c1c; }
    .pu-btn.pu-danger:hover { background:#fef2f2; }
  `]
})
export class PhotoUploadComponent {
  @Input() aberto = false;
  @Input() titulo = 'Foto';
  @Input() imagemAtual = '';
  @Output() salvar = new EventEmitter<string>();
  @Output() fechar = new EventEmitter<void>();

  @ViewChild('cropCanvas', { static: false }) cropCanvas?: ElementRef<HTMLCanvasElement>;

  sourceImage: HTMLImageElement | null = null;
  zoom = 1;
  offsetX = 0;
  offsetY = 0;
  readonly canvasSize = 220;
  readonly exportSize = 240;
  selectedFileName = 'Nenhum arquivo selecionado';
  feedback = '';
  private pendingRender = false;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginOffsetX = 0;
  private dragOriginOffsetY = 0;

  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {}

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) { this.selectedFileName = 'Nenhum arquivo selecionado'; return; }
    this.selectedFileName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const img = new Image();
      img.onload = () => {
        this.ngZone.run(() => {
          this.sourceImage = img;
          this.zoom = 1; this.offsetX = 0; this.offsetY = 0;
          this.cdr.detectChanges();
          this.pendingRender = true;
          setTimeout(() => this.tryRenderPending(), 0);
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  private tryRenderPending() {
    if (!this.pendingRender) return;
    if (!this.cropCanvas) { setTimeout(() => this.tryRenderPending(), 30); return; }
    this.pendingRender = false;
    this.renderCropPreview();
  }

  renderCropPreview() {
    if (!this.cropCanvas || !this.sourceImage) return;
    const ctx = this.cropCanvas.nativeElement.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvasSize, this.canvasSize);
    const img = this.sourceImage;
    const baseScale = Math.max(this.canvasSize / img.width, this.canvasSize / img.height);
    const scale = baseScale * this.zoom;
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (this.canvasSize - drawW) / 2 + this.offsetX;
    const y = (this.canvasSize - drawH) / 2 + this.offsetY;
    ctx.drawImage(img, x, y, drawW, drawH);
  }

  applyCrop() {
    if (!this.cropCanvas || !this.sourceImage) return;
    const out = document.createElement('canvas');
    out.width = this.exportSize; out.height = this.exportSize;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.cropCanvas.nativeElement, 0, 0, this.exportSize, this.exportSize);
    this.salvar.emit(out.toDataURL('image/png'));
    this.reset();
  }

  onRemove() {
    this.salvar.emit('');
    this.reset();
  }

  onCancel() {
    this.reset();
    this.fechar.emit();
  }

  private reset() {
    this.sourceImage = null;
    this.zoom = 1; this.offsetX = 0; this.offsetY = 0;
    this.selectedFileName = 'Nenhum arquivo selecionado';
    this.feedback = '';
    this.pendingRender = false;
  }

  onZoomInput(event: Event) {
    this.zoom = Math.max(1, Math.min(3, Number((event.target as HTMLInputElement).value)));
    this.renderCropPreview();
  }

  onDragStart(event: MouseEvent) {
    if (!this.sourceImage) return;
    this.isDragging = true;
    this.dragStartX = event.clientX; this.dragStartY = event.clientY;
    this.dragOriginOffsetX = this.offsetX; this.dragOriginOffsetY = this.offsetY;
  }
  onDragMove(event: MouseEvent) {
    if (!this.isDragging) return;
    this.offsetX = this.dragOriginOffsetX + (event.clientX - this.dragStartX);
    this.offsetY = this.dragOriginOffsetY + (event.clientY - this.dragStartY);
    this.renderCropPreview();
  }
  onDragEnd() { this.isDragging = false; }
  onCanvasWheel(event: WheelEvent) {
    if (!this.sourceImage) return;
    event.preventDefault();
    this.zoom = Math.max(1, Math.min(3, this.zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
    this.renderCropPreview();
  }
}
