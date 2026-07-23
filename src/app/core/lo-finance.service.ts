import { Injectable } from '@angular/core';

/**
 * Fonte única de verdade para os cálculos financeiros das Linhas Orçamentárias (LOs).
 *
 * A lógica aqui foi extraída verbatim da "Visão Geral das LOs" da tela de Alocações
 * (budget-allocation-panel). Cockpit (dashboard) e Relatórios passam a consumir este
 * serviço para que os três lugares mostrem exatamente os mesmos números.
 *
 * O serviço é puro: não faz HTTP nem guarda estado de UI. Cada consumidor monta um
 * {@link LoFinanceContext} apontando para os seus próprios dados (arrays vivos + closures
 * de estado mensal) e chama os métodos de agregação.
 */
export interface LoFinanceContext {
  ano: number;
  linhasOrcamentarias: any[];
  ajustes: any[];
  alocacoes: any[];
  pessoas: any[];
  perfis: any[];
  horasMes: any[];
  ausencias: any[];

  /** Percentual base por alocação (0..100). É o equivalente ao getConfig().percentual. */
  percentualBase: (allocationId: string) => number;
  /** Mês cancelado para a alocação. */
  isCancelado: (allocationId: string, month: number) => boolean;
  /** Valor manual mensal (sobrescreve o cálculo) ou null. */
  manualValue: (allocationId: string, month: number) => number | null;
  /** Percentual manual mensal (sobrescreve o percentual base) ou null. */
  manualPercent: (allocationId: string, month: number) => number | null;
  /** Mês pago para a alocação. */
  isPago: (allocationId: string, month: number) => boolean;
}

@Injectable({ providedIn: 'root' })
export class LoFinanceService {
  /** Cria uma calculadora vinculada a um contexto. */
  for(ctx: LoFinanceContext): LoFinanceCalculator {
    return new LoFinanceCalculator(ctx);
  }
}

/**
 * Calculadora vinculada a um contexto. Reusa as mesmas referências dos arrays do
 * componente, portanto sempre lê os dados mais recentes (não copia nada).
 */
export class LoFinanceCalculator {
  constructor(private ctx: LoFinanceContext) {}

  // ── utilidades ────────────────────────────────────────────────────────────
  private normalized(value: string): string {
    return (value || '').trim().toLowerCase();
  }

  private round2(value: number): number {
    return Number((value || 0).toFixed(2));
  }

  // ── seleção de LOs do ano ─────────────────────────────────────────────────
  linhasDoAno(): any[] {
    return this.ctx.linhasOrcamentarias.filter(
      (lo: any) => Number(lo?.ano) === Number(this.ctx.ano)
    );
  }

  // ── classificação de pessoa / alocação ────────────────────────────────────
  isPessoaPlaneada(a: any): boolean {
    return typeof a?.nomePessoa === 'string' && a.nomePessoa.startsWith('Pessoa Planejada ');
  }

  /** Para a Visão Geral: rascunhos e pessoas planejadas nunca contam. */
  alocacaoContaNoGeral(a: any): boolean {
    if (this.isPessoaPlaneada(a)) return false;
    if (a?.draft) return false;
    return true;
  }

  getCategoriaDaPessoa(allocation: any): 'FOLHA' | 'TERCEIRO' {
    const rawDireto = String(
      allocation?.tipoVinculo ??
      allocation?.categoria ??
      allocation?.pessoaTipoVinculo ??
      allocation?.pessoaCategoria ??
      ''
    ).toUpperCase();
    if (rawDireto.includes('TERCEIRO') || rawDireto.includes('PRESTADOR')) return 'TERCEIRO';
    if (rawDireto.includes('FOLHA')) return 'FOLHA';

    const nome = this.normalized(allocation?.nomePessoa || '');
    const pessoa = this.ctx.pessoas.find((p: any) => this.normalized(p?.nome || '') === nome);
    const tipoPessoa = String(pessoa?.tipoVinculo || '').toUpperCase();
    return tipoPessoa === 'TERCEIRO' ? 'TERCEIRO' : 'FOLHA';
  }

  private categoriaDaAlocacaoId(allocationId: string): 'FOLHA' | 'TERCEIRO' {
    const aloc = this.ctx.alocacoes.find((a: any) => a.id === allocationId);
    if (!aloc) return 'FOLHA';
    return this.getCategoriaDaPessoa(aloc);
  }

  private nomePessoaDaAlocacao(allocationId: string): string {
    const found = this.ctx.alocacoes.find((a: any) => a.id === allocationId);
    return found?.nomePessoa || 'Pessoa';
  }

  // ── valor/hora (com fallback de perfil e regra debitaLo) ──────────────────
  private debitaLoDaAlocacao(a: any): boolean {
    if (a?.debitaLo != null) return !!a.debitaLo;
    const pessoa = this.ctx.pessoas.find(
      (p: any) => this.normalized(p?.nome || '') === this.normalized(a?.nomePessoa || '')
    );
    const perfilId = a?.perfilId || pessoa?.perfilId;
    if (!perfilId) return true;
    const perfil = this.ctx.perfis.find((x: any) => x.id === perfilId);
    return perfil ? !!perfil.debitaLo : true;
  }

  getValorHoraDaAlocacao(a: any): number {
    if (!this.debitaLoDaAlocacao(a)) return 0;
    const pessoa = this.ctx.pessoas.find(
      (p: any) => this.normalized(p?.nome || '') === this.normalized(a?.nomePessoa || '')
    );
    if (pessoa?.valorHora != null) return Number(pessoa.valorHora);
    if (a?.perfilId) {
      const perfil = this.ctx.perfis.find((x: any) => x.id === a.perfilId);
      if (perfil?.valorHora != null) return Number(perfil.valorHora);
    }
    return Number(a?.valorHora || 0);
  }

  // ── horas efetivas (com desconto de ausências para TERCEIRO) ──────────────
  private horasDoCadastro(monthIndex: number): number {
    const mes = monthIndex + 1;
    const found = this.ctx.horasMes.find((h: any) => Number(h?.mes) === mes);
    const horas = Number(found?.horas ?? 160);
    return horas > 0 ? horas : 160;
  }

  private diasAusenciaNoMes(nomePessoa: string, monthIndex: number, ano: number): number {
    const nomeNorm = this.normalized(nomePessoa || '');
    if (!nomeNorm) return 0;
    const pessoa = this.ctx.pessoas.find((p: any) => this.normalized(p?.nome || '') === nomeNorm);
    const pessoaId = String(pessoa?.id || '').trim();
    const monthStart = new Date(ano, monthIndex, 1);
    const monthEnd = new Date(ano, monthIndex + 1, 0);
    const dias = new Set<string>();

    for (const a of (this.ctx.ausencias || [])) {
      const aid = String(a?.pessoaId || '').trim();
      const anome = this.normalized(a?.pessoaNome || '');
      if (!(pessoaId && aid === pessoaId) && anome !== nomeNorm) continue;

      const inicioRaw = String(a?.inicio || '');
      const fimRaw = String(a?.fim || '');
      if (!inicioRaw || !fimRaw) continue;
      const inicio = new Date((a?.recorrente ? `${ano}-${inicioRaw.slice(5)}` : inicioRaw) + 'T00:00:00');
      const fim = new Date((a?.recorrente ? `${ano}-${fimRaw.slice(5)}` : fimRaw) + 'T00:00:00');
      if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) continue;

      const clampStart = inicio > monthStart ? inicio : monthStart;
      const clampEnd = fim < monthEnd ? fim : monthEnd;
      if (clampStart > clampEnd) continue;

      const cursor = new Date(clampStart.getTime());
      while (cursor <= clampEnd) {
        const dow = cursor.getDay();
        // Apenas dias úteis (segunda a sexta) contam como ausência debitável.
        if (dow !== 0 && dow !== 6) dias.add(cursor.toISOString().slice(0, 10));
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return dias.size;
  }

  private horasEfetivas(
    monthIndex: number,
    categoria?: 'FOLHA' | 'TERCEIRO',
    nomePessoa?: string,
    isDraft = false
  ): number {
    if (categoria !== 'TERCEIRO') return isDraft ? this.horasDoCadastro(monthIndex) : 168;
    const base = this.horasDoCadastro(monthIndex);
    if (!nomePessoa) return base;
    const diasFora = this.diasAusenciaNoMes(nomePessoa, monthIndex, this.ctx.ano);
    return Math.max(0, base - (diasFora * 8));
  }

  private temReducaoPorAusencia(allocationId: string, monthIndex: number): boolean {
    const categoria = this.categoriaDaAlocacaoId(allocationId);
    if (categoria !== 'TERCEIRO') return false;
    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    return this.diasAusenciaNoMes(nomePessoa, monthIndex, this.ctx.ano) > 0;
  }

  // ── percentual efetivo (manual mensal sobrescreve o base) ─────────────────
  private getPercentualEfetivoMes(allocationId: string, month: number): number {
    const mensal = this.ctx.manualPercent(allocationId, month);
    if (mensal != null) return mensal;
    return Number(this.ctx.percentualBase(allocationId) || 0);
  }

  // ── disponibilidade entre LOs (impede dupla contagem) ─────────────────────
  private mesComControleExplicito(allocationId: string, month: number): boolean {
    if (this.ctx.isCancelado(allocationId, month)) return false;
    return this.ctx.isPago(allocationId, month);
  }

  private valorMesEfetivo(allocationId: string, month: number): number {
    const aloc = this.ctx.alocacoes.find((a: any) => a.id === allocationId);
    if (!aloc) return 0;
    const valorHora = this.getValorHoraDaAlocacao(aloc);
    return this.round2(this.custoMensalCalculado(allocationId, valorHora, month));
  }

  private mesAtivoParaAlocacao(allocationId: string, month: number): boolean {
    if (this.ctx.isCancelado(allocationId, month)) return false;
    if (this.ctx.isPago(allocationId, month)) return true;
    if ((this.ctx.manualValue(allocationId, month) ?? 0) > 0) return true;
    if (this.getPercentualEfetivoMes(allocationId, month) > 0) return true;
    return this.valorMesEfetivo(allocationId, month) > 0;
  }

  private mesIndisponivelParaAlocacao(allocationId: string, month: number): boolean {
    if (this.ctx.isPago(allocationId, month) || this.ctx.isCancelado(allocationId, month)) {
      return false;
    }

    const nomePessoa = this.nomePessoaDaAlocacao(allocationId);
    const linhasDaPessoa = this.ctx.alocacoes.filter(
      (a: any) => this.normalized(a?.nomePessoa || '') === this.normalized(nomePessoa)
    );

    const comControle = linhasDaPessoa.find(
      (a: any) => a.id !== allocationId && this.mesComControleExplicito(a.id, month)
    );
    if (comControle) return true;

    const thisIndex = linhasDaPessoa.findIndex((a: any) => a.id === allocationId);
    if (thisIndex > 0) {
      const percentualAnterior = linhasDaPessoa
        .slice(0, thisIndex)
        .filter((a: any) => !this.ctx.isCancelado(a.id, month))
        .reduce((sum: number, a: any) => sum + Number(this.getPercentualEfetivoMes(a.id, month) || 0), 0);
      if (percentualAnterior >= 100) return true;
    }

    return false;
  }

  // ── custo mensal ──────────────────────────────────────────────────────────
  private custoMensalCalculado(allocationId: string, valorHora: number, month: number): number {
    if (this.ctx.isCancelado(allocationId, month)) return 0;
    const percentual = this.getPercentualEfetivoMes(allocationId, month);
    const isDraftAloc = !!(this.ctx.alocacoes.find((a: any) => a.id === allocationId)?.draft);
    const horas = this.horasEfetivas(
      month,
      this.categoriaDaAlocacaoId(allocationId),
      this.nomePessoaDaAlocacao(allocationId),
      isDraftAloc
    );
    return (valorHora || 0) * horas * (percentual / 100);
  }

  /** Custo mensal canônico usado pela Visão Geral. */
  custoMensal(allocationId: string, valorHora: number, month: number): number {
    if (this.ctx.isCancelado(allocationId, month)) return 0;
    if (this.mesIndisponivelParaAlocacao(allocationId, month)) return 0;
    const manual = this.ctx.manualValue(allocationId, month);
    if (manual != null) return manual;
    const percentual = this.getPercentualEfetivoMes(allocationId, month);
    const isDraftAloc = !!(this.ctx.alocacoes.find((a: any) => a.id === allocationId)?.draft);
    const horas = this.horasEfetivas(month, this.categoriaDaAlocacaoId(allocationId), undefined, isDraftAloc);
    return (valorHora || 0) * horas * (percentual / 100);
  }

  /** Custo anual de uma alocação (12 meses), arredondando mês a mês como na tela. */
  custoAnualAlocacao(a: any): number {
    const vh = this.getValorHoraDaAlocacao(a);
    let total = 0;
    for (let mi = 0; mi < 12; mi++) total += this.round2(this.custoMensal(a.id, vh, mi));
    return total;
  }

  /** Custo pago (realizado) anual de uma alocação. */
  pagoAnualAlocacao(a: any): number {
    const vh = this.getValorHoraDaAlocacao(a);
    let total = 0;
    for (let mi = 0; mi < 12; mi++) {
      if (!this.ctx.isPago(a.id, mi)) continue;
      total += this.round2(this.custoMensal(a.id, vh, mi));
    }
    return total;
  }

  // ── orçamento (valorTotal + ajustes) ──────────────────────────────────────
  orcamentoLo(lo: any): number {
    const base = Number(lo?.valorTotal || 0);
    const delta = this.ctx.ajustes
      .filter((a: any) => a.budgetLineId === lo.id)
      .reduce((sum: number, a: any) => {
        const valor = Number(a?.valor || 0);
        return sum + (String(a?.tipo || '').toUpperCase() === 'APORTE' ? valor : -valor);
      }, 0);
    return base + delta;
  }

  // ── alocações do ano que contam na Visão Geral ────────────────────────────
  private alocacoesGeral(): any[] {
    const idsAno = new Set(this.linhasDoAno().map((lo: any) => lo.id));
    return this.ctx.alocacoes
      .filter((a: any) => idsAno.has(a.linhaOrcamentariaId))
      .filter((a: any) => this.alocacaoContaNoGeral(a));
  }

  // ── AGREGADOS GERAIS (cards "Visão Geral das LOs") ────────────────────────
  totalOrcamentoGeralLos(): number {
    return this.linhasDoAno().reduce((acc: number, lo: any) => acc + this.orcamentoLo(lo), 0);
  }

  comprometidoGeralPorCategoria(categoria: 'FOLHA' | 'TERCEIRO'): number {
    return this.alocacoesGeral()
      .filter((a: any) => this.getCategoriaDaPessoa(a) === categoria)
      .reduce((acc: number, a: any) => acc + this.custoAnualAlocacao(a), 0);
  }

  totalComprometidoGeralLos(): number {
    return this.comprometidoGeralPorCategoria('FOLHA') + this.comprometidoGeralPorCategoria('TERCEIRO');
  }

  saldoGeralLos(): number {
    return this.totalOrcamentoGeralLos() - this.totalComprometidoGeralLos();
  }

  saldoAtualGeralLos(): number {
    return this.totalOrcamentoGeralLos() - this.totalPagoGeralLos();
  }

  percentualUtilizadoGeral(): number {
    const orc = this.totalOrcamentoGeralLos();
    if (!orc) return 0;
    return (this.totalComprometidoGeralLos() / orc) * 100;
  }

  totalPagoGeralLosPorCategoria(categoria: 'FOLHA' | 'TERCEIRO'): number {
    return this.alocacoesGeral()
      .filter((a: any) => this.getCategoriaDaPessoa(a) === categoria)
      .reduce((acc: number, a: any) => acc + this.pagoAnualAlocacao(a), 0);
  }

  totalPagoGeralLos(): number {
    return this.totalPagoGeralLosPorCategoria('FOLHA') + this.totalPagoGeralLosPorCategoria('TERCEIRO');
  }

  numLosAno(): number {
    return this.linhasDoAno().length;
  }

  numAlocacoesAno(): number {
    return this.alocacoesGeral().length;
  }

  numPessoasAlocadasAno(): number {
    const nomes = new Set(
      this.alocacoesGeral()
        .map((a: any) => this.normalized(a?.nomePessoa || ''))
        .filter((n: string) => !!n)
    );
    return nomes.size;
  }

  mediaComprometidoPorLo(): number {
    const n = this.numLosAno();
    if (!n) return 0;
    return this.totalComprometidoGeralLos() / n;
  }

  // ── POR LO (cockpit "utilização" / relatório por LO) ──────────────────────
  private alocacoesGeralDaLo(loId: string): any[] {
    return this.ctx.alocacoes
      .filter((a: any) => a.linhaOrcamentariaId === loId)
      .filter((a: any) => this.alocacaoContaNoGeral(a));
  }

  comprometidoLo(loId: string): number {
    return this.alocacoesGeralDaLo(loId).reduce((acc: number, a: any) => acc + this.custoAnualAlocacao(a), 0);
  }

  comprometidoLoPorCategoria(loId: string, categoria: 'FOLHA' | 'TERCEIRO'): number {
    return this.alocacoesGeralDaLo(loId)
      .filter((a: any) => this.getCategoriaDaPessoa(a) === categoria)
      .reduce((acc: number, a: any) => acc + this.custoAnualAlocacao(a), 0);
  }

  pagoLo(loId: string): number {
    return this.alocacoesGeralDaLo(loId).reduce((acc: number, a: any) => acc + this.pagoAnualAlocacao(a), 0);
  }

  qtdAlocacoesLo(loId: string): number {
    return this.alocacoesGeralDaLo(loId).length;
  }

  /** Custo mensal somado de uma alocação (para relatório mensal / por mês). */
  custoMensalAlocacao(a: any, monthIndex: number): number {
    if (!this.alocacaoContaNoGeral(a)) return 0;
    return this.round2(this.custoMensal(a.id, this.getValorHoraDaAlocacao(a), monthIndex));
  }
}
