import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import faviconUrl from "@/assets/global-tickets-logo.png?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Slider Studio" },
      { name: "description", content: "Manage, optimise and export slider images for race pages." },
      { name: "author", content: "Global Tickets" },
      { property: "og:title", content: "Slider Studio" },
      { property: "og:description", content: "Manage, optimise and export slider images for race pages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/png",
        href: faviconUrl,
      },
      {
        rel: "apple-touch-icon",
        href: faviconUrl,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Captured at bundle load, before the lazy Supabase client can consume
// (and strip) the recovery hash from the URL.
const ARRIVED_WITH_RECOVERY_LINK =
  typeof window !== "undefined" && window.location.hash.includes("type=recovery");

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Recovery links log the user in via a one-time token. Wherever the
  // redirect lands, force the "set new password" page so the user cannot
  // end up in the app without choosing a new password.
  useEffect(() => {
    if (ARRIVED_WITH_RECOVERY_LINK && window.location.pathname !== "/reset-password") {
      // Keep any remaining hash so the Supabase client can consume the token there.
      window.location.replace(`/reset-password${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (cancelled) return;
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          if (window.location.pathname !== "/reset-password") {
            router.navigate({ to: "/reset-password" });
          }
          return;
        }
        if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      });
      (window as unknown as { __authSub?: { unsubscribe: () => void } }).__authSub = sub.subscription;
    });
    return () => {
      cancelled = true;
      const sub = (window as unknown as { __authSub?: { unsubscribe: () => void } }).__authSub;
      sub?.unsubscribe();
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
