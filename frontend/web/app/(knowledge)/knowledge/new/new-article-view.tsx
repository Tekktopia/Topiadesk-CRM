'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@topiadesk/ui';
import { PageHeader } from '../../_components/page-header';
import { buildCategoryTree, categoryLabel } from '../../_lib/category-tree';
import { markdownToHtml } from '../../_lib/markdown-preview';
import { useCreateKnowledgeArticle, useKnowledgeCategories } from '../../_lib/queries';
import type { KnowledgeArticleVisibility } from '../../_lib/types';

const NONE = '__none__';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function NewArticleView() {
  const router = useRouter();
  const categoriesQuery = useKnowledgeCategories();
  const categoryRows = useMemo(() => buildCategoryTree(categoriesQuery.data ?? []), [categoriesQuery.data]);
  const createMutation = useCreateKnowledgeArticle();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState(NONE);
  const [visibility, setVisibility] = useState<KnowledgeArticleVisibility>('INTERNAL');
  const [bodyMarkdown, setBodyMarkdown] = useState('');
  const previewHtml = useMemo(() => markdownToHtml(bodyMarkdown), [bodyMarkdown]);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate(
      {
        title,
        slug,
        categoryId: categoryId === NONE ? undefined : categoryId,
        visibility,
        bodyMarkdown,
      },
      { onSuccess: (article) => router.push(`/knowledge/${article.id}`) },
    );
  }

  const canSubmit = title.trim().length > 0 && slug.trim().length > 0 && bodyMarkdown.trim().length > 0 && !createMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New article"
        description="Creates a DRAFT article with its first content version. Title, slug, and category can't be changed after creation."
        actions={
          <Button variant="outline" asChild>
            <Link href="/knowledge">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Knowledge Base
            </Link>
          </Button>
        }
      />

      <form className="space-y-6" onSubmit={handleSubmit}>
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="article-title">Title</Label>
              <Input id="article-title" value={title} onChange={(e) => handleTitleChange(e.target.value)} required minLength={1} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="article-slug">Slug</Label>
              <Input
                id="article-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                required
                minLength={1}
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorized</SelectItem>
                  {categoryRows.map((row) => (
                    <SelectItem key={row.category.id} value={row.category.id}>
                      {categoryLabel(row)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as KnowledgeArticleVisibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTERNAL">Internal only</SelectItem>
                  <SelectItem value="CUSTOMER">Customer-visible</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <Label>Content (Markdown)</Label>
            <Tabs defaultValue="edit">
              <TabsList>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="edit" className="pt-3">
                <textarea
                  value={bodyMarkdown}
                  onChange={(e) => setBodyMarkdown(e.target.value)}
                  rows={16}
                  placeholder="# Article title&#10;&#10;Write the article body in Markdown…"
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-brand-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
              </TabsContent>
              <TabsContent value="preview" className="pt-3">
                <div
                  className="prose-sm min-h-[24rem] rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-foreground [&_a]:text-primary [&_h1]:mb-2 [&_h1]:mt-4 [&_h2]:mb-2 [&_h2]:mt-4 [&_h3]:mb-1 [&_h3]:mt-3 [&_p]:mb-3"
                  // Preview-only render of markdownToHtml's output, which
                  // HTML-escapes the source before applying any markup — see
                  // _lib/markdown-preview.ts's header comment.
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="text-muted-foreground">Nothing to preview yet.</p>' }}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/knowledge">Cancel</Link>
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {createMutation.isPending ? 'Creating…' : 'Create draft'}
          </Button>
        </div>
      </form>
    </div>
  );
}
