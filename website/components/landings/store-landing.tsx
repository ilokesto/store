'use client';

import { StoreDemo } from '../demos/store-demo';
import { LandingShell } from './landing-shell';
import { landingPackages } from './landing-packages';
import styles from './store-landing.module.css';

export function StoreLanding({ lang }: { readonly lang: 'en' | 'ko' }) {
  return (
    <LandingShell info={landingPackages[0]} lang={lang}>
      <div className={styles.packageWorkspace} id="store-demo" data-demo-slot="store">
        <StoreDemo lang={lang} />
      </div>
    </LandingShell>
  );
}
