/**
 * Automation logic shared by backend/api and backend/worker.
 *
 * These two are separate deployables with no import path between their src/
 * trees, which is why the pre-existing action-handler registry is duplicated
 * on both sides (see action-handler.ts's header comment). A workspace package
 * is the one place both CAN reach — so everything here is deliberately pure:
 * metadata, predicates and arithmetic, no Prisma client, no queue, no env.
 * The side-effecting halves stay where they belong on each side.
 */

export * from './entity-registry';
export * from './conditions';
export * from './schedule';
export * from './actions';
