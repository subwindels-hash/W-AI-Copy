import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";

export function NotFoundPage() {
  return (
    <div className="app-min-screen grid place-items-center p-6 text-center">
      <div>
        <div className="text-[96px] font-black bg-gradient-to-br from-azure to-violet bg-clip-text text-transparent leading-none">404</div>
        <h1 className="text-2xl font-semibold text-text-bright mt-2">Page not found</h1>
        <p className="text-text-muted mt-2 max-w-sm">This module hasn't been built yet — follow the session order and it will arrive here.</p>
        <Link to="/" className="inline-block mt-6">
          <Button>Go home</Button>
        </Link>
      </div>
    </div>
  );
}
