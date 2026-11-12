import type { AppContext } from '../../../../services/core-api/src/context.ts';
import type { ViewMode } from '../ui.ts';

export interface PageCtx {
  ctx: AppContext;
  csrf: string;
  mode: ViewMode;
  path: string;
  flash?: string;
}

export function modeFrom(query: URLSearchParams): ViewMode {
  return query.get('modus') === 'test' ? 'test' : 'live';
}
