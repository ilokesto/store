export const landingPackages = [
  { name: 'store', title: 'Store', en: 'A little home for your state.', ko: '작은 상태를 담는, 가벼운 시작.' },
] as const;

export type LandingPackage = (typeof landingPackages)[number];

export function getLandingPackage(name: string) {
  return landingPackages.find(item => item.name === name);
}
