import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, EventEmitter, Input, NgZone, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-account-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './account-panel.component.html',
  styleUrl: './account-panel.component.scss'
})
export class AccountPanelComponent {
  @Input() conta: any = null;
  @Input() profileImage = '';
  @Input() mensagem = '';
  @Output() updateAccount = new EventEmitter<{ username: string; nome: string }>();
  @Output() changePassword = new EventEmitter<{ senhaAtual: string; novaSenha: string }>();
  @Output() profileImageChange = new EventEmitter<string>();

  @ViewChild('cropCanvas', { static: false }) cropCanvas?: ElementRef<HTMLCanvasElement>;

  form = { senhaAtual: '', novaSenha: '', confirmarNovaSenha: '' };
  accountForm = { nome: '', username: '' };
  formError = '';
  accountFormError = '';
  sourceImage: HTMLImageElement | null = null;
  sourceDataUrl = '';
  zoom = 1;
  offsetX = 0;
  offsetY = 0;
  readonly canvasSize = 220;
  readonly exportSize = 240;
  selectedFileName = 'Nenhum arquivo selecionado';
  cropFeedback = '';
  private pendingRender = false;
  isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOriginOffsetX = 0;
  private dragOriginOffsetY = 0;

  constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) {}

  ngOnChanges() {
    this.accountForm = {
      nome: this.conta?.nome || this.conta?.username || '',
      username: this.conta?.username || ''
    };
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.selectedFileName = 'Nenhum arquivo selecionado';
      return;
    }
    this.selectedFileName = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const img = new Image();
      img.onload = () => {
        this.ngZone.run(() => {
          this.sourceImage = img;
          this.sourceDataUrl = dataUrl;
          this.zoom = 1;
          this.offsetX = 0;
          this.offsetY = 0;
          // In zoneless mode, force template update so the canvas exists immediately.
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
    if (!this.cropCanvas) {
      setTimeout(() => this.tryRenderPending(), 30);
      return;
    }
    this.pendingRender = false;
    this.renderCropPreview();
  }

  renderCropPreview() {
    if (!this.cropCanvas || !this.sourceImage) return;
    const canvas = this.cropCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
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
    if (!this.cropCanvas) return;
    const preview = this.cropCanvas.nativeElement;
    const out = document.createElement('canvas');
    out.width = this.exportSize;
    out.height = this.exportSize;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(preview, 0, 0, this.exportSize, this.exportSize);
    this.profileImageChange.emit(out.toDataURL('image/png'));
    this.cropFeedback = 'Foto de perfil atualizada com sucesso.';
    // Finaliza o fluxo apos aplicar: esconde area de recorte.
    this.sourceImage = null;
    this.sourceDataUrl = '';
    this.pendingRender = false;
    this.selectedFileName = 'Nenhum arquivo selecionado';
  }

  removePhoto() {
    this.sourceImage = null;
    this.sourceDataUrl = '';
    this.selectedFileName = 'Nenhum arquivo selecionado';
    this.cropFeedback = 'Foto removida.';
    this.profileImageChange.emit('');
  }

  submitChangePassword() {
    this.formError = '';
    if (!this.form.senhaAtual || !this.form.novaSenha || !this.form.confirmarNovaSenha) {
      this.formError = 'Preencha todos os campos de senha.';
      return;
    }
    if (this.form.novaSenha.length < 6) {
      this.formError = 'A nova senha deve ter ao menos 6 caracteres.';
      return;
    }
    if (this.form.novaSenha !== this.form.confirmarNovaSenha) {
      this.formError = 'A confirmação da nova senha não confere.';
      return;
    }
    this.changePassword.emit({ senhaAtual: this.form.senhaAtual, novaSenha: this.form.novaSenha });
  }

  submitAccountUpdate() {
    this.accountFormError = '';
    if (!this.accountForm.nome?.trim() || !this.accountForm.username?.trim()) {
      this.accountFormError = 'Nome e username sao obrigatorios.';
      return;
    }
    this.updateAccount.emit({
      nome: this.accountForm.nome.trim(),
      username: this.accountForm.username.trim()
    });
  }

  get mensagemEhErro() {
    const text = (this.mensagem || '').toLowerCase();
    return text.includes('falha') || text.includes('inval') || text.includes('erro') || text.includes('expirou');
  }

  onDragStart(event: MouseEvent) {
    if (!this.sourceImage) return;
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragOriginOffsetX = this.offsetX;
    this.dragOriginOffsetY = this.offsetY;
  }

  onDragMove(event: MouseEvent) {
    if (!this.isDragging) return;
    const dx = event.clientX - this.dragStartX;
    const dy = event.clientY - this.dragStartY;
    this.offsetX = this.dragOriginOffsetX + dx;
    this.offsetY = this.dragOriginOffsetY + dy;
    this.renderCropPreview();
  }

  onDragEnd() {
    this.isDragging = false;
  }

  onCanvasWheel(event: WheelEvent) {
    if (!this.sourceImage) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    const nextZoom = this.zoom + delta;
    this.zoom = Math.max(1, Math.min(3, nextZoom));
    this.renderCropPreview();
  }
}

