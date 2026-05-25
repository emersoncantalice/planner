import { Component, CUSTOM_ELEMENTS_SCHEMA, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

type Relatorio = 'lo' | 'pessoa' | 'prestador' | 'mensal' | 'nao_alocados';

@Component({
  selector: 'app-reports-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './reports-panel.component.html',
  styleUrl: './reports-panel.component.scss'
})
export class ReportsPanelComponent {
  @Input() linhasOrcamentarias: any[] = [];
  @Input() ajustes: any[] = [];
  @Input() alocacoes: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() perfis: any[] = [];
  @Input() consultorias: any[] = [];
  @Input() horasMes: any[] = [];

  meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  relatorioAtivo: Relatorio = 'lo';
  anoSelecionado = new Date().getFullYear();
  filtroTipo: '' | 'FOLHA' | 'TERCEIRO' = '';
  filtroLoId = '';

  // ── helpers ────────────────────────────────────────────────────────────────

  anosDisponiveis(): number[] {
    const anos = Array.from(
      new Set(this.linhasOrcamentarias.map((lo: any) => Number(lo?.ano || 0)).filter(a => a > 0))
    ).sort((a, b) => b - a);
    return anos.length ? anos : [new Date().getFullYear()];
  }

  losDoAno(): any[] {
    return this.linhasOrcamentarias.filter((lo: any) => Number(lo?.ano) === Number(this.anoSelecionado));
  }

  alocacoesDoAno(): any[] {
    const ids = new Set(this.losDoAno().map((lo: any) => lo.id));
    return this.alocacoes.filter((a: any) => ids.has(a.linhaOrcamentariaId));
  }

  private getValorHora(nomePessoa: string, fallback = 0): number {
    const p = this.pessoas.find(
      (x: any) => (x?.nome || '').trim().toLowerCase() === (nomePessoa || '').trim().toLowerCase()
    );
    return p?.valorHora != null ? Number(p.valorHora) : Number(fallback);
  }

  private getTipoVinculo(nomePessoa: string): string {
    const p = this.pessoas.find(
      (x: any) => (x?.nome || '').trim().toLowerCase() === (nomePessoa || '').trim().toLowerCase()
    );
    return String(p?.tipoVinculo || '').toUpperCase();
  }

  private getConsultoria(nomePessoa: string): string {
    const p = this.pessoas.find(
      (x: any) => (x?.nome || '').trim().toLowerCase() === (nomePessoa || '').trim().toLowerCase()
    );
    return p?.consultoria || '-';
  }

  private getPerfilNome(nomePessoa: string, fallback = ''): string {
    const p = this.pessoas.find(
      (x: any) => (x?.nome || '').trim().toLowerCase() === (nomePessoa || '').trim().toLowerCase()
    );
    if (p?.perfilId) {
      const perf = this.perfis.find((x: any) => x.id === p.perfilId);
      if (perf?.nomePerfil) return perf.nomePerfil;
    }
    return fallback;
  }

  private getPercentual(allocationId: string): number {
    try {
      const raw = localStorage.getItem(`planner_lo_alloc_${allocationId}`);
      if (raw) {
        const p = JSON.parse(raw);
        return Math.max(0, Math.min(100, Number(p?.percentual ?? 100)));
      }
    } catch {}
    return 100;
  }

  private getHorasMes(monthIndex: number): number {
    const found = this.horasMes.find((h: any) => Number(h?.mes) === monthIndex + 1);
    const h = Number(found?.horas ?? 160);
    return h > 0 ? h : 160;
  }

  private custoMensalAlloc(a: any, monthIndex: number): number {
    const pct = this.getPercentual(a.id);
    const vh = this.getValorHora(a.nomePessoa, Number(a.valorHora || 0));
    return vh * this.getHorasMes(monthIndex) * (pct / 100);
  }

  private custoAnualAlloc(a: any): number {
    return this.meses.reduce((acc, _, mi) => acc + this.custoMensalAlloc(a, mi), 0);
  }

  private orcamentoLo(lo: any): number {
    const base = Number(lo?.valorTotal || 0);
    const delta = this.ajustes
      .filter((aj: any) => aj.budgetLineId === lo.id)
      .reduce((s: number, aj: any) => {
        const v = Number(aj?.valor || 0);
        return s + (String(aj?.tipo || '').toUpperCase() === 'APORTE' ? v : -v);
      }, 0);
    return base + delta;
  }

  currency(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  pct(v: number): string {
    return v.toFixed(1) + '%';
  }

  clamp(v: number): number {
    return Math.max(0, Math.min(100, v));
  }

  // ── Relatório 1: Por LO ────────────────────────────────────────────────────

  relatorioLo(): any[] {
    return this.losDoAno().map(lo => {
      const alocsLo = this.alocacoes.filter((a: any) => a.linhaOrcamentariaId === lo.id);
      const comprometido = alocsLo.reduce((acc: number, a: any) => acc + this.custoAnualAlloc(a), 0);
      const folha = alocsLo.filter((a: any) => this.getTipoVinculo(a.nomePessoa) !== 'TERCEIRO')
        .reduce((acc: number, a: any) => acc + this.custoAnualAlloc(a), 0);
      const terceiros = alocsLo.filter((a: any) => this.getTipoVinculo(a.nomePessoa) === 'TERCEIRO')
        .reduce((acc: number, a: any) => acc + this.custoAnualAlloc(a), 0);
      const orc = this.orcamentoLo(lo);
      return {
        codigo: lo.codigo,
        nome: lo.nome || '-',
        tipo: lo.tipo || '-',
        centroCusto: lo.centroCusto || '-',
        orcamento: orc,
        comprometido,
        folha,
        terceiros,
        saldo: orc - comprometido,
        pctUtilizado: orc > 0 ? (comprometido / orc) * 100 : 0,
        qtdAlocacoes: alocsLo.length
      };
    });
  }

  totaisLo() {
    const rows = this.relatorioLo();
    return {
      orcamento: rows.reduce((s, r) => s + r.orcamento, 0),
      comprometido: rows.reduce((s, r) => s + r.comprometido, 0),
      folha: rows.reduce((s, r) => s + r.folha, 0),
      terceiros: rows.reduce((s, r) => s + r.terceiros, 0),
      saldo: rows.reduce((s, r) => s + r.saldo, 0),
      qtdAlocacoes: rows.reduce((s, r) => s + r.qtdAlocacoes, 0)
    };
  }

  // ── Relatório 2: Por Pessoa ────────────────────────────────────────────────

  relatorioPessoa(): any[] {
    const alocAnno = this.alocacoesDoAno();
    const filtered = alocAnno.filter((a: any) => {
      if (!this.filtroTipo) return true;
      const tipo = this.getTipoVinculo(a.nomePessoa);
      return this.filtroTipo === 'TERCEIRO' ? tipo === 'TERCEIRO' : tipo !== 'TERCEIRO';
    }).filter((a: any) => {
      if (!this.filtroLoId) return true;
      return a.linhaOrcamentariaId === this.filtroLoId;
    });

    const byPessoa = new Map<string, any>();
    for (const a of filtered) {
      const nome = a.nomePessoa || '-';
      if (!byPessoa.has(nome)) {
        const tipoVinculo = this.getTipoVinculo(nome);
        byPessoa.set(nome, {
          nome,
          perfil: this.getPerfilNome(nome, a.perfilNome || '-'),
          tipo: tipoVinculo === 'TERCEIRO' ? 'Prestador' : 'Folha',
          consultoria: this.getConsultoria(nome),
          valorHora: this.getValorHora(nome, Number(a.valorHora || 0)),
          los: new Set<string>(),
          custoAnual: 0,
          qtdAlocacoes: 0
        });
      }
      const row = byPessoa.get(nome)!;
      const lo = this.losDoAno().find((l: any) => l.id === a.linhaOrcamentariaId);
      if (lo?.codigo) row.los.add(lo.codigo);
      row.custoAnual += this.custoAnualAlloc(a);
      row.qtdAlocacoes++;
    }

    return Array.from(byPessoa.values())
      .map(r => ({ ...r, los: Array.from(r.los).join(', ') || '-' }))
      .sort((a, b) => b.custoAnual - a.custoAnual);
  }

  totaisPessoa() {
    const rows = this.relatorioPessoa();
    return { total: rows.reduce((s, r) => s + r.custoAnual, 0), qtd: rows.length };
  }

  // ── Relatório 3: Por Prestador ─────────────────────────────────────────────

  private _prestadorCache: any[] | null = null;
  private _prestadorCacheAno = -1;

  relatorioPrestador(): any[] {
    if (this._prestadorCacheAno !== this.anoSelecionado || !this._prestadorCache) {
      this._prestadorCache = this._computePrestador();
      this._prestadorCacheAno = this.anoSelecionado;
    }
    return this._prestadorCache;
  }

  totaisPrestador(): { totalCusto: number; totalPessoas: number } {
    const rows = this.relatorioPrestador();
    return {
      totalCusto: rows.reduce((s, r) => s + r.custoAnual, 0),
      totalPessoas: rows.reduce((s, r) => s + r.qtdPessoas, 0)
    };
  }

  private _computePrestador(): any[] {
    const alocAnno = this.alocacoesDoAno();
    const byPrestador = new Map<string, any>();

    // Include all consultancies even without allocations
    for (const c of this.consultorias) {
      byPrestador.set(c.nome, { nome: c.nome, pessoas: new Set<string>(), custoAnual: 0 });
    }

    for (const a of alocAnno) {
      if (this.getTipoVinculo(a.nomePessoa) !== 'TERCEIRO') continue;
      const cons = this.getConsultoria(a.nomePessoa);
      if (!byPrestador.has(cons)) byPrestador.set(cons, { nome: cons, pessoas: new Set<string>(), custoAnual: 0 });
      const row = byPrestador.get(cons)!;
      row.pessoas.add(a.nomePessoa);
      row.custoAnual += this.custoAnualAlloc(a);
    }

    return Array.from(byPrestador.values())
      .map(r => ({ ...r, qtdPessoas: r.pessoas.size, pessoas: Array.from(r.pessoas).join(', ') || '-' }))
      .sort((a, b) => b.custoAnual - a.custoAnual);
  }

  // ── Relatório 4: Visão Mensal ──────────────────────────────────────────────

  relatorioMensal() {
    const alocAnno = this.alocacoesDoAno();
    const folha = this.meses.map((_, mi) =>
      alocAnno.filter((a: any) => this.getTipoVinculo(a.nomePessoa) !== 'TERCEIRO')
              .reduce((s: number, a: any) => s + this.custoMensalAlloc(a, mi), 0)
    );
    const terceiros = this.meses.map((_, mi) =>
      alocAnno.filter((a: any) => this.getTipoVinculo(a.nomePessoa) === 'TERCEIRO')
              .reduce((s: number, a: any) => s + this.custoMensalAlloc(a, mi), 0)
    );
    const total = this.meses.map((_, mi) => folha[mi] + terceiros[mi]);

    // Per-LO rows
    const losRows = this.losDoAno().map(lo => {
      const alocsLo = alocAnno.filter((a: any) => a.linhaOrcamentariaId === lo.id);
      const mensal = this.meses.map((_, mi) =>
        alocsLo.reduce((s: number, a: any) => s + this.custoMensalAlloc(a, mi), 0)
      );
      return { codigo: lo.codigo, nome: lo.nome, mensal, totalAnual: mensal.reduce((s, v) => s + v, 0) };
    });

    return {
      folha, terceiros, total,
      totalFolha: folha.reduce((s, v) => s + v, 0),
      totalTerceiros: terceiros.reduce((s, v) => s + v, 0),
      totalGeral: total.reduce((s, v) => s + v, 0),
      losRows
    };
  }

  // ── Relatório 5: Não Alocados ──────────────────────────────────────────────

  relatorioNaoAlocados(): any[] {
    const nomeAlocados = new Set(this.alocacoesDoAno().map((a: any) => (a.nomePessoa || '').trim().toLowerCase()));
    return this.pessoas
      .filter((p: any) => !nomeAlocados.has((p?.nome || '').trim().toLowerCase()))
      .map(p => ({
        nome: p.nome,
        perfil: this.getPerfilNome(p.nome, p.perfilNome || '-'),
        tipo: String(p?.tipoVinculo || '').toUpperCase() === 'TERCEIRO' ? 'Prestador' : 'Folha',
        consultoria: p.consultoria || '-',
        valorHora: Number(p.valorHora || 0)
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // ── Exportação CSV ─────────────────────────────────────────────────────────

  exportarCsv() {
    let rows: string[][] = [];
    const h = (s: string) => s;

    if (this.relatorioAtivo === 'lo') {
      rows.push(['Código', 'Nome', 'Tipo', 'CC', 'Orçamento', 'Comprometido', 'Folha', 'Prestadores', 'Saldo', '% Utilizado', 'Alocações']);
      for (const r of this.relatorioLo()) {
        rows.push([r.codigo, r.nome, r.tipo, r.centroCusto, r.orcamento.toFixed(2), r.comprometido.toFixed(2), r.folha.toFixed(2), r.terceiros.toFixed(2), r.saldo.toFixed(2), r.pctUtilizado.toFixed(1), r.qtdAlocacoes]);
      }
    } else if (this.relatorioAtivo === 'pessoa') {
      rows.push(['Nome', 'Perfil', 'Tipo', 'Prestador', 'LOs', 'Valor/h', 'Custo Anual']);
      for (const r of this.relatorioPessoa()) {
        rows.push([r.nome, r.perfil, r.tipo, r.consultoria, r.los, r.valorHora.toFixed(2), r.custoAnual.toFixed(2)]);
      }
    } else if (this.relatorioAtivo === 'prestador') {
      rows.push(['Prestador', 'Qtd. Pessoas', 'Pessoas', 'Custo Anual']);
      for (const r of this.relatorioPrestador()) {
        rows.push([r.nome, r.qtdPessoas, r.pessoas, r.custoAnual.toFixed(2)]);
      }
    } else if (this.relatorioAtivo === 'mensal') {
      const m = this.relatorioMensal();
      rows.push(['Categoria', ...this.meses, 'Total']);
      rows.push(['Folha', ...m.folha.map((v: number) => v.toFixed(2)), m.totalFolha.toFixed(2)]);
      rows.push(['Prestadores', ...m.terceiros.map((v: number) => v.toFixed(2)), m.totalTerceiros.toFixed(2)]);
      rows.push(['Total', ...m.total.map((v: number) => v.toFixed(2)), m.totalGeral.toFixed(2)]);
      rows.push([]);
      rows.push(['LO', ...this.meses, 'Total']);
      for (const lo of m.losRows) {
        rows.push([lo.codigo, ...lo.mensal.map((v: number) => v.toFixed(2)), lo.totalAnual.toFixed(2)]);
      }
    } else {
      rows.push(['Nome', 'Perfil', 'Tipo', 'Prestador', 'Valor/h']);
      for (const r of this.relatorioNaoAlocados()) {
        rows.push([r.nome, r.perfil, r.tipo, r.consultoria, r.valorHora.toFixed(2)]);
      }
    }

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${this.relatorioAtivo}_${this.anoSelecionado}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
