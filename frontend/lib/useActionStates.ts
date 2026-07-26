"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createActionController,
  createActionStateMap,
  type ActionController,
  type ActionRunOptions,
  type ActionRunResult,
  type ActionStateMap,
} from "./actionState";

export function useActionStates<Key extends string>(keys: readonly Key[]) {
  const controllerRef = useRef<ActionController<Key> | null>(null);
  if (!controllerRef.current) controllerRef.current = createActionController(keys);
  const controller = controllerRef.current;
  const [states, setStates] = useState<ActionStateMap<Key>>(() => createActionStateMap(keys));

  useEffect(() => {
    const unsubscribe = controller.subscribe(setStates);
    return () => {
      unsubscribe();
      controller.abortAll();
    };
  }, [controller]);

  const runAction = useCallback(function runAction<T>(
    key: Key,
    task: (context: { signal: AbortSignal; requestId: string }) => Promise<T>,
    options?: ActionRunOptions<T>,
  ): Promise<ActionRunResult<T>> {
    return controller.run<T>(key, task, options);
  }, [controller]);

  return {
    abortAction: controller.abort,
    runAction,
    states,
  };
}
