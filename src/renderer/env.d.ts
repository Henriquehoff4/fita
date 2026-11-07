import type { FitaApi } from '../shared/types';

declare global {
  interface Window {
    fita: FitaApi;
  }
}

export {};
