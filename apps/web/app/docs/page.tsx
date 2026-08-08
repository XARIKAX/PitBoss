import { PageHeader, Section } from '@/components/ui';
import { DocsBook } from '@/components/DocsBook';
import { DocsViewer } from '@/components/DocsViewer';
import { loadDocs } from '@/lib/docs';

/**
 * Docs — the designed protocol book (DocsBook: 12 chapters, diagrams, the
 * complete fee schedule) followed by the auto-generated technical reference
 * (repo /docs markdown: network, addresses from deployment config, ABI
 * quick-ref, legal). Static: loadDocs() runs at build time.
 */
export const dynamic = 'force-static';

export default function DocsPage() {
  const docs = loadDocs();

  return (
    <>
      <PageHeader
        eyebrow="The PitBosses Book"
        title="How the floor"
        emphasis="works."
        lede="Twelve short chapters: the collection, the game, the odds, the money loop, and why none of it needs your trust. Ten minutes, no jargon required."
      />
      <section className="shell py-10">
        <DocsBook />
      </section>

      <Section label="Technical reference" title="For" emphasis="builders.">
        <p className="mb-6 max-w-[68ch] text-[13px] text-mute">
          Contract addresses (generated from the deployment config), network parameters, ABI
          quick-reference and legal. The chapters above explain the protocol; these files specify
          it.
        </p>
        <DocsViewer docs={docs} />
      </Section>
    </>
  );
}
