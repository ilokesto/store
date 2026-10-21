import {
  store,
  storeReleased,
} from 'collections/server';
import { toFumadocsSource } from 'fumadocs-mdx/runtime/server';
import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import type { Node, Root } from 'fumadocs-core/page-tree';
import { i18n } from '@/lib/i18n';
import { docsContentRoute, docsImageRoute, docsRoute } from './shared';
import { isDevelopmentDocs } from './publication';
import { rewriteMarkdownLinks } from './docs-links';

const packageCollections = {
  store: storeReleased,
};

const developmentCollections = { store };
type Collection = (typeof packageCollections)[keyof typeof packageCollections]
  | (typeof developmentCollections)[keyof typeof developmentCollections];

function createSource(collections: readonly (readonly [string, Collection])[]) {
  const docs = collections.flatMap(([prefix, collection]) =>
    collection.docs.map(doc => ({
      ...doc,
      info: { ...doc.info, path: `${prefix}/${doc.info.path}` },
    })),
  );
  const meta = collections.flatMap(([prefix, collection]) =>
    collection.meta.map(entry => ({
      ...entry,
      info: { ...entry.info, path: `${prefix}/${entry.info.path}` },
    })),
  );
  return loader({
    baseUrl: docsRoute,
    source: toFumadocsSource(docs, meta),
    i18n,
    plugins: [lucideIconsPlugin()],
  });
}

const publicCollections = Object.entries(packageCollections);
const nextCollections = Object.entries(developmentCollections)
  .map(([name, collection]) => [`${name}/next`, collection] as const);

export const publicSource = createSource(publicCollections);
export const developmentSource = createSource(nextCollections);
export const source = createSource([...publicCollections, ...nextCollections]);

const koreanSidebarLabels: Record<string, string> = {
  'Getting Started': '시작하기',
  Introduction: '소개',
  Reference: '레퍼런스',
  Guides: '가이드',
  Integrations: '통합',
  Advanced: '고급',
  Middleware: '미들웨어',
  Utility: '유틸리티',
  Entrypoints: '엔트리포인트',
  Bodies: '요청 본문',
  'Grouped request': '그룹 요청',
  'Path and query': '경로와 쿼리',
  'Runtime context': '런타임 컨텍스트',
  'Shortcut methods': '단축 메서드',
  Types: '타입',
  'Error handling': '오류 처리',
  'Generated OpenAPI types': '생성된 OpenAPI 타입',
  'ky hooks': 'ky 훅',
  'Uploads and forms': '업로드와 폼',
  'Response inference': '응답 추론',
  Migration: '마이그레이션',
  'Quick start': '빠른 시작',
  'Core concepts': '핵심 개념',
  'Mental model': '핵심 개념',
  'Practical guide': '실전 가이드',
  'API reference': 'API 레퍼런스',
  'CreateForm': 'CreateForm',
  'Field paths and values': '필드 경로와 값',
  'Field state and errors': '필드 상태와 오류',
  Validation: '검증',
  'Submit and reset': '제출과 초기화',
  Arrays: '배열',
  'Adapter useForm': '어댑터 useForm',
  'Build a login form': '로그인 폼 만들기',
  'Validation flow': '검증 흐름',
  'Nested fields': '중첩 필드',
  'Array fields': '배열 필드',
  'Submit handling': '제출 처리',
  React: 'React',
  Vue: 'Vue',
  Solid: 'Solid',
  Svelte: 'Svelte',
  'Standard Schema': 'Standard Schema',
  'Path semantics': '경로 의미',
  'Array rebasing': '배열 재배치',
  'Normalized store': '정규화 저장소',
  'OverlayProvider': 'OverlayProvider',
  'OverlayHost': 'OverlayHost',
  'createOverlayStore': 'createOverlayStore',
  'useOverlay': 'useOverlay',
  'useOverlayItems': 'useOverlayItems',
  'Adapter contracts': '어댑터 계약',
  'Confirmation dialog': '확인 다이얼로그',
  'Custom adapter': '커스텀 어댑터',
  'Async result flow': '비동기 결과 흐름',
  'Manual lifecycle': '수동 수명 주기',
  'Provider scoping': '프로바이더 범위',
  'Lifecycle model': '수명 주기 모델',
  'Adapter boundaries': '어댑터 경계',
  Troubleshooting: '문제 해결',
};

function translateSidebarName(name: Root['name']) {
  return typeof name === 'string' ? koreanSidebarLabels[name] ?? name : name;
}

function localizeKoreanSidebarNode(node: Node): Node {
  if (node.type === 'folder') {
    return {
      ...node,
      name: translateSidebarName(node.name),
      index: node.index
        ? {
            ...node.index,
            name: translateSidebarName(node.index.name),
          }
        : undefined,
      children: node.children.map(localizeKoreanSidebarNode),
    };
  }

  return {
    ...node,
    name: translateSidebarName(node.name),
  };
}

export function getDocsPageTree(locale: string, next = false): Root {
  const tree = (next ? developmentSource : publicSource).getPageTree(locale);

  if (locale !== 'ko') return tree;

  return {
    ...tree,
    name: translateSidebarName(tree.name),
    fallback: tree.fallback
      ? {
          ...tree.fallback,
          name: translateSidebarName(tree.fallback.name),
          children: tree.fallback.children.map(localizeKoreanSidebarNode),
        }
      : undefined,
    children: tree.children.map(localizeKoreanSidebarNode),
  };
}

export function getPageImage(page: InferPageType<typeof source>) {
  const segments = [page.locale, ...page.slugs, 'image.webp'];

  return {
    segments,
    url: `${docsImageRoute}/${segments.join('/')}`,
  };
}

export function getPageMarkdownUrl(page: InferPageType<typeof source>) {
  const segments = [page.locale, ...page.slugs, 'content.md'];

  return {
    segments,
    url: `${docsContentRoute}/${segments.join('/')}`,
  };
}

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');
  const content = rewriteMarkdownLinks(processed, isDevelopmentDocs(page.slugs), 'store');

  return `# ${page.data.title} (${page.url})

${content}`;
}
