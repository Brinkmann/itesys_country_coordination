import AuthStatus from "@/components/AuthStatus";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <AuthStatus />
    </main>
  );
}
