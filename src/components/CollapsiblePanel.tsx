import React, { useState, ReactNode } from 'react';
import styles from './CollapsiblePanel.module.css';

interface CollapsiblePanelProps {
  title: string;
  headerControls?: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
}

export default function CollapsiblePanel({
  title,
  headerControls,
  children,
  defaultCollapsed = false,
}: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}>
      <div className={styles.header} onClick={() => setCollapsed(!collapsed)}>
        <div className={`${styles.arrow} ${collapsed ? '' : styles.expanded}`}>
          &#9664;
        </div>
        <span className={styles.title}>{title}</span>
        {headerControls && (
          <div
            className={styles.headerControls}
            onClick={(e) => e.stopPropagation()}
          >
            {headerControls}
          </div>
        )}
      </div>
      {!collapsed && <div className={styles.body}>{children}</div>}
    </div>
  );
}
