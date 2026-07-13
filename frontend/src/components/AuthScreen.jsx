import React, { useState } from 'react';
import { BookOpen, Loader2, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';


export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'login') await login(email, password, rememberMe);
      else await register(email, password, rememberMe);
    } catch (requestError) {
      setError(requestError.message || 'Không thể xác thực tài khoản.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas-soft flex items-center justify-center p-lg">
      <div className="w-full max-w-md rounded-[20px] border border-hairline bg-surface p-xl shadow-lg">
        <div className="mb-xl text-center">
          <div className="mx-auto mb-md flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BookOpen size={32} />
          </div>
          <h1 className="font-display-2 text-display-2 text-ink">MinusLearn</h1>
          <p className="mt-xs font-body-md text-body-md text-ink-muted">
            {mode === 'login' ? 'Đăng nhập để đồng bộ dữ liệu học.' : 'Tạo tài khoản học tập của bạn.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-md">
          <label className="flex flex-col gap-xs font-body-sm text-body-sm text-ink">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="rounded-[10px] border border-hairline bg-canvas-soft px-md py-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="flex flex-col gap-xs font-body-sm text-body-sm text-ink">
            Mật khẩu
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="rounded-[10px] border border-hairline bg-canvas-soft px-md py-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="flex items-center gap-2 font-body-sm text-body-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              className="rounded border-hairline text-primary focus:ring-primary h-4 w-4"
            />
            Ghi nhớ đăng nhập
          </label>
          {error && <div className="rounded-[10px] border border-error/20 bg-error-container p-sm text-body-sm text-on-error-container">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-sm inline-flex items-center justify-center gap-xs rounded-full bg-primary px-lg py-md font-button text-button text-on-primary disabled:opacity-60"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(current => current === 'login' ? 'register' : 'login'); setError(''); }}
          className="mt-lg w-full text-center font-button text-button text-primary hover:underline"
        >
          {mode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
        </button>
      </div>
    </div>
  );
}

