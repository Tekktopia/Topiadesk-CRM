import { ArticleEditorView } from './article-editor-view';

export const metadata = {
  title: 'Article',
};

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArticleEditorView articleId={id} />;
}
