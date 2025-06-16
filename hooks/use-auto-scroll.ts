import { useEffect, useRef } from "react";

interface UseAutoScrollOptions {
  dependency: any[];
  behavior?: ScrollBehavior;
  block?: ScrollLogicalPosition;
  inline?: ScrollLogicalPosition;
}

export const useAutoScroll = ({
  dependency,
  behavior = "smooth",
  block = "end",
  inline = "nearest",
}: UseAutoScrollOptions) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (elementRef.current) {
      elementRef.current.scrollIntoView({
        behavior,
        block,
        inline,
      });
    }
  }, dependency);

  return elementRef;
};
