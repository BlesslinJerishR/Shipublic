import styles from './Card.module.css';

export function Card({
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
