import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BLOG_POSTS } from "@/lib/blog";
import type { BlogBlock } from "@/lib/blog";

export default function BlogPage() {
  const { slug } = useParams();
  const post = slug ? BLOG_POSTS.find(p => p.slug === slug) : null;
  if (slug && post) return <PostView post={post}/>;
  return (
    <div className="py-16">
      <div className="max-w-4xl mx-auto px-6">
        <h1 className="text-4xl font-bold text-text-bright mb-3">Blog</h1>
        <p className="text-text-muted mb-10">Product updates, engineering deep-dives, and essays on AI workforces.</p>
        <div className="space-y-4">
          {BLOG_POSTS.map(p => (
            <Card key={p.slug}>
              <CardContent className="py-5">
                <div className="flex items-center gap-2 mb-2 text-xs text-text-muted">
                  <time dateTime={p.date}>{new Date(p.date).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}</time>
                  <span>·</span>
                  <span>{p.readingTime}</span>
                  <span className="ml-auto flex gap-1">{p.tags.map(t=><Badge key={t} variant="slate">{t}</Badge>)}</span>
                </div>
                <Link to={`/blog/${p.slug}`} className="block">
                  <h2 className="text-xl font-semibold text-text-bright hover:text-azure transition-colors">{p.title}</h2>
                </Link>
                <p className="text-sm text-text-muted mt-1">{p.excerpt}</p>
                <div className="mt-3"><Link to={`/blog/${p.slug}`}><Button size="sm" variant="outline">Read →</Button></Link></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function PostView({ post }: { post: typeof BLOG_POSTS[0] }) {
  return (
    <div className="py-16">
      <div className="max-w-3xl mx-auto px-6">
        <Link to="/blog" className="text-sm text-azure hover:underline">← Back to blog</Link>
        <h1 className="text-4xl font-bold text-text-bright mt-4">{post.title}</h1>
        <div className="flex items-center gap-3 mt-3 text-sm text-text-muted">
          <span>{post.author}</span><span>·</span>
          <time>{new Date(post.date).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}</time>
          <span>·</span><span>{post.readingTime}</span>
        </div>
        <div className="flex gap-1 mt-3">{post.tags.map(t=><Badge key={t} variant="slate">{t}</Badge>)}</div>
        <div className="mt-8 space-y-5 text-text-main leading-relaxed">
          {post.body.map((b,i)=><Block key={i} b={b}/>)}
        </div>
      </div>
    </div>
  );
}

function Block({b}:{b:BlogBlock}) {
  switch(b.type) {
    case "p": return <p className="text-[15px]">{b.text}</p>;
    case "h2": return <h2 className="text-2xl font-bold text-text-bright pt-4">{b.text}</h2>;
    case "h3": return <h3 className="text-xl font-semibold text-text-bright pt-2">{b.text}</h3>;
    case "ul": return <ul className="list-disc list-inside space-y-1 text-[15px]">{b.items.map((it,i)=><li key={i}>{it}</li>)}</ul>;
    case "quote": return <blockquote className="border-l-4 border-violet pl-4 italic text-text-bright/90">{b.text}{b.cite && <div className="text-xs text-text-muted mt-2 not-italic">— {b.cite}</div>}</blockquote>;
    case "code": return <pre className="bg-black/60 border border-white/10 rounded p-4 overflow-x-auto text-xs font-mono text-slate-200"><code>{b.text}</code></pre>;
  }
}
