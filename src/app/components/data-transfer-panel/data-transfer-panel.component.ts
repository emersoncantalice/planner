import { ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
    pagamentos: any[];
    estadosMensais: any[];
    horasMes: any[];
    ausencias: any[];
    feriadosConfig: any;
    businessEpics: any[];
    allocationPercent: any[];
    loRealizado: any[];
  };
  localStorageConfig: Record<string, string>;
}

@Component({
  selector: 'app-data-transfer-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  @Input() pagamentos: any[] = [];
  @Input() estadosMensais: any[] = [];
  @Input() horasMes: any[] = [];
  @Input() businessEpics: any[] = [];

  /** Emitido quando a importa??o termina ? o pai deve recarregar todos os dados */
  @Output() imported = new EventEmitter<void>();

  private api   = inject(PlannerApiService);
  private toast = inject(ToastService);
  private cdr   = inject(ChangeDetectorRef);

  importando    = false;
  zerando       = false;
  importProgress = '';
  importErros: string[] = [];
  ignoredPeople: any[] = [];
  ignoredAllocations: any[] = [];
  importSelection = {
    perfis: true,
    consultorias: true,
    pontosFocais: true,
    pessoas: true,
    linhasOrcamentarias: true,
    alocacoes: true,
    pagamentos: true,
    estadosMensais: true,
    horasMes: true,
    ausencias: true,
    feriados: true,
    allocationPercent: true,
    loRealizado: true,
    localStorageConfig: true,
  };
  private lastPerfilIdMap: Record<string, string> = {};
  private lastLoIdMap: Record<string, string> = {};
  private clearConfirmUntil = 0;

  // Exportar

  exportando = false;
  exportAusenciasCount = 0;
  exportFeriadosCount = 0;

  async exportar() {
    if (!this.token || this.exportando) return;
    this.exportando = true;
    try {
      // Busca tudo direto do backend para garantir dados frescos
      const [perfis, pessoas, consultorias, pontosFocais,
             linhasOrcamentarias, alocacoes, pagamentos,
             estadosMensais, horasMes, ausencias, feriadosConfig, businessEpics,
             allocationPercent, loRealizado] = await Promise.all([
        lastValueFrom(this.api.listProfiles(this.token)),
        lastValueFrom(this.api.listPeople(this.token)),
        lastValueFrom(this.api.listConsultancies(this.token)),
        lastValueFrom(this.api.listFocalPoints(this.token)),
        lastValueFrom(this.api.listBudgetLines(this.token)),
        lastValueFrom(this.api.listBudgetAllocations(this.token)),
        lastValueFrom(this.api.listAllocationPayments(this.token)),
        lastValueFrom(this.api.listAllocationMonthlyState(this.token)),
        lastValueFrom(this.api.listMonthlyHours(this.token)),
        lastValueFrom(this.api.listAbsences(this.token)),
        lastValueFrom(this.api.getFeriadosConfig(this.token)),
        lastValueFrom(this.api.listBusinessEpics(this.token)),
        lastValueFrom(this.api.listAllocationPercent(this.token)),
        lastValueFrom(this.api.listLoRealizado(this.token)),
      ]);

      // Coleta chaves planner_lo_* do localStorage (configs locais de aloca??o)
      const localStorageConfig: Record<string, string> = {};
      const allocationIds = new Set((alocacoes || []).map((a: any) => String(a?.id ?? '')).filter(Boolean));
      const loIds = new Set((linhasOrcamentarias || []).map((lo: any) => String(lo?.id ?? '')).filter(Boolean));
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (this.shouldExportPlannerLoKey(key, allocationIds, loIds)) {
          localStorageConfig[key] = localStorage.getItem(key)!;
        }
      }

      const data: BackupData = {
        _version: '1.0',
        _exportedAt: new Date().toISOString(),
        cadastros: {
          perfis, pessoas, consultorias, pontosFocais,
          linhasOrcamentarias, alocacoes, pagamentos,
          estadosMensais, horasMes, ausencias, feriadosConfig, businessEpics,
          allocationPercent, loRealizado,
        },
        localStorageConfig,
      };
      this.exportAusenciasCount = Array.isArray(ausencias) ? ausencias.length : 0;
      this.exportFeriadosCount = Array.isArray(feriadosConfig?.feriados) ? feriadosConfig.feriados.length : 0;

      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast.show('Backup exportado com sucesso.', 'success');
    } catch (err: any) {
      this.toast.show(`Erro ao exportar: ${err?.message ?? 'Falha desconhecida.'}`, 'error', 6000);
    } finally {
      this.exportando = false;
    }
  }

  // Importar

  private shouldExportPlannerLoKey(
    key: string,
    allocationIds: Set<string>,
    loIds: Set<string>
  ): boolean {
    if (!key.startsWith('planner_lo_')) return false;

    if (key === 'planner_lo_cols_global' || key.startsWith('planner_lo_cols_')) return true;

    const allocMatch = key.match(/^planner_lo_(alloc|pago|cancelado|valor_manual|alloc_monthly)_([^_]+)(?:_|$)/);
    if (allocMatch) return allocationIds.has(allocMatch[2]);

    const loMatch = key.match(/^planner_lo_(realizado|custom_order)_([^_]+)(?:_|$)/);
    if (loMatch) return loIds.has(loMatch[2]);

    const pendingPctMatch = key.match(/^planner_lo_pending_pct_.+_([^_]+)$/);
    if (pendingPctMatch) return loIds.has(pendingPctMatch[1]);

    return false;
  }

  private async flushUi() {
    this.cdr.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

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
    this.ignoredPeople = [];
    this.ignoredAllocations = [];
    this.importProgress = 'Lendo arquivo...';
    await this.flushUi();

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
            linhasOrcamentarias = [], alocacoes = [], pagamentos = [],
            estadosMensais = [], horasMes = [], ausencias = [], feriadosConfig = null,
            allocationPercent = [], loRealizado = [] } = data.cadastros;
    const config = data.localStorageConfig ?? {};
    const sel = this.importSelection;
    if (!sel.perfis) perfis.length = 0;
    if (!sel.consultorias) consultorias.length = 0;
    if (!sel.pontosFocais) pontosFocais.length = 0;
    if (!sel.pessoas) pessoas.length = 0;
    if (!sel.linhasOrcamentarias) linhasOrcamentarias.length = 0;
    if (!sel.alocacoes) alocacoes.length = 0;
    if (!sel.pagamentos) pagamentos.length = 0;
    if (!sel.estadosMensais) estadosMensais.length = 0;
    if (!sel.horasMes) horasMes.length = 0;
    if (!sel.ausencias) ausencias.length = 0;
    if (!sel.allocationPercent) allocationPercent.length = 0;
    if (!sel.loRealizado) loRealizado.length = 0;

    const perfilIdMap: Record<string, string> = {};
    const loIdMap:     Record<string, string> = {};
    const allocIdMap:  Record<string, string> = {};
    this.lastPerfilIdMap = perfilIdMap;
    this.lastLoIdMap = loIdMap;

    // Snapshot atual do backend para evitar criar duplicados idênticos
    const [
      existingProfiles,
      existingConsultancies,
      existingFocalPoints,
      existingPeople,
      existingBudgetLines,
      existingAllocations,
    ] = await Promise.all([
      lastValueFrom(this.api.listProfiles(this.token)),
      lastValueFrom(this.api.listConsultancies(this.token)),
      lastValueFrom(this.api.listFocalPoints(this.token)),
      lastValueFrom(this.api.listPeople(this.token)),
      lastValueFrom(this.api.listBudgetLines(this.token)),
      lastValueFrom(this.api.listBudgetAllocations(this.token)),
    ]);

    // 1. Perfis
    this.importProgress = `Importando perfis (0 / ${perfis.length})...`;
    await this.flushUi();
    for (let i = 0; i < perfis.length; i++) {
      const p = perfis[i];
      this.importProgress = `Importando perfis (${i + 1} / ${perfis.length})...`;
      const existing = (existingProfiles || []).find((x: any) =>
        this.norm(x?.nomePerfil) === this.norm(p?.nomePerfil ?? p?.nome) &&
        Number(x?.valorHora ?? 0) === Number(p?.valorHora ?? 0) &&
        Boolean(x?.debitaLo ?? true) === Boolean(p?.debitaLo ?? true)
      );
      if (existing?.id) {
        if (p.id) perfilIdMap[p.id] = existing.id;
        continue;
      }
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
    this.importProgress = `Importando consultorias (0 / ${consultorias.length})...`;
    await this.flushUi();
    for (let i = 0; i < consultorias.length; i++) {
      const c = consultorias[i];
      this.importProgress = `Importando consultorias (${i + 1} / ${consultorias.length})...`;
      const exists = (existingConsultancies || []).some((x: any) =>
        this.norm(x?.nome) === this.norm(c?.nome) &&
        this.norm(x?.descricao) === this.norm(c?.descricao) &&
        this.norm(x?.email) === this.norm(c?.email) &&
        this.norm(x?.telefone) === this.norm(c?.telefone)
      );
      if (exists) continue;
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
    this.importProgress = `Importando pontos focais (0 / ${pontosFocais.length})...`;
    await this.flushUi();
    for (let i = 0; i < pontosFocais.length; i++) {
      const fp = pontosFocais[i];
      this.importProgress = `Importando pontos focais (${i + 1} / ${pontosFocais.length})...`;
      const exists = (existingFocalPoints || []).some((x: any) =>
        this.norm(x?.area) === this.norm(fp?.area) &&
        this.norm(x?.responsavelPor) === this.norm(fp?.responsavelPor) &&
        this.norm(x?.email) === this.norm(fp?.email) &&
        this.norm(x?.telefone) === this.norm(fp?.telefone)
      );
      if (exists) continue;
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
    this.importProgress = `Importando pessoas (0 / ${pessoas.length})...`;
    await this.flushUi();
    for (let i = 0; i < pessoas.length; i++) {
      const p = pessoas[i];
      const newPerfilId = p.perfilId ? (perfilIdMap[p.perfilId] ?? p.perfilId) : '';
      const tipoVinculo = this.normalizarTipoVinculo(p.tipoVinculo);
      this.importProgress = `Importando pessoas (${i + 1} / ${pessoas.length})...`;
      const exists = (existingPeople || []).some((x: any) =>
        this.norm(x?.nome) === this.norm(p?.nome) &&
        this.norm(x?.perfilId) === this.norm(newPerfilId) &&
        this.normalizarTipoVinculo(x?.tipoVinculo) === tipoVinculo &&
        this.norm(x?.consultoria) === this.norm(p?.consultoria)
      );
      if (exists) continue;
      try {
        await lastValueFrom(
          this.api.createPerson(this.token, {
            nome:            p.nome ?? '',
            perfilId:        newPerfilId,
            tipoVinculo,
            consultoria:     p.consultoria ?? '',
            valorHora:       p.valorHora ?? null,
            valorMensal:     p.valorMensal ?? null,
            vagaUrl:         p.vagaUrl ?? null,
            vagaAlias:       p.vagaAlias ?? null,
            dataNascimento:  p.dataNascimento ?? null,
            contato:         p.contato ?? null,
            ativo:           p.ativo ?? true,
            vagasAnteriores: Array.isArray(p.vagasAnteriores) ? p.vagasAnteriores : [],
          })
        );
      } catch (err: any) {
        const msg = err?.error?.error ?? err?.message ?? 'erro desconhecido';
        this.importErros.push(`Pessoa "${p.nome}": ignorada (${msg})`);
        this.ignoredPeople.push({
          nome: p.nome ?? '',
          perfilId: newPerfilId,
          tipoVinculo,
          consultoria: p.consultoria ?? '',
          valorHora: p.valorHora ?? null,
          valorMensal: p.valorMensal ?? null,
          vagaUrl: p.vagaUrl ?? null,
          vagaAlias: p.vagaAlias ?? null,
          dataNascimento: p.dataNascimento ?? null,
          contato: p.contato ?? null,
          ativo: p.ativo ?? true,
          vagasAnteriores: Array.isArray(p.vagasAnteriores) ? p.vagasAnteriores : [],
          erro: msg,
        });
      }
    }

    // 5. Linhas Orcamentarias
    this.importProgress = `Importando LOs (0 / ${linhasOrcamentarias.length})...`;
    await this.flushUi();
    const existingLoBySignature = new Map<string, any>();
    for (const elo of (existingBudgetLines || [])) {
      existingLoBySignature.set(this.loSignature(elo), elo);
    }
    for (let i = 0; i < linhasOrcamentarias.length; i++) {
      const lo = linhasOrcamentarias[i];
      this.importProgress = `Importando LOs (${i + 1} / ${linhasOrcamentarias.length})...`;
      const existing = (existingBudgetLines || []).find((x: any) =>
        this.norm(x?.codigo) === this.norm(lo?.codigo) &&
        this.norm(x?.nome) === this.norm(lo?.nome) &&
        Number(x?.ano ?? 0) === Number(lo?.ano ?? 0) &&
        this.norm(x?.tipo) === this.norm(lo?.tipo) &&
        this.norm(x?.centroCusto) === this.norm(lo?.centroCusto)
      );
      if (existing?.id) {
        if (lo.id) loIdMap[lo.id] = existing.id;
        continue;
      }
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

    // Reforca mapeamento das LOs ja existentes/duplicadas para permitir importar alocacoes
    for (const lo of linhasOrcamentarias) {
      if (!lo?.id || loIdMap[lo.id]) continue;
      const found = existingLoBySignature.get(this.loSignature(lo));
      if (found?.id) loIdMap[lo.id] = found.id;
    }

    // 6. Alocacoes
    this.importProgress = `Importando alocacoes (0 / ${alocacoes.length})...`;
    await this.flushUi();
    const validLoIds = new Set<string>([
      ...Object.values(loIdMap).map((id) => String(id)),
      ...(existingBudgetLines || []).map((lo: any) => String(lo?.id ?? '')).filter(Boolean),
    ]);
    for (let i = 0; i < alocacoes.length; i++) {
      const a = alocacoes[i];
      let newLoId    = a.linhaOrcamentariaId ? (loIdMap[a.linhaOrcamentariaId] ?? a.linhaOrcamentariaId) : '';
      const newPerfilId = a.perfilId            ? (perfilIdMap[a.perfilId]          ?? a.perfilId)          : '';
      this.importProgress = `Importando alocacoes (${i + 1} / ${alocacoes.length})...`;
      if (a?.linhaOrcamentariaId && !validLoIds.has(String(newLoId))) {
        const srcLo = linhasOrcamentarias.find((lo: any) => String(lo?.id ?? '') === String(a.linhaOrcamentariaId));
        if (srcLo) {
          const matched = existingLoBySignature.get(this.loSignature(srcLo));
          if (matched?.id) newLoId = matched.id;
        }
      }
      if (!newLoId || !validLoIds.has(String(newLoId))) {
        this.importErros.push(`Alocacao "${a.nomePessoa || '(sem nome)'}": ignorada (LO inexistente)`);
        continue;
      }
      const existing = (existingAllocations || []).find((x: any) =>
        this.norm(x?.linhaOrcamentariaId) === this.norm(newLoId) &&
        this.norm(x?.nomePessoa) === this.norm(a?.nomePessoa) &&
        this.norm(x?.perfilId) === this.norm(newPerfilId) &&
        Number(x?.horasPlanejadas ?? 0) === Number(a?.horasPlanejadas ?? 160) &&
        Boolean(x?.draft) === Boolean(a?.draft) &&
        Number(x?.mesInicio ?? -1) === Number(a?.mesInicio ?? -1)
      );
      if (existing?.id) {
        if (a.id) allocIdMap[a.id] = existing.id;
        continue;
      }
      try {
        const created = await lastValueFrom(
          this.api.createBudgetAllocation(this.token, {
            linhaOrcamentariaId: newLoId,
            nomePessoa:          a.nomePessoa ?? '',
            perfilId:            newPerfilId,
            horasPlanejadas:     Number(a.horasPlanejadas ?? 160),
            draft:               !!a.draft,
            mesInicio:           a.mesInicio != null ? Number(a.mesInicio) : undefined,
          })
        );
        if (a.id && created?.id) allocIdMap[a.id] = created.id;
      } catch (err: any) {
        const msg = err?.error?.error ?? err?.message ?? 'erro desconhecido';
        this.importErros.push(`AlocaÃƒÂ§ÃƒÂ£o "${a.nomePessoa || '(sem nome)'}": ignorada (${msg})`);
        this.ignoredAllocations.push({
          linhaOrcamentariaId: newLoId,
          nomePessoa: a.nomePessoa ?? '',
          perfilId: newPerfilId,
          horasPlanejadas: Number(a.horasPlanejadas ?? 160),
          draft: !!a.draft,
          mesInicio: a.mesInicio != null ? Number(a.mesInicio) : null,
          erro: msg,
        });
      }
    }

    // 7. Pagamentos de aloca??o
    this.importProgress = `Importando pagamentos (0 / ${pagamentos.length})...`;
    await this.flushUi();
    for (let i = 0; i < pagamentos.length; i++) {
      const p = pagamentos[i];
      this.importProgress = `Importando pagamentos (${i + 1} / ${pagamentos.length})...`;
      const newAllocId = p.allocationId ? (allocIdMap[p.allocationId] ?? p.allocationId) : null;
      if (!newAllocId) continue;
      try {
        await lastValueFrom(
          this.api.upsertAllocationPayment(this.token, newAllocId, Number(p.month ?? 0), Boolean(p.paid))
        );
      } catch { /* ignorar pagamentos ?rf?os */ }
    }

    // 8. Estados mensais de aloca??o (cancelamentos, overrides)
    this.importProgress = `Importando estados mensais (0 / ${estadosMensais.length})...`;
    await this.flushUi();
    for (let i = 0; i < estadosMensais.length; i++) {
      const e = estadosMensais[i];
      this.importProgress = `Importando estados mensais (${i + 1} / ${estadosMensais.length})...`;
      const newAllocId = e.allocationId ? (allocIdMap[e.allocationId] ?? e.allocationId) : null;
      if (!newAllocId) continue;
      try {
        await lastValueFrom(
          this.api.upsertAllocationMonthlyState(this.token, newAllocId, Number(e.month ?? 0), {
            canceled:      e.canceled      ?? null,
            manualValue:   e.manualValue   ?? null,
            manualPercent: e.manualPercent ?? null,
          })
        );
      } catch { /* ignorar estados ?rf?os */ }
    }

    // 9. Horas mensais
    this.importProgress = 'Importando horas mensais...';
    await this.flushUi();
    for (const h of horasMes) {
      try {
        await lastValueFrom(this.api.upsertMonthlyHours(this.token, Number(h.mes), Number(h.horas)));
      } catch { /* ignore */ }
    }

    // 10. Restaurar configs do localStorage com IDs remapeados (allocId e loId)
    this.importProgress = 'Restaurando configura??es de aloca??o...';
    await this.flushUi();
    for (const [oldKey, value] of Object.entries(sel.localStorageConfig ? config : {})) {
      let newKey = oldKey;
      // remap allocation IDs (planner_lo_alloc_*, planner_lo_valor_manual_*, etc.)
      for (const [oldId, newId] of Object.entries(allocIdMap)) {
        if (newKey.includes(oldId)) newKey = newKey.replace(oldId, newId);
      }
      // remap LO IDs (planner_lo_realizado_${loId}_${month})
      for (const [oldId, newId] of Object.entries(loIdMap)) {
        if (newKey.includes(oldId)) newKey = newKey.replace(oldId, newId);
      }
      localStorage.setItem(newKey, value);
    }

    // 11. Ausencias / ferias (remapeando pessoaId quando possivel)
    this.importProgress = `Importando ausências (${ausencias.length})...`;
    await this.flushUi();
    if (ausencias.length > 0) {
      const peopleAfterImport = await lastValueFrom(this.api.listPeople(this.token));
      for (const a of ausencias) {
        const person = (peopleAfterImport || []).find((p: any) => this.norm(p?.nome) === this.norm(a?.pessoaNome));
        const pessoaId = person?.id ?? a?.pessoaId ?? '';
        if (!pessoaId) continue;
        try {
          await lastValueFrom(this.api.createAbsence(this.token, {
            pessoaId,
            pessoaNome: a?.pessoaNome ?? person?.nome ?? '',
            tipo: a?.tipo ?? 'AUSENCIA',
            inicio: a?.inicio ?? '',
            fim: a?.fim ?? '',
            recorrente: !!a?.recorrente,
            observacao: a?.observacao ?? '',
          }));
        } catch {
          this.importErros.push(`Ausência "${a?.pessoaNome || a?.pessoaId || 'sem pessoa'}": ignorada`);
        }
      }
    }

    // 12. Feriados config
    this.importProgress = 'Importando feriados...';
    await this.flushUi();
    if (sel.feriados && feriadosConfig) {
      try {
        await lastValueFrom(this.api.saveFeriadosConfig(this.token, {
          feriados: Array.isArray(feriadosConfig?.feriados) ? feriadosConfig.feriados : [],
          federalOverrides: feriadosConfig?.federalOverrides && typeof feriadosConfig.federalOverrides === 'object'
            ? feriadosConfig.federalOverrides
            : {},
          diasUteis: Array.isArray(feriadosConfig?.diasUteis) ? feriadosConfig.diasUteis : [false, true, true, true, true, true, false],
        }));
      } catch {
        this.importErros.push('Feriados: não foi possível importar');
      }
    }

    // 13. Percentuais de alocacao (allocationPercent) ? remapear allocationId
    this.importProgress = `Importando percentuais de alocação (0 / ${allocationPercent.length})...`;
    await this.flushUi();
    for (let i = 0; i < allocationPercent.length; i++) {
      const ap = allocationPercent[i];
      this.importProgress = `Importando percentuais de alocação (${i + 1} / ${allocationPercent.length})...`;
      const newAllocId = ap.allocationId ? (allocIdMap[ap.allocationId] ?? ap.allocationId) : null;
      if (!newAllocId) continue;
      try {
        await lastValueFrom(
          this.api.upsertAllocationPercent(this.token, newAllocId, Number(ap.percentual ?? 100))
        );
      } catch { /* ignorar entradas ?rf?s */ }
    }

    // 14. Valores realizados mensais (loRealizado) ? remapear loId
    this.importProgress = `Importando valores realizados (0 / ${loRealizado.length})...`;
    await this.flushUi();
    for (let i = 0; i < loRealizado.length; i++) {
      const lr = loRealizado[i];
      this.importProgress = `Importando valores realizados (${i + 1} / ${loRealizado.length})...`;
      const newLoId = lr.loId ? (loIdMap[lr.loId] ?? lr.loId) : null;
      if (!newLoId) continue;
      try {
        await lastValueFrom(
          this.api.upsertLoRealizado(this.token, newLoId, Number(lr.month ?? 0), Number(lr.valor ?? 0))
        );
      } catch { /* ignorar entradas ?rf?s */ }
    }
  }

  private normalizarTipoVinculo(raw: any): 'BV' | 'TERCEIRO' {
    const tipo = String(raw ?? '').trim().toUpperCase();
    if (tipo === 'TERCEIRO') return 'TERCEIRO';
    if (tipo === 'BV' || tipo === 'FOLHA') return 'BV';
    return 'BV';
  }

  private norm(v: any): string {
    return String(v ?? '').trim().toLowerCase();
  }

  private loSignature(lo: any): string {
    return [
      this.norm(lo?.codigo),
      this.norm(lo?.nome),
      String(Number(lo?.ano ?? 0)),
      this.norm(lo?.tipo),
      this.norm(lo?.centroCusto),
    ].join('|');
  }

  async retryIgnoredPerson(item: any) {
    try {
      await lastValueFrom(this.api.createPerson(this.token, {
        nome: item.nome ?? '',
        perfilId: item.perfilId ?? '',
        tipoVinculo: this.normalizarTipoVinculo(item.tipoVinculo),
        consultoria: item.consultoria ?? '',
        valorHora: item.valorHora ?? null,
        valorMensal: item.valorMensal ?? null,
        vagaUrl: item.vagaUrl ?? null,
        vagaAlias: item.vagaAlias ?? null,
        dataNascimento: item.dataNascimento ?? null,
        contato: item.contato ?? null,
        ativo: item.ativo ?? true,
        vagasAnteriores: Array.isArray(item.vagasAnteriores) ? item.vagasAnteriores : [],
      }));
      this.ignoredPeople = this.ignoredPeople.filter((x) => x !== item);
      this.toast.show(`Pessoa "${item.nome}" importada com sucesso.`, 'success');
    } catch (err: any) {
      item.erro = err?.error?.error ?? err?.message ?? 'erro desconhecido';
      this.toast.show(`Falha ao importar pessoa "${item.nome}".`, 'error');
    }
  }

  async retryIgnoredAllocation(item: any) {
    try {
      await lastValueFrom(this.api.createBudgetAllocation(this.token, {
        linhaOrcamentariaId: item.linhaOrcamentariaId ?? '',
        nomePessoa: item.nomePessoa ?? '',
        perfilId: item.perfilId ?? '',
        horasPlanejadas: Number(item.horasPlanejadas ?? 160),
        draft: !!item.draft,
        mesInicio: item.mesInicio != null ? Number(item.mesInicio) : undefined,
      }));
      this.ignoredAllocations = this.ignoredAllocations.filter((x) => x !== item);
      this.toast.show(`Alocação de "${item.nomePessoa || 'Pessoa planejada'}" importada com sucesso.`, 'success');
    } catch (err: any) {
      item.erro = err?.error?.error ?? err?.message ?? 'erro desconhecido';
      this.toast.show('Falha ao importar alocação.', 'error');
    }
  }

  // Helpers

  get totalCadastros(): number {
    return this.perfis.length + this.pessoas.length + this.consultorias.length +
           this.pontosFocais.length + this.linhasOrcamentarias.length +
           this.alocacoes.length + this.horasMes.length + this.businessEpics.length;
  }

  async zerarDadosNegocio() {
    if (!this.token || this.zerando) return;
    const now = Date.now();
    if (now > this.clearConfirmUntil) {
      this.clearConfirmUntil = now + 7000;
      this.toast.show(
        'Clique novamente em "Zerar dados de negócio" em até 7 segundos para confirmar. Usuários e sessão serão preservados.',
        'info',
        7000
      );
      return;
    }
    this.clearConfirmUntil = 0;

    this.zerando = true;
    this.importProgress = 'Zerando dados...';
    this.importErros = [];

    try {
      await this.deleteProjects();
      await this.deleteIndicators();
      await this.deleteTechnicalDebts();
      await this.deleteIncidents();
      await this.deleteRisks();
      await this.deleteAllocations();
      await this.deleteBudgetLineAdjustments();
      await this.deleteBudgetLines();
      await this.deleteBusinessEpics();
      await this.deleteFocalPoints();
      await this.deletePeople();
      await this.deleteConsultancies();
      await this.deleteProfiles();
      await this.resetMonthlyHours();

      this.clearNonEssentialLocalStorage();

      this.toast.show('Dados de negócio zerados com sucesso. Usuários e sessão serão preservados.', 'success', 7000);
      this.imported.emit();
    } catch (err: any) {
      this.toast.show(`Erro ao zerar dados: ${err?.message ?? 'Falha desconhecida.'}`, 'error', 8000);
    } finally {
      this.zerando = false;
      this.importProgress = '';
    }
  }

  private async deleteProjects() {
    this.importProgress = 'Removendo projetos...';
    const rows = await lastValueFrom(this.api.listProjects(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteProject(this.token, r.id)); }
      catch { this.importErros.push(`Projeto "${r?.nome || r?.id}" não removido`); }
    }
  }

  private async deleteIndicators() {
    this.importProgress = 'Removendo indicadores...';
    const rows = await lastValueFrom(this.api.listIndicators(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteIndicator(this.token, r.id)); }
      catch { this.importErros.push(`Indicador "${r?.nome || r?.titulo || r?.id}" não removido`); }
    }
  }

  private async deleteTechnicalDebts() {
    this.importProgress = 'Removendo débitos técnicos...';
    const rows = await lastValueFrom(this.api.listTechnicalDebts(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteTechnicalDebt(this.token, r.id)); }
      catch { this.importErros.push(`Débito técnico "${r?.titulo || r?.id}" não removido`); }
    }
  }

  private async deleteIncidents() {
    this.importProgress = 'Removendo incidentes...';
    const rows = await lastValueFrom(this.api.listIncidents(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteIncident(this.token, r.id)); }
      catch { this.importErros.push(`Incidente "${r?.titulo || r?.id}" não removido`); }
    }
  }

  private async deleteRisks() {
    this.importProgress = 'Removendo riscos...';
    const rows = await lastValueFrom(this.api.listRisks(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteRisk(this.token, r.id)); }
      catch { this.importErros.push(`Risco "${r?.titulo || r?.id}" não removido`); }
    }
  }

  private async deleteAllocations() {
    this.importProgress = 'Removendo alocações...';
    const rows = await lastValueFrom(this.api.listBudgetAllocations(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteBudgetAllocation(this.token, r.id)); }
      catch { this.importErros.push(`Alocação "${r?.nomePessoa || r?.id}" não removida`); }
    }
  }

  private async deleteBudgetLineAdjustments() {
    this.importProgress = 'Removendo ajustes de LO...';
    const rows = await lastValueFrom(this.api.listBudgetLineAdjustments(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteBudgetLineAdjustment(this.token, r.id)); }
      catch { this.importErros.push(`Ajuste de LO "${r?.descricao || r?.id}" não removido`); }
    }
  }

  private async deleteBudgetLines() {
    this.importProgress = 'Removendo linhas or?ament?rias...';
    const rows = await lastValueFrom(this.api.listBudgetLines(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteBudgetLine(this.token, r.id)); }
      catch { this.importErros.push(`LO "${r?.codigo || r?.id}" não removida`); }
    }
  }

  private async deleteBusinessEpics() {
    this.importProgress = 'Removendo Business Epics...';
    const rows = await lastValueFrom(this.api.listBusinessEpics(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteBusinessEpic(this.token, r.id)); }
      catch { this.importErros.push(`Business Epic "${r?.nome || r?.id}" não removido`); }
    }
  }

  private async deleteFocalPoints() {
    this.importProgress = 'Removendo pontos focais...';
    const rows = await lastValueFrom(this.api.listFocalPoints(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteFocalPoint(this.token, r.id)); }
      catch { this.importErros.push(`Ponto focal "${r?.area || r?.id}" não removido`); }
    }
  }

  private async deletePeople() {
    this.importProgress = 'Removendo pessoas...';
    const rows = await lastValueFrom(this.api.listPeople(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deletePerson(this.token, r.id)); }
      catch { this.importErros.push(`Pessoa "${r?.nome || r?.id}" não removida`); }
    }
  }

  private async deleteConsultancies() {
    this.importProgress = 'Removendo consultorias...';
    const rows = await lastValueFrom(this.api.listConsultancies(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteConsultancy(this.token, r.id)); }
      catch { this.importErros.push(`Consultoria "${r?.nome || r?.id}" não removida`); }
    }
  }

  private async deleteProfiles() {
    this.importProgress = 'Removendo perfis...';
    const rows = await lastValueFrom(this.api.listProfiles(this.token));
    for (const r of rows || []) {
      try { await lastValueFrom(this.api.deleteProfile(this.token, r.id)); }
      catch { this.importErros.push(`Perfil "${r?.nomePerfil || r?.id}" não removido`); }
    }
  }

  private async resetMonthlyHours() {
    this.importProgress = 'Reiniciando horas mensais...';
    const rows = await lastValueFrom(this.api.listMonthlyHours(this.token));
    for (const r of rows || []) {
      const mes = Number(r?.mes);
      if (!Number.isFinite(mes)) continue;
      try { await lastValueFrom(this.api.upsertMonthlyHours(this.token, mes, 160)); }
      catch { this.importErros.push(`Horas do mês ${mes} não reiniciadas`); }
    }
  }

  private clearNonEssentialLocalStorage() {
    const keep = new Set([
      'planner_token',
      'planner_user',
      'planner_role',
      'planner_sidebar_collapsed',
      'planner_profile_image',
    ]);
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('planner_') && !keep.has(key)) toDelete.push(key);
    }
    for (const k of toDelete) localStorage.removeItem(k);
  }
}
