import { FiltrexType, toFunction } from './index';

export function runFilter(input: string, data: FiltrexType = {}) {
  const fn = toFunction(input);
  return fn(data);
}
