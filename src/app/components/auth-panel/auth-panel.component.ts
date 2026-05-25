import { Component, CUSTOM_ELEMENTS_SCHEMA, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-auth-panel',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './auth-panel.component.html',
  styleUrl: './auth-panel.component.scss'
})
export class AuthPanelComponent {
  @Input() mensagem = '';
  @Input() loading = false;
  @Output() login = new EventEmitter<{ username: string; password: string }>();
  @Output() register = new EventEmitter<{ nome: string; username: string; password: string }>();
  mode: 'login' | 'register' = 'login';
  auth = { nome: '', username: '', password: '', confirmPassword: '' };
  formError = '';

  get nomeValido() {
    return this.auth.nome.trim().length >= 3;
  }

  get usernameValido() {
    return this.auth.username.trim().length >= 3;
  }

  get senhaValida() {
    return this.auth.password.length >= 6;
  }

  get senhasConferem() {
    return !!this.auth.confirmPassword && this.auth.password === this.auth.confirmPassword;
  }

  get senhasDivergentes() {
    return !!this.auth.confirmPassword && this.auth.password !== this.auth.confirmPassword;
  }

  setMode(mode: 'login' | 'register') {
    this.mode = mode;
    this.formError = '';
  }

  submitLogin() {
    this.formError = '';
    if (!this.auth.username.trim()) {
      this.formError = 'Informe seu usuario.';
      return;
    }
    if (!this.auth.password) {
      this.formError = 'Informe sua senha.';
      return;
    }
    this.login.emit({ username: this.auth.username.trim(), password: this.auth.password });
  }

  submitRegister() {
    this.formError = '';
    if (this.auth.nome.trim().length < 3) {
      this.formError = 'Nome deve ter ao menos 3 caracteres.';
      return;
    }
    if (this.auth.username.trim().length < 3) {
      this.formError = 'Usuario deve ter ao menos 3 caracteres.';
      return;
    }
    if (this.auth.password.length < 6) {
      this.formError = 'Senha deve ter ao menos 6 caracteres.';
      return;
    }
    if (this.auth.password !== this.auth.confirmPassword) {
      this.formError = 'A confirmação de senha não confere.';
      return;
    }
    this.register.emit({
      nome: this.auth.nome.trim(),
      username: this.auth.username.trim(),
      password: this.auth.password
    });
  }

  onEnterSubmit() {
    if (this.mode === 'login') {
      this.submitLogin();
      return;
    }
    this.submitRegister();
  }
}

