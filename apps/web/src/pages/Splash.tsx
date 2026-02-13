import { Link } from 'react-router-dom';

export default function Splash() {
  return (
    <div className="flex flex-col min-h-[70vh] justify-center items-center px-8">
      <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <span className="material-symbols-outlined text-4xl text-primary">explore</span>
      </div>
      <h1 className="text-3xl font-bold text-text-main mb-2">Pilgrimage Tracker</h1>
      <p className="text-text-muted text-center mb-10">Discover, Visit, and Track Sacred Spaces</p>
      <Link
        to="/register"
        className="w-full max-w-sm bg-primary hover:bg-primary-hover text-white font-semibold py-4 px-6 rounded-xl text-center"
      >
        Get Started
      </Link>
      <Link to="/login" className="mt-6 text-sm text-text-muted hover:text-primary">
        Have an account? Sign In
      </Link>
    </div>
  );
}
