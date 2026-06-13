import { Component, CUSTOM_ELEMENTS_SCHEMA, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

interface WorkloadEntry {
  nome: string;
  total: number;
  riscos: string[];
  incidentes: string[];
  debitos: string[];
  indicadores: string[];
  acoes: string[];
  atividades: string[];
  atividadesConcluidas: string[];
}

@Component({
  selector: 'app-person-activity-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './person-activity-panel.component.html',
  styleUrl: './person-activity-panel.component.scss'
})
export class PersonActivityPanelComponent {
  @Input() pessoas: any[] = [];
  @Input() fotos: Record<string, string> = {};
  @Input() linhasOrcamentarias: any[] = [];
  @Input() alocacoes: any[] = [];
  @Input() riscos: any[] = [];
  @Input() incidentes: any[] = [];
  @Input() debitos: any[] = [];
  @Input() indicadores: any[] = [];
  @Input() atividades: any[] = [];

  exportarAtividadesExcel() {
    const atividades = this.atividadesOrdenadas();
    if (!atividades.length) return;

    const rows = atividades.map((a: any) => {
      const inicio = this.formatDate(a?.inicioPlanejado);
      const fim = this.formatDate(a?.fimPlanejado);
      return {
        Projeto: String(a?.projetoNome ?? ''),
        Atividade: String(a?.titulo ?? ''),
        Status: this.statusLabel(a?.status),
        Responsavel: String(a?.responsavel ?? ''),
        Inicio: inicio,
        Fim: fim,
        'Duracao (dias)': this.duracaoDias(a?.inicioPlanejado, a?.fimPlanejado),
        Descricao: this.cleanDescricao(a?.descricao),
        'ID Projeto': String(a?.projetoId ?? ''),
        'ID Atividade': String(a?.id ?? '')
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 28 },
      { wch: 42 },
      { wch: 18 },
      { wch: 26 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 56 },
      { wch: 24 },
      { wch: 24 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Atividades');
    XLSX.writeFile(workbook, `atividades_${this.todayStamp()}.xlsx`);
  }

  private atividadesOrdenadas(): any[] {
    return [...(this.atividades ?? [])].sort((a: any, b: any) => {
      const projeto = String(a?.projetoNome ?? '').localeCompare(String(b?.projetoNome ?? ''), 'pt-BR', { sensitivity: 'base' });
      if (projeto !== 0) return projeto;
      const inicioA = String(a?.inicioPlanejado ?? '');
      const inicioB = String(b?.inicioPlanejado ?? '');
      if (inicioA !== inicioB) return inicioA.localeCompare(inicioB);
      return String(a?.titulo ?? '').localeCompare(String(b?.titulo ?? ''), 'pt-BR', { sensitivity: 'base' });
    });
  }

  private statusLabel(status: any): string {
    const key = String(status ?? '').toUpperCase();
    return ({
      PLANEJADO: 'Planejado',
      EM_ANDAMENTO: 'Em andamento',
      CONCLUIDO: 'Concluido',
      ATRASADO: 'Atrasado',
      BLOQUEADO: 'Bloqueado'
    } as Record<string, string>)[key] ?? String(status ?? '');
  }

  private formatDate(value: any): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('pt-BR') : '';
  }

  private duracaoDias(inicio: any, fim: any): number | '' {
    if (!inicio || !fim) return '';
    const start = new Date(inicio);
    const end = new Date(fim);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '';
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return days > 0 ? days : '';
  }

  private cleanDescricao(descricao: any): string {
    let text = String(descricao ?? '');
    text = text.replace(/##PRED:[a-zA-Z0-9\-,]+##/g, '');
    text = text.replace(/##PERFILID:[a-zA-Z0-9\-]+##/g, '');
    text = text.replace(/##DOW:[0-6,]+##/g, '');
    const etapasIdx = text.indexOf('##ETAPAS:');
    if (etapasIdx >= 0) text = text.slice(0, etapasIdx);
    return text.trim();
  }

  private todayStamp(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  fotoDe(nome: string): string {
    return this.fotos?.[this.normNome(nome || '')] || '';
  }

  iniciaisDe(nome: string): string {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    return ((partes[0][0] || '') + (partes.length > 1 ? (partes[partes.length - 1][0] || '') : '')).toUpperCase();
  }

  // O mapa de fotos é indexado por nome em minúsculas e com trim (sem remover acentos).
  private normNome(v: string): string {
    return String(v || '').trim().toLowerCase();
  }

  searchTerm = '';
  loSelecionadaId = '';
  sortKey: 'nome' | 'total' = 'total';
  sortDir: 'asc' | 'desc' = 'desc';

  selecionarLo(loId: string) {
    this.loSelecionadaId = String(loId || '');
    if (this.expandedNome && !this.pessoaElegivel(this.expandedNome)) {
      this.expandedNome = '';
    }
  }

  losDisponiveis(): any[] {
    const idsComCobranca = new Set(
      this.alocacoes
        .filter((a: any) => this.alocacaoDebitaLo(a))
        .map((a: any) => a?.linhaOrcamentariaId)
        .filter(Boolean)
    );
    return [...this.linhasOrcamentarias]
      .filter((lo: any) => idsComCobranca.has(lo?.id))
      .sort((a: any, b: any) => {
        const ano = Number(b?.ano || 0) - Number(a?.ano || 0);
        if (ano !== 0) return ano;
        return String(a?.codigo || a?.nome || '').localeCompare(String(b?.codigo || b?.nome || ''), 'pt-BR');
      });
  }

  loLabel(loId: string): string {
    const lo = this.linhasOrcamentarias.find((x: any) => x.id === loId);
    return lo?.codigo || lo?.nome || loId;
  }

  workload(): WorkloadEntry[] {
    const byKey = new Map<string, WorkloadEntry>();

    const ensure = (nomeRaw: any): WorkloadEntry | null => {
      const nome = String(nomeRaw ?? '').trim();
      if (!nome) return null;
      if (!this.pessoaElegivel(nome)) return null;
      const key = this.norm(nome);
      let found = byKey.get(key);
      if (!found) {
        found = {
          nome,
          total: 0,
          riscos: [],
          incidentes: [],
          debitos: [],
          indicadores: [],
          acoes: [],
          atividades: [],
          atividadesConcluidas: []
        };
        byKey.set(key, found);
      }
      return found;
    };

    
    for (const p of this.pessoas.filter(p => p.ativo !== false)) {
      ensure(p?.nome);
    }

    
    for (const r of this.riscos) {
      if ((r?.status || '').toUpperCase() === 'CONCLUIDO') continue;
      const row = ensure(r?.responsavel);
      if (!row) continue;
      row.riscos.push(String(r?.titulo ?? 'Apontamento'));
    }

    
    for (const i of this.incidentes) {
      if ((i?.status || '').toUpperCase() === 'RESOLVIDO') continue;
      const row = ensure(i?.responsavel);
      if (!row) continue;
      row.incidentes.push(String(i?.titulo ?? 'Incidente'));
    }

    
    for (const d of this.debitos) {
      if ((d?.status || '').toUpperCase() === 'RESOLVIDO') continue;
      const row = ensure(d?.responsavel);
      if (!row) continue;
      row.debitos.push(String(d?.titulo ?? 'Débito técnico'));
    }

    
    for (const ind of this.indicadores) {
      if ((ind?.status || '').toUpperCase() === 'ATIVO') {
        const row = ensure(ind?.responsavel);
        if (row) row.indicadores.push(String(ind?.titulo ?? 'Indicador'));
      }
      for (const a of (ind?.acoes ?? []) as any[]) {
        if ((a?.status || '').toUpperCase() === 'CONCLUIDA') continue;
        const row = ensure(a?.responsavel);
        if (!row) continue;
        row.acoes.push(`${String(ind?.titulo ?? 'Indicador')}: ${String(a?.descricao ?? 'Ação')}`);
      }
    }

    
    for (const a of this.atividades) {
      const row = ensure(a?.responsavel);
      if (!row) continue;
      const label = `[${String(a?.projetoNome ?? 'Projeto')}] ${String(a?.titulo ?? 'Atividade')}`;
      if ((a?.status || '').toUpperCase() === 'CONCLUIDO') {
        row.atividadesConcluidas.push(label);
      } else {
        row.atividades.push(label);
      }
    }

    const list = [...byKey.values()];
    for (const row of list) {
      
      row.total = row.riscos.length + row.incidentes.length + row.debitos.length + row.indicadores.length + row.acoes.length + row.atividades.length;
    }
    return list;
  }

  filtered(): WorkloadEntry[] {
    const q = this.searchTerm.trim().toLowerCase();
    const dir = this.sortDir === 'asc' ? 1 : -1;
    return this.workload()
      .filter(e => !q || e.nome.toLowerCase().includes(q))
      .sort((a, b) => {
        if (this.sortKey === 'total') return (a.total - b.total) * dir;
        return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }) * dir;
      });
  }

  toggleSort(key: 'nome' | 'total') {
    if (this.sortKey === key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortKey = key;
      this.sortDir = key === 'total' ? 'desc' : 'asc';
    }
  }

  sortIndicator(key: 'nome' | 'total') {
    if (this.sortKey !== key) return '';
    return this.sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  workloadClass(total: number): string {
    if (total > 5)  return 'wl-red';
    if (total >= 3) return 'wl-amber';
    if (total >= 1) return 'wl-teal';
    return 'wl-green';
  }

  workloadLabel(total: number): string {
    if (total > 5)  return 'Muito atarefado';
    if (total >= 3) return 'Atarefado';
    if (total >= 1) return 'Ocupado';
    return 'Disponível';
  }

  
  barPct(total: number): number {
    return Math.min(100, Math.round((total / 8) * 100));
  }

  expandedNome = '';
  toggleExpand(nome: string) {
    this.expandedNome = this.expandedNome === nome ? '' : nome;
  }

  private norm(v: string): string {
    return String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private alocacaoDebitaLo(a: any): boolean {
    return a?.debitaLo !== false;
  }

  private pessoaElegivel(nomePessoa: string): boolean {
    const nome = this.norm(nomePessoa);
    return this.alocacoes.some((a: any) => {
      if (!this.alocacaoDebitaLo(a)) return false;
      if (this.loSelecionadaId && a?.linhaOrcamentariaId !== this.loSelecionadaId) return false;
      return this.norm(a?.nomePessoa || '') === nome;
    });
  }
}
