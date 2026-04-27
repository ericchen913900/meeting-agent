import { useEffect, useState } from "react";

export function useLocalStorageState<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readStorage(localStorage, key, initialValue));

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

export function useSessionStorageState<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => readStorage(sessionStorage, key, initialValue));

  useEffect(() => {
    sessionStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function readStorage<T>(storage: Storage, key: string, initialValue: T): T {
  const raw = storage.getItem(key);
  if (!raw) return initialValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return initialValue;
  }
}
