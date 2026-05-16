import { v4 as uuidv4 } from 'uuid';
import type { AccountResource, Resource, Task } from '../types';
import { useResourceStore } from '../stores/useResourceStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import { getAppDate } from '../utils/dateUtils';

function applyAccountTransactionLogSideEffects(
  resourceStore: ReturnType<typeof useResourceStore.getState>,
  resource: AccountResource,
  task: Task,
): void {
  const scheduleStore = useScheduleStore.getState();
  const {
    amount,
    note,
    newBalance,
    linkedAccountId,
  } = task.resultFields as Record<string, unknown>;

  void note;

  if (typeof amount !== 'number') return;

  const formattedAmount = `$${amount.toFixed(2)}`;
  let primaryValue = formattedAmount;
  let primaryNote = formattedAmount;

  if (resource.kind === 'debt') {
    const monthlyRate = (resource.debtRate ?? 0) / 12 / 100;
    const interestPortion = (resource.balance ?? 0) * monthlyRate;
    const principalPortion = Math.max(0, amount - interestPortion);
    const debtNextBalance = Math.max(0, (resource.balance ?? 0) - principalPortion);
    const debtNote = `$${amount.toFixed(2)} paid · Principal: $${principalPortion.toFixed(2)} · Interest: $${interestPortion.toFixed(2)}`;

    resourceStore.setResource({
      ...resource,
      balance: debtNextBalance,
    } as unknown as Resource);

    primaryValue = debtNote;
    primaryNote = debtNote;
  } else if (typeof newBalance === 'number') {
    resourceStore.setResource({
      ...resource,
      balance: newBalance,
    } as unknown as Resource);
  }

  if (typeof linkedAccountId !== 'string' || linkedAccountId.length === 0) {
    scheduleStore.setTask({
      ...task,
      resultFields: ({
        ...task.resultFields,
        value: primaryValue,
        note: primaryNote,
      } as unknown) as Task['resultFields'],
    });
    return;
  }

  const linkedDirection = resource.kind === 'income' ? 'deposit' : 'withdrawal';
  const linkedResource = resourceStore.resources[linkedAccountId];
  if (!linkedResource || linkedResource.type !== 'account') {
    scheduleStore.setTask({
      ...task,
      resultFields: ({
        ...task.resultFields,
        value: primaryValue,
        note: primaryNote,
      } as unknown) as Task['resultFields'],
    });
    return;
  }

  const linkedAccount = linkedResource as AccountResource;
  const linkedCurrentBalance = typeof linkedAccount.balance === 'number' ? linkedAccount.balance : 0;
  const linkedNextBalance = linkedDirection === 'deposit'
    ? linkedCurrentBalance + amount
    : linkedCurrentBalance - amount;

  resourceStore.setResource({
    ...linkedAccount,
    balance: linkedNextBalance,
  } as unknown as Resource);

  scheduleStore.setTask({
    ...task,
    resultFields: ({
      ...task.resultFields,
      value: primaryValue,
      note: primaryNote,
      direction: linkedDirection,
      linkedAccountName: linkedAccount.name,
      linkedAccountIcon: linkedAccount.icon,
    } as unknown) as Task['resultFields'],
  });

  const linkedTransactionLogTask = linkedAccount.accountTasks?.find((accountTask) => accountTask.kind === 'transaction-log');
  if (!linkedTransactionLogTask) return;

  const sourceLabel = resource.name ?? 'account';
  const linkedNote = linkedDirection === 'deposit'
    ? `$${amount.toFixed(2)} deposited from ${sourceLabel}`
    : `$${amount.toFixed(2)} withdrawn for ${sourceLabel}`;

  const linkedCompletionTask: Task = {
    id: uuidv4(),
    templateRef: null,
    isUnique: true,
    title: linkedTransactionLogTask.name,
    icon: linkedTransactionLogTask.icon ?? linkedAccount.icon,
    taskType: linkedTransactionLogTask.taskType ?? 'TEXT',
    completionState: 'complete',
    completedAt: new Date().toISOString(),
    resultFields: ({
      resourceTaskId: `resource-task:${linkedAccount.id}:account-task:${linkedTransactionLogTask.id}`,
      amount,
      note: linkedNote,
      value: linkedNote,
      newBalance: linkedNextBalance,
    } as unknown) as Task['resultFields'],
    attachmentRef: null,
    resourceRef: linkedAccount.id,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };

  scheduleStore.setTask(linkedCompletionTask);

  const today = getAppDate();
  const qaId = `qa-${today}`;
  const qa = scheduleStore.activeEvents[qaId] as typeof scheduleStore.activeEvents[string] & { completions: { taskRef: string; completedAt: string }[] } | undefined;
  if (qa) {
    scheduleStore.setActiveEvent({
      ...qa,
      completions: [
        ...qa.completions,
        { taskRef: linkedCompletionTask.id, completedAt: new Date().toISOString() },
      ],
    });
  }
}

export function reverseAccountTransactionSideEffects(task: Task): void {
  if (!task.resourceRef) return;
  const resourceStore = useResourceStore.getState();
  const scheduleStore = useScheduleStore.getState();
  const resource = resourceStore.resources[task.resourceRef];
  if (!resource || resource.type !== 'account') return;

  const rf = task.resultFields as Record<string, unknown>;
  const amount = typeof rf.amount === 'number' ? rf.amount : null;
  if (amount === null) return;

  const accountResource = resource as AccountResource;
  const direction = typeof rf.direction === 'string' ? rf.direction : null;

  if (typeof accountResource.balance === 'number') {
    const reversedBalance = direction === 'deposit'
      ? accountResource.balance - amount
      : accountResource.balance + amount;
    resourceStore.setResource({
      ...accountResource,
      balance: reversedBalance,
    } as unknown as Resource);
  }

  const linkedAccountId = typeof rf.linkedAccountId === 'string' ? rf.linkedAccountId : null;
  if (linkedAccountId) {
    const linkedResource = resourceStore.resources[linkedAccountId];
    if (linkedResource && linkedResource.type === 'account') {
      const linkedAccount = linkedResource as AccountResource;
      if (typeof linkedAccount.balance === 'number') {
        const linkedReversedBalance = direction === 'deposit'
          ? linkedAccount.balance - amount
          : linkedAccount.balance + amount;
        resourceStore.setResource({
          ...linkedAccount,
          balance: linkedReversedBalance,
        } as unknown as Resource);
      }
    }
  }

  const resourceTaskId = typeof rf.resourceTaskId === 'string' ? rf.resourceTaskId : null;
  if (!resourceTaskId) return;

  Object.values(scheduleStore.tasks).forEach((t) => {
    if (
      t.completionState === 'complete' &&
      t.id !== task.id &&
      (t.resultFields as Record<string, unknown>)?.resourceTaskId === resourceTaskId
    ) {
      scheduleStore.removeTask(t.id);
    }
  });

  if (linkedAccountId) {
    Object.values(scheduleStore.tasks).forEach((t) => {
      if (
        t.completionState === 'complete' &&
        t.resourceRef === linkedAccountId &&
        (t.resultFields as Record<string, unknown>)?.amount === rf.amount
      ) {
        scheduleStore.removeTask(t.id);
      }
    });
  }
}

export function applyResourceTaskCompletion(task: Task): void {
  if (!task.resourceRef) return;

  const resourceStore = useResourceStore.getState();
  const resource = resourceStore.resources[task.resourceRef];
  if (!resource) return;

  resourceStore.setResource({
    ...resource,
    lastCompleted: new Date().toISOString(),
  } as unknown as Resource);

  if (
    resource.type === 'account' &&
    typeof (task.resultFields as Record<string, unknown>)?.amount === 'number'
  ) {
    applyAccountTransactionLogSideEffects(resourceStore, resource as AccountResource, task);
  }

  switch (task.taskType) {
    case 'TRANSACTION_LOG':
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
