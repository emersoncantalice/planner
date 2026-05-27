import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlannerApiService } from '../../core/planner-api.service';

@Component({
  selector: 'app-dashboard-panel',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './dashboard-panel.component.html',
  styleUrl: './dashboard-panel.component.scss'
})
export class DashboardPanelComponent implements OnChanges, OnDestroy {
  private api = inject(PlannerApiService);
  @Input() nomeUsuario = '';
  @Input() usernameAtual = '';
  @Input() token = '';
  @Input() resumo: any[] = [];
  @Input() linhasOrcamentarias: any[] = [];
  @Input() ajustes: any[] = [];
  @Input() alocacoes: any[] = [];
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() horasMes: any[] = [];
  @Input() ausencias: any[] = [];
  @Input() riscos: any[] = [];
  @Input() incidentes: any[] = [];
  @Input() debitosTecnicos: any[] = [];
  @Input() indicadores: any[] = [];
  @Input() atividades: any[] = [];
  @Output() navigate = new EventEmitter<string>();
  @Output() selectProject = new EventEmitter<string>();
  @Output() selectRisk = new EventEmitter<string>();
  allocationPayments: any[] = [];
  allocationMonthlyState: any[] = [];
  private realizadoSyncTimer: ReturnType<typeof setInterval> | null = null;

  anoAtual = new Date().getFullYear();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['token']) this.startRealizadoSync();
    if (changes['alocacoes']) this.carregarRealizado();
  }

  ngOnDestroy(): void {
    if (this.realizadoSyncTimer) {
      clearInterval(this.realizadoSyncTimer);
      this.realizadoSyncTimer = null;
    }
  }

  private carregarRealizado() {
    if (!this.token) return;
    this.api.listAllocationPayments(this.token).subscribe({ next: (rows) => this.allocationPayments = rows || [] });
    this.api.listAllocationMonthlyState(this.token).subscribe({ next: (rows) => this.allocationMonthlyState = rows || [] });
  }

  private startRealizadoSync() {
    if (this.realizadoSyncTimer) {
      clearInterval(this.realizadoSyncTimer);
      this.realizadoSyncTimer = null;
    }
    if (!this.token) return;
    this.carregarRealizado();
    this.realizadoSyncTimer = setInterval(() => this.carregarRealizado(), 3000);
  }

  // ── Monitoramento ────────────────────────────────────────────────────────
  filtroMonitoramento: 'todos' | 'riscos' | 'incidentes' | 'debitos' = 'todos';

  setFiltroMonitoramento(f: typeof this.filtroMonitoramento) { this.filtroMonitoramento = f; }

  incidentesAbertos(): any[] {
    return this.incidentes.filter(i => {
      const s = (i.status || '').toUpperCase();
      return s !== 'RESOLVIDO' && s !== 'POS_MORTEM';
    });
  }

  debitosAbertos(): any[] {
    return this.debitosTecnicos.filter(d => (d.status || '').toUpperCase() !== 'RESOLVIDO');
  }

  totalMonitoramento(): number {
    return this.riscosAbertos().length + this.incidentesAbertos().length + this.debitosAbertos().length;
  }

  itensMonitoramento(): any[] {
    const PREVIEW = 8;
    let pool: any[];
    switch (this.filtroMonitoramento) {
      case 'riscos':
        pool = this.riscosAbertosFilt().map(r => ({ ...r, _tipo: 'risco' }));
        break;
      case 'incidentes':
        pool = this.incidentesAbertosFilt().map(i => ({ ...i, _tipo: 'incidente' }));
        break;
      case 'debitos':
        pool = this.debitosAbertosFilt().map(d => ({ ...d, _tipo: 'debito' }));
        break;
      default:
        pool = [
          ...this.riscosAbertosFilt().map(r   => ({ ...r, _tipo: 'risco' })),
          ...this.incidentesAbertosFilt().map(i => ({ ...i, _tipo: 'incidente' })),
          ...this.debitosAbertosFilt().map(d   => ({ ...d, _tipo: 'debito' })),
        ];
    }
    return pool
      .sort((a, b) => this.epoch(b.criadoEm) - this.epoch(a.criadoEm))
      .slice(0, PREVIEW);
  }

  totalFiltrado(): number {
    switch (this.filtroMonitoramento) {
      case 'riscos':     return this.riscosAbertosFilt().length;
      case 'incidentes': return this.incidentesAbertosFilt().length;
      case 'debitos':    return this.debitosAbertosFilt().length;
      default:           return this.totalMonitoramentoFilt();
    }
  }

  navMonitoramento() {
    switch (this.filtroMonitoramento) {
      case 'riscos':     return 'riscos';
      case 'incidentes': return 'incidentes';
      case 'debitos':    return 'debitos_tecnicos';
      default:           return 'riscos';
    }
  }

  corItem(item: any): string {
    if (item._tipo === 'risco')     return this.corRisco(item);
    if (item._tipo === 'incidente') return this.corIncidente(item);
    return this.corDebito(item);
  }

  labelStatus(item: any): string {
    if (item._tipo === 'risco')     return this.labelRisco(item);
    if (item._tipo === 'incidente') return this.labelIncidente(item);
    return this.labelDebito(item);
  }

  private corIncidente(i: any): string {
    const s = (i.severidade || '').toUpperCase();
    if (s === 'P1_CRITICO') return 'red';
    if (s === 'P2_ALTO')    return 'amber';
    if (s === 'P3_MEDIO')   return 'yellow';
    return 'green';
  }

  private labelIncidente(i: any): string {
    const map: Record<string, string> = {
      P1_CRITICO: 'P1 Crítico', P2_ALTO: 'P2 Alto', P3_MEDIO: 'P3 Médio', P4_BAIXO: 'P4 Baixo'
    };
    return map[(i.severidade || '').toUpperCase()] || i.severidade || '—';
  }

  private corDebito(d: any): string {
    const s = (d.prioridade || '').toUpperCase();
    if (s === 'URGENTE') return 'red';
    if (s === 'ALTA')    return 'amber';
    if (s === 'MEDIA')   return 'yellow';
    return 'green';
  }

  private labelDebito(d: any): string {
    const map: Record<string, string> = {
      URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa'
    };
    return map[(d.prioridade || '').toUpperCase()] || d.prioridade || '—';
  }

  private epoch(value: any): number {
    if (!value) return 0;
    const d = new Date(value);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  formatDate(value: any): string {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }

  num(v: any): number { const n = Number(v); return isFinite(n) ? n : 0; }

  brl(v: number): string {
    if (Math.abs(v) >= 1_000_000) {
      return 'R$ ' + (v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M';
    }
    if (Math.abs(v) >= 1_000) {
      return 'R$ ' + (v / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + 'k';
    }
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  brlFull(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  saudacao(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  dataHoje(): string {
    const d = new Date();
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    const rest = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1) + ', ' + rest;
  }

  // ── LOs ──────────────────────────────────────────────────────────────────
  losDoAno(): any[] {
    return this.linhasOrcamentarias.filter(lo => Number(lo?.ano) === this.anoAtual);
  }

  private orcamentoLo(lo: any): number {
    const aj = this.ajustes.filter((a: any) => a.budgetLineId === lo.id);
    const delta = aj.reduce((s: number, a: any) => {
      const tipo = String(a?.tipo || '').toUpperCase();
      const valor = this.num(a?.valor);
      return s + (tipo === 'APORTE' ? valor : -valor);
    }, 0);
    return this.num(lo.valorTotal) + delta;
  }

  orcamentoTotal(): number {
    return this.losDoAno().reduce((acc, lo) => acc + this.orcamentoLo(lo), 0);
  }

  comprometidoTotal(): number {
    const ids = new Set(this.losDoAno().map((lo: any) => lo.id));
    return this.alocacoes
      .filter((a: any) => ids.has(a.linhaOrcamentariaId))
      .reduce((acc: number, a: any) => acc + this.custoAnualAlocacao(a), 0);
  }

  saldoTotal(): number { return this.orcamentoTotal() - this.comprometidoTotal(); }
  realizadoTotal(): number {
    const ids = new Set(this.losDoAno().map((lo: any) => lo.id));
    return this.alocacoes
      .filter((a: any) => ids.has(a.linhaOrcamentariaId))
      .reduce((acc: number, a: any) => {
        let total = 0;
        for (let mi = 0; mi < 12; mi++) {
          if (!this.isPago(a?.id, mi)) continue;
          total += this.custoMesAlocacao(a, mi);
        }
        return acc + total;
      }, 0);
  }

  pctComprometido(): number {
    const orc = this.orcamentoTotal();
    return orc > 0 ? Math.min(100, (this.comprometidoTotal() / orc) * 100) : 0;
  }

  utilizacaoLos(): Array<{ lo: any; orcamento: number; comprometido: number; saldo: number; pct: number; qtd: number }> {
    return this.losDoAno().map(lo => {
      const orcamento = this.orcamentoLo(lo);
      const comprometido = this.alocacoes
        .filter((a: any) => a.linhaOrcamentariaId === lo.id)
        .reduce((acc: number, a: any) => acc + this.custoAnualAlocacao(a), 0);
      const saldo = orcamento - comprometido;
      const pct = orcamento > 0 ? Math.min(100, (comprometido / orcamento) * 100) : 0;
      const qtd = this.alocacoes.filter((a: any) => a.linhaOrcamentariaId === lo.id).length;
      return { lo, orcamento, comprometido, saldo, pct, qtd };
    }).sort((a, b) => b.pct - a.pct);
  }

  // ── Tipo LO breakdown ────────────────────────────────────────────────────
  private comprometidoPorTipo(tipo: 'folha' | 'terceiro'): number {
    const ids = new Set(this.losDoAno().map((lo: any) => lo.id));
    return this.alocacoes
      .filter((a: any) => {
        if (!ids.has(a.linhaOrcamentariaId)) return false;
        const p = this.pessoas.find((x: any) =>
          (x?.nome || '').trim().toLowerCase() === (a.nomePessoa || '').trim().toLowerCase()
        );
        const tv = (p?.tipoVinculo || '').toUpperCase();
        if (tipo === 'terceiro') return tv === 'TERCEIRO' || tv === 'PRESTADOR';
        return tv !== 'TERCEIRO' && tv !== 'PRESTADOR';
      })
      .reduce((acc: number, a: any) => acc + this.custoAnualAlocacao(a), 0);
  }

  comprometidoFolha(): number { return this.comprometidoPorTipo('folha'); }
  comprometidoTerceiros(): number { return this.comprometidoPorTipo('terceiro'); }

  private getPercentual(allocationId: string): number {
    try {
      const raw = localStorage.getItem(`planner_lo_alloc_${allocationId}`);
      if (!raw) return 100;
      const parsed = JSON.parse(raw);
      return Math.max(0, Math.min(100, Number(parsed?.percentual ?? 100)));
    } catch {
      return 100;
    }
  }

  private getHorasMes(monthIndex: number): number {
    const found = this.horasMes.find((h: any) => Number(h?.mes) === monthIndex + 1);
    const horas = Number(found?.horas ?? 160);
    return horas > 0 ? horas : 160;
  }

  private categoriaDaAlocacao(a: any): 'FOLHA' | 'TERCEIRO' {
    const pessoa = this.pessoas.find((p: any) =>
      (p?.nome || '').trim().toLowerCase() === (a?.nomePessoa || '').trim().toLowerCase()
    );
    const tv = String(pessoa?.tipoVinculo || a?.tipoVinculo || '').toUpperCase();
    return tv === 'TERCEIRO' || tv === 'PRESTADOR' ? 'TERCEIRO' : 'FOLHA';
  }

  private horasEfetivas(monthIndex: number, categoria: 'FOLHA' | 'TERCEIRO'): number {
    return categoria === 'FOLHA' ? 160 : this.getHorasMes(monthIndex);
  }

  private debitaLoDaAlocacao(a: any): boolean {
    if (a?.debitaLo != null) return !!a.debitaLo;
    const pessoa = this.pessoas.find((p: any) =>
      (p?.nome || '').trim().toLowerCase() === (a?.nomePessoa || '').trim().toLowerCase()
    );
    const perfilId = a?.perfilId || pessoa?.perfilId;
    if (!perfilId) return true;
    const perfil = this.perfis.find((x: any) => x.id === perfilId);
    return perfil ? !!perfil.debitaLo : true;
  }

  private valorHoraDaAlocacao(a: any): number {
    if (!this.debitaLoDaAlocacao(a)) return 0;
    const pessoa = this.pessoas.find((p: any) =>
      (p?.nome || '').trim().toLowerCase() === (a?.nomePessoa || '').trim().toLowerCase()
    );
    if (pessoa?.valorHora != null) return this.num(pessoa.valorHora);
    return this.num(a?.valorHora);
  }

  private custoAnualAlocacao(a: any): number {
    let total = 0;
    for (let mi = 0; mi < 12; mi++) total += this.custoMesAlocacao(a, mi);
    return total;
  }

  private isPago(allocationId: string, month: number): boolean {
    return this.allocationPayments.some((p: any) =>
      String(p?.allocationId || '') === String(allocationId || '') &&
      Number(p?.month) === month &&
      !!p?.paid
    );
  }

  private monthlyState(allocationId: string, month: number): any | null {
    return this.allocationMonthlyState.find((s: any) =>
      String(s?.allocationId || '') === String(allocationId || '') && Number(s?.month) === month
    ) || null;
  }

  private custoMesAlocacao(a: any, month: number): number {
    const st = this.monthlyState(a?.id, month);
    if (st?.canceled === true) return 0;
    if (st?.manualValue != null && st?.manualValue !== '') return this.num(st.manualValue);
    const vh = this.valorHoraDaAlocacao(a);
    if (!vh) return 0;
    const basePct = this.getPercentual(a?.id);
    const pct = st?.manualPercent != null && st?.manualPercent !== '' ? this.num(st.manualPercent) : basePct;
    const categoria = this.categoriaDaAlocacao(a);
    return vh * this.horasEfetivas(month, categoria) * (pct / 100);
  }

  // ── Pessoas ───────────────────────────────────────────────────────────────
  pessoasAlocadas(): number {
    const ids = new Set(this.losDoAno().map((lo: any) => lo.id));
    return new Set(
      this.alocacoes.filter((a: any) => ids.has(a.linhaOrcamentariaId)).map((a: any) => a.nomePessoa)
    ).size;
  }

  // ── Riscos ────────────────────────────────────────────────────────────────
  riscosAbertos(): any[] {
    return this.riscos.filter(r => {
      const s = (r.status || '').toUpperCase();
      return s !== 'RESOLVIDO' && s !== 'FECHADO' && s !== 'CONCLUIDO';
    });
  }

  riscosExibidos(): any[] { return this.riscosAbertos().slice(0, 6); }

  // ── Filtro de monitoramento por usuário ───────────────────────────────────
  private _filtraMonitoramento(items: any[]): any[] {
    if (this.mostrarTodos) return items;
    const user = (this.nomeUsuario || '').trim().toLowerCase();
    if (!user) return items;
    return items.filter(item => {
      const resp = (item.responsavel || '').trim().toLowerCase();
      return !resp || resp === user;
    });
  }

  riscosAbertosFilt():     any[] { return this._filtraMonitoramento(this.riscosAbertos()); }
  incidentesAbertosFilt(): any[] { return this._filtraMonitoramento(this.incidentesAbertos()); }
  debitosAbertosFilt():    any[] { return this._filtraMonitoramento(this.debitosAbertos()); }

  totalMonitoramentoFilt(): number {
    return this.riscosAbertosFilt().length + this.incidentesAbertosFilt().length + this.debitosAbertosFilt().length;
  }

  // ── Indicadores ───────────────────────────────────────────────────────────
  indicadoresAtivos(): any[] {
    return this.indicadores.filter(i => (i.status || '').toUpperCase() === 'ATIVO');
  }

  indicadoresNaMeta(): number {
    return this.indicadoresAtivos().filter(ind => {
      const ciclos = (ind.ciclos ?? []) as any[];
      if (!ciclos.length || ind.meta == null) return false;
      const val = Number(ciclos[ciclos.length - 1].valor ?? 0);
      return ind.polaridade === 'MAIOR_MELHOR' ? val >= ind.meta : val <= ind.meta;
    }).length;
  }

  totalAcoesAbertasIndicadores(): number {
    return this.indicadoresAtivos().reduce((acc, ind) => {
      return acc + ((ind.acoes ?? []) as any[]).filter((a: any) => a.status === 'ABERTA').length;
    }, 0);
  }

  indMiniList(): any[] {
    // up to 6 active indicators, ordered by those NOT meeting their goal first
    return this.indicadoresAtivos()
      .sort((a, b) => {
        const aMeta = this.indAtingeMeta(a) ? 1 : 0;
        const bMeta = this.indAtingeMeta(b) ? 1 : 0;
        return aMeta - bMeta;
      })
      .slice(0, 6);
  }

  indAtingeMeta(ind: any): boolean {
    const ciclos = (ind.ciclos ?? []) as any[];
    if (!ciclos.length || ind.meta == null) return false;
    const val = Number(ciclos[ciclos.length - 1].valor ?? 0);
    return ind.polaridade === 'MAIOR_MELHOR' ? val >= ind.meta : val <= ind.meta;
  }

  indValorAtual(ind: any): number | null {
    const ciclos = (ind.ciclos ?? []) as any[];
    if (!ciclos.length) return null;
    const v = ciclos[ciclos.length - 1].valor;
    return v != null ? Number(v) : null;
  }

  indPct(ind: any): number {
    const val = this.indValorAtual(ind);
    if (val == null || !ind.meta) return 0;
    if (ind.polaridade === 'MAIOR_MELHOR') return Math.min(100, Math.round((val / ind.meta) * 100));
    if (val <= ind.meta) return 100;
    return Math.max(0, Math.round((ind.meta / val) * 100));
  }

  indSparkline(ind: any): string {
    const ciclos = (ind.ciclos ?? []) as any[];
    if (ciclos.length < 2) return '';
    const vals = ciclos.map((c: any) => Number(c.valor ?? 0));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const W = 60, H = 22;
    return vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  indSparkColor(ind: any): string {
    return this.indAtingeMeta(ind) ? '#22c55e' : '#f59e0b';
  }

  indFormatVal(v: any, unidade: string): string {
    if (v == null) return '—';
    const num = Number(v);
    if (isNaN(num)) return '—';
    const s = num.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    return unidade ? `${s} ${unidade}` : s;
  }

  corRisco(r: any): string {
    const s = (r.status || '').toUpperCase();
    if (s === 'CRITICO' || s === 'ALTO') return 'red';
    if (s === 'MEDIO' || s === 'EM_ANDAMENTO') return 'amber';
    if (s === 'BAIXO') return 'green';
    return 'gray';
  }

  labelRisco(r: any): string {
    const s = (r.status || '').toUpperCase();
    const map: Record<string, string> = {
      CRITICO: 'Crítico', ALTO: 'Alto', MEDIO: 'Médio',
      BAIXO: 'Baixo', EM_ANDAMENTO: 'Em andamento', ABERTO: 'Aberto'
    };
    return map[s] || r.status || '—';
  }

  // ── Projetos ──────────────────────────────────────────────────────────────
  mostrarTodos = false;
  toggleMostrarTodos() { this.mostrarTodos = !this.mostrarTodos; }

  private _projetosMeus(lista: any[]): any[] {
    const me = String(this.usernameAtual || this.nomeUsuario || '').trim().toLowerCase();
    return lista.filter(r => {
      const owner = String(r?.donoProjeto || '').trim().toLowerCase();
      return !owner || (!!me && owner === me);
    });
  }

  projetosAtivos(): any[] {
    const ativos = this.resumo.filter(r => (r.status || '').toUpperCase() !== 'CONCLUIDO');
    return this.mostrarTodos ? ativos : this._projetosMeus(ativos);
  }

  projetosConcluidos(): number {
    const concl = this.resumo.filter(r => (r.status || '').toUpperCase() === 'CONCLUIDO');
    return (this.mostrarTodos ? concl : this._projetosMeus(concl)).length;
  }

  projetosExibidos(): any[] { return this.projetosAtivos().slice(0, 5); }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      EM_ANDAMENTO: 'Em andamento', ANDAMENTO: 'Em andamento',
      CONCLUIDO: 'Concluído', ATRASADO: 'Atrasado',
      PAUSADO: 'Pausado', PLANEJADO: 'Planejado', CRITICO: 'Crítico'
    };
    return map[(status || '').toUpperCase()] || status || '—';
  }

  statusColor(status: string): string {
    const s = (status || '').toUpperCase();
    if (s === 'CONCLUIDO') return 'green';
    if (s === 'EM_ANDAMENTO' || s === 'ANDAMENTO') return 'blue';
    if (s === 'ATRASADO' || s === 'CRITICO') return 'red';
    if (s === 'PAUSADO') return 'amber';
    return 'gray';
  }

  // ── Próximos eventos (aniversários + ausências iniciando) ────────────────

  private readonly ABSENCE_COLORS: Record<string, string> = {
    FERIAS: '#1d63da', AUSENCIA: '#7c3aed', LICENCA: '#16a34a', OUTRO: '#64748b',
  };
  private readonly ABSENCE_LABELS: Record<string, string> = {
    FERIAS: 'Férias', AUSENCIA: 'Ausência', LICENCA: 'Licença', OUTRO: 'Outro',
  };
  private readonly ABSENCE_ICONS: Record<string, string> = {
    FERIAS: '🏖️', AUSENCIA: '📋', LICENCA: '🩺', OUTRO: '📌',
  };

  proximosEventos(): Array<{
    tipo: 'aniversario' | 'ausencia';
    diasAte: number;
    pessoa: any;
    ausencia?: any;
    dataLabel: string;
    tipoLabel: string;
    icon: string;
    cor: string;
  }> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const JANELA_ANIV = 30;
    const JANELA_AUS  = 14;

    const eventos: ReturnType<typeof this.proximosEventos> = [];

    // ── Aniversários ──────────────────────────────────────────────────────────
    for (const p of this.pessoas) {
      const dn = (p.dataNascimento || '');
      if (!dn) continue;
      const parts = dn.split('-');
      if (parts.length < 3) continue;
      const [, mm, dd] = parts;

      for (const ano of [hoje.getFullYear(), hoje.getFullYear() + 1]) {
        const aniv = new Date(ano, Number(mm) - 1, Number(dd));
        aniv.setHours(0, 0, 0, 0);
        const diff = Math.round((aniv.getTime() - hoje.getTime()) / 86_400_000);
        if (diff >= 0 && diff <= JANELA_ANIV) {
          eventos.push({
            tipo: 'aniversario',
            diasAte: diff,
            pessoa: p,
            dataLabel: aniv.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }),
            tipoLabel: 'Aniversário',
            icon: '🎂',
            cor: '#f59e0b',
          });
          break;
        }
      }
    }

    // ── Ausências / férias que iniciam nos próximos N dias ───────────────────
    for (const a of this.ausencias) {
      const stored = (a.inicio || '').slice(0, 10); // 'YYYY-MM-DD'
      if (!stored) continue;

      let inicio: Date;
      if (a.recorrente) {
        const [, mm, dd] = stored.split('-');
        inicio = new Date(hoje.getFullYear(), Number(mm) - 1, Number(dd));
        inicio.setHours(0, 0, 0, 0);
        // If already passed this year, use next year
        if (inicio < hoje) {
          inicio = new Date(hoje.getFullYear() + 1, Number(mm) - 1, Number(dd));
        }
      } else {
        const [y, m, d] = stored.split('-').map(Number);
        inicio = new Date(y, m - 1, d);
        inicio.setHours(0, 0, 0, 0);
      }

      const diff = Math.round((inicio.getTime() - hoje.getTime()) / 86_400_000);
      if (diff >= 0 && diff <= JANELA_AUS) {
        const tipoKey = (a.tipo || '').toUpperCase();
        const pessoa = this.pessoas.find(p => p.id === a.pessoaId) ?? { nome: a.pessoaNome || '' };
        eventos.push({
          tipo: 'ausencia',
          diasAte: diff,
          pessoa,
          ausencia: a,
          dataLabel: inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }),
          tipoLabel: this.ABSENCE_LABELS[tipoKey] ?? a.tipo ?? 'Ausência',
          icon: this.ABSENCE_ICONS[tipoKey] ?? '📅',
          cor: this.ABSENCE_COLORS[tipoKey] ?? '#64748b',
        });
      }
    }

    return eventos.sort((a, b) => a.diasAte - b.diasAte);
  }

  labelDias(dias: number): string {
    if (dias === 0) return 'Hoje!';
    if (dias === 1) return 'Amanhã';
    return `Em ${dias} dias`;
  }

  fimAusencia(a: any): string {
    const fim = (a?.fim || '').slice(0, 10);
    if (!fim) return '';
    const [y, m, d] = fim.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  // ── Atividades sem responsável ────────────────────────────────────────────
  atividadesSemResponsavel(): any[] {
    return this.atividades.filter((a: any) => {
      const resp = (a.responsavel || '').trim();
      const status = (a.status || '').toUpperCase();
      return !resp && status !== 'CONCLUIDO';
    });
  }

  fmtActivityDate(value: any): string {
    if (!value) return '—';
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  statusAtivColor(status: string): string {
    const s = (status || '').toUpperCase();
    if (s === 'ATRASADO' || s === 'BLOQUEADO') return 'red';
    if (s === 'EM_ANDAMENTO') return 'blue';
    if (s === 'CONCLUIDO') return 'green';
    return 'gray';
  }

  // ── Atalhos ───────────────────────────────────────────────────────────────
  atalhos = [
    { secao: 'projetos',       label: 'Projetos',       desc: 'Criar e acompanhar projetos',    color: 'blue',   icon: 'M4 5h16v14H4zm2 2v10h12V7zm2 2h8v2H8zm0 4h5v2H8z' },
    { secao: 'alocacoes_lo',   label: 'Alocações',      desc: 'Alocar pessoas nas LOs',          color: 'teal',   icon: 'M3 18h4V6H3zm7 0h4V3h-4zm7 0h4V10h-4z' },
    { secao: 'orcamento',      label: 'LOs',            desc: 'Linhas orçamentárias',            color: 'amber',  icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
    { secao: 'relatorios',     label: 'Relatórios',     desc: 'Visão analítica e exportações',   color: 'purple', icon: 'M4 19h16v2H4zM6 10h2v7H6zm5-4h2v11h-2zm5 2h2v9h-2z' },
    { secao: 'riscos',         label: 'Riscos',         desc: 'Monitorar apontamentos',          color: 'red',    icon: 'M12 3 2 21h20zm1 6v5h-2V9zm0 7v2h-2v-2z' },
    { secao: 'pessoas',        label: 'Pessoas',        desc: 'Cadastrar e gerenciar pessoas',   color: 'indigo', icon: 'M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z' },
    { secao: 'prestadores',    label: 'Prestadores',    desc: 'Consultorias e terceiros',        color: 'sky',    icon: 'M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z' },
    { secao: 'horas_mes',      label: 'Horas/Mês',      desc: 'Horas úteis por mês',            color: 'gray',   icon: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z' },
  ];
}
