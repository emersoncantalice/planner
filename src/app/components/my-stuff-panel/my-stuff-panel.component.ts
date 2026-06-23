import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, Input, OnChanges, SimpleChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlannerApiService } from '../../core/planner-api.service';
import { ToastService } from '../../core/toast.service';

export type ThingType = 'texto' | 'imagem' | 'query' | 'codigo' | 'arquivo';

export interface ThingItem {
  id: string;
  titulo: string;
  tipo: ThingType;
  conteudo: string;
  linguagem?: string;
  arquivo?: string;
  labels?: string[];
  pasta?: string;
  atualizadoEm?: string;
}

interface FolderNode { path: string; name: string; depth: number; count: number; children: FolderNode[]; }
interface Crumb { name: string; path: string; }

const TYPE_META: Record<ThingType, { label: string; icon: string; mono: boolean }> = {
  texto:   { label: 'Texto',   icon: '📝', mono: false },
  imagem:  { label: 'Imagem',  icon: '🖼️', mono: false },
  query:   { label: 'Query',   icon: '🗄️', mono: true },
  codigo:  { label: 'Código',  icon: '💻', mono: true },
  arquivo: { label: 'Arquivo', icon: '📎', mono: false },
};

@Component({
  selector: 'app-my-stuff-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './my-stuff-panel.component.html',
  styleUrl: './my-stuff-panel.component.scss'
})
export class MyStuffPanelComponent implements OnChanges {
  @Input() token = '';

  private api   = inject(PlannerApiService);
  private toast = inject(ToastService);

  readonly typeMeta = TYPE_META;
  readonly types: ThingType[] = ['texto', 'imagem', 'query', 'codigo', 'arquivo'];

  meta(tipo: string) { return TYPE_META[(tipo as ThingType)] ?? TYPE_META.texto; }

  items        = signal<ThingItem[]>([]);
  extraFolders = signal<string[]>([]);   // pastas vazias criadas explicitamente
  loading      = signal(false);
  saving       = signal(false);

  // Menu de contexto (botão direito) de pastas. path = null → raiz.
  folderMenu   = signal<{ x: number; y: number; path: string | null } | null>(null);
  // Modal de nova pasta. parent = null → cria na raiz.
  newFolder    = signal<{ parent: string | null } | null>(null);
  newFolderName = signal('');

  // ── Navegação / busca ──────────────────────────────────────────────────────
  globalSearch    = signal('');          // busca geral (todas as pastas)
  folderSearch    = signal('');          // busca dentro da pasta (e subpastas) selecionada
  selectedFolder  = signal<string | null>(null);
  activeLabel     = signal<string | null>(null);
  expandedFolders = signal<Set<string>>(new Set());

  // ── Editor ───────────────────────────────────────────────────────────────
  editorOpen = signal(false);
  editId     = signal<string | null>(null);
  form = {
    titulo: '',
    tipo: 'texto' as ThingType,
    conteudo: '',
    linguagem: '',
    arquivo: '',
    pasta: '',
  };
  formLabels = signal<string[]>([]);
  labelDraft = signal('');

  // ── Visualização ───────────────────────────────────────────────────────────
  viewItem = signal<ThingItem | null>(null);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['token'] && this.token) this.carregar();
  }

  carregar() {
    this.loading.set(true);
    this.api.listThings(this.token).subscribe({
      next: (res) => { this.items.set(res ?? []); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.show('Falha ao carregar Minhas Coisas.', 'error'); }
    });
    this.carregarPastas();
  }

  private carregarPastas() {
    this.api.listThingFolders(this.token).subscribe({
      next: (res) => this.extraFolders.set(res ?? []),
      error: () => {}
    });
  }

  // ── Derivados ──────────────────────────────────────────────────────────────
  // Todos os caminhos de pasta (itens + pastas vazias), incluindo segmentos
  // intermediários, ex.: "A", "A/B".
  folders = computed<string[]>(() => {
    const set = new Set<string>();
    const addPath = (raw: string) => {
      const p = (raw ?? '').trim();
      if (!p) return;
      let acc = '';
      for (const seg of p.split('/')) { acc = acc ? acc + '/' + seg : seg; set.add(acc); }
    };
    for (const it of this.items()) addPath(it.pasta ?? '');
    for (const f of this.extraFolders()) addPath(f);
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  // Quantidade de itens diretamente em cada pasta (sem contar subpastas).
  private directCounts = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const it of this.items()) {
      const p = (it.pasta ?? '').trim();
      if (!p) continue;
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return map;
  });

  // Árvore de pastas (nós raiz). Subpastas viram filhos.
  folderTree = computed<FolderNode[]>(() => {
    const counts = this.directCounts();
    const byPath = new Map<string, FolderNode>();
    const roots: FolderNode[] = [];
    // ordena por profundidade primeiro para garantir que o pai exista antes do filho
    const paths = [...this.folders()].sort(
      (a, b) => (a.split('/').length - b.split('/').length) || a.localeCompare(b, 'pt-BR')
    );
    for (const path of paths) {
      const name = path.split('/').pop()!;
      const depth = path.split('/').length - 1;
      const node: FolderNode = { path, name, depth, count: counts.get(path) ?? 0, children: [] };
      byPath.set(path, node);
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (parent && byPath.has(parent)) byPath.get(parent)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  });

  // Lista achatada para a sidebar, respeitando expansão.
  visibleFolders = computed<FolderNode[]>(() => {
    const out: FolderNode[] = [];
    const walk = (nodes: FolderNode[]) => {
      for (const n of [...nodes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))) {
        out.push(n);
        if (this.expandedFolders().has(n.path)) walk(n.children);
      }
    };
    walk(this.folderTree());
    return out;
  });

  private findNode(path: string, nodes = this.folderTree()): FolderNode | null {
    for (const n of nodes) {
      if (n.path === path) return n;
      const found = this.findNode(path, n.children);
      if (found) return found;
    }
    return null;
  }

  // Subpastas diretas da pasta selecionada.
  subfolders = computed<FolderNode[]>(() => {
    const folder = this.selectedFolder();
    if (folder === null) return [];
    const node = this.findNode(folder);
    return node ? [...node.children].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) : [];
  });

  // Trilha de navegação (breadcrumb) da pasta selecionada.
  breadcrumb = computed<Crumb[]>(() => {
    const folder = this.selectedFolder();
    if (!folder) return [];
    let acc = '';
    return folder.split('/').map(seg => { acc = acc ? acc + '/' + seg : seg; return { name: seg, path: acc }; });
  });

  allLabels = computed<string[]>(() => {
    const set = new Set<string>();
    for (const it of this.items()) for (const l of it.labels ?? []) set.add(l);
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  });

  isSearching = computed(() => this.globalSearch().trim().length > 0);

  private matches(it: ThingItem, term: string): boolean {
    const q = term.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      it.titulo,
      it.conteudo,
      it.linguagem ?? '',
      it.tipo,
      (it.labels ?? []).join(' '),
      it.pasta ?? ''
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  private matchesLabel(it: ThingItem): boolean {
    const lbl = this.activeLabel();
    return !lbl || (it.labels ?? []).includes(lbl);
  }

  // Resultados da busca geral: lista plana sobre todos os itens.
  searchResults = computed<ThingItem[]>(() => {
    const term = this.globalSearch();
    return this.items().filter(it => this.matchesLabel(it) && this.matches(it, term));
  });

  // Itens da pasta selecionada. Sem busca: só itens diretos. Com busca: subárvore inteira.
  folderItems = computed<ThingItem[]>(() => {
    const folder = this.selectedFolder();
    if (folder === null) return [];
    const term = this.folderSearch().trim();
    return this.items().filter(it => {
      const p = (it.pasta ?? '');
      const inScope = term ? (p === folder || p.startsWith(folder + '/')) : p === folder;
      return inScope && this.matchesLabel(it) && this.matches(it, term);
    });
  });

  // Itens sem pasta (mostrados na visão raiz).
  rootItems = computed<ThingItem[]>(() =>
    this.items().filter(it => !(it.pasta ?? '').trim() && this.matchesLabel(it))
  );

  // ── Navegação ──────────────────────────────────────────────────────────────
  abrirPasta(folder: string | null) {
    this.selectedFolder.set(folder);
    this.folderSearch.set('');
    if (folder) this.expandAncestors(folder);
  }

  toggleFolderExpand(path: string, ev?: Event) {
    ev?.stopPropagation();
    const next = new Set(this.expandedFolders());
    next.has(path) ? next.delete(path) : next.add(path);
    this.expandedFolders.set(next);
  }

  private expandAncestors(folder: string) {
    const next = new Set(this.expandedFolders());
    let acc = '';
    for (const seg of folder.split('/')) { acc = acc ? acc + '/' + seg : seg; next.add(acc); }
    this.expandedFolders.set(next);
  }

  // ── Menu de contexto / criação de pastas ──────────────────────────────────
  abrirMenuPasta(ev: MouseEvent, path: string | null) {
    ev.preventDefault();
    ev.stopPropagation();
    this.folderMenu.set({ x: ev.clientX, y: ev.clientY, path });
  }

  fecharMenuPasta() { this.folderMenu.set(null); }

  @HostListener('document:click')
  onDocClick() { if (this.folderMenu()) this.fecharMenuPasta(); }

  @HostListener('document:keydown.escape')
  onEsc() { this.fecharMenuPasta(); this.newFolder.set(null); }

  // Abre o modal de nova pasta (subpasta do alvo do menu, ou raiz).
  novaPastaNoMenu() {
    const menu = this.folderMenu();
    this.newFolder.set({ parent: menu ? menu.path : null });
    this.newFolderName.set('');
    this.fecharMenuPasta();
  }

  // "Nova coisa aqui" a partir do menu de contexto.
  novaCoisaNoMenu() {
    const menu = this.folderMenu();
    const parent = menu ? menu.path : null;
    this.fecharMenuPasta();
    this.novoItem();
    this.form.pasta = parent ?? '';
  }

  cancelarNovaPasta() { this.newFolder.set(null); }

  confirmarNovaPasta() {
    const ctx = this.newFolder();
    if (!ctx) return;
    const nome = this.newFolderName().trim().replace(/\//g, ' ').trim();
    if (!nome) { this.toast.show('Informe o nome da pasta.', 'error'); return; }
    const path = ctx.parent ? `${ctx.parent}/${nome}` : nome;
    this.api.createThingFolder(this.token, path).subscribe({
      next: (folders) => {
        this.extraFolders.set(folders ?? []);
        this.newFolder.set(null);
        this.toast.show('Pasta criada.', 'success');
        this.abrirPasta(path);
      },
      error: (err) => this.toast.show(err?.error?.error ?? 'Falha ao criar pasta.', 'error')
    });
  }

  toggleLabel(label: string) {
    this.activeLabel.set(this.activeLabel() === label ? null : label);
  }

  limparBuscaGeral() { this.globalSearch.set(''); }

  // ── Editor ───────────────────────────────────────────────────────────────
  novoItem() {
    this.editId.set(null);
    this.form = {
      titulo: '',
      tipo: 'texto',
      conteudo: '',
      linguagem: '',
      arquivo: '',
      pasta: this.selectedFolder() ?? '',
    };
    this.formLabels.set([]);
    this.labelDraft.set('');
    this.editorOpen.set(true);
  }

  editarItem(it: ThingItem) {
    this.editId.set(it.id);
    this.form = {
      titulo: it.titulo,
      tipo: it.tipo,
      conteudo: it.conteudo,
      linguagem: it.linguagem ?? '',
      arquivo: it.arquivo ?? '',
      pasta: it.pasta ?? '',
    };
    this.formLabels.set([...(it.labels ?? [])]);
    this.labelDraft.set('');
    this.viewItem.set(null);
    this.editorOpen.set(true);
  }

  fecharEditor() { this.editorOpen.set(false); }

  get isMono(): boolean { return TYPE_META[this.form.tipo].mono; }

  adicionarLabel() {
    const raw = this.labelDraft().trim();
    if (!raw) return;
    // permite colar "a, b, c"
    const novos = raw.split(',').map(s => s.trim()).filter(Boolean);
    const atual = new Set(this.formLabels());
    for (const n of novos) atual.add(n);
    this.formLabels.set([...atual]);
    this.labelDraft.set('');
  }

  removerLabel(label: string) {
    this.formLabels.set(this.formLabels().filter(l => l !== label));
  }

  onLabelKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      this.adicionarLabel();
    }
  }

  // Preserva a identação ao digitar Tab em query/código.
  onContentKeydown(ev: KeyboardEvent) {
    if (ev.key !== 'Tab' || !this.isMono) return;
    ev.preventDefault();
    const ta = ev.target as HTMLTextAreaElement;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const indent = '  ';
    const value = ta.value;
    ta.value = value.slice(0, start) + indent + value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + indent.length;
    this.form.conteudo = ta.value;
  }

  // Limite de ~10 MB para o data URL (base64 cresce ~33%).
  private static readonly MAX_FILE_BYTES = 10 * 1024 * 1024;

  onFileSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.form.tipo === 'imagem' && !file.type.startsWith('image/')) {
      this.toast.show('Selecione um arquivo de imagem.', 'error');
      input.value = '';
      return;
    }
    if (file.size > MyStuffPanelComponent.MAX_FILE_BYTES) {
      this.toast.show('Arquivo muito grande (máx. 10 MB).', 'error');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.form.conteudo = String(reader.result ?? '');
      this.form.arquivo = file.name;
    };
    reader.onerror = () => this.toast.show('Falha ao ler o arquivo.', 'error');
    reader.readAsDataURL(file);
  }

  // Baixa imagem/arquivo a partir do data URL armazenado.
  baixar(it: ThingItem, ev?: Event) {
    ev?.stopPropagation();
    if (!it.conteudo) { this.toast.show('Nada para baixar.', 'error'); return; }
    const a = document.createElement('a');
    a.href = it.conteudo;
    a.download = (it.arquivo || it.titulo || 'arquivo').trim();
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  formatarTamanho(dataUrl: string): string {
    const i = dataUrl.indexOf(',');
    if (i < 0) return '';
    const bytes = Math.floor((dataUrl.length - i - 1) * 3 / 4);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  salvar() {
    if (this.saving()) return;
    const titulo = this.form.titulo.trim();
    if (!titulo) { this.toast.show('Informe um título.', 'error'); return; }
    if ((this.form.tipo === 'imagem' || this.form.tipo === 'arquivo') && !this.form.conteudo) {
      this.toast.show(this.form.tipo === 'imagem' ? 'Selecione uma imagem.' : 'Selecione um arquivo.', 'error');
      return;
    }
    // garante que um rascunho de label não digitado seja incluído
    if (this.labelDraft().trim()) this.adicionarLabel();

    const payload = {
      titulo,
      tipo: this.form.tipo,
      conteudo: this.form.conteudo,
      linguagem: this.form.linguagem.trim(),
      arquivo: this.form.arquivo.trim(),
      labels: this.formLabels(),
      pasta: this.form.pasta.trim(),
    };

    this.saving.set(true);
    const id = this.editId();
    const req = id
      ? this.api.updateThing(this.token, id, payload)
      : this.api.createThing(this.token, payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.editorOpen.set(false);
        this.toast.show(id ? 'Item atualizado.' : 'Item salvo.', 'success');
        this.carregar();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.show(err?.error?.error ?? 'Falha ao salvar item.', 'error');
      }
    });
  }

  excluir(it: ThingItem) {
    if (!confirm(`Excluir "${it.titulo}"?`)) return;
    this.api.deleteThing(this.token, it.id).subscribe({
      next: () => {
        this.toast.show('Item excluído.', 'success');
        if (this.viewItem()?.id === it.id) this.viewItem.set(null);
        this.carregar();
      },
      error: (err) => this.toast.show(err?.error?.error ?? 'Falha ao excluir item.', 'error')
    });
  }

  copiarConteudo(it: ThingItem) {
    navigator.clipboard?.writeText(it.conteudo).then(
      () => this.toast.show('Conteúdo copiado.', 'success'),
      () => this.toast.show('Não foi possível copiar.', 'error')
    );
  }

  abrirVisualizacao(it: ThingItem) { this.viewItem.set(it); }
  fecharVisualizacao() { this.viewItem.set(null); }
}
