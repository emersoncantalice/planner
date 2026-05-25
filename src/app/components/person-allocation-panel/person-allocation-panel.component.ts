import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-person-allocation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './person-allocation-panel.component.html',
  styleUrl: './person-allocation-panel.component.scss'
})
export class PersonAllocationPanelComponent {
  @Input() alocacoes: any[] = [];
  @Input() linhasOrcamentarias: any[] = [];
  @Input() horasMes: any[] = [];
  @Output() openAllocation = new EventEmitter<{ loId: string; ano: number }>();

  searchTerm = '';
  anoSelecionado = new Date().getFullYear();
  readonly meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

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

    for (const a of this.alocacoes) {
      if (!idsAno.has(a?.linhaOrcamentariaId)) continue;
      const nome = String(a?.nomePessoa || '').trim();
      if (!nome) continue;
      if (!map.has(nome)) {
        const meses: MesInfo[] = this.meses.map((m, i) => ({
          mes: m, monthIndex: i, alocado: false,
          loId: '', loLabel: '-', percentual: 0,
          horas: this.getHorasMesByIndex(i), linhas: []
        }));
        map.set(nome, { nomePessoa: nome, picoPercentual: 0, totalHorasAno: 0, totalValorAno: 0, meses });
      }
    }

    for (const row of map.values()) {
      const alocsPessoaAno = this.alocacoes.filter((a: any) =>
        idsAno.has(a?.linhaOrcamentariaId) && this.normalized(a?.nomePessoa || '') === this.normalized(row.nomePessoa)
      );

      for (let month = 0; month < 12; month++) {
        // Candidatas: ativas (não canceladas, percentual > 0)
        const candidatas = alocsPessoaAno
          .filter((a: any) => !this.isCancelado(a.id, month))
          .filter((a: any) => this.getPercentualEfetivoMes(a.id, month) > 0);

        if (!candidatas.length) continue;

        // Aplica prioridade por ordem do array (igual ao budget panel):
        //   pago em qualquer linha → essa linha tem controle exclusivo
        //   senão → soma em ordem até 100%
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
        // Valor usando o percentual efetivo com prioridade (não o raw da LO bloqueada)
        row.totalValorAno += linhas.reduce((sum, l) => {
          const a = candidatas.find((c: any) => c.linhaOrcamentariaId === l.loId);
          if (!a) return sum;
          const manual = this.getValorMensalManual(a.id, month);
          if (manual > 0) return sum + Number(manual.toFixed(2));
          const vh = Number(a.valorHora || 0);
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
    const raw = localStorage.getItem(`planner_lo_alloc_${allocationId}`);
    if (!raw) return 100;
    try {
      return Number(JSON.parse(raw)?.percentual ?? 100);
    } catch {
      return 100;
    }
  }

  private isPago(allocationId: string, month: number): boolean {
    return localStorage.getItem(`planner_lo_pago_${allocationId}_${month}`) === '1';
  }

  private isCancelado(allocationId: string, month: number): boolean {
    return localStorage.getItem(`planner_lo_cancelado_${allocationId}_${month}`) === '1';
  }

  private getValorMensalManual(allocationId: string, month: number): number {
    const raw = localStorage.getItem(`planner_lo_valor_manual_${allocationId}_${month}`);
    const parsed = Number(raw || 0);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private getPercentualMensalManual(allocationId: string, month: number): number | null {
    const raw = localStorage.getItem(`planner_lo_alloc_monthly_${allocationId}_${month}`);
    if (raw == null || raw === '') return null;
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return null;
    return Math.max(0, Math.min(100, parsed));
  }

  private isPercentualMesSobrescrito(allocationId: string, month: number): boolean {
    return this.getPercentualMensalManual(allocationId, month) != null;
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

  private getValorMes(owner: any, month: number): number {
    if (this.isCancelado(owner?.id, month)) return 0;
    const manual = this.getValorMensalManual(owner?.id, month);
    if (manual > 0) return Number(manual.toFixed(2));
    const valorHora = Number(owner?.valorHora || 0);
    const horas = this.getHorasMesByIndex(month);
    const percentual = this.getPercentualEfetivoMes(owner.id, month);
    return Number((valorHora * horas * (percentual / 100)).toFixed(2));
  }

  currency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  private normalized(value: string): string {
    return (value || '').trim().toLowerCase();
  }
}
