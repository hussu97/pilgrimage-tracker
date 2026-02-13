import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '@/api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-text-main mb-2">Check your email</h1>
        <p className="text-text-muted mb-6">If an account exists, you will receive a reset link. In dev, check the server console for the link.</p>
        <Link to="/login" className="text-primary font-medium">Back to Log In</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-text-main mb-2">Forgot password?</h1>
      <p className="text-text-muted mb-6">Enter your email and we’ll send you a reset link.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 border border-input-border rounded-xl"
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-semibold">
          Send reset link
        </button>
      </form>
      <Link to="/login" className="block mt-6 text-center text-sm text-text-muted">Back to Log In</Link>
    </div>
  );
}
