import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  type: 'info' | 'success' | 'error';
  persistent: boolean;
  // Modo simples
  message?: string;
  // Modo CSV (persistente com ações)
  format?: string;
  example?: string;
  copied?: boolean;
  onSelectFile?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  toasts = signal<Toast[]>([]);
  private nextId = 0;

  /** Toast simples auto-dismiss (para mensagens rápidas) */
  show(message: string, type: Toast['type'] = 'info', duration = 4000) {
    const id = ++this.nextId;
    this.toasts.update(list => [...list, { id, message, type, persistent: false }]);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }

  /** Toast persistente para hint de CSV com ações */
  showCsv(options: {
    format: string;
    example: string;
    onSelectFile: () => void;
  }) {
    // Substitui qualquer CSV toast existente (evita empilhar)
    const existingCsv = this.toasts().find(t => !!t.onSelectFile);
    if (existingCsv) this.dismiss(existingCsv.id);

    const id = ++this.nextId;
    this.toasts.update(list => [
      ...list,
      {
        id,
        type: 'info',
        persistent: true,
        format: options.format,
        example: options.example,
        copied: false,
        onSelectFile: options.onSelectFile,
      }
    ]);
  }

  dismiss(id: number) {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  /** Chama o callback de seleção de arquivo e fecha o toast */
  selectFile(id: number) {
    const t = this.toasts().find(t => t.id === id);
    if (t?.onSelectFile) {
      this.dismiss(id);
      // pequeno delay para o dismiss animar antes do dialog abrir
      setTimeout(() => t.onSelectFile!(), 80);
    }
  }

  /** Copia formato + exemplo para clipboard */
  copyExample(id: number) {
    const t = this.toasts().find(t => t.id === id);
    if (!t?.format || !t?.example) return;

    const text = `${t.format}\n${t.example}`;
    const write = () => {
      this.toasts.update(list => list.map(item =>
        item.id === id ? { ...item, copied: true } : item
      ));
      setTimeout(() => {
        this.toasts.update(list => list.map(item =>
          item.id === id ? { ...item, copied: false } : item
        ));
      }, 2200);
    };

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(write).catch(() => this.fallbackCopy(text, write));
    } else {
      this.fallbackCopy(text, write);
    }
  }

  private fallbackCopy(text: string, cb: () => void) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(el);
    cb();
  }
}
