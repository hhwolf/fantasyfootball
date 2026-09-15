import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

export function NotConfigured() {
  return (
    <Alert>
      <AlertTitle>Connect your ESPN league</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>Enter your league ID (and cookies for a private league) to get started.</span>
        <Link href="/settings" className={buttonVariants({ size: "sm", className: "w-fit" })}>
          Open settings
        </Link>
      </AlertDescription>
    </Alert>
  );
}

export function StaleBanner({ fetchedAt, error }: { fetchedAt: string; error?: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Showing cached data</AlertTitle>
      <AlertDescription>
        ESPN could not be reached ({error ?? "unknown error"}). Last successful fetch: {new Date(fetchedAt).toLocaleString()}.{" "}
        {/auth|denied|403|401/i.test(error ?? "") && (
          <Link href="/settings" className="underline">
            Re-paste your cookies in settings.
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function NeedsDb({ what }: { what: string }) {
  return (
    <Alert>
      <AlertTitle>Database required</AlertTitle>
      <AlertDescription>{what} needs a Postgres database. Set DATABASE_URL and run `pnpm db:push`.</AlertDescription>
    </Alert>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  const auth = /auth|denied|403|401/i.test(msg);
  return (
    <Alert variant="destructive">
      <AlertTitle>{auth ? "ESPN denied access" : "Something went wrong"}</AlertTitle>
      <AlertDescription>
        {msg}{" "}
        {auth && (
          <Link href="/settings" className="underline">
            Update your league cookies.
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}
