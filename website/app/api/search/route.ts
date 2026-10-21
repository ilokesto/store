import { publicSource as source } from '@/lib/source';
import { flexsearchFromSource } from 'fumadocs-core/search/flexsearch';

export const { GET } = flexsearchFromSource(source, {
  localeMap: {
    ko: 'cjk',
  },
});
