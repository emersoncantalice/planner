import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { LoggerService } from './logger.service';

@Injectable({ providedIn: 'root' })
export class PlannerApiService {
  private readonly api = this.resolveApiBase();

  constructor(private http: HttpClient, private logger: LoggerService) {
    this.logger.info('PlannerApiService initialized', { apiBase: this.api });
  }

  private resolveApiBase(): string {
    const raw = ((window as any)?.__env?.API_URL || 'http://localhost:8080/api').trim();
    const normalized = raw.replace(/^['"]|['"]$/g, '');
    try {
      const pageProtocol = window?.location?.protocol;
      
      if (!/^https?:\/\//i.test(normalized) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(normalized)) {
        return `https://${normalized}`.replace(/\/+$/, '');
      }
      if (pageProtocol === 'https:' && normalized.startsWith('http://')) {
        return (`https://${normalized.slice('http://'.length)}`).replace(/\/+$/, '');
      }
    } catch {
      
    }
    return normalized.replace(/\/+$/, '');
  }

  headers(token: string) {
    return new HttpHeaders({ 'X-Auth-Token': token });
  }

  register(auth: { nome: string; username: string; password: string }) {
    const payload = {
      ...auth,
      nomeCompleto: auth.nome,
      fullName: auth.nome
    };
    return this.http.post<any>(`${this.api}/auth/register`, payload);
  }

  login(auth: { username: string; password: string }) {
    return this.http.post<any>(`${this.api}/auth/login`, auth);
  }

  logout(token: string) {
    return this.http.post<any>(`${this.api}/auth/logout`, {}, { headers: this.headers(token) });
  }

  listProfiles(token: string) {
    return this.http.get<any[]>(`${this.api}/profiles`, { headers: this.headers(token) });
  }

  createProfile(token: string, perfil: { nomePerfil: string; valorHora: number; debitaLo: boolean }) {
    return this.http.post<any>(`${this.api}/profiles`, perfil, { headers: this.headers(token) });
  }
  importProfilesCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/profiles/import-csv`, { csv }, { headers: this.headers(token) });
  }
  updateProfile(token: string, profileId: string, perfil: { nomePerfil: string; valorHora: number; debitaLo: boolean }) {
    return this.http.put<any>(`${this.api}/profiles/${profileId}`, perfil, { headers: this.headers(token) });
  }
  deleteProfile(token: string, profileId: string) {
    return this.http.delete<void>(`${this.api}/profiles/${profileId}`, { headers: this.headers(token) });
  }

  listBudgetLines(token: string) {
    return this.http.get<any[]>(`${this.api}/budget-lines`, { headers: this.headers(token) });
  }

  createBudgetLine(token: string, payload: { codigo: string; nome: string; ano: number; tipo: string; centroCusto: string; valorTotal: number | null }) {
    return this.http.post<any>(`${this.api}/budget-lines`, payload, { headers: this.headers(token) });
  }
  importBudgetLinesCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/budget-lines/import-csv`, { csv }, { headers: this.headers(token) });
  }
  updateBudgetLine(token: string, budgetLineId: string, payload: { codigo: string; nome: string; ano: number; tipo: string; centroCusto: string; valorTotal: number | null }) {
    return this.http.put<any>(`${this.api}/budget-lines/${budgetLineId}`, payload, { headers: this.headers(token) });
  }
  deleteBudgetLine(token: string, budgetLineId: string) {
    return this.http.delete<void>(`${this.api}/budget-lines/${budgetLineId}`, { headers: this.headers(token) });
  }

  listBudgetLineAdjustments(token: string) {
    return this.http.get<any[]>(`${this.api}/budget-line-adjustments`, { headers: this.headers(token) });
  }
  createBudgetLineAdjustment(token: string, payload: { budgetLineId: string; tipo: string; descricao: string; valor: number | null }) {
    return this.http.post<any>(`${this.api}/budget-line-adjustments`, payload, { headers: this.headers(token) });
  }
  updateBudgetLineAdjustment(token: string, adjustmentId: string, payload: { budgetLineId: string; tipo: string; descricao: string; valor: number | null }) {
    return this.http.put<any>(`${this.api}/budget-line-adjustments/${adjustmentId}`, payload, { headers: this.headers(token) });
  }
  deleteBudgetLineAdjustment(token: string, adjustmentId: string) {
    return this.http.delete<void>(`${this.api}/budget-line-adjustments/${adjustmentId}`, { headers: this.headers(token) });
  }

  listBusinessEpics(token: string) {
    return this.http.get<any[]>(`${this.api}/business-epics`, { headers: this.headers(token) });
  }

  createBusinessEpic(token: string, payload: { nome: string; aliasLink?: string; jiraUrl: string; inicio: string | null; fim: string | null }) {
    return this.http.post<any>(`${this.api}/business-epics`, payload, { headers: this.headers(token) });
  }
  importBusinessEpicsCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/business-epics/import-csv`, { csv }, { headers: this.headers(token) });
  }
  updateBusinessEpic(token: string, epicId: string, payload: { nome: string; aliasLink?: string; jiraUrl: string; inicio: string | null; fim: string | null }) {
    return this.http.put<any>(`${this.api}/business-epics/${epicId}`, payload, { headers: this.headers(token) });
  }
  deleteBusinessEpic(token: string, epicId: string) {
    return this.http.delete<void>(`${this.api}/business-epics/${epicId}`, { headers: this.headers(token) });
  }

  listBudgetAllocations(token: string) {
    return this.http.get<any[]>(`${this.api}/budget-allocations`, { headers: this.headers(token) });
  }

  createBudgetAllocation(
    token: string,
    payload: { linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number }
  ) {
    return this.http.post<any>(`${this.api}/budget-allocations`, payload, { headers: this.headers(token) });
  }
  updateBudgetAllocation(
    token: string,
    allocationId: string,
    payload: { linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number }
  ) {
    return this.http.put<any>(`${this.api}/budget-allocations/${allocationId}`, payload, { headers: this.headers(token) });
  }
  deleteBudgetAllocation(token: string, allocationId: string) {
    return this.http.delete<void>(`${this.api}/budget-allocations/${allocationId}`, { headers: this.headers(token) });
  }

  listPeople(token: string) {
    return this.http.get<any[]>(`${this.api}/people`, { headers: this.headers(token) });
  }
  createPerson(token: string, payload: { nome: string; perfilId: string; tipoVinculo: string; consultoria: string; valorHora: number | null; valorMensal: number | null; vagaUrl?: string | null; vagaAlias?: string | null; dataNascimento?: string | null; contato?: string | null; ativo?: boolean; vagasAnteriores?: { alias: string; url: string; inicio: string; fim: string }[] }) {
    return this.http.post<any>(`${this.api}/people`, payload, { headers: this.headers(token) });
  }
  updatePerson(token: string, personId: string, payload: { nome: string; perfilId: string; tipoVinculo: string; consultoria: string; valorHora: number | null; valorMensal: number | null; vagaUrl?: string | null; vagaAlias?: string | null; dataNascimento?: string | null; contato?: string | null; ativo?: boolean; vagasAnteriores?: { alias: string; url: string; inicio: string; fim: string }[] }) {
    return this.http.put<any>(`${this.api}/people/${personId}`, payload, { headers: this.headers(token) });
  }
  deletePerson(token: string, personId: string) {
    return this.http.delete<void>(`${this.api}/people/${personId}`, { headers: this.headers(token) });
  }
  importPeopleCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/people/import-csv`, { csv }, { headers: this.headers(token) });
  }

  listConsultancies(token: string) {
    return this.http.get<any[]>(`${this.api}/consultancies`, { headers: this.headers(token) });
  }
  createConsultancy(token: string, payload: { nome: string; descricao: string; telefone: string; email: string }) {
    return this.http.post<any>(`${this.api}/consultancies`, payload, { headers: this.headers(token) });
  }
  importConsultanciesCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/consultancies/import-csv`, { csv }, { headers: this.headers(token) });
  }
  updateConsultancy(token: string, consultancyId: string, payload: { nome: string; descricao: string; telefone: string; email: string }) {
    return this.http.put<any>(`${this.api}/consultancies/${consultancyId}`, payload, { headers: this.headers(token) });
  }
  deleteConsultancy(token: string, consultancyId: string) {
    return this.http.delete<void>(`${this.api}/consultancies/${consultancyId}`, { headers: this.headers(token) });
  }

  listFocalPoints(token: string) {
    return this.http.get<any[]>(`${this.api}/focal-points`, { headers: this.headers(token) });
  }
  createFocalPoint(token: string, payload: { area: string; responsavelPor: string; email: string; telefone: string }) {
    return this.http.post<any>(`${this.api}/focal-points`, payload, { headers: this.headers(token) });
  }
  importFocalPointsCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/focal-points/import-csv`, { csv }, { headers: this.headers(token) });
  }
  updateFocalPoint(token: string, focalPointId: string, payload: { area: string; responsavelPor: string; email: string; telefone: string }) {
    return this.http.put<any>(`${this.api}/focal-points/${focalPointId}`, payload, { headers: this.headers(token) });
  }
  deleteFocalPoint(token: string, focalPointId: string) {
    return this.http.delete<void>(`${this.api}/focal-points/${focalPointId}`, { headers: this.headers(token) });
  }

  listMonthlyHours(token: string) {
    return this.http.get<any[]>(`${this.api}/monthly-hours`, { headers: this.headers(token) });
  }
  upsertMonthlyHours(token: string, month: number, hours: number) {
    return this.http.put<any>(`${this.api}/monthly-hours/${month}`, { horas: hours }, { headers: this.headers(token) });
  }

  listAllocationPayments(token: string) {
    return this.http.get<any[]>(`${this.api}/allocation-payments`, { headers: this.headers(token) });
  }

  upsertAllocationPayment(token: string, allocationId: string, month: number, paid: boolean) {
    return this.http.put<any>(`${this.api}/allocation-payments/${allocationId}/${month}`, { paid }, { headers: this.headers(token) });
  }

  listLoPresence(token: string) {
    return this.http.get<any[]>(`${this.api}/lo-presence`, { headers: this.headers(token) });
  }

  upsertLoPresence(token: string, loId: string) {
    return this.http.put<any>(`${this.api}/lo-presence`, { loId }, { headers: this.headers(token) });
  }

  listAllocationMonthlyState(token: string) {
    return this.http.get<any[]>(`${this.api}/allocation-monthly-state`, { headers: this.headers(token) });
  }

  upsertAllocationMonthlyState(
    token: string,
    allocationId: string,
    month: number,
    payload: { canceled?: boolean | null; manualValue?: number | null; manualPercent?: number | null }
  ) {
    return this.http.put<any>(`${this.api}/allocation-monthly-state/${allocationId}/${month}`, payload, { headers: this.headers(token) });
  }

  listAllocationCursors(token: string, loId: string) {
    return this.http.get<any[]>(`${this.api}/allocation-cursors?loId=${encodeURIComponent(loId)}`, { headers: this.headers(token) });
  }

  upsertAllocationCursor(token: string, payload: { loId: string; x: number; y: number }) {
    return this.http.put<any>(`${this.api}/allocation-cursors`, payload, { headers: this.headers(token) });
  }

  listRisks(token: string) {
    return this.http.get<any[]>(`${this.api}/risks`, { headers: this.headers(token) });
  }

  createRisk(token: string, payload: { titulo: string; descricao: string; planoAcao: string; status: string; dataFim: string | null; criadoPor?: string; dono?: string }) {
    return this.http.post<any>(`${this.api}/risks`, payload, { headers: this.headers(token) });
  }
  importRisksCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/risks/import-csv`, { csv }, { headers: this.headers(token) });
  }
  updateRiskFull(token: string, riskId: string, payload: { titulo: string; descricao: string; planoAcao: string; status: string; dataFim: string | null }) {
    return this.http.put<any>(`${this.api}/risks/${riskId}`, payload, { headers: this.headers(token) });
  }
  postponeRisk(token: string, riskId: string, payload: { novaDataFim: string; motivo: string }) {
    return this.http.post<any>(`${this.api}/risks/${riskId}/postpone`, payload, { headers: this.headers(token) });
  }

  updateRisk(token: string, riskId: string, status: string) {
    return this.http.patch<any>(`${this.api}/risks/${riskId}`, { status }, { headers: this.headers(token) });
  }
  deleteRisk(token: string, riskId: string) {
    return this.http.delete<void>(`${this.api}/risks/${riskId}`, { headers: this.headers(token) });
  }

  // ── Incidents ────────────────────────────────────────────────────────────
  listIncidents(token: string) {
    return this.http.get<any[]>(`${this.api}/incidents`, { headers: this.headers(token) });
  }
  createIncident(token: string, payload: any) {
    return this.http.post<any>(`${this.api}/incidents`, payload, { headers: this.headers(token) });
  }
  importIncidentsCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/incidents/import-csv`, { csv }, { headers: this.headers(token) });
  }
  updateIncident(token: string, id: string, payload: any) {
    return this.http.put<any>(`${this.api}/incidents/${id}`, payload, { headers: this.headers(token) });
  }
  deleteIncident(token: string, id: string) {
    return this.http.delete<void>(`${this.api}/incidents/${id}`, { headers: this.headers(token) });
  }

  // ── Technical Debt ────────────────────────────────────────────────────────
  listTechnicalDebts(token: string) {
    return this.http.get<any[]>(`${this.api}/technical-debts`, { headers: this.headers(token) });
  }
  createTechnicalDebt(token: string, payload: any) {
    return this.http.post<any>(`${this.api}/technical-debts`, payload, { headers: this.headers(token) });
  }
  updateTechnicalDebt(token: string, id: string, payload: any) {
    return this.http.put<any>(`${this.api}/technical-debts/${id}`, payload, { headers: this.headers(token) });
  }
  deleteTechnicalDebt(token: string, id: string) {
    return this.http.delete<void>(`${this.api}/technical-debts/${id}`, { headers: this.headers(token) });
  }
  importTechnicalDebtsCsv(token: string, csv: string) {
    return this.http.post<{ criados: number; ignorados: number }>(`${this.api}/technical-debts/import-csv`, { csv }, { headers: this.headers(token) });
  }

  // ── Indicators ────────────────────────────────────────────────────────────
  listIndicators(token: string) {
    return this.http.get<any[]>(`${this.api}/indicators`, { headers: this.headers(token) });
  }
  createIndicator(token: string, payload: any) {
    return this.http.post<any>(`${this.api}/indicators`, payload, { headers: this.headers(token) });
  }
  updateIndicator(token: string, id: string, payload: any) {
    return this.http.put<any>(`${this.api}/indicators/${id}`, payload, { headers: this.headers(token) });
  }
  deleteIndicator(token: string, id: string) {
    return this.http.delete<void>(`${this.api}/indicators/${id}`, { headers: this.headers(token) });
  }
  addIndicatorCycle(token: string, id: string, payload: any) {
    return this.http.post<any>(`${this.api}/indicators/${id}/cycles`, payload, { headers: this.headers(token) });
  }
  updateIndicatorCycle(token: string, id: string, cycleId: string, payload: any) {
    return this.http.put<any>(`${this.api}/indicators/${id}/cycles/${cycleId}`, payload, { headers: this.headers(token) });
  }
  deleteIndicatorCycle(token: string, id: string, cycleId: string) {
    return this.http.delete<any>(`${this.api}/indicators/${id}/cycles/${cycleId}`, { headers: this.headers(token) });
  }
  addIndicatorAction(token: string, id: string, payload: any) {
    return this.http.post<any>(`${this.api}/indicators/${id}/actions`, payload, { headers: this.headers(token) });
  }
  updateIndicatorAction(token: string, id: string, actionId: string, payload: any) {
    return this.http.put<any>(`${this.api}/indicators/${id}/actions/${actionId}`, payload, { headers: this.headers(token) });
  }
  deleteIndicatorAction(token: string, id: string, actionId: string) {
    return this.http.delete<void>(`${this.api}/indicators/${id}/actions/${actionId}`, { headers: this.headers(token) });
  }

  // ── Activities (cross-project) ────────────────────────────────────────────
  listActivities(token: string) {
    return this.http.get<any[]>(`${this.api}/activities`, { headers: this.headers(token) });
  }

  listOverview(token: string) {
    return this.http.get<any[]>(`${this.api}/reports/overview`, { headers: this.headers(token) });
  }

  listProjects(token: string) {
    return this.http.get<any[]>(`${this.api}/projects`, { headers: this.headers(token) });
  }

  createProject(token: string, projeto: { nome: string; descricao: string }) {
    return this.http.post<any>(`${this.api}/projects`, projeto, { headers: this.headers(token) });
  }
  updateProject(token: string, projectId: string, projeto: { nome: string; descricao: string }) {
    return this.http.put<any>(`${this.api}/projects/${projectId}`, projeto, { headers: this.headers(token) });
  }
  deleteProject(token: string, projectId: string) {
    return this.http.delete<void>(`${this.api}/projects/${projectId}`, { headers: this.headers(token) });
  }

  getProject(token: string, projectId: string) {
    return this.http.get<any>(`${this.api}/projects/${projectId}`, { headers: this.headers(token) });
  }

  addStep(token: string, projectId: string, etapa: { titulo: string }) {
    return this.http.post<any>(`${this.api}/projects/${projectId}/steps`, etapa, { headers: this.headers(token) });
  }

  toggleStep(token: string, projectId: string, stepId: string, concluido: boolean) {
    return this.http.patch<any>(`${this.api}/projects/${projectId}/steps/${stepId}`, { concluido }, { headers: this.headers(token) });
  }

  addAllocation(token: string, projectId: string, payload: { nomePessoa: string; perfilId: string; horasPlanejadas: number }) {
    return this.http.post<any>(`${this.api}/projects/${projectId}/allocations`, payload, { headers: this.headers(token) });
  }

  addFinance(token: string, projectId: string, payload: { tipo: string; descricao: string; valor: number }) {
    return this.http.post<any>(`${this.api}/projects/${projectId}/finance/entries`, payload, { headers: this.headers(token) });
  }

  addScheduleItem(
    token: string,
    projectId: string,
    payload: { titulo: string; descricao: string; inicioPlanejado: string | null; fimPlanejado: string | null; permiteParalelo: boolean }
  ) {
    return this.http.post<any>(`${this.api}/projects/${projectId}/schedule/items`, payload, { headers: this.headers(token) });
  }

  updateScheduleItem(
    token: string,
    projectId: string,
    itemId: string,
    payload: { titulo?: string; descricao?: string; inicioPlanejado?: string | null; fimPlanejado?: string | null; permiteParalelo?: boolean; status?: string }
  ) {
    return this.http.patch<any>(`${this.api}/projects/${projectId}/schedule/items/${itemId}`, payload, { headers: this.headers(token) });
  }

  reorderSchedule(token: string, projectId: string, itemIdsOrdered: string[]) {
    return this.http.patch<any>(`${this.api}/projects/${projectId}/schedule/reorder`, { itemIdsOrdered }, { headers: this.headers(token) });
  }

  deleteScheduleItem(token: string, projectId: string, itemId: string) {
    return this.http.delete<void>(`${this.api}/projects/${projectId}/schedule/items/${itemId}`, { headers: this.headers(token) });
  }

  addReplanningEvent(
    token: string,
    projectId: string,
    payload: {
      scheduleItemId: string;
      scheduleItemTitulo: string;
      tipoAlteracao: string;
      inicioAnterior: string;
      fimAnterior: string;
      inicioNovo: string;
      fimNovo: string;
    }
  ) {
    return this.http.post<any>(`${this.api}/projects/${projectId}/replanejamentos`, payload, { headers: this.headers(token) });
  }

  addRisk(
    token: string,
    projectId: string,
    payload: { titulo: string; descricao: string; dataFim: string | null }
  ) {
    return this.http.post<any>(`${this.api}/projects/${projectId}/risks`, payload, { headers: this.headers(token) });
  }

  updateRiskStatus(
    token: string,
    projectId: string,
    riskId: string,
    status: string
  ) {
    return this.http.patch<any>(`${this.api}/projects/${projectId}/risks/${riskId}`, { status }, { headers: this.headers(token) });
  }

  me(token: string) {
    return this.http.get<any>(`${this.api}/account/me`, { headers: this.headers(token) });
  }

  authMe(token: string) {
    return this.http.get<any>(`${this.api}/auth/me`, { headers: this.headers(token) });
  }

  // ── Situação (draft/published) ─────────────────────────────────────────
  updateProjectSituacao(token: string, projectId: string, situacao: 'DRAFT' | 'PUBLISHED') {
    return this.http.patch<any>(`${this.api}/projects/${projectId}/situacao`, { situacao }, { headers: this.headers(token) });
  }

  updateBudgetLineSituacao(token: string, budgetLineId: string, situacao: 'DRAFT' | 'PUBLISHED') {
    return this.http.patch<any>(`${this.api}/budget-lines/${budgetLineId}/situacao`, { situacao }, { headers: this.headers(token) });
  }

  transferBudgetLineDono(token: string, budgetLineId: string, novoDono: string) {
    return this.http.patch<any>(`${this.api}/budget-lines/${budgetLineId}/dono`, { novoDono }, { headers: this.headers(token) });
  }

  // ── Allocation Percent (general % per allocation, stored in backend) ──────
  listAllocationPercent(token: string) {
    return this.http.get<any[]>(`${this.api}/allocation-percent`, { headers: this.headers(token) });
  }

  upsertAllocationPercent(token: string, allocationId: string, percentual: number) {
    return this.http.put<any>(`${this.api}/allocation-percent/${allocationId}`, { percentual }, { headers: this.headers(token) });
  }

  // ── Lo Realizado (realized monthly value per LO, stored in backend) ────────
  listLoRealizado(token: string) {
    return this.http.get<any[]>(`${this.api}/lo-realizado`, { headers: this.headers(token) });
  }

  upsertLoRealizado(token: string, loId: string, month: number, valor: number) {
    return this.http.put<any>(`${this.api}/lo-realizado/${loId}/${month}`, { valor }, { headers: this.headers(token) });
  }

  transferProjectDono(token: string, projectId: string, novoDono: string) {
    return this.http.patch<any>(`${this.api}/projects/${projectId}/dono`, { novoDono }, { headers: this.headers(token) });
  }

  transferRiskDono(token: string, riskId: string, novoDono: string) {
    return this.http.patch<any>(`${this.api}/risks/${riskId}/dono`, { novoDono }, { headers: this.headers(token) });
  }

  transferIncidentDono(token: string, incidentId: string, novoDono: string) {
    return this.http.patch<any>(`${this.api}/incidents/${incidentId}/dono`, { novoDono }, { headers: this.headers(token) });
  }

  transferTechnicalDebtDono(token: string, debtId: string, novoDono: string) {
    return this.http.patch<any>(`${this.api}/technical-debts/${debtId}/dono`, { novoDono }, { headers: this.headers(token) });
  }

  transferIndicatorDono(token: string, indicatorId: string, novoDono: string) {
    return this.http.patch<any>(`${this.api}/indicators/${indicatorId}/dono`, { novoDono }, { headers: this.headers(token) });
  }


  adminListUsers(token: string) {
    return this.http.get<any[]>(`${this.api}/auth/users`, { headers: this.headers(token) });
  }

  adminCreateUser(
    token: string,
    payload: { username: string; password: string; nome?: string; email?: string; role?: string; status?: string }
  ) {
    return this.http.post<any>(`${this.api}/auth/users`, payload, { headers: this.headers(token) });
  }

  adminUpdateUser(token: string, username: string, payload: { nome?: string; email?: string; role?: string; status?: string }) {
    return this.http.put<any>(`${this.api}/auth/users/${encodeURIComponent(username)}`, payload, { headers: this.headers(token) });
  }

  adminResetPassword(token: string, username: string) {
    return this.http.post<{ novaSenha: string }>(`${this.api}/auth/users/${encodeURIComponent(username)}/reset-password`, {}, { headers: this.headers(token) });
  }

  adminDeleteUser(token: string, username: string) {
    return this.http.delete<void>(`${this.api}/auth/users/${encodeURIComponent(username)}`, { headers: this.headers(token) });
  }

  updateAccount(token: string, payload: { username: string; nome: string }) {
    return this.http.patch<any>(`${this.api}/account`, payload, { headers: this.headers(token) });
  }

  changePassword(token: string, payload: { senhaAtual: string; novaSenha: string }) {
    return this.http.patch<any>(`${this.api}/account/password`, payload, { headers: this.headers(token) });
  }

  getProfileImage(token: string) {
    return this.http.get<{ dataUrl: string }>(`${this.api}/account/profile-image`, { headers: this.headers(token) });
  }

  updateProfileImage(token: string, dataUrl: string) {
    return this.http.put<{ dataUrl: string }>(`${this.api}/account/profile-image`, { dataUrl }, { headers: this.headers(token) });
  }

  // ── Absences / férias ─────────────────────────────────────────────────────
  listAbsences(token: string) {
    return this.http.get<any[]>(`${this.api}/absences`, { headers: this.headers(token) });
  }
  createAbsence(token: string, payload: {
    pessoaId: string; pessoaNome: string; tipo: string;
    inicio: string; fim: string; recorrente: boolean; observacao: string;
  }) {
    return this.http.post<any>(`${this.api}/absences`, payload, { headers: this.headers(token) });
  }
  updateAbsence(token: string, absenceId: string, payload: {
    pessoaId: string; pessoaNome: string; tipo: string;
    inicio: string; fim: string; recorrente: boolean; observacao: string;
  }) {
    return this.http.put<any>(`${this.api}/absences/${absenceId}`, payload, { headers: this.headers(token) });
  }
  deleteAbsence(token: string, absenceId: string) {
    return this.http.delete<void>(`${this.api}/absences/${absenceId}`, { headers: this.headers(token) });
  }

  // ── Feriados config ───────────────────────────────────────────────────────
  getFeriadosConfig(token: string) {
    return this.http.get<any>(`${this.api}/feriados`, { headers: this.headers(token) });
  }

  saveFeriadosConfig(token: string, config: { feriados: any[]; federalOverrides: Record<string, any>; diasUteis: boolean[] }) {
    return this.http.put<any>(`${this.api}/feriados`, config, { headers: this.headers(token) });
  }

  // ── Gantt config ──────────────────────────────────────────────────────────
  getGanttConfig(token: string, projectId: string) {
    return this.http.get<any>(`${this.api}/gantt-configs/${projectId}`, { headers: this.headers(token) });
  }

  saveGanttConfig(token: string, projectId: string, config: { markers: any[]; meta: Record<string, any>; rowHeight?: number | null; rowHeights?: Record<string, number> }) {
    return this.http.put<any>(`${this.api}/gantt-configs/${projectId}`, config, { headers: this.headers(token) });
  }
}
