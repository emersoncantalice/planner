import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SearchableSelectDirective } from '../../core/searchable-select.directive';
import { PlannerApiService } from '../../core/planner-api.service';

@Component({
  selector: 'app-person-allocation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './person-allocation-panel.component.html',
  styleUrl: './person-allocation-panel.component.scss'
})
export class PersonAllocationPanelComponent implements OnChanges, OnDestroy {
  @Input() alocacoes: any[] = [];
  @Input() linhasOrcamentarias: any[] = [];
  @Input() horasMes: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() fotos: Record<string, string> = {};
  @Input() token = '';
  @Output() openAllocation = new EventEmitter<{ loId: string; ano: number }>();

  fotoDe(nome: string): string {
    return this.fotos?.[this.normalized(nome || '')] || '';
  }

  iniciaisDe(nome: string): string {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    return ((partes[0][0] || '') + (partes.length > 1 ? (partes[partes.length - 1][0] || '') : '')).toUpperCase();
  }

  searchTerm = '';
  anoSelecionado = new Date().getFullYear();
  readonly meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  private api = inject(PlannerApiService);
  private cdr = inject(ChangeDetectorRef);
  private syncTimer: ReturnType<typeof setInterval> | null = null;

  private allocationPercents: Record<string, number> = {};
  private pagoMensal: Record<string, boolean> = {};
  private canceladoMensal: Record<string, boolean> = {};
  private valorMensalManualMap: Record<string, number> = {};
  private percentualMensalManualMap: Record<string, number> = {};

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['token']) {
      this.stopSync();
      if (this.token) {
        this.loadAll();
        this.syncTimer = setInterval(() => this.loadAll(), 5000);
      }
    }
  }

  ngOnDestroy(): void {
    this.stopSync();
  }

  private stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private loadAll() {
    this.api.listAllocationPercent(this.token).subscribe({
      next: (rows: any[]) => {
        const next: Record<string, number> = {};
        for (const r of rows || []) {
          const id = String(r?.allocationId || '').trim();
          if (!id) continue;
          next[id] = Math.max(0, Math.min(100, Number(r?.percentual ?? 100)));
        }
        this.allocationPercents = next;
        this.cdr.markForCheck();
      }
    });
    this.api.listAllocationPayments(this.token).subscribe({
      next: (rows: any[]) => {
        const next: Record<string, boolean> = {};
        for (const r of rows || []) {
          const id = String(r?.allocationId || '').trim();
          const month = Number(r?.month);
          if (!id || month < 0 || month > 11) continue;
          if (r?.paid) next[`${id}_${month}`] = true;
        }
        this.pagoMensal = next;
        this.cdr.markForCheck();
      }
    });
    this.api.listAllocationMonthlyState(this.token).subscribe({
      next: (rows: any[]) => {
        const nextCancel: Record<string, boolean> = {};
        const nextValor: Record<string, number> = {};
        const nextPct: Record<string, number> = {};
        for (const r of rows || []) {
          const id = String(r?.allocationId || '').trim();
          const month = Number(r?.month);
          if (!id || month < 0 || month > 11) continue;
          if (r?.canceled === true) nextCancel[`${id}_${month}`] = true;
          if (r?.manualValue != null && r?.manualValue !== '') {
            const n = Number(r.manualValue);
            if (!Number.isNaN(n) && n >= 0) nextValor[`${id}_${month}`] = n;
          }
          if (r?.manualPercent != null && r?.manualPercent !== '') {
            const p = Number(r.manualPercent);
            if (!Number.isNaN(p)) nextPct[`${id}_${month}`] = Math.max(0, Math.min(100, p));
          }
        }
        this.canceladoMensal = nextCancel;
        this.valorMensalManualMap = nextValor;
        this.percentualMensalManualMap = nextPct;
        this.cdr.markForCheck();
      }
    });
  }

  anosDisponiveis(): number[] {
    const anos = Array.from(new Set(this.linhasOrcamentarias.map((lo: any) => Number(lo?.ano || 0)).filter((a: number) => a > 0)));
    return anos.sort((a, b) => b - a);
  }

  selecionarAno(ano: number) {
    this.anoSelecionado = Number(ano || new Date().getFullYear());
  }

  pessoasAno() {
    type Linha  = { loId: string; loLabel: string; percentual: number };
    type MesInfo = { mes: string; monthIndex: number; alocado: boolean; loId: string; loLabel: string; percentual: number; horas: number; linhas: Linha[] };
    type PessoaRow = { nomePessoa: string; picoPercentual: number; totalHorasAno: number; totalValorAno: number; meses: MesInfo[] };

    const map = new Map<string, PessoaRow>();
    const idsAno = new Set(this.linhasOrcamentarias.filter((lo: any) => Number(lo?.ano) === Number(this.anoSelecionado)).map((lo: any) => lo.id));
    const buildEmptyRow = (nome: string): PessoaRow => ({
      nomePessoa: nome,
      picoPercentual: 0,
      totalHorasAno: 0,
      totalValorAno: 0,
      meses: this.meses.map((m, i) => ({
        mes: m, monthIndex: i, alocado: false,
        loId: '', loLabel: '-', percentual: 0,
        horas: this.getHorasMesByIndex(i), linhas: []
      }))
    });

    for (const p of this.pessoas) {
      const nome = String(p?.nome || '').trim();
      if (!nome) continue;
      if (!map.has(nome)) map.set(nome, buildEmptyRow(nome));
    }

    for (const a of this.alocacoes) {
      if (!idsAno.has(a?.linhaOrcamentariaId)) continue;
      const nome = String(a?.nomePessoa || '').trim();
      if (!nome) continue;
      if (!map.has(nome)) map.set(nome, buildEmptyRow(nome));
    }

    for (const row of map.values()) {
      const alocsPessoaAno = this.alocacoes.filter((a: any) =>
        idsAno.has(a?.linhaOrcamentariaId) && this.normalized(a?.nomePessoa || '') === this.normalized(row.nomePessoa)
      );

      for (let month = 0; month < 12; month++) {
        const candidatas = alocsPessoaAno
          .filter((a: any) => !this.isCancelado(a.id, month))
          .filter((a: any) => this.getPercentualEfetivoMes(a.id, month) > 0);

        if (!candidatas.length) continue;

        const pagas = candidatas.filter((a: any) => this.isPago(a.id, month));
        let linhas: Linha[];
        if (pagas.length > 0) {
          linhas = pagas.map((a: any) => {
            const lo = this.linhasOrcamentarias.find((x: any) => x.id === a.linhaOrcamentariaId);
            return { loId: a.linhaOrcamentariaId, loLabel: lo?.codigo || a?.linhaOrcamentariaCodigo || '-', percentual: this.getPercentualEfetivoMes(a.id, month) };
          });
        } else {
          let consumido = 0;
          linhas = [];
          for (const a of candidatas) {
            if (consumido >= 100) break;
            const pct = Math.min(this.getPercentualEfetivoMes(a.id, month), Math.max(0, 100 - consumido));
            if (pct <= 0) continue;
            const lo = this.linhasOrcamentarias.find((x: any) => x.id === a.linhaOrcamentariaId);
            linhas.push({ loId: a.linhaOrcamentariaId, loLabel: lo?.codigo || a?.linhaOrcamentariaCodigo || '-', percentual: pct });
            consumido += pct;
          }
        }

        if (!linhas.length) continue;

        const percentualTotal = linhas.reduce((sum, l) => sum + l.percentual, 0);

        row.meses[month] = {
          mes: this.meses[month],
          monthIndex: month,
          alocado: true,
          loId: linhas[0].loId,
          loLabel: linhas[0].loLabel,
          percentual: percentualTotal,
          horas: this.getHorasMesByIndex(month),
          linhas
        };

        row.picoPercentual = Math.max(row.picoPercentual, percentualTotal);
        row.totalHorasAno += this.getHorasMesByIndex(month);

        row.totalValorAno += linhas.reduce((sum, l) => {
          const a = candidatas.find((c: any) => c.linhaOrcamentariaId === l.loId);
          if (!a) return sum;
          const manual = this.getValorMensalManual(a.id, month);
          if (manual > 0) return sum + Number(manual.toFixed(2));
          const vh = this.getValorHoraDaAlocacao(a);
          return sum + Number((vh * this.getHorasMesByIndex(month) * (l.percentual / 100)).toFixed(2));
        }, 0);
      }
    }

    const query = this.searchTerm.trim().toLowerCase();
    return Array.from(map.values())
      .filter((p) => {
        if (!query) return true;
        const mesTxt = p.meses.map((m) => `${m.mes} ${m.linhas.map(l => l.loLabel).join(' ')} ${m.percentual}`).join(' ');
        return `${p.nomePessoa} ${mesTxt}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.nomePessoa.localeCompare(b.nomePessoa, 'pt-BR', { sensitivity: 'base' }));
  }

  abrirAlocacaoLinha(linha: { loId: string }) {
    if (!linha?.loId) return;
    this.openAllocation.emit({ loId: linha.loId, ano: this.anoSelecionado });
  }

  abrirAlocacaoMes(mes: { loId: string }, event: Event) {
    event.preventDefault();
    if (!mes?.loId) return;
    this.openAllocation.emit({ loId: mes.loId, ano: this.anoSelecionado });
  }

  private getPercentual(allocationId: string): number {
    return this.allocationPercents[allocationId] ?? 100;
  }

  private isPago(allocationId: string, month: number): boolean {
    return !!this.pagoMensal[`${allocationId}_${month}`];
  }

  private isCancelado(allocationId: string, month: number): boolean {
    return !!this.canceladoMensal[`${allocationId}_${month}`];
  }

  private getValorMensalManual(allocationId: string, month: number): number {
    return this.valorMensalManualMap[`${allocationId}_${month}`] ?? 0;
  }

  private getPercentualMensalManual(allocationId: string, month: number): number | null {
    return this.percentualMensalManualMap[`${allocationId}_${month}`] ?? null;
  }

  private getPercentualEfetivoMes(allocationId: string, month: number): number {
    const mensal = this.getPercentualMensalManual(allocationId, month);
    if (mensal != null) return mensal;
    return this.getPercentual(allocationId);
  }

  private getHorasMesByIndex(monthIndex: number): number {
    const mes = monthIndex + 1;
    const found = this.horasMes.find((h: any) => Number(h?.mes) === mes);
    const horas = Number(found?.horas ?? 160);
    return horas > 0 ? horas : 160;
  }

  private getValorHoraDaAlocacao(a: any): number {
    return a?.debitaLo === false ? 0 : Number(a?.valorHora || 0);
  }

  currency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private normalized(value: string): string {
    return (value || '').trim().toLowerCase();
  }
}
