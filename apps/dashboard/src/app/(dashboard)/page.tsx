import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

async function getWorkspaces() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('better-auth.session_token')?.value;
  if (!sessionToken) redirect('/login');

  try {
    const res = await fetch(
      `${process.env.API_URL || 'http://localhost:4000'}/v1/workspaces`,
      {
        headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const workspaces = await getWorkspaces();

  if (workspaces.length === 0) {
    redirect('/create-workspace');
  }

  redirect(`/${workspaces[0].slug}`);
}
