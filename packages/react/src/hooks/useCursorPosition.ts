import * as React from 'react';
import useLayoutEffect from 'use-isomorphic-layout-effect';

import type {
  Coords,
  Dimensions,
  ElementProps,
  FloatingContext,
  ReferenceType,
} from '../types';
import {contains} from '../utils/contains';
import {getTarget} from '../utils/getTarget';
import {isMouseLikePointerType} from '../utils/is';
import {useLatestRef} from './utils/useLatestRef';

function createVirtualElement(rect: Coords & Partial<Dimensions>) {
  return {
    getBoundingClientRect() {
      const width = rect.width || 0;
      const height = rect.height || 0;
      return {
        width,
        height,
        x: rect.x,
        y: rect.y,
        top: rect.y,
        right: rect.x + width,
        bottom: rect.y + height,
        left: rect.x,
      };
    },
  };
}

function isMouseBasedEvent(event: Event | undefined): event is MouseEvent {
  return event != null && (event as MouseEvent).clientX != null;
}

export interface Props {
  enabled: boolean;
  axis: 'x' | 'y' | 'both';
  follow: boolean;
  x: number | null;
  y: number | null;
}

/**
 * Positions the floating element relative to the cursor.
 * @see https://floating-ui.com/docs/useCursorPosition
 */
export const useCursorPosition = <RT extends ReferenceType = ReferenceType>(
  {open, refs, dataRef, elements: {floating}}: FloatingContext<RT>,
  {enabled = true, axis = 'both', follow = true, x, y}: Partial<Props> = {}
): ElementProps => {
  const initialRef = React.useRef(false);
  const pointerTypeRef = React.useRef<string | undefined>();
  const initialOpenEventRef = React.useRef<Event | undefined>();

  const openRef = useLatestRef(open);

  const setReference = React.useCallback(
    (x: number, y: number) => {
      if (initialRef.current) return;

      // Prevent setting if the open event was not a mouse-like one
      // (e.g. focus to open, then hover over the reference element).
      // Only apply if the event exists.
      if (
        initialOpenEventRef.current &&
        !isMouseBasedEvent(initialOpenEventRef.current)
      ) {
        return;
      }

      const domRect = refs.domReference.current?.getBoundingClientRect() || {
        top: 0,
        left: 0,
        height: 0,
        width: 0,
      };

      const getVirtualElement = {
        both: () => createVirtualElement({x, y}),
        x: () =>
          createVirtualElement({
            x,
            y: domRect.top,
            width: 0,
            height: domRect.height,
          }),
        y: () =>
          createVirtualElement({
            x: domRect.left,
            y,
            width: domRect.width,
            height: 0,
          }),
      }[axis];

      if (getVirtualElement) {
        refs.setPositionReference(getVirtualElement());
      }
    },
    [refs, axis]
  );

  React.useEffect(() => {
    // If the pointer is a mouse-like pointer, we want to continue following the
    // mouse even if the floating element is transitioning out. On touch
    // devices, this is undesirable because the floating element will move to
    // the dismissal touch point.
    const check = isMouseLikePointerType(pointerTypeRef.current)
      ? floating
      : openRef.current;

    if (!check || !enabled || x != null || y != null) return;

    const win = floating?.ownerDocument.defaultView || window;

    function handleMouseMove(event: MouseEvent) {
      const target = getTarget(event) as Element | null;

      if (!contains(floating, target)) {
        setReference(event.clientX, event.clientY);
      } else {
        win.removeEventListener('mousemove', handleMouseMove);
      }
    }

    if (isMouseBasedEvent(dataRef.current.openEvent)) {
      win.addEventListener('mousemove', handleMouseMove);
      return () => {
        win.removeEventListener('mousemove', handleMouseMove);
      };
    }

    refs.setPositionReference(refs.domReference.current);
  }, [enabled, refs, dataRef, openRef, floating, axis, setReference, x, y]);

  React.useEffect(() => {
    if (!enabled) return;

    if (!floating) {
      initialRef.current = false;
    }
  }, [enabled, floating]);

  React.useEffect(() => {
    if (!enabled) return;

    if (open && !follow) {
      initialRef.current = true;
    }
  }, [enabled, open, follow]);

  useLayoutEffect(() => {
    if (!enabled) return;
    initialOpenEventRef.current = open ? dataRef.current.openEvent : undefined;
  }, [enabled, open, dataRef]);

  useLayoutEffect(() => {
    if (!enabled) return;

    if (x != null && y != null) {
      initialRef.current = false;
      setReference(x, y);
    }
  }, [enabled, x, y, setReference]);

  return React.useMemo(() => {
    if (!enabled) return {};

    function setPointerTypeRef({pointerType}: React.PointerEvent) {
      pointerTypeRef.current = pointerType;
    }

    return {
      reference: {
        onPointerDown: setPointerTypeRef,
        onPointerEnter: setPointerTypeRef,
        onMouseMove({clientX, clientY}) {
          if (!open) {
            setReference(clientX, clientY);
          }
        },
        onMouseEnter({clientX, clientY}) {
          if (!open) {
            setReference(clientX, clientY);
          }
        },
      },
    };
  }, [enabled, open, setReference]);
};
