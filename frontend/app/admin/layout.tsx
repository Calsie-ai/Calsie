import type { ReactNode } from "react";
import styles from "./admin.module.css";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className={styles.scope}>{children}</div>;
}
