import { docs } from '@/.source';
import { loader } from 'fumadocs-core/source';

const mdxSource = docs.toFumadocsSource();

const resolved = typeof mdxSource.files === 'function'
  ? { files: (mdxSource.files as () => any[])() }
  : mdxSource;

export const source = loader({
  baseUrl: '/docs',
  source: resolved,
});
