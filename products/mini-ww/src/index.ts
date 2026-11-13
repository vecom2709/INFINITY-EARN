/** Mini-Warenwirtschaft – öffentliche Fachschnittstelle (Pilot P1: Domänenschicht). */
export * from './model.ts';
export { DomainError, computeTotals, formatMoney, type Ctx } from './core.ts';
export * from './inventory.ts';
export * from './sales.ts';
export * from './billing.ts';
export * from './settings.ts';
export * from './reports.ts';
export * from './io.ts';
