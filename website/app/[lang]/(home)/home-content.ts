import { Blocks } from 'lucide-react';

export type Locale = 'en' | 'ko';
export type PackageName = 'store';

export type PackageCard = {
  readonly pkg: PackageName;
  readonly descriptions: Record<Locale, string>;
  readonly support: Record<Locale, string>;
};

export const packageCards: readonly PackageCard[] = [
  {
    pkg: 'store',
    descriptions: {
      en: 'A small framework-neutral state container with synchronous reads and selector subscriptions.',
      ko: '동기식 읽기와 선택 구독을 제공하는 작은 프레임워크 독립 상태 컨테이너.',
    },
    support: { en: 'Framework-neutral', ko: '프레임워크 독립' },
  },
];

export const packageGroups = [
  { id: 'store', packages: ['store'], icon: Blocks },
] as const;

export const homeCopy = {
  en: {
    eyebrow: 'Small tools. Explicit contracts.',
    title: 'Keep state updates predictable.',
    subtitle:
      'ilokesto means “toolbox” in Esperanto. Store is a small, framework-neutral foundation for state, subscriptions, and middleware.',
    browse: 'Explore Store',
    support: 'Support',
    packagesEyebrow: 'The Store toolbox',
    packagesTitle: 'One focused state container.',
    packagesBody:
      'Create a store, read snapshots synchronously, and subscribe to state or selected values.',
    groups: {
      store: {
        title: 'State and subscriptions',
        description: 'A framework-neutral core with explicit synchronous update and notification semantics.',
      },
    },
    packageExplore: 'Explore Store',
    packageQuickStart: 'Quick start',
    chooseEyebrow: 'A clear foundation',
    chooseTitle: 'Keep state changes explicit.',
    choices: [
      {
        question: 'What does Store provide?',
        answer:
          'Store provides synchronous state reads, immutable update snapshots, middleware, and subscriptions. It does not include framework hooks or persistence helpers.',
      },
    ],
  },
  ko: {
    eyebrow: '작은 도구, 명확한 동작',
    title: '예측 가능한 상태 업데이트를 만드세요.',
    subtitle:
      "ilokesto는 에스페란토로 '도구상자'라는 뜻입니다. Store는 상태, 구독, 미들웨어를 위한 작고 프레임워크 독립적인 기반입니다.",
    browse: 'Store 살펴보기',
    support: '지원 환경',
    packagesEyebrow: 'Store 도구상자',
    packagesTitle: '하나의 상태 컨테이너에 집중합니다.',
    packagesBody:
      'Store를 만들고 스냅샷을 동기적으로 읽으며 상태나 선택한 값의 변경을 구독하세요.',
    groups: {
      store: {
        title: '상태와 구독',
        description: '동기식 업데이트와 알림 의미론을 명시하는 프레임워크 독립 코어입니다.',
      },
    },
    packageExplore: 'Store 살펴보기',
    packageQuickStart: '빠른 시작',
    chooseEyebrow: '명확한 기반',
    chooseTitle: '상태 변경을 명시적으로 다루세요.',
    choices: [
      {
        question: 'Store는 무엇을 제공하나요?',
        answer:
          'Store는 동기식 상태 읽기, 불변 업데이트 스냅샷, 미들웨어와 구독을 제공합니다. 프레임워크 훅이나 영속성 도우미는 포함하지 않습니다.',
      },
    ],
  },
} as const;
