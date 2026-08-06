import { PageHeader } from '@/components/ui';
import { DocsViewer } from '@/components/DocsViewer';
import { loadDocs } from '@/lib/docs';

/**
 * Docs — renders markdown from the repo /docs folder at build time.
 * Contract addresses are auto-generated from config/chains.ts (see lib/docs.ts).
 * This is a server component; loadDocs() runs during `next build` and the
 * rendered content is baked into the static export.
 */
export const dynamic = 'force-static';

export default function DocsPage() {
  const docs = loadDocs();

  return (
    <>
      <PageHeader
        eyebrow="Docs"
        title="Read the"
        emphasis="floor."
        lede="Overview, network, contract addresses, module guides, ABI quick-ref and legal. Addresses are generated from the deployment config."
      />
      <section className="shell py-10">
        <DocsViewer docs={docs} />
      </section>
    </>
  );
}
