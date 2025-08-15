'use client';
export default function AuthDebug() {
  const cid = process.env.NEXT_PUBLIC_CIAM_CLIENT_ID ?? '';
  const auth = process.env.NEXT_PUBLIC_CIAM_AUTHORITY ?? '';
  const domain = process.env.NEXT_PUBLIC_CIAM_DOMAIN ?? '';
  return (
    <div style={{ fontSize: 12, opacity: 0.7 }}>
      <div>ClientId: {cid ? cid.slice(0,8) + '…' + cid.slice(-6) : '(missing)'}</div>
      <div>Authority host: {auth.split('/')[2] || '(missing)'}</div>
      <div>Known authority: {domain || '(missing)'}</div>
    </div>
  );
}
