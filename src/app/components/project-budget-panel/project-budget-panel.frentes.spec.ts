import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectBudgetPanelComponent } from './project-budget-panel.component';

// Jan/2026 de 05 a 23 nao tem feriado: 1 semana = 5 dias uteis = 40h.
const perfis = [
  { id: 'p1', nomePerfil: 'Dev | Senior | Backend', valorHora: 100 },
  { id: 'p2', nomePerfil: 'QA | Pleno', valorHora: 50 },
];

function orcamento() {
  return {
    id: 'o1', nome: 'Projeto Alpha', descricao: '', dataBase: '2026-01-05',
    atividades: [
      { id: 'a1', nome: 'API', frente: 'Backend', perfilId: 'p1', horas: 40, dataInicio: '2026-01-05', dataFim: '2026-01-09', cor: '#4f87f0', alocacaoPct: 100 },
      { id: 'a2', nome: 'Testes API', frente: 'backend ', perfilId: 'p2', horas: 40, dataInicio: '2026-01-12', dataFim: '2026-01-16', cor: '#f59e0b', alocacaoPct: 50 },
      { id: 'a3', nome: 'App', frente: 'Mobile', perfilId: 'p1', horas: 80, dataInicio: '2026-01-12', dataFim: '2026-01-23', cor: '#10b981', alocacaoPct: 100 },
      { id: 'a4', nome: 'Kickoff', perfilId: 'p2', horas: 10, dataInicio: '', dataFim: '', cor: '#ef4444' },
    ],
    custosCloud: [{ id: 'c1', nome: 'Cluster', servico: 'AWS', valorMensal: 100, mesesContratados: 12 }],
  };
}

function painel() {
  const c = new ProjectBudgetPanelComponent();
  c.perfis = perfis;
  c.orcamentos = [orcamento()];
  c.selecionarOrcamento(c.orcamentos[0]);
  return c;
}

describe('orcamento de projeto — frentes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('agrupa por frente ignorando maiusculas/espacos e deixa "Sem frente" por ultimo', () => {
    const c = painel();
    expect(c.frentes()).toEqual(['Backend', 'Mobile']);
    const grupos = c.gruposFrente();
    expect(grupos.map(g => [g.nome, g.atividades.length, g.horas, g.custo])).toEqual([
      ['Backend', 2, 60, 5000],
      ['Mobile', 1, 80, 8000],
      ['Sem frente', 1, 10, 500],
    ]);
    expect(grupos[0].inicio).toBe('2026-01-05');
    expect(grupos[0].fim).toBe('2026-01-16');
  });

  it('a visao geral soma todas as frentes + cloud; a visao de frente so as suas atividades', () => {
    const c = painel();
    expect(c.emGeral()).toBe(true);
    expect(c.totalPessoas()).toBe(13500);
    expect(c.totalGeral()).toBe(14700);
    expect(c.ganttRange()).toEqual({ minDate: '2026-01-05', maxDate: '2026-01-23', totalDays: 19 });

    c.selecionarFrente('Mobile');
    expect(c.atividadesEscopo().map(a => a.id)).toEqual(['a3']);
    expect(c.totalGeral()).toBe(8000);
    expect(c.totalOrcamento()).toBe(14700);
    expect(c.ganttRange()).toEqual({ minDate: '2026-01-12', maxDate: '2026-01-23', totalDays: 12 });

    c.selecionarFrente(c.SEM_FRENTE);
    expect(c.atividadesEscopo().map(a => a.id)).toEqual(['a4']);
    expect(c.totalGeral()).toBe(500);
  });

  it('volta para Geral quando a frente selecionada deixa de existir', () => {
    const c = painel();
    c.selecionarFrente('Mobile');
    c.orcamentos = [{ ...orcamento(), atividades: orcamento().atividades.filter(a => a.frente !== 'Mobile') }];
    expect(c.frenteAtual()).toBe('');
    expect(c.atividadesEscopo().length).toBe(3);
  });

  it('nova atividade nasce na frente vista e reaproveita a grafia de uma frente existente', () => {
    const c = painel();
    const emitido = vi.fn();
    c.update.subscribe(emitido);

    c.selecionarFrente('Mobile');
    c.openAtividadeCreate();
    expect(c.atividadeForm.frente).toBe('Mobile');

    c.atividadeForm = { ...c.atividadeForm, nome: 'Push', frente: '  BACKEND  ', perfilId: 'p1', dataInicio: '', dataFim: '', horas: 8 };
    c.submitAtividade();
    const nova = emitido.mock.calls[0][0].payload.atividades.at(-1);
    expect(nova.frente).toBe('Backend');
  });

  it('inserir template aplica a frente escolhida a todas as atividades inseridas', () => {
    const c = painel();
    const emitido = vi.fn();
    c.update.subscribe(emitido);
    c.templates = [{ id: 't1', nome: 'Squad', atividades: [
      { id: 'x', nome: 'Sprint', frente: 'Web', perfilId: 'p1', horas: 40, offsetDias: 0, duracaoDias: 5 },
    ] }];
    c.openInjetar();
    c.injetarFrente = 'mobile';
    c.injetarTemplate();
    expect(emitido.mock.calls[0][0].payload.atividades.at(-1).frente).toBe('Mobile');
  });

  it('edita direto na tabela: valida, normaliza, recalcula horas e ignora o que nao mudou', () => {
    const c = painel();
    const emitido = vi.fn();
    c.update.subscribe(emitido);
    const ev = { currentTarget: null } as unknown as Event;
    const editar = (id: string, campo: any, valor: any) => {
      const a = c.atividades().find(x => x.id === id);
      c.iniciarEdicaoInline(a, campo, ev);
      c.valorInline = valor;
      c.salvarEdicaoInline();
      return emitido.mock.calls.at(-1)?.[0].payload.atividades.find((x: any) => x.id === id);
    };

    // fim estendido de 23/01 para 30/01: 15 dias uteis -> 120h
    expect(editar('a3', 'dataFim', '2026-01-30')).toMatchObject({ dataFim: '2026-01-30', horas: 120 });
    expect(editar('a1', 'frente', 'mobile')).toMatchObject({ frente: 'Mobile' });
    expect(editar('a2', 'alocacaoPct', 250)).toMatchObject({ alocacaoPct: 100 }); // limitado a 100%

    const antes = emitido.mock.calls.length;
    editar('a3', 'dataFim', '2026-01-01');   // fim antes do inicio
    editar('a1', 'nome', '   ');             // nome vazio
    editar('a1', 'nome', 'API');             // igual ao atual
    expect(emitido.mock.calls.length).toBe(antes);

    // horas so editam sem datas; Esc cancela sem emitir
    c.iniciarEdicaoInline(c.atividades()[0], 'horas', ev);
    expect(c.edicaoInline).toBeNull();
    c.iniciarEdicaoInline(c.atividades()[3], 'horas', ev);
    expect(c.editandoCelula(c.atividades()[3], 'horas')).toBe(true);
    c.valorInline = 99;
    c.cancelarEdicaoInline();
    c.salvarEdicaoInline(); // o blur que vem depois do Esc nao salva
    expect(emitido.mock.calls.length).toBe(antes);
    expect(editar('a4', 'horas', 12)).toMatchObject({ horas: 12 });
  });

  it('exporta a planilha com resumo por frente (SOMASE), atividades, cronograma e cloud', async () => {
    const mod: any = await import('xlsx-js-style');
    const XLSX = mod.default ?? mod;
    let wb: any = null;
    let arquivo = '';
    vi.spyOn(XLSX, 'writeFile').mockImplementation((w: any, nome: any) => { wb = w; arquivo = nome; });

    const c = painel();
    await c.exportarPlanilha();

    expect(arquivo).toMatch(/^orcamento-projeto-alpha-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(wb.SheetNames).toEqual(['Resumo', 'Atividades', 'Cronograma', 'Cloud']);

    const at = wb.Sheets['Atividades'];
    expect([at.A2.v, at.B2.v, at.M2.v, at.M2.f]).toEqual(['Backend', 'API', 4000, 'K2*L2']);
    expect([at.A3.v, at.K3.v, at.K3.f]).toEqual(['Backend', 20, 'I3*J3']);
    expect([at.A5.v, at.M5.v]).toEqual(['Sem frente', 500]);
    expect(at.M6.f).toBe('SUBTOTAL(109,M2:M5)');
    expect(at.M6.v).toBe(13500);
    expect(at['!autofilter'].ref).toBe('A1:M5');

    const rs = wb.Sheets['Resumo'];
    const linhas = Object.keys(rs).filter(k => /^A\d+$/.test(k)).map(k => ({ r: Number(k.slice(1)), v: rs[k].v }));
    const linha = (rotulo: string) => linhas.find(l => l.v === rotulo)!.r;
    const rBack = linha('Backend');
    expect(rs[`F${rBack}`].f).toBe(`SUMIF(Atividades!$A$2:$A$5,A${rBack},Atividades!$M$2:$M$5)`);
    expect(rs[`F${rBack}`].v).toBe(5000);
    expect(rs[`B${rBack}`].f).toBe(`COUNTIF(Atividades!$A$2:$A$5,A${rBack})`);
    expect(rs[`F${linha('Mobile')}`].v).toBe(8000);
    expect(rs[`F${linha('Sem frente')}`].v).toBe(500);
    const rCloud = linha('Cloud (anualizado)');
    expect(rs[`F${rCloud}`].f).toBe('Cloud!$E$3');
    const rTotal = linha('Total Geral');
    expect(rTotal).toBe(rCloud + 1);
    expect(rs[`F${rTotal}`].v).toBe(14700);
    expect(rs[`G${rBack}`].f).toBe(`IF($F$${rTotal}=0,0,F${rBack}/$F$${rTotal})`);

    // Cronograma semanal: 05/01, 12/01 e 19/01; Mobile ocupa as semanas 2 e 3.
    const cr = wb.Sheets['Cronograma'];
    expect([cr.F2.v, cr.G2.v, cr.H2.v, cr.I2]).toEqual(['05/01', '12/01', '19/01', undefined]);
    const crLinhas = Object.keys(cr).filter(k => /^A\d+$/.test(k)).map(k => ({ r: Number(k.slice(1)), v: cr[k].v }));
    const rApp = crLinhas.find(l => l.v === 'App')!.r;
    expect([cr[`F${rApp}`].s.fill, cr[`G${rApp}`].s.fill?.fgColor.rgb, cr[`H${rApp}`].s.fill?.fgColor.rgb])
      .toEqual([undefined, '10B981', '10B981']);
    expect(crLinhas.some(l => l.v === 'Kickoff')).toBe(false); // sem datas nao entra na grade

    const cl = wb.Sheets['Cloud'];
    expect([cl.E2.f, cl.E2.v]).toEqual(['C2*D2', 1200]);
  });

  it('conta meses do projeto a partir do inicio da primeira atividade', () => {
    const c = painel();
    expect(c.mesDoProjeto('2026-01-05', '2026-01-05')).toBe(1);
    expect(c.mesDoProjeto('2026-02-04', '2026-01-05')).toBe(1);
    expect(c.mesDoProjeto('2026-02-05', '2026-01-05')).toBe(2);
    expect(c.mesDoProjeto('2027-01-05', '2026-01-05')).toBe(13);
    expect(c.periodoMeses({ mesIni: 2, mesFim: 2 })).toBe('Mês 2');
    expect(c.periodoMeses({ mesIni: 1, mesFim: 3 })).toBe('Mês 1 a Mês 3');
    expect(c.duracaoMeses({ mesIni: 1, mesFim: 1 })).toBe('1 mês');
    expect(c.duracaoMeses({ mesIni: 2, mesFim: 4 })).toBe('3 meses');
  });

  it('resumo executivo: por frente, quantidade, periodo em meses, valor e % (cloud a parte)', () => {
    const c = painel();
    // Mobile vai ate 10/03: Mes 1 a Mes 3 (14 + 20 + 6 dias uteis = 40 dias -> 320h x R$100)
    c.orcamentos[0].atividades[2].dataFim = '2026-03-10';
    const ex = c.resumoExecutivo();
    expect(ex.frentes.map(f => [f.nome, f.atividades, c.periodoMeses(f.periodo), f.valor])).toEqual([
      ['Backend', 2, 'Mês 1', 5000],
      ['Mobile', 1, 'Mês 1 a Mês 3', c.atividadeCusto(c.orcamentos[0].atividades[2])],
      ['Sem frente', 1, '—', 500],
    ]);
    expect(c.duracaoMeses(ex.projeto)).toBe('3 meses');
    expect(ex.total).toBe(ex.totalPessoas + 1200);
    expect(ex.frentes.reduce((s, f) => s + f.pct, 0) + c.pctDe(1200, ex.total)).toBeCloseTo(100, 6);
  });

  it('o PDF executivo nao traz datas nem horas, so meses, valores e %', async () => {
    const { jsPDF } = await import('jspdf');
    let conteudo = '';
    let arquivo = '';
    const eventos = (jsPDF.API as any).events as any[];
    const evento = ['initialized', function (this: any) {
      const doc = this;
      doc.save = (nome: string) => { arquivo = nome; conteudo = doc.output(); return doc; };
    }];
    eventos.push(evento);
    const c = painel();
    c.orcamentos[0].atividades[2].dataFim = '2026-03-10';
    try {
      await c.exportarPDFExecutivo();
    } finally {
      eventos.splice(eventos.indexOf(evento), 1);
    }

    expect(arquivo).toMatch(/^orcamento-executivo-projeto-alpha-/);
    const textos = [...conteudo.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)].map(m => m[1]);
    expect(textos).toContain('Mês 1 a Mês 3');
    expect(textos).toContain('Cronograma por frente');
    expect(textos).toContain('Projeto completo');
    expect(textos).toContain('Infraestrutura cloud');
    expect(textos.some(t => /\d{2}\/\d{2}\/\d{4}/.test(t))).toBe(false); // nenhuma data
    expect(textos.some(t => /\d\s?h\b/.test(t))).toBe(false);          // nenhuma hora
  });

  it('gera o PDF com resumo por frente e uma pagina de cronograma por frente datada', async () => {
    const { jsPDF } = await import('jspdf');
    let conteudo = '';
    let paginas = 0;
    // Metodos do jsPDF sao por instancia: o evento "initialized" troca o save de cada documento.
    const eventos = (jsPDF.API as any).events as any[];
    const evento = ['initialized', function (this: any) {
      const doc = this;
      doc.save = () => { paginas = doc.internal.getNumberOfPages(); conteudo = doc.output(); return doc; };
    }];
    eventos.push(evento);

    const c = painel();
    c.selecionarFrente('Mobile'); // o PDF ignora a visao atual e traz o orcamento inteiro
    try {
      await (c as any).gerarPDF({ geral: true, frentes: true });
    } finally {
      eventos.splice(eventos.indexOf(evento), 1);
    }

    // Texto fica literal no stream do PDF: "(...) Tj"; o travessao vira um byte da fonte.
    const titulos = [...conteudo.matchAll(/\(Cronograma([^)]*)\) Tj/g)].map(m => m[1]);
    expect(conteudo).toContain('(Resumo por Frente) Tj');
    expect(titulos.filter(t => t === ' geral')).toHaveLength(1);
    expect(titulos.filter(t => t.endsWith('Backend'))).toHaveLength(1);
    expect(titulos.filter(t => t.endsWith('Mobile'))).toHaveLength(1);
    expect(titulos.some(t => t.endsWith('Sem frente'))).toBe(false); // sem atividades datadas
    expect(conteudo).toContain('14.700,00');
    expect(paginas).toBeGreaterThanOrEqual(4);
  });
});
