import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

async function getDefaultWorkspaceSlug(sessionToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.API_URL || 'http://localhost:4000'}/v1/workspaces`,
      {
        headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const workspaces = data.data || [];
    return workspaces.length > 0 ? workspaces[0].slug : null;
  } catch {
    return null;
  }
}

export default async function RootPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('better-auth.session_token')?.value;

  if (!sessionToken) {
    redirect('/login');
  }

  const slug = await getDefaultWorkspaceSlug(sessionToken);

  if (slug) {
    redirect(`/${slug}`);
  }

  // No workspaces yet — send to the dashboard overview or workspace creation
  redirect('/dashboard');
}
