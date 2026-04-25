import { memo } from 'react';
import styles from './Card.module.css';

function CardImpl({
  title,
  action,
  children,
  style,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className={styles.card} style={style}>
      {(title || action) && (
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>{title}</div>
          <div>{action}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export const Card = memo(CardImpl);
