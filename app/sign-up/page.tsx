import AuthPage from "../auth-page";

export const metadata = { title: "Sign up · StreamAds" };

export default function SignUp({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AuthPage mode="signup" searchParams={searchParams} />;
}
