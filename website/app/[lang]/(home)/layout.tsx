import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import styles from '@/components/landings/industrial-theme.module.css';

export default function Layout({ children }: LayoutProps<'/'>) {
  return <div className={styles.overview}><HomeLayout {...baseOptions()}>{children}</HomeLayout></div>;
}
