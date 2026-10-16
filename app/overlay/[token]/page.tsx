import Overlay from "./Overlay";

export default async function OverlayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <style>{"html,body{background:transparent!important;margin:0;overflow:hidden}"}</style>
      <Overlay token={token} />
    </>
  );
}
