import { Component, Input, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { timeout } from 'rxjs/operators';
import { PlannerApiService } from '../../core/planner-api.service';

@Component({
  selector: 'app-admin-users-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users-panel.component.html',
  styleUrl: './admin-users-panel.component.scss'
})
export class AdminUsersPanelComponent implements OnChanges {
  @Input() token = '';

  private api = inject(PlannerApiService);

  usuarios = signal<any[]>([]);
  carregando = signal(false);
  mensagem = signal('');
  mensagemTipo = signal<'ok' | 'erro'>('ok');
  criando = signal(false);

  editandoId = signal<string | null>(null);
  editForm: { nome: string; email: string; role: string; status: string } = this.emptyEdit();

  novaSenhaUsuario = signal('');
  novaSenhaValor = signal('');
  copiadoId = signal('');

  deleteConfirmUsername = signal('');
  private deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null;
  createForm = this.emptyCreate();

  ngOnChanges(c: SimpleChanges) {
    if (c['token'] && this.token) this.carregar();
  }

  carregar() {
    if (!this.token) return;
    this.carregando.set(true);
    this.mensagem.set('');
    this.api.adminListUsers(this.token).pipe(timeout(15000)).subscribe({
      next: res => {
        this.usuarios.set(Array.isArray(res) ? res : []);
        this.carregando.set(false);
      },
      error: (err) => {
        this.carregando.set(false);
        if (err?.name === 'TimeoutError') {
          this.setMsg('O servidor nao respondeu. Verifique se o backend esta rodando.', 'erro');
        } else {
          const msg = err?.error?.error ?? err?.message ?? 'Falha ao carregar usuarios.';
          this.setMsg(msg, 'erro');
        }
      }
    });
  }

  startEdit(u: any) {
    if (this.editandoId() === u.username) { this.editandoId.set(null); return; }
    this.editandoId.set(u.username);
    this.editForm = {
      nome: u.nome || '',
      email: u.email || '',
      role: u.role || 'USER',
      status: u.status || 'PENDING',
    };
    this.novaSenhaValor.set('');
    this.novaSenhaUsuario.set('');
  }

  cancelEdit() { this.editandoId.set(null); this.novaSenhaValor.set(''); }

  salvar(u: any) {
    this.api.adminUpdateUser(this.token, u.username, this.editForm).subscribe({
      next: updated => {
        this.usuarios.update(list => {
          const idx = list.findIndex(x => x.username === u.username);
          if (idx >= 0) { const next = [...list]; next[idx] = updated; return next; }
          return list;
        });
        this.editandoId.set(null);
        this.setMsg(`Usuario ${u.username} atualizado.`, 'ok');
      },
      error: err => this.setMsg(err?.error?.error ?? 'Falha ao salvar.', 'erro')
    });
  }

  aprovar(u: any) {
    this.api.adminUpdateUser(this.token, u.username, { status: 'APPROVED' }).subscribe({
      next: updated => {
        this.usuarios.update(list => {
          const idx = list.findIndex(x => x.username === u.username);
          if (idx >= 0) { const next = [...list]; next[idx] = updated; return next; }
          return list;
        });
        this.setMsg(`${u.username} aprovado.`, 'ok');
      },
      error: err => this.setMsg(err?.error?.error ?? 'Falha.', 'erro')
    });
  }

  resetSenha(u: any) {
    this.api.adminResetPassword(this.token, u.username).subscribe({
      next: res => {
        this.novaSenhaUsuario.set(u.username);
        this.novaSenhaValor.set(res.novaSenha);
        this.copiadoId.set('');
        this.setMsg('Nova senha gerada. Copie antes de fechar.', 'ok');
      },
      error: err => this.setMsg(err?.error?.error ?? 'Falha ao redefinir senha.', 'erro')
    });
  }

  copiarSenha() {
    navigator.clipboard.writeText(this.novaSenhaValor()).then(() => {
      this.copiadoId.set(this.novaSenhaUsuario());
      setTimeout(() => this.copiadoId.set(''), 2000);
    });
  }

  fecharNovaSenha() { this.novaSenhaValor.set(''); this.novaSenhaUsuario.set(''); }

  excluir(u: any) {
    if (this.deleteConfirmUsername() !== u.username) {
      this.deleteConfirmUsername.set(u.username);
      this.setMsg(`Confirme a exclusao de ${u.username}: clique em excluir novamente em ate 5s.`, 'erro');
      if (this.deleteConfirmTimer) clearTimeout(this.deleteConfirmTimer);
      this.deleteConfirmTimer = setTimeout(() => this.deleteConfirmUsername.set(''), 5000);
      return;
    }

    this.deleteConfirmUsername.set('');
    if (this.deleteConfirmTimer) {
      clearTimeout(this.deleteConfirmTimer);
      this.deleteConfirmTimer = null;
    }

    this.api.adminDeleteUser(this.token, u.username).subscribe({
      next: () => {
        this.usuarios.update(list => list.filter(x => x.username !== u.username));
        this.setMsg(`Usuario ${u.username} excluido.`, 'ok');
      },
      error: err => this.setMsg(err?.error?.error ?? 'Falha ao excluir.', 'erro')
    });
  }

  criarUsuario() {
    const username = (this.createForm.username || '').trim();
    const password = this.createForm.password || '';
    if (!username) {
      this.setMsg('Informe o username.', 'erro');
      return;
    }
    if (!password) {
      this.setMsg('Informe a senha.', 'erro');
      return;
    }
    const payload = {
      username,
      password,
      nome: (this.createForm.nome || '').trim() || username,
      email: (this.createForm.email || '').trim() || undefined,
      role: this.createForm.role || 'USER',
      status: this.createForm.status || 'APPROVED',
    };
    this.criando.set(true);
    this.api.adminCreateUser(this.token, payload).subscribe({
      next: (created) => {
        this.usuarios.update(list => [created, ...list]);
        this.createForm = this.emptyCreate();
        this.criando.set(false);
        this.setMsg(`Usuario ${created?.username || username} criado com sucesso.`, 'ok');
      },
      error: err => {
        this.criando.set(false);
        this.setMsg(err?.error?.error ?? 'Falha ao criar usuario.', 'erro');
      }
    });
  }

  private emptyEdit() {
    return { nome: '', email: '', role: 'USER', status: 'PENDING' };
  }

  private emptyCreate() {
    return { nome: '', username: '', password: '', email: '', role: 'USER', status: 'APPROVED' };
  }

  private setMsg(msg: string, tipo: 'ok' | 'erro') {
    this.mensagem.set(msg);
    this.mensagemTipo.set(tipo);
    setTimeout(() => this.mensagem.set(''), 5000);
  }

  statusLabel(s: string) {
    return s === 'APPROVED' ? 'Aprovado' : 'Pendente';
  }
  roleLabel(r: string) {
    return r === 'ADMIN' ? 'Admin' : 'Usuario';
  }
  roleBadge(r: string) {
    return r === 'ADMIN' ? 'badge-admin' : 'badge-user';
  }
  statusBadge(s: string) {
    return s === 'APPROVED' ? 'badge-approved' : 'badge-pending';
  }
}
