import { requirePortalSession } from '@/lib/portal-auth/session';
import { PortalKnowledgeArticleView } from './knowledge-article-view';

export const metadata = {
  title: 'Help Center — Customer Portal',
};

export default async function PortalKnowledgeArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePortalSession();
  const { slug } = await params;
  return <PortalKnowledgeArticleView slug={slug} />;
}
