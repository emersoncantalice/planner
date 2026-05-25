import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  FeriadosService,
  FeriadoCustom,
  federalHolidaysForYear,
} from '../../core/feriados.service';

// ── Form types ────────────────────────────────────────────────────────────────
interface CustomForm {
  data: string;
  nome: string;
  tipo: FeriadoCustom['tipo'];
}

interface FederalForm {
  data: string;       // readonly — shown only for reference
  nomeOriginal: string;
  nomeCustom: string;
}

@Component({
  selector: 'app-feriados-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './feriados-panel.component.html',
  styleUrl: './feriados-panel.component.scss'
})
export class FeriadosPanelComponent {
  svc = inject(FeriadosService);

  // ── Ano de referência ────────────────────────────────────────────────────
  anoRef = signal(new Date().getFullYear());

  /** Federal list with override info merged in. */
  federaisDoAno = computed(() => {
    const overrides = this.svc.federalOverrides();
    return federalHolidaysForYear(this.anoRef())
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(f => ({
        data: f.data,
        nomeOriginal: f.nome,
        nome: overrides[f.data]?.nomeCustom || f.nome,
        disabled: overrides[f.data]?.disabled ?? false,
        editado: !!overrides[f.data]?.nomeCustom,
      }));
  });

  allCustoms = computed(() =>
    [...this.svc.feriados()].sort((a, b) => a.data.localeCompare(b.data))
  );

  tipoLabels: Record<FeriadoCustom['tipo'], string> = {
    municipal: 'Municipal',
    estadual: 'Estadual',
    facultativo: 'Facultativo',
    outro: 'Outro',
  };

  // ── Modal state ──────────────────────────────────────────────────────────
  /** 'custom' | 'federal' | null */
  modalMode = signal<'custom' | 'federal' | null>(null);

  editingCustomId = signal<string | null>(null);   // null = new
  customForm = signal<CustomForm>({ data: '', nome: '', tipo: 'municipal' });

  federalForm = signal<FederalForm>({ data: '', nomeOriginal: '', nomeCustom: '' });

  get showModal() { return this.modalMode() !== null; }

  // ── Custom modal ─────────────────────────────────────────────────────────
  abrirNovoCustom() {
    this.editingCustomId.set(null);
    this.customForm.set({ data: '', nome: '', tipo: 'municipal' });
    this.modalMode.set('custom');
  }

  abrirEditarCustom(f: FeriadoCustom) {
    this.editingCustomId.set(f.id);
    this.customForm.set({ data: f.data, nome: f.nome, tipo: f.tipo });
    this.modalMode.set('custom');
  }

  salvarCustom() {
    const f = this.customForm();
    if (!f.data || !f.nome.trim()) return;
    const id = this.editingCustomId();
    if (id) {
      this.svc.updateFeriado(id, f);
    } else {
      this.svc.addFeriado({ ...f, nome: f.nome.trim() });
    }
    this.fecharModal();
  }

  removerCustom(id: string) {
    if (confirm('Remover este feriado personalizado?')) {
      this.svc.removeFeriado(id);
    }
  }

  // ── Federal modal ────────────────────────────────────────────────────────
  abrirEditarFederal(f: { data: string; nomeOriginal: string; nome: string }) {
    this.federalForm.set({
      data: f.data,
      nomeOriginal: f.nomeOriginal,
      nomeCustom: this.svc.federalOverrides()[f.data]?.nomeCustom ?? f.nomeOriginal,
    });
    this.modalMode.set('federal');
  }

  salvarFederal() {
    const f = this.federalForm();
    if (!f.nomeCustom.trim()) return;
    this.svc.renameFederal(f.data, f.nomeCustom.trim());
    this.fecharModal();
  }

  desabilitarFederal(data: string) {
    if (confirm('Remover este feriado nacional do calendário de dias úteis?\nEle continuará aparecendo aqui, mas será tratado como dia útil.')) {
      this.svc.disableFederal(data);
    }
  }

  restaurarFederal(data: string) {
    this.svc.restoreFederal(data);
  }

  // ── Shared ───────────────────────────────────────────────────────────────
  fecharModal() {
    this.modalMode.set(null);
    this.editingCustomId.set(null);
  }

  // ── Dias úteis ───────────────────────────────────────────────────────────
  diasNomes     = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  diasNomesLong = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

  toggleDia(dow: number) { this.svc.toggleDiaUtil(dow); }

  // ── Helpers ──────────────────────────────────────────────────────────────
  formatDate(ymd: string): string {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  }

  mudarAno(delta: number) { this.anoRef.update(v => v + delta); }
}
