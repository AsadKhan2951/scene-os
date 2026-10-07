'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, errorText } from '@/lib/api';
import { Btn, Glass, Input, Note } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/login', { email: form.get('email'), password: form.get('password') });
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Glass className="w-full max-w-sm">
        <Image src="/logo-white.png" alt="Scene OS" width={108} height={80} priority unoptimized />
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">Sign in to Scene OS</h1>
        <form onSubmit={signIn} className="mt-5 flex flex-col gap-3">
          <Input label="Email" name="email" type="email" autoComplete="username" required />
          <Input label="Password" name="password" type="password" autoComplete="current-password" required minLength={8} />
          {error && <Note>{error}</Note>}
          <Btn variant="primary" type="submit" disabled={busy} className="mt-2 w-full">{busy ? 'Signing in…' : 'Sign in'}</Btn>
        </form>
      </Glass>
    </main>
  );
}
