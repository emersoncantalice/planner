import { Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  templateUrl: './person-activity-panel.component.html',
  styleUrl: './person-activity-panel.component.scss'
})
export class PersonActivityPanelComponent {
  @Input() pessoas: any[] = [];
  @Input() riscos: any[] = [];
  @Input() incidentes: any[] = [];
  @Input() debitos: any[] = [];
  @Input() indicadores: any[] = [];
  @Input() atividades: any[] = [];   // ProjectActivity[] from GET /api/activities

  searchTerm = '';
  sortKey: 'nome' | 'total' = 'total';
  sortDir: 'asc' | 'desc' = 'desc';

  workload(): WorkloadEntry[] {
    const byKey = new Map<string, WorkloadEntry>();

    const ensure = (nomeRaw: any): WorkloadEntry | null => {
      const nome = String(nomeRaw ?? '').trim();
      if (!nome) return null;
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

    // Base: pessoas ativas
    for (const p of this.pessoas.filter(p => p.ativo !== false)) {
      ensure(p?.nome);
    }

    // Apontamentos
    for (const r of this.riscos) {
      if ((r?.status || '').toUpperCase() === 'CONCLUIDO') continue;
      const row = ensure(r?.responsavel);
      if (!row) continue;
      row.riscos.push(String(r?.titulo ?? 'Apontamento'));
    }

    // Incidentes
    for (const i of this.incidentes) {
      if ((i?.status || '').toUpperCase() === 'RESOLVIDO') continue;
      const row = ensure(i?.responsavel);
      if (!row) continue;
      row.incidentes.push(String(i?.titulo ?? 'Incidente'));
    }

    // Débitos técnicos
    for (const d of this.debitos) {
      if ((d?.status || '').toUpperCase() === 'RESOLVIDO') continue;
      const row = ensure(d?.responsavel);
      if (!row) continue;
      row.debitos.push(String(d?.titulo ?? 'Débito técnico'));
    }

    // Indicadores + ações
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

    // Atividades do cronograma
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
      // Concluídas não contam na carga, apenas exibimos no detalhamento.
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

  /** Bar width as a percentage, capped at 100 */
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
}
