import { CommonModule } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, inject, signal } from '@angular/core';
import { PlannerApiService } from './core/planner-api.service';
import { LoggerService } from './core/logger.service';
import { ToastService } from './core/toast.service';
import { NotificationService } from './core/notification.service';
import { concatMap, finalize, forkJoin, timeout } from 'rxjs';
import { dateToYmd } from './core/business-days';
import { AuthPanelComponent } from './components/auth-panel/auth-panel.component';
import { ProfilePanelComponent } from './components/profile-panel/profile-panel.component';
import { ProjectCreateComponent } from './components/project-create/project-create.component';
import { OverviewListComponent } from './components/overview-list/overview-list.component';
import { ProjectDetailComponent } from './components/project-detail/project-detail.component';
import { AccountPanelComponent } from './components/account-panel/account-panel.component';
import { BudgetLinePanelComponent } from './components/budget-line-panel/budget-line-panel.component';
import { BusinessEpicPanelComponent } from './components/business-epic-panel/business-epic-panel.component';
import { BudgetAllocationPanelComponent } from './components/budget-allocation-panel/budget-allocation-panel.component';
import { RiskPanelComponent } from './components/risk-panel/risk-panel.component';
import { PersonPanelComponent } from './components/person-panel/person-panel.component';
import { MonthlyHoursPanelComponent } from './components/monthly-hours-panel/monthly-hours-panel.component';
import { PersonAllocationPanelComponent } from './components/person-allocation-panel/person-allocation-panel.component';
import { ConsultancyPanelComponent } from './components/consultancy-panel/consultancy-panel.component';
import { FocalPointPanelComponent } from './components/focal-point-panel/focal-point-panel.component';
import { ReportsPanelComponent } from './components/reports-panel/reports-panel.component';
import { DashboardPanelComponent } from './components/dashboard-panel/dashboard-panel.component';
import { FeriadosPanelComponent } from './components/feriados-panel/feriados-panel.component';
import { FeriadosService } from './core/feriados.service';
import { AusenciasPanelComponent } from './components/ausencias-panel/ausencias-panel.component';
import { AdminUsersPanelComponent } from './components/admin-users-panel/admin-users-panel.component';
import { IncidentPanelComponent } from './components/incident-panel/incident-panel.component';
import { TechnicalDebtPanelComponent } from './components/technical-debt-panel/technical-debt-panel.component';
import { IndicatorsPanelComponent } from './components/indicators-panel/indicators-panel.component';
import { PersonActivityPanelComponent } from './components/person-activity-panel/person-activity-panel.component';
import { DataTransferPanelComponent } from './components/data-transfer-panel/data-transfer-panel.component';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    AuthPanelComponent,
    ProfilePanelComponent,
    ProjectCreateComponent,
    BudgetLinePanelComponent,
    BusinessEpicPanelComponent,
    BudgetAllocationPanelComponent,
    RiskPanelComponent,
    PersonPanelComponent,
    MonthlyHoursPanelComponent,
    PersonAllocationPanelComponent,
    ConsultancyPanelComponent,
    FocalPointPanelComponent,
    ReportsPanelComponent,
    DashboardPanelComponent,
    OverviewListComponent,
    ProjectDetailComponent,
    AccountPanelComponent,
    FeriadosPanelComponent,
    AusenciasPanelComponent,
    AdminUsersPanelComponent,
    IncidentPanelComponent,
    TechnicalDebtPanelComponent,
    IndicatorsPanelComponent,
    PersonActivityPanelComponent,
    DataTransferPanelComponent
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  token = signal(localStorage.getItem('planner_token') ?? '');
  usuario = signal(localStorage.getItem('planner_user') ?? '');
  role = signal(localStorage.getItem('planner_role') ?? '');
  isAdmin = computed(() => this.role() === 'ADMIN');
  profileImage = signal('');
  mensagem = signal('');
  resumo = signal<any[]>([]);
  perfis = signal<any[]>([]);
  linhasOrcamentarias = signal<any[]>([]);
  ajustesLo = signal<any[]>([]);
  businessEpics = signal<any[]>([]);
  alocacoesLo = signal<any[]>([]);
  riscos = signal<any[]>([]);
  incidentes = signal<any[]>([]);
  debitosTecnicos = signal<any[]>([]);
  indicadores = signal<any[]>([]);
  atividades = signal<any[]>([]);
  pessoas = signal<any[]>([]);
  consultorias = signal<any[]>([]);
  pontosFocais = signal<any[]>([]);
  ausencias    = signal<any[]>([]);
  horasMes = signal<any[]>([]);
  conta = signal<any>(null);
  projetoSelecionado = signal<any>(null);
  menuAberto = signal(false);
  sidebarCollapsed = signal(localStorage.getItem('planner_sidebar_collapsed') === '1');
  cadastrosExpanded = signal(false);
  alocacoesExpanded = signal(false);
  riscosExpanded = signal(false);
  flyoutTop = signal(0);
  flyoutBottom = signal<number | null>(null);
  flyoutMaxHeight = signal<number | null>(null);
  projectCreateModalOpen = signal(false);
  confirmModalOpen = signal(false);
  confirmModalMessage = signal('');
  authSubmitting = signal(false);
  mobileSidebarOpen = signal(false);
  secaoAtiva = signal<'dashboard' | 'conta' | 'perfis' | 'projetos' | 'orcamento' | 'epicos' | 'alocacoes_lo' | 'alocacoes_pessoa' | 'pessoas_atividade' | 'riscos' | 'incidentes' | 'debitos_tecnicos' | 'indicadores' | 'pessoas' | 'horas_mes' | 'prestadores' | 'pontos_focais' | 'relatorios' | 'feriados' | 'ausencias' | 'usuarios' | 'dados'>('dashboard');
  riscoEmFocoId = signal('');

  get authLoading() {
    return this.authSubmitting();
  }

  toast = inject(ToastService);
  feriados = inject(FeriadosService);
  private notifications = inject(NotificationService);

  /** Counts critical datasets that need to load before firing notifications */
  private dadosCriticosCarregados = 0;

  constructor(private api: PlannerApiService, private logger: LoggerService) {
    if (this.token()) {
      this.logger.info('Sessão encontrada, carregando dashboard inicial');
      this.inicializarSessao();
    }
  }

  cadastrar(auth: { nome: string; username: string; password: string }) {
    if (this.authSubmitting()) return;
    this.authSubmitting.set(true);
    this.logger.info('Tentando cadastrar usuario', { username: auth.username });
    this.api.register(auth).pipe(
      timeout(15000),
      finalize(() => this.authSubmitting.set(false))
    ).subscribe({
      next: (res) => {
        this.authSubmitting.set(false);
        if (!res?.token) {
          // PENDING: user registered but needs admin approval
          this.mensagem.set('Cadastro realizado! Aguardando aprovação do administrador para acessar o sistema.');
          return;
        }
        this.onAuthSuccess(res, 'Usuario cadastrado com sucesso.');
      },
      error: (err) => {
        this.logger.error('Falha no cadastro', err);
        this.mensagem.set(err?.error?.error ?? 'Falha no cadastro.');
      }
    });
  }

  entrar(auth: { username: string; password: string }) {
    if (this.authSubmitting()) return;
    this.authSubmitting.set(true);
    this.logger.info('Tentando login', { username: auth.username });
    this.api.login(auth).pipe(
      timeout(15000),
      finalize(() => this.authSubmitting.set(false))
    ).subscribe({
      next: (res) => {
        this.authSubmitting.set(false);
        if (!res?.token) {
          this.mensagem.set('Login invalido.');
          return;
        }
        this.onAuthSuccess(res, 'Autenticado com sucesso.');
      },
      error: (err) => {
        this.logger.error('Falha no login', err);
        if (err?.error?.code === 'PENDING_APPROVAL') {
          this.mensagem.set('Seu cadastro ainda não foi aprovado pelo administrador.');
          return;
        }
        const apiMsg = err?.error?.error;
        this.mensagem.set(apiMsg ?? (err?.status === 400 ? 'Login invalido.' : 'Falha no login. Verifique backend e tente novamente.'));
      }
    });
  }

  sair() {
    const tokenAtual = this.token();
    this.logger.info('Encerrando sessão', { usuario: this.usuario() });
    if (tokenAtual) {
      this.api.logout(tokenAtual).subscribe({
        error: (err) => this.logger.warn('Falha ao encerrar sessão no backend, seguindo com logout local', err)
      });
    }
    localStorage.removeItem('planner_token');
    localStorage.removeItem('planner_user');
    localStorage.removeItem('planner_role');
    this.token.set('');
    this.usuario.set('');
    this.role.set('');
    this.resumo.set([]);
    this.projetoSelecionado.set(null);
    this.conta.set(null);
    this.menuAberto.set(false);
    this.cadastrosExpanded.set(false);
    this.alocacoesExpanded.set(false);
    this.riscosExpanded.set(false);
    this.mensagem.set('');
  }

  toggleMenu() {
    this.menuAberto.update(v => !v);
  }

  toggleSidebar() {
    this.sidebarCollapsed.update(v => {
      const next = !v;
      localStorage.setItem('planner_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }

  toggleCadastrosMenu(event?: MouseEvent) {
    const willOpen = !this.cadastrosExpanded();
    this.alocacoesExpanded.set(false);
    this.riscosExpanded.set(false);
    if (event && this.sidebarCollapsed()) {
      const el = event.currentTarget as HTMLElement;
      this.setFlyoutTop(el, 10); // Cadastros possui 10 itens
    }
    this.cadastrosExpanded.set(willOpen);
  }

  toggleAlocacoesMenu(event?: MouseEvent) {
    const willOpen = !this.alocacoesExpanded();
    this.cadastrosExpanded.set(false);
    this.riscosExpanded.set(false);
    if (event && this.sidebarCollapsed()) {
      const el = event.currentTarget as HTMLElement;
      this.setFlyoutTop(el, 3);
    }
    this.alocacoesExpanded.set(willOpen);
  }

  toggleMobileSidebar() {
    this.mobileSidebarOpen.update(v => !v);
  }

  irParaCookpitComMenuCompleto() {
    this.sidebarCollapsed.set(false);
    localStorage.setItem('planner_sidebar_collapsed', '0');
    this.selecionarSecao('dashboard');
  }

  irParaContaComMenuCompleto() {
    this.selecionarSecao('conta');
  }

  selecionarSecao(secao: 'dashboard' | 'conta' | 'perfis' | 'projetos' | 'orcamento' | 'epicos' | 'alocacoes_lo' | 'alocacoes_pessoa' | 'pessoas_atividade' | 'riscos' | 'incidentes' | 'debitos_tecnicos' | 'indicadores' | 'pessoas' | 'horas_mes' | 'prestadores' | 'pontos_focais' | 'relatorios' | 'feriados' | 'ausencias' | 'usuarios' | 'dados') {
    this.secaoAtiva.set(secao);
    if (secao !== 'riscos') this.riscoEmFocoId.set('');
    if (secao !== 'projetos') this.projectCreateModalOpen.set(false);
    this.menuAberto.set(false);
    this.cadastrosExpanded.set(false);
    this.alocacoesExpanded.set(false);
    this.riscosExpanded.set(false);
    this.mobileSidebarOpen.set(false);
  }

  toggleRiscosMenu(event?: MouseEvent) {
    const willOpen = !this.riscosExpanded();
    this.cadastrosExpanded.set(false);
    this.alocacoesExpanded.set(false);
    if (event && this.sidebarCollapsed()) {
      const el = event.currentTarget as HTMLElement;
      this.setFlyoutTop(el, 3);
    }
    this.riscosExpanded.set(willOpen);
  }

  private setFlyoutTop(anchorEl: HTMLElement, itemCount: number) {
    const visualViewportHeight = window.visualViewport?.height;
    const viewportH = Number(visualViewportHeight || window.innerHeight || 900);
    const marginTop = 12;
    const marginBottom = 72; // folga extra para barra de tarefas/área não visível
    const headerHeight = 32; // label + respiros
    const rowHeight = 42;    // item médio no flyout
    const estimatedHeight = headerHeight + (Math.max(0, itemCount) * rowHeight);
    const desiredTop = anchorEl.getBoundingClientRect().top;

    // A partir de 6 itens, trava a altura visual em 6 linhas e habilita scroll interno.
    if (itemCount >= 6) {
      const visibleRows = 6;
      const desiredMaxHeight = headerHeight + (visibleRows * rowHeight);
      const maxTop = Math.max(marginTop, viewportH - estimatedHeight - marginBottom);
      const clampedTop = Math.min(Math.max(desiredTop, marginTop), maxTop);
      const maxHeightByViewport = Math.max(180, viewportH - clampedTop - marginBottom);
      const maxHeight = Math.min(desiredMaxHeight, maxHeightByViewport);
      this.flyoutTop.set(clampedTop);
      this.flyoutBottom.set(marginBottom);
      this.flyoutMaxHeight.set(maxHeight);
      return;
    }

    this.flyoutTop.set(Math.max(desiredTop, marginTop));
    this.flyoutBottom.set(null);
    this.flyoutMaxHeight.set(null);
  }

  private confirmAction: (() => void) | null = null;

  private confirmarExclusao(mensagem: string, onConfirm: () => void) {
    this.confirmModalMessage.set(mensagem);
    this.confirmAction = onConfirm;
    this.confirmModalOpen.set(true);
  }

  cancelarConfirmacao() {
    this.confirmModalOpen.set(false);
    this.confirmModalMessage.set('');
    this.confirmAction = null;
  }

  confirmarAcaoModal() {
    const action = this.confirmAction;
    this.cancelarConfirmacao();
    if (action) action();
  }

  abrirModalProjeto() {
    this.projectCreateModalOpen.set(true);
  }

  fecharModalProjeto() {
    this.projectCreateModalOpen.set(false);
  }


  abrirRiscoDoDashboard(riskId: string) {
    if (!riskId) return;
    this.riscoEmFocoId.set('');
    this.selecionarSecao('riscos');
    setTimeout(() => this.riscoEmFocoId.set(riskId), 0);
  }
  abrirAbaAlocacoesLo(payload: { loId: string; ano: number }) {
    if (payload?.loId) localStorage.setItem('planner_pending_lo_id', payload.loId);
    if (payload?.ano) localStorage.setItem('planner_pending_lo_ano', String(payload.ano));
    this.selecionarSecao('alocacoes_lo');
  }

  criarProjeto(projeto: {
    nome: string;
    descricao: string;
    cliente: string;
    responsavel: string;
    inicioPrevisto: string;
    fimPrevisto: string;
    prioridade: string;
    linhaOrcamentariaId: string;
    businessEpicId: string;
    percentualLo: number | null;
    orcamentoPrevisto: number | null;
    precisaArquitetura: boolean;
  }) {
    this.logger.info('Criando projeto', { nome: projeto.nome });
    const lo = this.linhasOrcamentarias().find((x: any) => x.id === projeto.linhaOrcamentariaId);
    const epic = this.businessEpics().find((x: any) => x.id === projeto.businessEpicId);
    const valorOrcamento = Number(projeto.orcamentoPrevisto ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const detalhes: string[] = [];
    if (lo) detalhes.push(`LO vinculada: ${lo.codigo} - ${lo.nome}`);
    if (projeto.cliente) detalhes.push(`Cliente/Area: ${projeto.cliente}`);
    if (projeto.responsavel) detalhes.push(`Responsavel: ${projeto.responsavel}`);
    if (projeto.inicioPrevisto) detalhes.push(`Inicio previsto: ${projeto.inicioPrevisto}`);
    if (projeto.fimPrevisto) detalhes.push(`Fim previsto: ${projeto.fimPrevisto}`);
    if (projeto.prioridade) detalhes.push(`Prioridade: ${projeto.prioridade}`);
    if (projeto.percentualLo != null) detalhes.push(`Percentual da LO: ${projeto.percentualLo}%`);
    if (projeto.orcamentoPrevisto != null) detalhes.push(`Orcamento previsto: ${valorOrcamento}`);

    const epicTexto = epic
      ? [
          'Business Epic',
          `Nome: ${epic.nome}`,
          `Alias: ${epic.aliasLink || '-'}`,
          `Jira: ${epic.jiraUrl || '-'}`,
          `Janela: ${epic.inicio || '-'} ate ${epic.fim || '-'}`
        ].join('\n')
      : '';

    const descricaoExpandida = [
      projeto.descricao?.trim() || '',
      detalhes.length ? ['Detalhes do projeto', ...detalhes.map((d) => `- ${d}`)].join('\n') : '',
      epicTexto
    ].filter(Boolean).join('\n\n');

    this.api.createProject(this.token(), { nome: projeto.nome, descricao: descricaoExpandida }).subscribe({
      next: (created) => {
        if (projeto.precisaArquitetura && created?.id) {
          // ── Calcula datas em dias úteis ──────────────────────────────────
          const hoje         = this.feriados.nextBusinessDay(new Date());
          const discoveryFim = this.feriados.nthBusinessDay(hoje, 5);     // 5 dias úteis

          const ansInicio = this.feriados.nextBusinessDay(
            new Date(discoveryFim.getFullYear(), discoveryFim.getMonth(), discoveryFim.getDate() + 1)
          );
          const ansFim = this.feriados.nthBusinessDay(ansInicio, 10);     // 10 dias úteis

          const aswInicio = this.feriados.nextBusinessDay(
            new Date(ansFim.getFullYear(), ansFim.getMonth(), ansFim.getDate() + 1)
          );
          const aswFim = this.feriados.nthBusinessDay(aswInicio, 10);     // 10 dias úteis

          // Próxima Terça (2) ou Quinta (4) após o fim de ASW
          const findNextTueThu = (from: Date): Date => {
            let d = this.feriados.nextBusinessDay(new Date(from.getTime() + 86_400_000));
            for (let i = 0; i < 14; i++) {
              if (d.getDay() === 2 || d.getDay() === 4) return d;
              const next = new Date(d.getTime() + 86_400_000);
              next.setHours(0, 0, 0, 0);
              d = this.feriados.nextBusinessDay(next);
            }
            return d;
          };
          const defesaInicio = findNextTueThu(aswFim);

          const toISO  = (d: Date) => `${dateToYmd(d)}T00:00:00Z`;
          // Extrai o ID do último item adicionado ao cronograma (API retorna o projeto inteiro)
          const lastId = (proj: any): string => {
            const arr: any[] = proj?.cronograma ?? [];
            return arr[arr.length - 1]?.id ?? '';
          };

          const etapasAns = JSON.stringify([
            { id: crypto.randomUUID(), label: 'Desenho de Contexto',  done: false },
            { id: crypto.randomUUID(), label: 'Desenho de Container', done: false },
          ]);
          const etapasAsw = JSON.stringify([
            { id: crypto.randomUUID(), label: 'Desenho Técnico', done: false },
          ]);

          // Cadeia: Discovery → Arquitetura ANS → Arquitetura ASW → Defesa no Fórum
          this.api.addScheduleItem(this.token(), created.id, {
            titulo: 'Discovery',
            descricao: '',
            inicioPlanejado: toISO(hoje),
            fimPlanejado:    toISO(discoveryFim),
            permiteParalelo: false,
          }).pipe(
            concatMap((proj1: any) => {
              const discovId = lastId(proj1);
              return this.api.addScheduleItem(this.token(), created.id, {
                titulo: 'Arquitetura ANS',
                descricao: `${discovId ? `##PRED:${discovId}##\n` : ''}##ETAPAS:${etapasAns}##`,
                inicioPlanejado: toISO(ansInicio),
                fimPlanejado:    toISO(ansFim),
                permiteParalelo: false,
              });
            }),
            concatMap((proj2: any) => {
              const ansId = lastId(proj2);
              return this.api.addScheduleItem(this.token(), created.id, {
                titulo: 'Arquitetura ASW',
                descricao: `${ansId ? `##PRED:${ansId}##\n` : ''}##ETAPAS:${etapasAsw}##`,
                inicioPlanejado: toISO(aswInicio),
                fimPlanejado:    toISO(aswFim),
                permiteParalelo: false,
              });
            }),
            concatMap((proj3: any) => {
              const aswId = lastId(proj3);
              return this.api.addScheduleItem(this.token(), created.id, {
                titulo: 'Defesa no Fórum',
                descricao: `${aswId ? `##PRED:${aswId}##\n` : ''}##DOW:2,4##`,
                inicioPlanejado: toISO(defesaInicio),
                fimPlanejado:    toISO(defesaInicio), // 1 dia
                permiteParalelo: false,
              });
            })
          ).subscribe({
            next: () => {
              this.mensagem.set(
                'Projeto criado com Discovery (5 dias) + Arquitetura ANS (10 dias) + Arquitetura ASW (10 dias) + Defesa no Fórum (1 dia — Ter/Qui).'
              );
              this.projectCreateModalOpen.set(false);
              this.carregarResumo();
            },
            error: () => {
              this.mensagem.set('Projeto criado, mas falhou ao criar atividades de arquitetura.');
              this.projectCreateModalOpen.set(false);
              this.carregarResumo();
            }
          });
          return;
        }
        this.mensagem.set('Projeto criado.');
        this.projectCreateModalOpen.set(false);
        this.carregarResumo();
      },
      error: (err) => {
        this.mensagem.set(err?.error?.error ?? 'Falha ao criar projeto.');
      }
    });
  }

  criarPerfil(perfil: { nomePerfil: string; valorHora: number; nivel: string; departamento: string; observacoes: string; debitaLo: boolean }) {
    this.logger.info('Criando perfil', perfil);
    const nomeComContexto = [
      perfil.nomePerfil?.trim() || '',
      perfil.nivel ? perfil.nivel.trim() : '',
      perfil.departamento ? perfil.departamento.trim() : ''
    ].filter(Boolean).join(' | ');

    const nomeFinal = perfil.observacoes?.trim()
      ? `${nomeComContexto} - ${perfil.observacoes.trim()}`
      : nomeComContexto;

    this.api.createProfile(this.token(), { nomePerfil: nomeFinal, valorHora: perfil.valorHora, debitaLo: perfil.debitaLo }).subscribe({
      next: () => {
        this.mensagem.set('Perfil criado.');
        this.carregarPerfis();
      },
      error: (err) => {
        this.mensagem.set(err?.error?.error ?? 'Falha ao criar perfil.');
      }
    });
  }

  importarPerfisCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importProfilesCsv(this.token(), csv), () => this.carregarPerfis(), 'perfis');
  }

  atualizarPerfil(perfil: { id: string; nomePerfil: string; valorHora: number; debitaLo: boolean }) {
    this.api.updateProfile(this.token(), perfil.id, perfil).subscribe({
      next: () => {
        this.mensagem.set('Perfil atualizado.');
        this.carregarPerfis();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar perfil.')
    });
  }

  excluirPerfil(id: string) {
    this.confirmarExclusao('Confirma a exclusao deste perfil?', () => {
      this.api.deleteProfile(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Perfil excluido.');
          this.carregarPerfis();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir perfil.')
      });
    });
  }

  criarLinhaOrcamentaria(linha: { codigo: string; nome: string; ano: number; tipo: string; centroCusto: string; valorTotal: number | null }) {
    this.api.createBudgetLine(this.token(), linha).subscribe({
      next: () => {
        this.mensagem.set('Linha orcamentaria criada.');
        this.carregarLinhasOrcamentarias();
      },
      error: (err) => {
        this.mensagem.set(err?.error?.error ?? 'Falha ao criar linha orcamentaria.');
      }
    });
  }

  importarLinhasCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importBudgetLinesCsv(this.token(), csv), () => this.carregarLinhasOrcamentarias(), 'LOs');
  }

  atualizarLinhaOrcamentaria(linha: { id: string; codigo: string; nome: string; ano: number; tipo: string; centroCusto: string; valorTotal: number | null }) {
    this.api.updateBudgetLine(this.token(), linha.id, linha).subscribe({
      next: () => {
        this.mensagem.set('Linha orcamentaria atualizada.');
        this.carregarLinhasOrcamentarias();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar linha orcamentaria.')
    });
  }

  excluirLinhaOrcamentaria(id: string) {
    this.confirmarExclusao('Confirma a exclusao desta linha orcamentaria?', () => {
      this.api.deleteBudgetLine(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Linha orcamentaria excluida.');
          this.carregarLinhasOrcamentarias();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir linha orcamentaria.')
      });
    });
  }

  criarAjusteLo(payload: { budgetLineId: string; tipo: string; descricao: string; valor: number | null }) {
    this.api.createBudgetLineAdjustment(this.token(), payload).subscribe({
      next: () => {
        this.mensagem.set('Movimentacao da LO cadastrada.');
        this.carregarAjustesLo();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao cadastrar movimentacao da LO.')
    });
  }

  atualizarAjusteLo(payload: { id: string; budgetLineId: string; tipo: string; descricao: string; valor: number | null }) {
    this.api.updateBudgetLineAdjustment(this.token(), payload.id, payload).subscribe({
      next: () => {
        this.mensagem.set('Movimentacao da LO atualizada.');
        this.carregarAjustesLo();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar movimentacao da LO.')
    });
  }

  excluirAjusteLo(id: string) {
    this.confirmarExclusao('Confirma a exclusao desta movimentacao da LO?', () => {
      this.api.deleteBudgetLineAdjustment(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Movimentacao da LO excluida.');
          this.carregarAjustesLo();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir movimentacao da LO.')
      });
    });
  }

  criarBusinessEpic(epic: { nome: string; aliasLink: string; jiraUrl: string; inicio: string | null; fim: string | null }) {
    this.api.createBusinessEpic(this.token(), epic).subscribe({
      next: () => {
        this.mensagem.set('Business Epic criado.');
        this.carregarBusinessEpics();
      },
      error: (err) => {
        this.mensagem.set(err?.error?.error ?? 'Falha ao criar Business Epic.');
      }
    });
  }

  importarEpicsCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importBusinessEpicsCsv(this.token(), csv), () => this.carregarBusinessEpics(), 'business epics');
  }

  atualizarBusinessEpic(epic: { id: string; nome: string; aliasLink: string; jiraUrl: string; inicio: string | null; fim: string | null }) {
    this.api.updateBusinessEpic(this.token(), epic.id, epic).subscribe({
      next: () => {
        this.mensagem.set('Business Epic atualizado.');
        this.carregarBusinessEpics();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar Business Epic.')
    });
  }

  excluirBusinessEpic(id: string) {
    this.confirmarExclusao('Confirma a exclusao deste Business Epic?', () => {
      this.api.deleteBusinessEpic(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Business Epic excluido.');
          this.carregarBusinessEpics();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir Business Epic.')
      });
    });
  }

  criarAlocacaoLo(payload: { linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number }) {
    this.api.createBudgetAllocation(this.token(), payload).subscribe({
      next: () => {
        this.mensagem.set('Alocacao LO criada.');
        this.carregarAlocacoesLo();
      },
      error: (err) => {
        this.mensagem.set(err?.error?.error ?? 'Falha ao criar alocacao LO.');
      }
    });
  }

  atualizarAlocacaoLo(payload: { id: string; linhaOrcamentariaId: string; nomePessoa: string; perfilId: string; horasPlanejadas: number }) {
    this.api.updateBudgetAllocation(this.token(), payload.id, payload).subscribe({
      next: () => {
        this.mensagem.set('Alocacao LO atualizada.');
        this.carregarAlocacoesLo();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar alocacao LO.')
    });
  }

  excluirAlocacaoLo(id: string) {
    this.confirmarExclusao('Confirma a exclusao desta alocacao?', () => {
      this.api.deleteBudgetAllocation(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Alocacao LO excluida.');
          this.carregarAlocacoesLo();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir alocacao LO.')
      });
    });
  }

  criarPessoa(payload: { nome: string; perfilId: string; tipoVinculo: string; consultoria: string; valorHora: number | null; valorMensal: number | null; vagaUrl?: string | null; vagaAlias?: string | null; dataNascimento?: string | null; contato?: string | null; ativo?: boolean; vagasAnteriores?: any[] }) {
    this.api.createPerson(this.token(), payload).subscribe({
      next: () => {
        this.mensagem.set('Pessoa cadastrada.');
        this.carregarPessoas();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao cadastrar pessoa.')
    });
  }

  atualizarPessoa(payload: { id: string; nome: string; perfilId: string; tipoVinculo: string; consultoria: string; valorHora: number | null; valorMensal: number | null; vagaUrl?: string | null; vagaAlias?: string | null; dataNascimento?: string | null; contato?: string | null; ativo?: boolean; vagasAnteriores?: any[] }) {
    this.api.updatePerson(this.token(), payload.id, payload).subscribe({
      next: () => {
        this.mensagem.set('Pessoa atualizada.');
        this.carregarPessoas();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar pessoa.')
    });
  }

  excluirPessoa(id: string) {
    this.confirmarExclusao('Confirma a exclusao desta pessoa?', () => {
      this.api.deletePerson(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Pessoa excluida.');
          this.carregarPessoas();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir pessoa.')
      });
    });
  }

  importarPessoasCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importPeopleCsv(this.token(), csv), () => this.carregarPessoas(), 'pessoas');
  }

  criarConsultoria(payload: { nome: string; descricao: string; telefone: string; email: string }) {
    this.api.createConsultancy(this.token(), payload).subscribe({
      next: () => {
        this.mensagem.set('Prestador de servico cadastrado.');
        this.carregarConsultorias();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao cadastrar prestador de servico.')
    });
  }

  importarConsultoriasCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importConsultanciesCsv(this.token(), csv), () => this.carregarConsultorias(), 'prestadores');
  }

  atualizarConsultoria(payload: { id: string; nome: string; descricao: string; telefone: string; email: string }) {
    this.api.updateConsultancy(this.token(), payload.id, payload).subscribe({
      next: () => {
        this.mensagem.set('Prestador de servico atualizado.');
        this.carregarConsultorias();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar prestador de servico.')
    });
  }

  excluirConsultoria(id: string) {
    this.confirmarExclusao('Confirma a exclusao deste prestador de servico?', () => {
      this.api.deleteConsultancy(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Prestador de servico excluido.');
          this.carregarConsultorias();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir prestador de servico.')
      });
    });
  }

  criarPontoFocal(payload: { area: string; responsavelPor: string; email: string; telefone: string }) {
    this.api.createFocalPoint(this.token(), payload).subscribe({
      next: () => {
        this.mensagem.set('Ponto focal cadastrado.');
        this.carregarPontosFocais();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao cadastrar ponto focal.')
    });
  }

  importarPontosFocaisCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importFocalPointsCsv(this.token(), csv), () => this.carregarPontosFocais(), 'pontos focais');
  }

  importarRiscosCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importRisksCsv(this.token(), csv), () => this.carregarRiscos(), 'riscos');
  }

  importarIncidentesCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importIncidentsCsv(this.token(), csv), () => this.carregarIncidentes(), 'incidentes');
  }

  importarDebitosCsv(file: File) {
    this.importarCsvGenerico(file, (csv) => this.api.importTechnicalDebtsCsv(this.token(), csv), () => this.carregarDebitosTecnicos(), 'débitos técnicos');
  }

  exportarProjetosParaJira() {
    this.api.listProjects(this.token()).subscribe({
      next: (projects: any[]) => {
        const rows: string[][] = [];
        rows.push([
          'Issue Type',
          'Summary',
          'Description',
          'Priority',
          'Start Date',
          'Due Date',
          'Epic Name',
          'Epic Link',
          'Labels'
        ]);

        for (const p of projects ?? []) {
          const nomeProjeto = String(p?.nome ?? '').trim();
          if (!nomeProjeto) continue;
          const descricaoProjeto = String(p?.descricao ?? '').trim();

          rows.push([
            'Epic',
            nomeProjeto,
            descricaoProjeto,
            this.mapStatusToPriority('PLANEJADO'),
            '',
            '',
            nomeProjeto,
            '',
            'planner,projeto'
          ]);

          const cronograma = Array.isArray(p?.cronograma) ? p.cronograma : [];
          for (const item of cronograma) {
            const status = String(item?.status ?? 'PLANEJADO');
            rows.push([
              'Task',
              String(item?.titulo ?? '').trim() || `Atividade ${nomeProjeto}`,
              String(item?.descricao ?? '').replace(/##PRED:[a-zA-Z0-9\-]+##/g, '').trim(),
              this.mapStatusToPriority(status),
              this.toJiraDate(item?.inicioPlanejado),
              this.toJiraDate(item?.fimPlanejado),
              '',
              nomeProjeto,
              'planner,cronograma'
            ]);
          }
        }

        const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dt = new Date();
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        a.download = `jira_projects_${y}-${m}-${d}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.mensagem.set('CSV para importacao no Jira gerado com sucesso.');
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao exportar projetos para Jira.')
    });
  }

  private mapStatusToPriority(status: string): string {
    const s = String(status || '').toUpperCase();
    if (s === 'ATRASADO' || s === 'BLOQUEADO') return 'Highest';
    if (s === 'EM_ANDAMENTO') return 'High';
    if (s === 'CONCLUIDO') return 'Low';
    return 'Medium';
  }

  private toJiraDate(value: any): string {
    if (!value) return '';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return '';
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  atualizarPontoFocal(payload: { id: string; area: string; responsavelPor: string; email: string; telefone: string }) {
    this.api.updateFocalPoint(this.token(), payload.id, payload).subscribe({
      next: () => {
        this.mensagem.set('Ponto focal atualizado.');
        this.carregarPontosFocais();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar ponto focal.')
    });
  }

  excluirPontoFocal(id: string) {
    this.confirmarExclusao('Confirma a exclusao deste ponto focal?', () => {
      this.api.deleteFocalPoint(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Ponto focal excluido.');
          this.carregarPontosFocais();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir ponto focal.')
      });
    });
  }

  salvarHorasMes(payload: { mes: number; horas: number }) {
    this.api.upsertMonthlyHours(this.token(), payload.mes, Number(payload.horas)).subscribe({
      next: () => this.carregarHorasMes(),
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao salvar horas do mes.')
    });
  }

  salvarHorasMesLote(payload: Array<{ mes: number; horas: number }>) {
    if (!payload?.length) return;
    forkJoin(payload.map((p) => this.api.upsertMonthlyHours(this.token(), p.mes, Number(p.horas)))).subscribe({
      next: () => {
        this.mensagem.set('Horas por mes salvas.');
        this.carregarHorasMes();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao salvar horas por mes.')
    });
  }

  selecionarProjeto(projectId: string) {
    this.logger.info('Selecionando projeto', { projectId });
    this.api.getProject(this.token(), projectId).subscribe({
      next: (res) => {
        this.projetoSelecionado.set(res);
        this.secaoAtiva.set('projetos');
      },
      error: () => {}
    });
  }

  addEtapa(etapa: { titulo: string }) {
    if (!this.projetoSelecionado()) return;
    this.api
      .addStep(this.token(), this.projetoSelecionado().id, etapa)
      .subscribe({
        next: (res) => {
          this.projetoSelecionado.set(res);
          this.carregarResumo();
        },
        error: () => {}
      });
  }

  toggleEtapa(payload: { stepId: string; checked: boolean }) {
    this.api
      .toggleStep(this.token(), this.projetoSelecionado().id, payload.stepId, payload.checked)
      .subscribe({
        next: (res) => {
          this.projetoSelecionado.set(res);
          this.carregarResumo();
        },
        error: () => {}
      });
  }

  addAlocacao(alocacao: {
    nomePessoa: string;
    emailPessoa: string;
    funcao: string;
    perfilId: string;
    horasPlanejadas: number;
    observacoes: string;
  }) {
    if (!this.projetoSelecionado()) return;
    const nomePessoaExpandido = [
      alocacao.nomePessoa?.trim() || '',
      alocacao.funcao ? `(${alocacao.funcao.trim()})` : '',
      alocacao.emailPessoa ? `<${alocacao.emailPessoa.trim()}>` : '',
      alocacao.observacoes ? `- ${alocacao.observacoes.trim()}` : ''
    ].filter(Boolean).join(' ');

    this.api
      .addAllocation(this.token(), this.projetoSelecionado().id, {
        nomePessoa: nomePessoaExpandido,
        perfilId: alocacao.perfilId,
        horasPlanejadas: alocacao.horasPlanejadas
      })
      .subscribe({
        next: (res) => {
          this.projetoSelecionado.set(res);
          this.carregarResumo();
        },
        error: () => {}
      });
  }

  addFinanceiro(financeiro: { tipo: string; descricao: string; valor: number }) {
    if (!this.projetoSelecionado()) return;
    this.api
      .addFinance(this.token(), this.projetoSelecionado().id, financeiro)
      .subscribe({
        next: (res) => {
          this.projetoSelecionado.set(res);
          this.carregarResumo();
        },
        error: () => {}
      });
  }

  addCronograma(item: { titulo: string; descricao: string; inicioPlanejado: string | null; fimPlanejado: string | null; permiteParalelo: boolean }) {
    if (!this.projetoSelecionado()) return;
    this.api.addScheduleItem(this.token(), this.projetoSelecionado().id, {
      ...item,
      inicioPlanejado: this.toOffsetDateTime(item.inicioPlanejado),
      fimPlanejado: this.toOffsetDateTime(item.fimPlanejado)
    }).subscribe({
      next: (res) => this.projetoSelecionado.set(res),
      error: () => {}
    });
  }

  criarRiscoGlobal(risco: { titulo: string; descricao: string; planoAcao: string; status: string; dataFim: string | null }) {
    this.api.createRisk(this.token(), {
      ...risco,
      dataFim: this.toOffsetDateTime(risco.dataFim)
    }).subscribe({
      next: () => {
        this.mensagem.set('Apontamento de risco criado.');
        this.carregarRiscos();
        this.carregarPessoas();
        this.carregarHorasMes();
        this.carregarConsultorias();
        this.carregarPontosFocais();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao cadastrar apontamento de risco.')
    });
  }

  atualizarRiscoGlobal(risco: { id: string; titulo: string; descricao: string; planoAcao: string; status: string; dataFim: string | null }) {
    this.api.updateRiskFull(this.token(), risco.id, {
      ...risco,
      dataFim: this.toOffsetDateTime(risco.dataFim)
    }).subscribe({
      next: () => {
        this.mensagem.set('Apontamento de risco atualizado.');
        this.carregarRiscos();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar apontamento de risco.')
    });
  }

  excluirRiscoGlobal(id: string) {
    this.confirmarExclusao('Confirma a exclusao deste apontamento de risco?', () => {
      this.api.deleteRisk(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Apontamento de risco excluido.');
          this.carregarRiscos();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir apontamento de risco.')
      });
    });
  }

  // ── Incidentes ────────────────────────────────────────────────────────────
  criarIncidente(payload: any) {
    this.api.createIncident(this.token(), payload).subscribe({
      next: () => { this.mensagem.set('Incidente registrado.'); this.carregarIncidentes(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao registrar incidente.')
    });
  }

  atualizarIncidente(payload: any) {
    const { id, ...rest } = payload;
    this.api.updateIncident(this.token(), id, rest).subscribe({
      next: () => { this.mensagem.set('Incidente atualizado.'); this.carregarIncidentes(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar incidente.')
    });
  }

  excluirIncidente(id: string) {
    this.confirmarExclusao('Confirma a exclusão deste incidente?', () => {
      this.api.deleteIncident(this.token(), id).subscribe({
        next: () => { this.mensagem.set('Incidente excluído.'); this.carregarIncidentes(); },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir incidente.')
      });
    });
  }

  // ── Débitos Técnicos ──────────────────────────────────────────────────────
  criarDebitoTecnico(payload: any) {
    this.api.createTechnicalDebt(this.token(), payload).subscribe({
      next: () => { this.mensagem.set('Débito técnico registrado.'); this.carregarDebitosTecnicos(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao registrar débito técnico.')
    });
  }

  atualizarDebitoTecnico(payload: any) {
    const { id, ...rest } = payload;
    this.api.updateTechnicalDebt(this.token(), id, rest).subscribe({
      next: () => { this.mensagem.set('Débito técnico atualizado.'); this.carregarDebitosTecnicos(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar débito técnico.')
    });
  }

  excluirDebitoTecnico(id: string) {
    this.confirmarExclusao('Confirma a exclusão deste débito técnico?', () => {
      this.api.deleteTechnicalDebt(this.token(), id).subscribe({
        next: () => { this.mensagem.set('Débito técnico excluído.'); this.carregarDebitosTecnicos(); },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir débito técnico.')
      });
    });
  }

  // ── Indicadores ───────────────────────────────────────────────────────────
  criarIndicador(payload: any) {
    const { valorInicial, ...indPayload } = payload;
    this.api.createIndicator(this.token(), indPayload).subscribe({
      next: (created: any) => {
        this.mensagem.set('Indicador criado.');
        if (valorInicial != null && created?.id) {
          this.api.addIndicatorCycle(this.token(), created.id, {
            valor: Number(valorInicial),
            observacao: 'Valor inicial',
            dataReferencia: null,
            acoesConcluidasIds: [],
          }).subscribe({
            next: () => this.carregarIndicadores(),
            error: () => this.carregarIndicadores(),
          });
        } else {
          this.carregarIndicadores();
        }
      },
      error: (err: any) => this.mensagem.set(err?.error?.error ?? 'Falha ao criar indicador.')
    });
  }

  atualizarIndicador(payload: any) {
    const { id, ...rest } = payload;
    this.api.updateIndicator(this.token(), id, rest).subscribe({
      next: () => { this.mensagem.set('Indicador atualizado.'); this.carregarIndicadores(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar indicador.')
    });
  }

  excluirIndicador(id: string) {
    this.confirmarExclusao('Confirma a exclusão deste indicador e todo seu histórico?', () => {
      this.api.deleteIndicator(this.token(), id).subscribe({
        next: () => { this.mensagem.set('Indicador excluído.'); this.carregarIndicadores(); },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir indicador.')
      });
    });
  }

  adicionarCiclo(event: { indicatorId: string; payload: any }) {
    this.api.addIndicatorCycle(this.token(), event.indicatorId, event.payload).subscribe({
      next: () => { this.mensagem.set('Ciclo registrado.'); this.carregarIndicadores(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao registrar ciclo.')
    });
  }

  atualizarCicloIndicador(event: { indicatorId: string; cycleId: string; payload: any }) {
    this.api.updateIndicatorCycle(this.token(), event.indicatorId, event.cycleId, event.payload).subscribe({
      next: () => { this.mensagem.set('Ciclo atualizado.'); this.carregarIndicadores(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar ciclo.')
    });
  }

  excluirCicloIndicador(event: { indicatorId: string; cycleId: string }) {
    this.confirmarExclusao('Confirma a exclusão deste ciclo?', () => {
      this.api.deleteIndicatorCycle(this.token(), event.indicatorId, event.cycleId).subscribe({
        next: () => { this.mensagem.set('Ciclo excluído.'); this.carregarIndicadores(); },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir ciclo.')
      });
    });
  }

  adicionarAcaoIndicador(event: { indicatorId: string; payload: any }) {
    this.api.addIndicatorAction(this.token(), event.indicatorId, event.payload).subscribe({
      next: () => { this.mensagem.set('Ação criada.'); this.carregarIndicadores(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao criar ação.')
    });
  }

  atualizarAcaoIndicador(event: { indicatorId: string; actionId: string; payload: any }) {
    this.api.updateIndicatorAction(this.token(), event.indicatorId, event.actionId, event.payload).subscribe({
      next: () => { this.mensagem.set('Ação atualizada.'); this.carregarIndicadores(); },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar ação.')
    });
  }

  excluirAcaoIndicador(event: { indicatorId: string; actionId: string }) {
    this.confirmarExclusao('Confirma a exclusão desta ação?', () => {
      this.api.deleteIndicatorAction(this.token(), event.indicatorId, event.actionId).subscribe({
        next: () => { this.mensagem.set('Ação excluída.'); this.carregarIndicadores(); },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir ação.')
      });
    });
  }

  atualizarSituacaoProjeto(payload: { id: string; situacao: 'DRAFT' | 'PUBLISHED' }) {
    this.api.updateProjectSituacao(this.token(), payload.id, payload.situacao).subscribe({
      next: () => this.carregarResumo(),
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao alterar situação do projeto.')
    });
  }

  atualizarSituacaoLo(payload: { id: string; situacao: 'DRAFT' | 'PUBLISHED' }) {
    this.api.updateBudgetLineSituacao(this.token(), payload.id, payload.situacao).subscribe({
      next: () => this.carregarLinhasOrcamentarias(),
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao alterar situação da LO.')
    });
  }

  atualizarProjeto(payload: { id: string; nome: string; descricao: string }) {
    this.api.updateProject(this.token(), payload.id, { nome: payload.nome, descricao: payload.descricao }).subscribe({
      next: () => {
        this.mensagem.set('Projeto atualizado.');
        this.carregarResumo();
        if (this.projetoSelecionado()?.id === payload.id) this.selecionarProjeto(payload.id);
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar projeto.')
    });
  }

  excluirProjeto(id: string) {
    this.confirmarExclusao('Confirma a exclusao deste projeto?', () => {
      this.api.deleteProject(this.token(), id).subscribe({
        next: () => {
          this.mensagem.set('Projeto excluido.');
          if (this.projetoSelecionado()?.id === id) this.projetoSelecionado.set(null);
          this.carregarResumo();
        },
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir projeto.')
      });
    });
  }

  updateRiscoGlobalStatus(payload: { riskId: string; status: string }) {
    this.api.updateRisk(this.token(), payload.riskId, payload.status).subscribe({
      next: () => this.carregarRiscos(),
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar etapa do risco.')
    });
  }

  adiarRiscoGlobal(payload: { riskId: string; novaDataFim: string; motivo: string }) {
    this.api.postponeRisk(this.token(), payload.riskId, {
      ...payload,
      novaDataFim: this.toOffsetDateTime(payload.novaDataFim) || payload.novaDataFim
    }).subscribe({
      next: () => {
        this.mensagem.set('Prazo do apontamento adiado.');
        this.carregarRiscos();
      },
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao adiar apontamento de risco.')
    });
  }

  updateCronograma(payload: { itemId: string; titulo?: string; descricao?: string; inicioPlanejado?: string | null; fimPlanejado?: string | null; permiteParalelo?: boolean; status?: string }) {
    if (!this.projetoSelecionado()) return;
    // Drag ops embed a _replanejamento field so we can chain it after the
    // schedule-item write completes â€” avoiding the JSON file write race.
    const replanejamento = (payload as any)._replanejamento ?? null;
    const { itemId, ...rest } = payload;
    this.api.updateScheduleItem(this.token(), this.projetoSelecionado().id, itemId, {
      ...rest,
      inicioPlanejado: rest.inicioPlanejado === undefined ? undefined : this.toOffsetDateTime(rest.inicioPlanejado),
      fimPlanejado: rest.fimPlanejado === undefined ? undefined : this.toOffsetDateTime(rest.fimPlanejado)
    }).subscribe({
      next: (res) => {
        this.projetoSelecionado.set(res);
        if (replanejamento) {
          this.api.addReplanningEvent(this.token(), res.id, replanejamento).subscribe({
            next: (res2) => this.projetoSelecionado.set(res2),
            error: () => {}
          });
        }
      },
      error: () => {}
    });
  }

  excluirAtividadeCronograma(itemId: string) {
    if (!this.projetoSelecionado()) return;
    this.confirmarExclusao('Confirma a exclusao desta atividade do cronograma?', () => {
      this.api.deleteScheduleItem(this.token(), this.projetoSelecionado().id, itemId).subscribe({
        next: () => this.selecionarProjeto(this.projetoSelecionado().id),
        error: () => {}
      });
    });
  }

  registrarReplanejamento(payload: {
    scheduleItemId: string;
    scheduleItemTitulo: string;
    tipoAlteracao: string;
    inicioAnterior: string;
    fimAnterior: string;
    inicioNovo: string;
    fimNovo: string;
  }) {
    if (!this.projetoSelecionado()) return;
    this.api.addReplanningEvent(this.token(), this.projetoSelecionado().id, payload).subscribe({
      next: (res) => this.projetoSelecionado.set(res),
      error: () => {}
    });
  }

  // â”€â”€ AusÃªncias / fÃ©rias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  criarAusencia(payload: { pessoaId: string; pessoaNome: string; tipo: string; inicio: string; fim: string; recorrente: boolean; observacao: string }) {
    this.api.createAbsence(this.token(), payload).subscribe({
      next: () => this.carregarAusencias(),
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao registrar ausÃªncia.')
    });
  }

  atualizarAusencia(payload: { id: string; pessoaId: string; pessoaNome: string; tipo: string; inicio: string; fim: string; recorrente: boolean; observacao: string }) {
    const { id, ...rest } = payload;
    this.api.updateAbsence(this.token(), id, rest).subscribe({
      next: () => this.carregarAusencias(),
      error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar ausÃªncia.')
    });
  }

  excluirAusencia(id: string) {
    this.confirmarExclusao('Confirma a exclusÃ£o desta ausÃªncia?', () => {
      this.api.deleteAbsence(this.token(), id).subscribe({
        next: () => this.carregarAusencias(),
        error: (err) => this.mensagem.set(err?.error?.error ?? 'Falha ao excluir ausÃªncia.')
      });
    });
  }

  reorderCronograma(itemIdsOrdered: string[]) {
    if (!this.projetoSelecionado()) return;
    this.api.reorderSchedule(this.token(), this.projetoSelecionado().id, itemIdsOrdered).subscribe({
      next: (res) => this.projetoSelecionado.set(res),
      error: () => {}
    });
  }

  alterarSenha(payload: { senhaAtual: string; novaSenha: string }) {
    this.logger.info('Solicitando troca de senha');
    this.api.changePassword(this.token(), payload).subscribe({
      next: () => this.mensagem.set('Senha alterada com sucesso.'),
      error: (err) => {
        this.logger.error('Falha ao alterar senha', err);
        this.mensagem.set(err?.error?.error ?? 'Falha ao alterar senha.');
      }
    });
  }

  atualizarConta(payload: { username: string; nome: string }) {
    const oldUsername = this.usuario();
    this.api.updateAccount(this.token(), payload).subscribe({
      next: (contaAtualizada) => {
        this.conta.set(contaAtualizada);
        if (contaAtualizada?.username) {
          this.usuario.set(contaAtualizada.username);
          localStorage.setItem('planner_user', contaAtualizada.username);
          if (oldUsername && oldUsername !== contaAtualizada.username) {
            localStorage.removeItem(this.profileImageKey(oldUsername));
          }
          this.carregarFotoPerfil();
        }
        this.mensagem.set('Dados da conta atualizados com sucesso.');
      },
      error: (err) => {
        this.mensagem.set(err?.error?.error ?? 'Falha ao atualizar dados da conta.');
      }
    });
  }

  atualizarFotoPerfil(dataUrl: string) {
    this.api.updateProfileImage(this.token(), dataUrl || '').subscribe({
      next: (res) => {
        const saved = res?.dataUrl || '';
        this.profileImage.set(saved);
        this.syncLegacyProfileImage(saved);
      },
      error: (err) => {
        this.mensagem.set(err?.error?.error ?? 'Falha ao salvar foto de perfil.');
      }
    });
  }

  mensagemEhErro() {
    const text = (this.mensagem() || '').toLowerCase();
    return text.includes('falha') || text.includes('inval') || text.includes('erro') || text.includes('expirou');
  }

  nomeExibicaoUsuario() {
    const conta = this.conta();
    return conta?.nome || conta?.username || this.usuario() || 'Usuario';
  }

  fecharMensagem() {
    this.mensagem.set('');
  }

  private onAuthSuccess(res: any, successMessage: string) {
    this.authSubmitting.set(false);
    this.logger.info('Autenticacao concluida', { username: res.username });
    this.token.set(res.token);
    this.usuario.set(res.username);
    this.role.set(res.role ?? '');
    this.profileImage.set('');
    localStorage.setItem('planner_token', res.token);
    localStorage.setItem('planner_user', res.username);
    if (res.role) localStorage.setItem('planner_role', res.role);
    this.mensagem.set(successMessage);
    this.secaoAtiva.set('dashboard');
    this.cadastrosExpanded.set(false);
    this.alocacoesExpanded.set(false);
    this.conta.set(null);
    this.resumo.set([]);
    this.perfis.set([]);
    this.projetoSelecionado.set(null);
    this.inicializarSessao();
  }

  inicializarSessao() {
    this.dadosCriticosCarregados = 0; // reset for each new session load
    this.api.me(this.token()).subscribe({
      next: (res) => {
        if (!this.token()) return;
        this.conta.set(res);
        // Sync role from server so admin promotions take effect on next load
        if (res?.role) {
          this.role.set(res.role);
          localStorage.setItem('planner_role', res.role);
        }
        this.carregarFotoPerfil();
        this.carregarResumo();
        this.carregarPerfis();
        this.carregarLinhasOrcamentarias();
        this.carregarBusinessEpics();
        this.carregarAlocacoesLo();
        this.carregarAjustesLo();
        this.carregarRiscos();
        this.carregarIncidentes();
        this.carregarDebitosTecnicos();
        this.carregarIndicadores();
        this.carregarAtividades();
        this.carregarPessoas();
        this.carregarHorasMes();
        this.carregarConsultorias();
        this.carregarAusencias();
        this.feriados.syncFromApi(this.token());
      },
      error: (err) => {
        if (!this.token()) return;
        this.logger.warn('Falha ao inicializar sessão', err);
        if (err?.status === 401 || err?.status === 403) {
          this.mensagem.set('Sua sessão expirou. Faça login novamente.');
          this.sair();
          return;
        }
        this.mensagem.set(err?.error?.error ?? 'Não foi possível carregar seus dados agora.');
      }
    });
  }

  private tratarErroCarga(mensagemPadrao: string, err: any) {
    if (!this.token()) return;
    this.logger.error(mensagemPadrao, err);
    const status = err?.status;
    if (status === 401 || status === 403) {
      this.mensagem.set('Sua sessão expirou. Faça login novamente.');
      this.sair();
      return;
    }
    this.mensagem.set(err?.error?.error ?? mensagemPadrao);
  }

  private carregarResumo() {
    this.api.listOverview(this.token()).subscribe({
      next: (res) => this.resumo.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar resumo.', err)
    });
    this.carregarAtividades();
  }

  private carregarPerfis() {
    this.api.listProfiles(this.token()).subscribe({
      next: (res) => this.perfis.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar perfis.', err)
    });
  }

  private carregarLinhasOrcamentarias() {
    this.api.listBudgetLines(this.token()).subscribe({
      next: (res) => this.linhasOrcamentarias.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar linhas orcamentarias.', err)
    });
  }

  private carregarBusinessEpics() {
    this.api.listBusinessEpics(this.token()).subscribe({
      next: (res) => this.businessEpics.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar Business Epics.', err)
    });
  }

  private carregarAlocacoesLo() {
    this.api.listBudgetAllocations(this.token()).subscribe({
      next: (res) => this.alocacoesLo.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar alocacoes LO.', err)
    });
  }

  private carregarAjustesLo() {
    this.api.listBudgetLineAdjustments(this.token()).subscribe({
      next: (res) => this.ajustesLo.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar movimentacoes da LO.', err)
    });
  }

  private carregarIncidentes() {
    this.api.listIncidents(this.token()).subscribe({
      next: (res) => this.incidentes.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar incidentes.', err)
    });
  }

  private carregarDebitosTecnicos() {
    this.api.listTechnicalDebts(this.token()).subscribe({
      next: (res) => this.debitosTecnicos.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar débitos técnicos.', err)
    });
  }

  private carregarIndicadores() {
    this.api.listIndicators(this.token()).subscribe({
      next: (res) => this.indicadores.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar indicadores.', err)
    });
  }

  private carregarAtividades() {
    this.api.listActivities(this.token()).subscribe({
      next: (res) => this.atividades.set(res),
      error: () => {} // non-critical, ignore silently
    });
  }

  private carregarRiscos() {
    this.api.listRisks(this.token()).subscribe({
      next: (res) => this.riscos.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar apontamentos de risco.', err)
    });
  }

  private carregarPessoas() {
    this.api.listPeople(this.token()).subscribe({
      next: (res) => { this.pessoas.set(res); this.tentarNotificacoes(); },
      error: (err) => this.tratarErroCarga('Falha ao carregar pessoas.', err)
    });
  }

  private carregarHorasMes() {
    this.api.listMonthlyHours(this.token()).subscribe({
      next: (res) => this.horasMes.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar horas por mes.', err)
    });
  }

  private carregarConsultorias() {
    this.api.listConsultancies(this.token()).subscribe({
      next: (res) => this.consultorias.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar prestadores de servico.', err)
    });
  }

  private carregarPontosFocais() {
    this.api.listFocalPoints(this.token()).subscribe({
      next: (res) => this.pontosFocais.set(res),
      error: (err) => this.tratarErroCarga('Falha ao carregar pontos focais.', err)
    });
  }

  private carregarAusencias() {
    this.api.listAbsences(this.token()).subscribe({
      next: (res) => { this.ausencias.set(res); this.tentarNotificacoes(); },
      error: (err) => this.tratarErroCarga('Falha ao carregar ausÃªncias.', err)
    });
  }

  /** Called after each critical dataset loads. Fires notifications once both are ready. */
  private tentarNotificacoes() {
    this.dadosCriticosCarregados++;
    if (this.dadosCriticosCarregados >= 2) {
      this.verificarNotificacoesHoje();
    }
  }

  private verificarNotificacoesHoje(): void {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeStr  = hoje.toISOString().slice(0, 10); // 'YYYY-MM-DD'
    const hojeMMDD = hojeStr.slice(5);                // 'MM-DD'

    const eventos: Array<{ id: string; titulo: string; corpo: string }> = [];

    // â”€â”€ AniversÃ¡rios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (const p of this.pessoas()) {
      const dn = (p.dataNascimento || '');
      if (!dn) continue;
      const mmdd = dn.slice(5, 10); // 'MM-DD'
      if (mmdd === hojeMMDD) {
        eventos.push({
          id:    `aniv-${p.id}-${hojeStr}`,
          titulo: `ðŸŽ‚ AniversÃ¡rio de ${p.nome}`,
          corpo:  `Hoje Ã© o aniversÃ¡rio de ${p.nome}! NÃ£o esqueÃ§a de parabenizÃ¡-lo(a).`,
        });
      }
    }

    // â”€â”€ AusÃªncias / fÃ©rias iniciando hoje â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const tipoLabel: Record<string, string> = {
      FERIAS: 'fÃ©rias', AUSENCIA: 'ausÃªncia', LICENCA: 'licenÃ§a', OUTRO: 'afastamento',
    };
    for (const a of this.ausencias()) {
      const stored = (a.inicio || '').slice(0, 10); // 'YYYY-MM-DD'
      let inicioStr: string;
      if (a.recorrente) {
        inicioStr = `${hoje.getFullYear()}-${stored.slice(5)}`;
      } else {
        inicioStr = stored;
      }
      if (inicioStr === hojeStr) {
        const tipo = tipoLabel[(a.tipo || '').toUpperCase()] ?? 'ausÃªncia';
        const nome = a.pessoaNome || '';
        const fim  = (a.fim || '').slice(0, 10);
        eventos.push({
          id:    `aus-${a.id}-${hojeStr}`,
          titulo: `ðŸ“… ${nome} â€” inÃ­cio de ${tipo}`,
          corpo:  `${nome} comeÃ§a ${tipo} hoje${fim ? ` (atÃ© ${fim.split('-').reverse().join('/')})` : ''}.`,
        });
      }
    }

    if (eventos.length > 0) {
      this.notifications.notificar(eventos);
    }
  }

  private importarCsvGenerico(
    file: File,
    sender: (csv: string) => any,
    onSuccessReload: () => void,
    label: string
  ) {
    if (!file) return;
    file.text().then((csv) => {
      sender(csv).subscribe({
        next: (res: any) => {
          const criados = Number(res?.criados || 0);
          const ignorados = Number(res?.ignorados || 0);
          this.mensagem.set(`Importacao de ${label} concluida. Criados: ${criados}. Ignorados: ${ignorados}.`);
          onSuccessReload();
        },
        error: (err: any) => this.mensagem.set(err?.error?.error ?? `Falha ao importar CSV de ${label}.`)
      });
    }).catch(() => this.mensagem.set('Falha ao ler arquivo CSV.'));
  }

  private carregarFotoPerfil() {
    if (!this.token()) return;
    this.api.getProfileImage(this.token()).subscribe({
      next: (res) => {
        const dataUrl = res?.dataUrl || '';
        if (dataUrl) {
          this.profileImage.set(dataUrl);
          this.syncLegacyProfileImage(dataUrl);
          return;
        }
        const legacy = this.readLegacyProfileImage(this.usuario());
        if (legacy) {
          this.api.updateProfileImage(this.token(), legacy).subscribe({
            next: () => {
              this.profileImage.set(legacy);
              this.syncLegacyProfileImage(legacy);
            },
            error: () => this.profileImage.set('')
          });
          return;
        }
        this.profileImage.set('');
      },
      error: () => this.profileImage.set('')
    });
  }

  private profileImageKey(username: string) {
    const safe = (username || '').trim().toLowerCase();
    return safe ? `planner_profile_image_${safe}` : '';
  }

  private readLegacyProfileImage(username: string) {
    const key = this.profileImageKey(username);
    const byUser = key ? localStorage.getItem(key) : '';
    return byUser || localStorage.getItem('planner_profile_image') || '';
  }

  private syncLegacyProfileImage(dataUrl: string) {
    const username = this.usuario();
    const key = this.profileImageKey(username);
    if (dataUrl) {
      if (key) localStorage.setItem(key, dataUrl);
      localStorage.setItem('planner_profile_image', dataUrl);
      return;
    }
    if (key) localStorage.removeItem(key);
    localStorage.removeItem('planner_profile_image');
  }

  private toOffsetDateTime(value: string | null | undefined): string | null {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (raw.includes('T')) return raw;
    return `${raw}T00:00:00Z`;
  }
}
