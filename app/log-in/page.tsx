import AuthPage from "../auth-page";

export const metadata = { title: "Log in · StreamAds" };

export default function LogIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AuthPage mode="login" searchParams={searchParams} />;
}
