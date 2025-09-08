import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { setAuth } from '../store';

const API = 'http://localhost:4000';

export default function Login() {
  const [tab, setTab] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const dispatch = useDispatch();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API}/api/auth/${tab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi');
      localStorage.setItem('token', data.token);
      dispatch(setAuth({ user: data.user, token: data.token }));
    } catch (e) {
      setError(e.message);
    }
  };

  const errorId = 'form-error';
  const userErrId = 'username-error';
  const passErrId = 'password-error';
  const hasError = Boolean(error);

  const handleGoogle = () => {
    window.location.href = `${API}/api/auth/oauth/google`;
  };
  const handleGithub = () => {
    window.location.href = `${API}/api/auth/oauth/github`;
  };

  const inputBase =
    'w-full rounded-xl border bg-white border-slate-300 text-text-900 placeholder:text-slate-400 px-4 py-3 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/30';
  const inputError = 'border-red-500 focus:ring-red-300';

  return (
    <div className="min-h-screen bg-surface text-text-900 flex">
      {/* Left: cover image */}
      <aside className="relative hidden md:flex flex-1 items-end overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?q=80&w=2000&auto=format&fit=crop"
            alt="People chatting in a cafe"
            className="w-full h-full object-cover brightness-90 saturate-105"
          />
        </div>
        <div className="relative z-10 w-full p-12 text-white bg-gradient-to-b from-transparent via-black/40 to-black/70">
          <h1 className="font-extrabold tracking-tight text-[clamp(28px,4vw,40px)]">Chát Chít</h1>
          <p className="text-white/90 text-[clamp(14px,2vw,16px)]">Kết nối tức thì. Trò chuyện an toàn.</p>
        </div>
      </aside>

      {/* Right: form */}
      <main className="flex-1 min-h-screen flex items-center justify-center p-8">
        <div className="w-[min(460px,92vw)] rounded-2xl border border-slate-200 bg-white shadow-xl px-7 py-6 animate-[fade-in_0.35s_ease-out]">
          <h2 className="text-2xl font-extrabold mb-1">{tab === 'login' ? 'Đăng nhập' : 'Đăng ký'}</h2>
          <p className="mb-4 text-sm text-text-900">
            {tab === 'login' ? (
              <>
                Chưa có tài khoản?{' '}
                <button
                  type="button"
                  className="text-primary-500 font-bold hover:underline px-0"
                  onClick={() => setTab('register')}
                >
                  Đăng ký ngay
                </button>
              </>
            ) : (
              <>
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  className="text-primary-500 font-bold hover:underline px-0"
                  onClick={() => setTab('login')}
                >
                  Đăng nhập
                </button>
              </>
            )}
          </p>

          {/* Social login */}
          <div className="flex flex-col gap-2 mb-2">
            <button
              type="button"
              onClick={handleGoogle}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-800 font-bold hover:-translate-y-[1px] active:translate-y-0 transition shadow-sm"
            >
              <svg aria-hidden="true" viewBox="0 0 48 48" className="h-4 w-4 fill-current">
                <path d="M44.5 20H24v8.5h11.9C34.9 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6-6C34.3 5 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.4 0 20-7.5 20-21 0-1.3-.1-2.2-.5-4z" />
              </svg>
              Tiếp tục với Google
            </button>

            <button
              type="button"
              onClick={handleGithub}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-50 font-bold hover:-translate-y-[1px] active:translate-y-0 transition shadow"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <path d="M12 .5A12 12 0 0 0 0 12.7c0 5.4 3.4 10 8 11.6.6.1.8-.3.8-.6v-2c-3.3.8-4-1.5-4-1.5-.6-1.5-1.4-2-1.4-2-1.2-.9.1-.9.1-.9 1.3.1 2 .9 2 .9 1.1 2 2.8 1.5 3.5 1.1.1-.8.5-1.5.8-1.8-2.7-.3-5.6-1.4-5.6-6.3 0-1.4.5-2.6 1.3-3.5-.1-.3-.6-1.7.1-3.5 0 0 1.1-.4 3.6 1.3a12.1 12.1 0 0 1 6.6 0C18 3.7 19.1 4 19.1 4c.7 1.8.2 3.2.1 3.5.8.9 1.3 2.1 1.3 3.5 0 5-2.9 6-5.6 6.3.5.4.9 1.2.9 2.4v3.6c0 .3.2.7.8.6A12.2 12.2 0 0 0 24 12.7 12 12 0 0 0 12 .5Z" />
              </svg>
              Tiếp tục với GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 text-text-900 text-xs my-2">
            <hr className="flex-1 border-slate-200" />
            <span className="color-appbg-950">hoặc</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          {/* Form */}
          <form onSubmit={submit} noValidate className="flex flex-col gap-3 mt-1" aria-describedby={error ? errorId : undefined}>
            <div className="flex flex-col gap-2">
              <label htmlFor="username" className="text-sm font-bold color-accent-500 text-body">
                Tên đăng nhập
              </label>
              <input
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tên đăng nhập"
                required
                aria-required="true"
                aria-invalid={hasError ? 'true' : 'false'}
                aria-errormessage={hasError ? userErrId : undefined}
                className={`${inputBase} ${hasError ? inputError : ''}`}
              />
              {hasError && <p id={userErrId} className="text-xs text-red-600" aria-live="polite"></p>}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-sm font-bold color-accent-500 text-body">
                Mật khẩu
              </label>
              <input
                id="password"
                type="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                aria-required="true"
                aria-invalid={hasError ? 'true' : 'false'}
                aria-errormessage={hasError ? passErrId : undefined}
                className={`${inputBase} ${hasError ? inputError : ''}`}
              />
              {hasError && <p id={passErrId} className="text-xs text-red-600" aria-live="polite"></p>}
            </div>

            <div id={errorId} className="min-h-5 text-sm text-red-600" aria-live="polite">
              {error ? error : null}
            </div>

            <button
              type="submit"
              className="text-button-size mt-1 w-full rounded-xl bg-gradient-to-b from-primary-500 to-primary-600 text-white font-extrabold px-4 py-3 shadow-lg shadow-primary-glow transition hover:saturate-110 hover:-translate-y-[1px] active:translate-y-0"
            >
              {tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
