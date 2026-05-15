import type { AccountResource, Resource, Task } from '../types';
import { useResourceStore } from '../stores/useResourceStore';

export function applyResourceTaskCompletion(task: Task): void {
  if (!task.resourceRef) return;

  const resourceStore = useResourceStore.getState();
  const resource = resourceStore.resources[task.resourceRef];
  if (!resource) return;

  resourceStore.setResource({
    ...resource,
    lastCompleted: new Date().toISOString(),
  } as unknown as Resource);

  switch (task.taskType) {
    case 'TRANSACTION_LOG':
      if (resource.type !== 'account') return;

      {
        const accountResource = resource as AccountResource;
        const {
          amount,
          note,
          newBalance,
          linkedAccountId,
          direction,
        } = task.resultFields as Record<string, unknown>;

        void note;

        if (typeof newBalance === 'number') {
          resourceStore.setResource({
            ...accountResource,
            balance: newBalance,
          } as unknown as Resource);
        }

        if (typeof linkedAccountId !== 'string' || linkedAccountId.length === 0) break;
        if (typeof amount !== 'number') return;
        if (direction !== 'deposit' && direction !== 'withdrawal') return;

        const linkedResource = resourceStore.resources[linkedAccountId];
        if (!linkedResource || linkedResource.type !== 'account') return;

        const linkedAccount = linkedResource as AccountResource;
        const linkedCurrentBalance = typeof linkedAccount.balance === 'number' ? linkedAccount.balance : 0;
        const linkedNextBalance = direction === 'deposit'
          ? linkedCurrentBalance + amount
          : linkedCurrentBalance - amount;

        resourceStore.setResource({
          ...linkedAccount,
          balance: linkedNextBalance,
        } as unknown as Resource);
      }
      break;
    case 'CONSUME':
      // TODO: consume side effects (already handled in eventExecution — note only)
      break;
    default:
      // TODO: other task types
      break;
  }

  if (task.attachmentRef?.startsWith('resource-task:') && task.attachmentRef.includes('home-placement')) {
    // TODO: home placement lastCompleted
  }
}
