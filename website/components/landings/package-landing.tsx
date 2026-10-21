import { PackageDemo } from '../demos/package-demo';
import type { LandingPackage } from './landing-packages';
import { LandingShell } from './landing-shell';
import styles from './store-landing.module.css';

export function PackageLanding({ info, lang }: {
  readonly info: LandingPackage;
  readonly lang: 'en' | 'ko';
}) {
  return (
    <LandingShell info={info} lang={lang}>
      <div className={styles.packageWorkspace} id={`${info.name}-demo`}>
        <PackageDemo name={info.name} lang={lang} />
      </div>
    </LandingShell>
  );
}
