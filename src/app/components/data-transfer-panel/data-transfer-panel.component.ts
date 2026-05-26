import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlannerApiService } from '../../core/planner-api.service';
import { ToastService } from '../../core/toast.service';
import { lastValueFrom } from 'rxjs';

interface BackupData {
  _version: string;
  _exportedAt: string;
  cadastros: {
    perfis: any[];
    pessoas: any[];
    consultorias: any[];
    pontosFocais: any[];
    linhasOrcamentarias: any[];
    alocacoes: any[];
    horasMes: any[];
    businessEpics: any[];
  };
  localStorageConfig: Record<string, string>;
}

@Component({
  selector: 'app-data-transfer-panel',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './data-transfer-panel.component.html',
  styleUrl: './data-transfer-panel.component.scss',
})
export class DataTransferPanelComponent {
  @Input() token = '';
  @Input() perfis: any[] = [];
  @Input() pessoas: any[] = [];
  @Input() consultorias: any[] = [];
  @Input() pontosFocais: any[] = [];
  @Input() linhasOrcamentarias: any[] = [];
  @Input() alocacoes: any[] = [];
  @Input() horasMes: any[] = [];
  @Input() businessEpics: any[] = [];

  /** Emitido quando a importação termina — o pai deve recarregar todos os dados */
  @Output() imported = new EventEmitter<void>();

  private api   = inject(PlannerApiService);
  private toast = inject(ToastService);

  importando    = false;
  importProgress = '';
  importErros: string[] = [];

  // ── Exportar ───────────────────────────────────────────────────────────────

  exportar() {
    // Coleta todas as chaves planner_lo_* do localStorage (configs de alocação)
    const localStorageConfig: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (key.startsWith('planner_lo_')) {
        localStorageConfig[key] = localStorage.getItem(key)!;
      }
    }

    const data: BackupData = {
      _version: '1.0',
      _exportedAt: new Date().toISOString(),
      cadastros: {
        perfis: this.perfis,
        pessoas: this.pessoas,
        consultorias: this.consultorias,
        pontosFocais: this.pontosFocais,
        linhasOrcamentarias: this.linhasOrcamentarias,
        alocacoes: this.alocacoes,
        horasMes: this.horasMes,
        businessEpics: this.businessEpics,
      },
      localStorageConfig,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.show('Backup exportado com sucesso.', 'success');
  }

  // ── Importar ───────────────────────────────────────────────────────────────

  abrirImport() {
    const input    = document.createElement('input');
    input.type     = 'file';
    input.accept   = '.json,application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) this.processarImport(file);
    };
    input.click();
  }

  private async processarImport(file: File) {
    this.importando = true;
    this.importErros = [];
    this.importProgress = 'Lendo arquivo…';

    try {
      const text = await file.text();
      const data: BackupData = JSON.parse(text);

      if (!data._version || !data.cadastros) {
        throw new Error('Arquivo inválido: formato não reconhecido.');
      }

      await this.importarDados(data);
      this.toast.show(
        `Importação concluída.${this.importErros.length ? ` ${this.importErros.length} itens ignorados (já existentes ou inválidos).` : ''}`,
        this.importErros.length ? 'info' : 'success',
        6000
      );
      this.imported.emit();
    } catch (err: any) {
      this.toast.show(`Erro na importação: ${err?.message ?? 'Falha desconhecida.'}`, 'error', 8000);
    } finally {
      this.importando    = false;
      this.importProgress = '';
    }
  }

  private async importarDados(data: BackupData) {
    const { perfis = [], pessoas = [], consultorias = [], pontosFocais = [],
            linhasOrcamentarias = [], alocacoes = [], horasMes = [] } = data.cadastros;
    const config = data.localStorageConfig ?? {};

    const perfilIdMap: Record<string, string> = {};
    const loIdMap:     Record<string, string> = {};
    const allocIdMap:  Record<string, string> = {};

    // 1. Perfis
    this.importProgress = `Importando perfis (0 / ${perfis.length})…`;
    for (let i = 0; i < perfis.length; i++) {
      const p = perfis[i];
      this.importProgress = `Importando perfis (${i + 1} / ${perfis.length})…`;
      try {
        const created = await lastValueFrom(
          this.api.createProfile(this.token, {
            nomePerfil: p.nomePerfil ?? p.nome ?? '',
            valorHora:  Number(p.valorHora ?? 0),
            debitaLo:   p.debitaLo ?? true,
          })
        );
        if (p.id && created?.id) perfilIdMap[p.id] = created.id;
      } catch { this.importErros.push(`Perfil "${p.nomePerfil}": ignorado`); }
    }

    // 2. Consultorias
    this.importProgress = `Importando consultorias (0 / ${consultorias.length})…`;
    for (let i = 0; i < consultorias.length; i++) {
      const c = consultorias[i];
      this.importProgress = `Importando consultorias (${i + 1} / ${consultorias.length})…`;
      try {
        await lastValueFrom(
          this.api.createConsultancy(this.token, {
            nome:      c.nome ?? '',
            descricao: c.descricao ?? '',
            telefone:  c.telefone ?? '',
            email:     c.email ?? '',
          })
        );
      } catch { this.importErros.push(`Consultoria "${c.nome}": ignorada`); }
    }

    // 3. Pontos Focais
    this.importProgress = `Importando pontos focais (0 / ${pontosFocais.length})…`;
    for (let i = 0; i < pontosFocais.length; i++) {
      const fp = pontosFocais[i];
      this.importProgress = `Importando pontos focais (${i + 1} / ${pontosFocais.length})…`;
      try {
        await lastValueFrom(
          this.api.createFocalPoint(this.token, {
            area:            fp.area ?? '',
            responsavelPor:  fp.responsavelPor ?? '',
            email:           fp.email ?? '',
            telefone:        fp.telefone ?? '',
          })
        );
      } catch { this.importErros.push(`Ponto focal "${fp.area}": ignorado`); }
    }

    // 4. Pessoas
    this.importProgress = `Importando pessoas (0 / ${pessoas.length})…`;
    for (let i = 0; i < pessoas.length; i++) {
      const p = pessoas[i];
      this.importProgress = `Importando pessoas (${i + 1} / ${pessoas.length})…`;
      try {
        const newPerfilId = p.perfilId ? (perfilIdMap[p.perfilId] ?? p.perfilId) : '';
        await lastValueFrom(
          this.api.createPerson(this.token, {
            nome:           p.nome ?? '',
            perfilId:       newPerfilId,
            tipoVinculo:    p.tipoVinculo ?? 'FOLHA',
            consultoria:    p.consultoria ?? '',
            valorHora:      p.valorHora ?? null,
            valorMensal:    p.valorMensal ?? null,
            dataNascimento: p.dataNascimento ?? null,
            contato:        p.contato ?? null,
          })
        );
      } catch { this.importErros.push(`Pessoa "${p.nome}": ignorada`); }
    }

    // 5. Linhas Orçamentárias
    this.importProgress = `Importando LOs (0 / ${linhasOrcamentarias.length})…`;
    for (let i = 0; i < linhasOrcamentarias.length; i++) {
      const lo = linhasOrcamentarias[i];
      this.importProgress = `Importando LOs (${i + 1} / ${linhasOrcamentarias.length})…`;
      try {
        const created = await lastValueFrom(
          this.api.createBudgetLine(this.token, {
            codigo:      lo.codigo ?? '',
            nome:        lo.nome ?? '',
            ano:         Number(lo.ano ?? new Date().getFullYear()),
            tipo:        lo.tipo ?? '',
            centroCusto: lo.centroCusto ?? '',
            valorTotal:  lo.valorTotal ?? null,
          })
        );
        if (lo.id && created?.id) loIdMap[lo.id] = created.id;
      } catch { this.importErros.push(`LO "${lo.codigo}": ignorada`); }
    }

    // 6. Alocações
    this.importProgress = `Importando alocações (0 / ${alocacoes.length})…`;
    for (let i = 0; i < alocacoes.length; i++) {
      const a = alocacoes[i];
      this.importProgress = `Importando alocações (${i + 1} / ${alocacoes.length})…`;
      try {
        const newLoId    = a.linhaOrcamentariaId ? (loIdMap[a.linhaOrcamentariaId] ?? a.linhaOrcamentariaId) : '';
        const newPerfilId = a.perfilId            ? (perfilIdMap[a.perfilId]          ?? a.perfilId)          : '';
        const created = await lastValueFrom(
          this.api.createBudgetAllocation(this.token, {
            linhaOrcamentariaId: newLoId,
            nomePessoa:          a.nomePessoa ?? '',
            perfilId:            newPerfilId,
            horasPlanejadas:     Number(a.horasPlanejadas ?? 160),
          })
        );
        if (a.id && created?.id) allocIdMap[a.id] = created.id;
      } catch { this.importErros.push(`Alocação "${a.nomePessoa}": ignorada`); }
    }

    // 7. Horas mensais
    this.importProgress = 'Importando horas mensais…';
    for (const h of horasMes) {
      try {
        await lastValueFrom(this.api.upsertMonthlyHours(this.token, Number(h.mes), Number(h.horas)));
      } catch { /* ignore */ }
    }

    // 8. Restaurar configs do localStorage com IDs remapeados
    this.importProgress = 'Restaurando configurações de alocação…';
    for (const [oldKey, value] of Object.entries(config)) {
      let newKey = oldKey;
      for (const [oldId, newId] of Object.entries(allocIdMap)) {
        if (newKey.includes(oldId)) {
          newKey = newKey.replace(oldId, newId);
        }
      }
      localStorage.setItem(newKey, value);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  get totalCadastros(): number {
    return this.perfis.length + this.pessoas.length + this.consultorias.length +
           this.pontosFocais.length + this.linhasOrcamentarias.length +
           this.alocacoes.length + this.horasMes.length + this.businessEpics.length;
  }
}
