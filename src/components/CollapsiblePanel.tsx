import React, { useState, ReactNode } from 'react';
import styles from './CollapsiblePanel.module.css';
import { buttonA11yProps } from '../utils/a11y';

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
  const toggleCollapsed = () => setCollapsed(!collapsed);

  return (
    <div className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}>
      <div
        className={styles.header}
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        {...buttonA11yProps(toggleCollapsed, { label: `${title} section` })}
      >
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
