import { Injectable } from '@angular/core';

export type BirthdayTheme =
  | 'festa' | 'baloes' | 'noite' | 'doce' | 'menta' | 'lavanda' | 'coral'
  | 'oceano' | 'floresta' | 'grafite' | 'porDoSol' | 'neon' | 'corporativo' | 'aurora';

type Decor = 'confete' | 'baloes' | 'estrelas' | 'bolhas' | 'serpentina' | 'geo';

export interface BirthdayArtOptions {
  nome: string;
  /** Data URL da foto da pessoa. Sem foto, usamos as iniciais. */
  foto?: string;
  /** Ex.: "14 de março" — usado quando `subtitulo` não é informado. */
  dataLabel: string;
  /** Idade a completar — só entra no subtítulo padrão quando informada. */
  idade?: number | null;
  tema?: BirthdayTheme;
  /** Textos personalizados; vazio/ausente usa o padrão. */
  titulo?: string;
  subtitulo?: string;
  assinatura?: string;
}

interface ThemePalette {
  label: string;
  decor: Decor;
  bgFrom: string; bgTo: string;
  titulo: string; nome: string; texto: string;
  cartao: string; cartaoBorda: string;
  anel: string; anelBrilho: string;
  confetes: string[];
}

const SIZE = 1080;

export const TITULO_PADRAO = '🎉  F E L I Z   A N I V E R S Á R I O  🎉';
export const ASSINATURA_PADRAO = 'Toda a equipe deseja um dia incrível!';

const THEMES: Record<BirthdayTheme, ThemePalette> = {
  festa: {
    label: 'Festa', decor: 'confete',
    bgFrom: '#fff7ed', bgTo: '#fde68a',
    titulo: '#b45309', nome: '#7c2d12', texto: '#92400e',
    cartao: 'rgba(255,255,255,0.72)', cartaoBorda: 'rgba(180,83,9,0.18)',
    anel: '#f59e0b', anelBrilho: '#fbbf24',
    confetes: ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#ec4899'],
  },
  baloes: {
    label: 'Balões', decor: 'baloes',
    bgFrom: '#eff6ff', bgTo: '#dbeafe',
    titulo: '#1d4ed8', nome: '#1e293b', texto: '#475569',
    cartao: 'rgba(255,255,255,0.8)', cartaoBorda: 'rgba(29,99,218,0.18)',
    anel: '#2563eb', anelBrilho: '#60a5fa',
    confetes: ['#2563eb', '#f97316', '#ec4899', '#14b8a6', '#8b5cf6', '#facc15'],
  },
  noite: {
    label: 'Noite', decor: 'estrelas',
    bgFrom: '#0f172a', bgTo: '#312e81',
    titulo: '#fbbf24', nome: '#ffffff', texto: '#c7d2fe',
    cartao: 'rgba(255,255,255,0.08)', cartaoBorda: 'rgba(255,255,255,0.18)',
    anel: '#fbbf24', anelBrilho: '#fde68a',
    confetes: ['#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#c084fc', '#ffffff'],
  },
  doce: {
    label: 'Doce', decor: 'bolhas',
    bgFrom: '#fff1f2', bgTo: '#fecdd3',
    titulo: '#be123c', nome: '#881337', texto: '#9f1239',
    cartao: 'rgba(255,255,255,0.78)', cartaoBorda: 'rgba(190,18,60,0.16)',
    anel: '#fb7185', anelBrilho: '#fda4af',
    confetes: ['#fb7185', '#fbbf24', '#f472b6', '#c084fc', '#ffffff', '#fca5a5'],
  },
  menta: {
    label: 'Menta', decor: 'confete',
    bgFrom: '#ecfdf5', bgTo: '#a7f3d0',
    titulo: '#047857', nome: '#064e3b', texto: '#065f46',
    cartao: 'rgba(255,255,255,0.8)', cartaoBorda: 'rgba(4,120,87,0.16)',
    anel: '#10b981', anelBrilho: '#6ee7b7',
    confetes: ['#10b981', '#facc15', '#38bdf8', '#fb7185', '#ffffff', '#34d399'],
  },
  lavanda: {
    label: 'Lavanda', decor: 'bolhas',
    bgFrom: '#faf5ff', bgTo: '#ddd6fe',
    titulo: '#6d28d9', nome: '#4c1d95', texto: '#5b21b6',
    cartao: 'rgba(255,255,255,0.8)', cartaoBorda: 'rgba(109,40,217,0.16)',
    anel: '#8b5cf6', anelBrilho: '#c4b5fd',
    confetes: ['#8b5cf6', '#f0abfc', '#a5b4fc', '#fbcfe8', '#ffffff', '#c084fc'],
  },
  coral: {
    label: 'Coral', decor: 'serpentina',
    bgFrom: '#fff7f5', bgTo: '#fecaca',
    titulo: '#c2410c', nome: '#7c2d12', texto: '#9a3412',
    cartao: 'rgba(255,255,255,0.8)', cartaoBorda: 'rgba(194,65,12,0.16)',
    anel: '#f97316', anelBrilho: '#fdba74',
    confetes: ['#f97316', '#ef4444', '#fbbf24', '#ec4899', '#ffffff', '#fb923c'],
  },
  oceano: {
    label: 'Oceano', decor: 'bolhas',
    bgFrom: '#083344', bgTo: '#0e7490',
    titulo: '#a5f3fc', nome: '#ffffff', texto: '#cffafe',
    cartao: 'rgba(255,255,255,0.10)', cartaoBorda: 'rgba(165,243,252,0.24)',
    anel: '#22d3ee', anelBrilho: '#a5f3fc',
    confetes: ['#22d3ee', '#67e8f9', '#a5f3fc', '#ffffff', '#38bdf8', '#5eead4'],
  },
  floresta: {
    label: 'Floresta', decor: 'geo',
    bgFrom: '#052e16', bgTo: '#15803d',
    titulo: '#bbf7d0', nome: '#ffffff', texto: '#d1fae5',
    cartao: 'rgba(255,255,255,0.10)', cartaoBorda: 'rgba(187,247,208,0.22)',
    anel: '#4ade80', anelBrilho: '#bbf7d0',
    confetes: ['#4ade80', '#bbf7d0', '#facc15', '#ffffff', '#34d399', '#a3e635'],
  },
  grafite: {
    label: 'Grafite', decor: 'geo',
    bgFrom: '#111827', bgTo: '#374151',
    titulo: '#22d3ee', nome: '#ffffff', texto: '#d1d5db',
    cartao: 'rgba(255,255,255,0.08)', cartaoBorda: 'rgba(255,255,255,0.16)',
    anel: '#22d3ee', anelBrilho: '#67e8f9',
    confetes: ['#22d3ee', '#f472b6', '#facc15', '#ffffff', '#818cf8', '#4ade80'],
  },
  porDoSol: {
    label: 'Pôr do sol', decor: 'serpentina',
    bgFrom: '#fb923c', bgTo: '#7c3aed',
    titulo: '#fff7ed', nome: '#ffffff', texto: '#fde68a',
    cartao: 'rgba(255,255,255,0.16)', cartaoBorda: 'rgba(255,255,255,0.3)',
    anel: '#fbbf24', anelBrilho: '#fed7aa',
    confetes: ['#fde68a', '#ffffff', '#fca5a5', '#c4b5fd', '#fbbf24', '#f9a8d4'],
  },
  neon: {
    label: 'Neon', decor: 'estrelas',
    bgFrom: '#0a0a0a', bgTo: '#1e1b4b',
    titulo: '#f0abfc', nome: '#ffffff', texto: '#67e8f9',
    cartao: 'rgba(255,255,255,0.06)', cartaoBorda: 'rgba(240,171,252,0.35)',
    anel: '#e879f9', anelBrilho: '#22d3ee',
    confetes: ['#e879f9', '#22d3ee', '#a3e635', '#facc15', '#fb7185', '#ffffff'],
  },
  corporativo: {
    label: 'Corporativo', decor: 'geo',
    bgFrom: '#f8fafc', bgTo: '#e2e8f0',
    titulo: '#1d63da', nome: '#0f172a', texto: '#475569',
    cartao: 'rgba(255,255,255,0.9)', cartaoBorda: 'rgba(29,99,218,0.14)',
    anel: '#1d63da', anelBrilho: '#93c5fd',
    confetes: ['#1d63da', '#93c5fd', '#cbd5e1', '#64748b', '#38bdf8', '#e2e8f0'],
  },
  aurora: {
    label: 'Aurora', decor: 'bolhas',
    bgFrom: '#042f2e', bgTo: '#4c1d95',
    titulo: '#5eead4', nome: '#ffffff', texto: '#c4b5fd',
    cartao: 'rgba(255,255,255,0.09)', cartaoBorda: 'rgba(94,234,212,0.24)',
    anel: '#2dd4bf', anelBrilho: '#a78bfa',
    confetes: ['#2dd4bf', '#a78bfa', '#f0abfc', '#5eead4', '#ffffff', '#818cf8'],
  },
};

/** Gerador determinístico — a mesma pessoa produz sempre a mesma arte. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

function seedFromString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

@Injectable({ providedIn: 'root' })
export class BirthdayArtService {

  readonly tituloPadrao = TITULO_PADRAO;
  readonly assinaturaPadrao = ASSINATURA_PADRAO;

  /** Lista para a UI: id, nome e as cores da amostra. */
  readonly temas: { id: BirthdayTheme; label: string; de: string; para: string }[] =
    (Object.keys(THEMES) as BirthdayTheme[]).map(id => ({
      id,
      label: THEMES[id].label,
      de: THEMES[id].bgFrom,
      para: THEMES[id].bgTo,
    }));

  /** Subtítulo padrão: "38 anos · 14 de março". */
  subtituloPadrao(dataLabel: string, idade?: number | null): string {
    const prefixo = idade && idade > 0 && idade < 130 ? `${idade} anos · ` : '';
    return `${prefixo}${dataLabel}`.trim();
  }

  /** Desenha a arte e devolve um PNG em data URL (1080×1080). */
  async generate(options: BirthdayArtOptions): Promise<string> {
    const tema = THEMES[options.tema ?? 'festa'] ?? THEMES.festa;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível neste navegador.');

    const rand = seededRandom(seedFromString(options.nome + (options.tema ?? '')));

    this.drawBackground(ctx, tema);
    this.drawDecor(ctx, tema, rand);
    this.drawCard(ctx, tema);

    const foto = options.foto ? await this.loadImage(options.foto) : null;
    this.drawAvatar(ctx, tema, foto, options.nome);
    this.drawTexts(ctx, tema, options);

    return canvas.toDataURL('image/png');
  }

  /** Baixa a arte já gerada com um nome de arquivo amigável. */
  download(dataUrl: string, nome: string) {
    const slug = (nome || 'aniversario')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `feliz-aniversario-${slug || 'equipe'}.png`;
    a.click();
  }

  // ── Fundo e enfeites ───────────────────────────────────────────────────────

  private drawBackground(ctx: CanvasRenderingContext2D, tema: ThemePalette) {
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, tema.bgFrom);
    g.addColorStop(1, tema.bgTo);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Halo suave atrás do cartão
    const halo = ctx.createRadialGradient(SIZE / 2, SIZE * 0.42, 60, SIZE / 2, SIZE * 0.42, SIZE * 0.6);
    halo.addColorStop(0, 'rgba(255,255,255,0.28)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  private drawDecor(ctx: CanvasRenderingContext2D, tema: ThemePalette, rand: () => number) {
    switch (tema.decor) {
      case 'baloes':     return this.drawBalloons(ctx, tema, rand);
      case 'estrelas':   return this.drawStars(ctx, tema, rand);
      case 'bolhas':     return this.drawBubbles(ctx, tema, rand);
      case 'serpentina': return this.drawStreamers(ctx, tema, rand);
      case 'geo':        return this.drawGeo(ctx, tema, rand);
      default:           return this.drawConfetti(ctx, tema, rand);
    }
  }

  /** Mantém o miolo livre para o cartão respirar. */
  private noMiolo(x: number, y: number, raio = 0.3): boolean {
    return Math.hypot(x - SIZE / 2, y - SIZE / 2) < SIZE * raio;
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, tema: ThemePalette, rand: () => number) {
    for (let i = 0; i < 90; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      if (this.noMiolo(x, y)) continue;

      const cor = tema.confetes[Math.floor(rand() * tema.confetes.length)];
      const w = 12 + rand() * 16;
      const h = 6 + rand() * 10;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI);
      ctx.globalAlpha = 0.5 + rand() * 0.45;
      ctx.fillStyle = cor;
      if (rand() > 0.65) {
        ctx.beginPath();
        ctx.arc(0, 0, h * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawBalloons(ctx: CanvasRenderingContext2D, tema: ThemePalette, rand: () => number) {
    for (let i = 0; i < 14; i++) {
      const x = 60 + rand() * (SIZE - 120);
      const y = 80 + rand() * (SIZE * 0.75);
      if (this.noMiolo(x, y, 0.34)) continue;

      const r = 34 + rand() * 26;
      const cor = tema.confetes[Math.floor(rand() * tema.confetes.length)];

      ctx.save();
      ctx.globalAlpha = 0.55 + rand() * 0.35;

      ctx.strokeStyle = 'rgba(100,116,139,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + r * 1.2);
      ctx.quadraticCurveTo(x + r * 0.4, y + r * 2.1, x, y + r * 2.9);
      ctx.stroke();

      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.82, r, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(x - r * 0.28, y - r * 0.34, r * 0.18, r * 0.26, -0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawStars(ctx: CanvasRenderingContext2D, tema: ThemePalette, rand: () => number) {
    // Poeira estelar
    for (let i = 0; i < 150; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      if (this.noMiolo(x, y, 0.28)) continue;
      ctx.globalAlpha = 0.25 + rand() * 0.6;
      ctx.fillStyle = tema.confetes[Math.floor(rand() * tema.confetes.length)];
      ctx.beginPath();
      ctx.arc(x, y, 1 + rand() * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Estrelas de quatro pontas
    for (let i = 0; i < 22; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      if (this.noMiolo(x, y, 0.32)) continue;
      const r = 8 + rand() * 16;
      ctx.globalAlpha = 0.5 + rand() * 0.5;
      ctx.fillStyle = tema.confetes[Math.floor(rand() * tema.confetes.length)];
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y);
      ctx.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
      ctx.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y);
      ctx.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, tema: ThemePalette, rand: () => number) {
    for (let i = 0; i < 30; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      if (this.noMiolo(x, y, 0.33)) continue;
      const r = 26 + rand() * 96;
      const cor = tema.confetes[Math.floor(rand() * tema.confetes.length)];

      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, this.comAlfa(cor, 0.5));
      g.addColorStop(1, this.comAlfa(cor, 0.06));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStreamers(ctx: CanvasRenderingContext2D, tema: ThemePalette, rand: () => number) {
    for (let i = 0; i < 16; i++) {
      const inicioX = rand() * SIZE;
      const lado = rand() > 0.5 ? 1 : -1;
      const topo = rand() > 0.5;
      const y0 = topo ? -40 : SIZE + 40;
      const cor = tema.confetes[Math.floor(rand() * tema.confetes.length)];

      ctx.save();
      ctx.globalAlpha = 0.35 + rand() * 0.4;
      ctx.strokeStyle = cor;
      ctx.lineWidth = 8 + rand() * 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(inicioX, y0);
      const alcance = 260 + rand() * 260;
      const dir = topo ? 1 : -1;
      ctx.bezierCurveTo(
        inicioX + lado * 120, y0 + dir * alcance * 0.35,
        inicioX - lado * 120, y0 + dir * alcance * 0.7,
        inicioX + lado * 60,  y0 + dir * alcance
      );
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawGeo(ctx: CanvasRenderingContext2D, tema: ThemePalette, rand: () => number) {
    for (let i = 0; i < 34; i++) {
      const x = rand() * SIZE;
      const y = rand() * SIZE;
      if (this.noMiolo(x, y, 0.32)) continue;
      const r = 18 + rand() * 54;
      const cor = tema.confetes[Math.floor(rand() * tema.confetes.length)];

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rand() * Math.PI);
      ctx.globalAlpha = 0.3 + rand() * 0.4;
      ctx.strokeStyle = cor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const lados = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < lados; k++) {
        const a = (Math.PI * 2 * k) / lados - Math.PI / 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (rand() > 0.6) { ctx.fillStyle = this.comAlfa(cor, 0.18); ctx.fill(); }
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── Cartão, foto e textos ──────────────────────────────────────────────────

  private drawCard(ctx: CanvasRenderingContext2D, tema: ThemePalette) {
    const x = 90; const y = 150; const w = SIZE - 180; const h = SIZE - 300;
    ctx.save();
    ctx.shadowColor = 'rgba(15,23,42,0.18)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = tema.cartao;
    this.roundRect(ctx, x, y, w, h, 48);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = tema.cartaoBorda;
    ctx.lineWidth = 3;
    this.roundRect(ctx, x, y, w, h, 48);
    ctx.stroke();
  }

  private drawAvatar(
    ctx: CanvasRenderingContext2D, tema: ThemePalette,
    foto: HTMLImageElement | null, nome: string
  ) {
    const cx = SIZE / 2; const cy = 372; const r = 148;

    const anel = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    anel.addColorStop(0, tema.anel);
    anel.addColorStop(1, tema.anelBrilho);
    ctx.fillStyle = anel;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    if (foto) {
      // cover: preenche o círculo sem distorcer a foto
      const escala = Math.max((r * 2) / foto.width, (r * 2) / foto.height);
      const w = foto.width * escala;
      const h = foto.height * escala;
      ctx.drawImage(foto, cx - w / 2, cy - h / 2, w, h);
    } else {
      ctx.fillStyle = tema.anel;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 118px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.iniciais(nome), cx, cy + 6);
    }
    ctx.restore();
  }

  private drawTexts(ctx: CanvasRenderingContext2D, tema: ThemePalette, o: BirthdayArtOptions) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const UTIL = SIZE - 260;

    const titulo = (o.titulo ?? TITULO_PADRAO).trim();
    if (titulo) {
      ctx.fillStyle = tema.titulo;
      ctx.font = `700 ${this.ajustarCorpo(ctx, titulo, 46, 24, '700', UTIL)}px Inter, system-ui, sans-serif`;
      ctx.fillText(titulo, SIZE / 2, 622);
    }

    const nome = (o.nome || '').trim() || 'Parabéns!';
    ctx.fillStyle = tema.nome;
    ctx.font = `800 ${this.ajustarCorpo(ctx, nome, 92, 34, '800', UTIL)}px Inter, system-ui, sans-serif`;
    ctx.fillText(nome, SIZE / 2, 722);

    const subtitulo = (o.subtitulo ?? this.subtituloPadrao(o.dataLabel, o.idade)).trim();
    if (subtitulo) {
      ctx.fillStyle = tema.texto;
      ctx.font = `500 ${this.ajustarCorpo(ctx, subtitulo, 40, 24, '500', UTIL)}px Inter, system-ui, sans-serif`;
      ctx.fillText(subtitulo, SIZE / 2, 788);
    }

    const assinatura = (o.assinatura ?? ASSINATURA_PADRAO).trim();
    if (!assinatura) return;

    ctx.strokeStyle = tema.cartaoBorda;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(SIZE / 2 - 120, 828);
    ctx.lineTo(SIZE / 2 + 120, 828);
    ctx.stroke();

    // Assinatura em até 2 linhas
    ctx.fillStyle = tema.texto;
    const corpo = 32;
    ctx.font = `400 ${corpo}px Inter, system-ui, sans-serif`;
    const linhas = this.quebrarTexto(ctx, assinatura, UTIL, 2);
    const baseY = linhas.length > 1 ? 876 : 890;
    linhas.forEach((linha, i) => ctx.fillText(linha, SIZE / 2, baseY + i * (corpo * 1.28)));
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

  /** Maior corpo de fonte (entre max e min) em que o texto cabe na largura dada. */
  private ajustarCorpo(
    ctx: CanvasRenderingContext2D, texto: string,
    max: number, min: number, peso: string, largura: number
  ): number {
    let corpo = max;
    while (corpo > min) {
      ctx.font = `${peso} ${corpo}px Inter, system-ui, sans-serif`;
      if (ctx.measureText(texto).width <= largura) break;
      corpo -= 2;
    }
    return corpo;
  }

  /** Quebra por palavras respeitando a largura; a última linha ganha reticências. */
  private quebrarTexto(
    ctx: CanvasRenderingContext2D, texto: string, largura: number, maxLinhas: number
  ): string[] {
    const palavras = texto.split(/\s+/).filter(Boolean);
    const linhas: string[] = [];
    let atual = '';

    for (const palavra of palavras) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(tentativa).width <= largura) {
        atual = tentativa;
        continue;
      }
      if (atual) linhas.push(atual);
      atual = palavra;
      if (linhas.length === maxLinhas) break;
    }
    if (atual && linhas.length < maxLinhas) linhas.push(atual);

    // Se sobrou texto, reticências na última linha
    const usadas = linhas.join(' ');
    if (usadas.length < texto.trim().length && linhas.length) {
      let ultima = linhas[linhas.length - 1];
      while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > largura) {
        ultima = ultima.slice(0, -1);
      }
      linhas[linhas.length - 1] = `${ultima}…`;
    }
    return linhas;
  }

  private comAlfa(hex: string, alfa: number): string {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alfa})`;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  private iniciais(nome: string): string {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '🎂';
    return ((partes[0][0] || '') + (partes.length > 1 ? partes[partes.length - 1][0] || '' : '')).toUpperCase();
  }

  private loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
      const img = new Image();
      // Fotos vêm como data URL; o crossOrigin cobre o caso de virem por http.
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
}
