import React, { useState, cloneElement, type ReactNode, type ReactElement } from 'react';
import styles from './ContextMenu.module.css';

interface ContextMenuProps {
  trigger: ReactElement<{ onClick?: React.MouseEventHandler }>;
  children: ReactNode;
  /** Если true — меню отображается по центру экрана с затемнённым фоном. */
  centered?: boolean;
}

export function ContextMenu({ trigger, children, centered = false }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const handleOpen = (e: React.MouseEvent) => {
    trigger.props.onClick?.(e);
    setPos({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  };

  const close = () => setIsOpen(false);

  return (
    <>
      {cloneElement(trigger, { onClick: handleOpen })}

      {isOpen && (
        <>
          <div
            className={`${styles.overlay} ${centered ? styles.overlayDimmed : ''}`}
            onClick={close}
          />
          <div
            className={centered ? styles.menuCentered : styles.menu}
            style={centered ? undefined : { top: pos.y, left: pos.x }}
          >
            {children}
          </div>
        </>
      )}
    </>
  );
}
