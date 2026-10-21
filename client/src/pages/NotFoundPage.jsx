import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <p className="text-5xl font-semibold text-slate-300">404</p>
      <h1 className="mt-2 text-lg font-semibold">Page not found</h1>
      <Link to="/dashboard" className="btn-primary mt-4">
        Back to dashboard
      </Link>
    </div>
  );
}
