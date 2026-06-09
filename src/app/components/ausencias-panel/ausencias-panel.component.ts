import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';

interface AbsRow {
  id: string;
  pessoaId: string;
  pessoaNome: string;
  tipo: string;
  inicio: string;   // yyyy-MM-dd
  fim: string;      // yyyy-MM-dd
  recorrente: boolean;
  observacao: string;
  criadoEm?: string;
}

interface Conflito {
  pessoa1Id: string;
  pessoa1Nome: string;
  pessoa2Id: string;
  pessoa2Nome: string;
  a1: AbsRow;
  a2: AbsRow;
  overlapInicio: string;
  overlapFim: string;
  overlapDias: number;
}

import { ScrollIntoViewWhenDirective } from "../../core/scroll-into-view-when.directive";

@Component({
  selector: 'app-ausencias-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollIntoViewWhenDirective, SearchableSelectDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './ausencias-panel.component.html',
  styleUrl: './ausencias-panel.component.scss'
})
export class AusenciasPanelComponent implements OnChanges {
  @Input() pessoas: any[] = [];
  @Input() ausencias: AbsRow[] = [];
  @Input() linhasOrcamentarias: any[] = [];
  @Input() alocacoes: any[] = [];
  @Output() create = new EventEmitter<Omit<AbsRow, 'id' | 'criadoEm'>>();
  @Output() update = new EventEmitter<AbsRow>();
  @Output() remove = new EventEmitter<string>();

  
  ano = new Date().getFullYear();
  mesHover = -1;

  
  formOpen = false;
  editingId = '';
  form = this.emptyForm();

  private emptyForm() {
    return {
      pessoaId: '',
      pessoaNome: '',
      tipo: 'FERIAS',
      inicio: '',
      fim: '',
      recorrente: false,
      observacao: ''
    };
  }

  ngOnChanges(c: SimpleChanges) {
    if (c['pessoas'] && !this.form.pessoaId && this.pessoas.length)
      this.form.pessoaId = '';
  }

  
  readonly MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  readonly TIPOS: Record<string, string> = {
    FERIAS: 'Férias', AUSENCIA: 'Ausência', LICENCA: 'Licença', OUTRO: 'Outro'
  };
  readonly CORES: Record<string, string> = {
    FERIAS: '#22c55e', AUSENCIA: '#f59e0b', LICENCA: '#6366f1', OUTRO: '#94a3b8'
  };

  pessoasComAusencia(): any[] {
    const comAus = new Set(this.ausenciasDoAno().map(a => a.pessoaId));
    return this.pessoas.filter(p => comAus.has(p.id));
  }

  todasAsPessoas(): any[] {
    return this.pessoas;
  }

  ausenciasDoAno(): AbsRow[] {
    return this.ausencias.filter(a => {
      if (a.recorrente) return true;          
      const y = Number(a.inicio?.split('-')[0]);
      return y === this.ano;
    });
  }

  
  barsForPersonMonth(pessoaId: string, mes: number): Array<{ ab: AbsRow; left: number; width: number; color: string; label: string }> {
    const daysInMonth = new Date(this.ano, mes + 1, 0).getDate();
    const monthStart  = new Date(this.ano, mes, 1);
    const monthEnd    = new Date(this.ano, mes, daysInMonth);

    return this.ausenciasDoAno()
      .filter(a => a.pessoaId === pessoaId)
      .flatMap(a => {
        const inicioRaw = a.recorrente ? `${this.ano}-${a.inicio.slice(5)}` : a.inicio;
        const fimRaw    = a.recorrente ? `${this.ano}-${a.fim.slice(5)}`   : a.fim;
        const s = new Date(inicioRaw + 'T00:00:00');
        const e = new Date(fimRaw   + 'T00:00:00');

        
        const clampS = s < monthStart ? monthStart : s;
        const clampE = e > monthEnd   ? monthEnd   : e;

        if (clampS > clampE) return [];

        const left  = ((clampS.getDate() - 1) / daysInMonth) * 100;
        const right = ((clampE.getDate())      / daysInMonth) * 100;
        const width = right - left;

        return [{ ab: a, left, width, color: this.CORES[a.tipo] ?? '#94a3b8', label: this.TIPOS[a.tipo] ?? a.tipo }];
      });
  }

  hasAnyAbsenceInMonth(pessoaId: string, mes: number): boolean {
    return this.barsForPersonMonth(pessoaId, mes).length > 0;
  }

  labelTipoAbrev(tipo: string): string {
    const map: Record<string, string> = { FERIAS: 'FÉR', AUSENCIA: 'AUS', LICENCA: 'LIC', OUTRO: 'OUT' };
    return map[tipo] ?? tipo.slice(0, 3).toUpperCase();
  }

  
  searchPessoa = '';
  filterTipo = '';
  filterLoId = '';

  private normNome(v: string): string {
    return String(v || '').trim().toLowerCase();
  }

  /** LOs disponíveis para filtro, ordenadas por ano (desc) e código. */
  losDisponiveis(): any[] {
    return [...(this.linhasOrcamentarias || [])].sort((a, b) => {
      const ano = Number(b?.ano || 0) - Number(a?.ano || 0);
      return ano !== 0 ? ano : this.normNome(a?.codigo || a?.nome).localeCompare(this.normNome(b?.codigo || b?.nome), 'pt-BR');
    });
  }

  loLabel(lo: any): string {
    return lo?.codigo || lo?.nome || lo?.id || '';
  }

  /** Nomes (normalizados) das pessoas alocadas na LO selecionada. */
  private nomesAlocadosNaLo(loId: string): Set<string> {
    const set = new Set<string>();
    for (const a of (this.alocacoes || [])) {
      if (a?.linhaOrcamentariaId === loId) set.add(this.normNome(a?.nomePessoa));
    }
    return set;
  }

  pessoasFiltradas(): any[] {
    const q = this.searchPessoa.trim().toLowerCase();
    const nomesLo = this.filterLoId ? this.nomesAlocadosNaLo(this.filterLoId) : null;
    return this.pessoas.filter(p => {
      if (q && !p.nome.toLowerCase().includes(q)) return false;
      if (nomesLo && !nomesLo.has(this.normNome(p.nome))) return false;
      if (this.filterTipo) {
        return this.ausenciasDoAno().some(a => a.pessoaId === p.id && a.tipo === this.filterTipo);
      }
      return true;
    });
  }

  totalPorTipo(tipo: string): number {
    return this.ausenciasDoAno().filter(a => a.tipo === tipo).length;
  }

  
  openCreate(pessoaId = '') {
    this.editingId = '';
    this.form = { ...this.emptyForm(), pessoaId };
    if (pessoaId) {
      const p = this.pessoas.find(x => x.id === pessoaId);
      if (p) this.form.pessoaNome = p.nome;
    }
    this.formOpen = true;
  }

  startEdit(a: AbsRow) {
    this.editingId = a.id;
    this.form = {
      pessoaId: a.pessoaId,
      pessoaNome: a.pessoaNome,
      tipo: a.tipo,
      inicio: a.recorrente ? `${this.ano}-${a.inicio.slice(5)}` : a.inicio,
      fim:    a.recorrente ? `${this.ano}-${a.fim.slice(5)}`    : a.fim,
      recorrente: a.recorrente,
      observacao: a.observacao
    };
    this.formOpen = true;
  }

  onPessoaChange() {
    const p = this.pessoas.find(x => x.id === this.form.pessoaId);
    this.form.pessoaNome = p ? p.nome : '';
  }

  submit() {
    if (!this.form.pessoaId || !this.form.inicio || !this.form.fim) return;
    const payload = {
      ...this.form,
      inicio: this.form.recorrente ? this.form.inicio : this.form.inicio,
      fim:    this.form.recorrente ? this.form.fim    : this.form.fim,
    };
    if (this.editingId) {
      this.update.emit({ id: this.editingId, criadoEm: undefined, ...payload });
    } else {
      this.create.emit(payload);
    }
    this.cancelForm();
  }

  cancelForm() {
    this.formOpen = false;
    this.editingId = '';
    this.form = this.emptyForm();
  }

  
  diasAusentePorPessoa(pessoaId: string): number {
    let total = 0;
    for (const a of this.ausenciasDoAno().filter(x => x.pessoaId === pessoaId)) {
      const inicioRaw = a.recorrente ? `${this.ano}-${a.inicio.slice(5)}` : a.inicio;
      const fimRaw    = a.recorrente ? `${this.ano}-${a.fim.slice(5)}`   : a.fim;
      const s = new Date(inicioRaw + 'T00:00:00');
      const e = new Date(fimRaw   + 'T00:00:00');
      const dias = Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
      if (dias > 0) total += dias;
    }
    return total;
  }

  fmtDate(d: string): string {
    if (!d) return '-';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  ausenciasDaPessoa(pessoaId: string): AbsRow[] {
    return this.ausenciasDoAno().filter(a => a.pessoaId === pessoaId);
  }

  // ── conflict detection ────────────────────────────────────────────────────

  private resolveAbsDate(dateStr: string, recorrente: boolean): Date {
    const raw = recorrente ? `${this.ano}-${dateStr.slice(5)}` : dateStr;
    return new Date(raw + 'T00:00:00');
  }

  conflitos(): Conflito[] {
    const result: Conflito[] = [];
    const abs = this.ausenciasDoAno();
    for (let i = 0; i < abs.length; i++) {
      for (let j = i + 1; j < abs.length; j++) {
        const a1 = abs[i];
        const a2 = abs[j];
        if (a1.pessoaId === a2.pessoaId) continue;
        const s1 = this.resolveAbsDate(a1.inicio, a1.recorrente);
        const e1 = this.resolveAbsDate(a1.fim,    a1.recorrente);
        const s2 = this.resolveAbsDate(a2.inicio, a2.recorrente);
        const e2 = this.resolveAbsDate(a2.fim,    a2.recorrente);
        const oS = s1 > s2 ? s1 : s2;
        const oE = e1 < e2 ? e1 : e2;
        if (oS <= oE) {
          const dias = Math.round((oE.getTime() - oS.getTime()) / 86_400_000) + 1;
          result.push({
            pessoa1Id:   a1.pessoaId,
            pessoa1Nome: a1.pessoaNome || this.pessoas.find(p => p.id === a1.pessoaId)?.nome || a1.pessoaId,
            pessoa2Id:   a2.pessoaId,
            pessoa2Nome: a2.pessoaNome || this.pessoas.find(p => p.id === a2.pessoaId)?.nome || a2.pessoaId,
            a1, a2,
            overlapInicio: oS.toISOString().slice(0, 10),
            overlapFim:    oE.toISOString().slice(0, 10),
            overlapDias:   dias,
          });
        }
      }
    }
    return result;
  }

  temConflito(pessoaId: string): boolean {
    return this.conflitos().some(c => c.pessoa1Id === pessoaId || c.pessoa2Id === pessoaId);
  }

  conflitosParaPessoa(pessoaId: string): Conflito[] {
    return this.conflitos().filter(c => c.pessoa1Id === pessoaId || c.pessoa2Id === pessoaId);
  }

  isConflitante(ausenciaId: string): boolean {
    return this.conflitos().some(c => c.a1.id === ausenciaId || c.a2.id === ausenciaId);
  }

  conflitosOpen = true;

  
  expandedRows = new Set<string>();
  toggleRow(pessoaId: string) {
    if (this.expandedRows.has(pessoaId)) this.expandedRows.delete(pessoaId);
    else this.expandedRows.add(pessoaId);
  }
  isExpanded(pessoaId: string) { return this.expandedRows.has(pessoaId); }
}
