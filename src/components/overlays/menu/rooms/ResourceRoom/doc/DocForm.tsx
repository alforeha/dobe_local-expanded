import { useId, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { starterTaskTemplates } from '../../../../../../coach/StarterQuestLibrary';
import { getItemTemplateByRef, itemLibrary } from '../../../../../../coach/ItemLibrary';
import type { Task } from '../../../../../../types/task';
import type { InputFields, TaskTemplate, TaskType } from '../../../../../../types/taskTemplate';
import type {
  AccountResource,
  ContractTask,
  DocContractDepositTemplate,
  DocRecipeIngredient,
  DocRecipeStep,
  DocResource,
  DocType,
} from '../../../../../../types/resource';
import { isContact, isVehicle } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateDocTasks_stub, generateGTDItems } from '../../../../../../engine/resourceEngine';
import { getLibraryTemplatePool, resolveTaskTemplate } from '../../../../../../utils/resolveTaskTemplate';
import { resolveTaskDisplayName } from '../../../../../../utils/resolveTaskDisplayName';
import { getUserInventoryItemTemplates } from '../../../../../../utils/inventoryItems';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { NumberInput } from '../../../../../shared/inputs/NumberInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { IconDisplay } from '../../../../../shared/IconDisplay';

interface DocFormProps {
  existing?: DocResource;
  onSaved: () => void;
  onCancel: () => void;
}

type ContractTaskTab = 'library' | 'new';
type NewContractTaskType = Extract<TaskType, 'CHECK' | 'COUNTER' | 'DURATION' | 'TIMER' | 'RATING' | 'TEXT'>;

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'reference', label: 'Reference' },
  { value: 'manual', label: 'Manual' },
  { value: 'contract', label: 'Contract' },
  { value: 'license', label: 'License' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'course', label: 'Course' },
];

const NEW_TASK_TYPES: Array<{ value: NewContractTaskType; label: string }> = [
  { value: 'CHECK', label: 'Check' },
  { value: 'COUNTER', label: 'Counter' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'TIMER', label: 'Timer' },
  { value: 'RATING', label: 'Rating' },
  { value: 'TEXT', label: 'Text' },
];

const CAMERA_MODULE_SPECIFIER = '@capacitor/camera';

const SELECT_CLS =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:border-purple-500 focus:outline-none disabled:opacity-40';

const SMALL_INPUT_CLS =
  'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlSizeBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function buildContractTaskParameters(taskType: NewContractTaskType, values: {
  counterTarget: number;
  counterUnit: string;
  durationMinutes: number;
  timerSeconds: number;
  ratingScale: number;
  ratingPrompt: string;
  textPrompt: string;
}): Record<string, unknown> {
  switch (taskType) {
    case 'CHECK':
      return { label: 'Done' };
    case 'COUNTER':
      return { target: values.counterTarget, unit: values.counterUnit.trim(), step: 1 };
    case 'DURATION':
      return { targetDuration: values.durationMinutes * 60, unit: 'minutes' };
    case 'TIMER':
      return { countdownFrom: values.timerSeconds };
    case 'RATING':
      return { scale: values.ratingScale, label: values.ratingPrompt.trim() || 'Rate this' };
    case 'TEXT':
      return { prompt: values.textPrompt.trim(), maxLength: null };
  }
}

function normalizeExistingContractTasks(existing?: DocResource): ContractTask[] {
  if (existing?.contractTasks?.length) {
    return existing.contractTasks.map((task) => ({
      ...task,
      parameters: task.parameters ? { ...task.parameters } : undefined,
    }));
  }

  return (existing?.trackedTasks ?? []).map((taskName) => ({
    id: uuidv4(),
    isUnique: true,
    title: taskName,
  }));
}

function contractTaskToDisplayTask(task: ContractTask): Task {
  return {
    id: task.id,
    templateRef: task.isUnique ? null : (task.templateRef ?? null),
    isUnique: task.isUnique,
    title: task.title ?? null,
    taskType: task.taskType ?? null,
    completionState: 'pending',
    completedAt: null,
    resultFields: (task.parameters ?? {}) as Partial<InputFields>,
    attachmentRef: null,
    resourceRef: null,
    location: null,
    sharedWith: null,
    questRef: null,
    actRef: null,
    secondaryTag: null,
  };
}

function getContractTaskDisplayName(
  task: ContractTask,
  templates: Record<string, TaskTemplate>,
): string {
  return resolveTaskDisplayName(contractTaskToDisplayTask(task), templates, starterTaskTemplates);
}

function getContractTaskDisplayType(
  task: ContractTask,
  templates: Record<string, TaskTemplate>,
  libraryTemplates: TaskTemplate[],
): string {
  if (task.isUnique) return task.taskType ?? 'Unique';
  if (!task.templateRef) return task.taskType ?? 'Template';

  return resolveTaskTemplate(task.templateRef, templates, starterTaskTemplates, libraryTemplates)?.taskType
    ?? task.taskType
    ?? 'Template';
}

export function DocForm({ existing, onSaved, onCancel }: DocFormProps) {
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? (resources[existing.id] as typeof existing | undefined) : undefined;

  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);

  const [iconKey, setIconKey] = useState(existing?.icon ?? 'doc');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [docType, setDocType] = useState<DocType>(existing?.docType ?? 'reference');

  const [url, setUrl] = useState(existing?.url ?? '');
  const [manualLinkedRef, setManualLinkedRef] = useState(
    existing?.docType === 'manual' ? (existing?.linkedResourceRef ?? '') : '',
  );

  const [licensePhoto, setLicensePhoto] = useState(existing?.licensePhoto ?? '');
  const [licenseNumber, setLicenseNumber] = useState(existing?.licenseNumber ?? '');
  const [renewalNotes, setRenewalNotes] = useState(existing?.renewalNotes ?? '');
  const [expiryDate, setExpiryDate] = useState(existing?.expiryDate ?? '');
  const [expiryLeadDays, setExpiryLeadDays] = useState<number | ''>(existing?.expiryLeadDays ?? '');
  const [licenseStatusMessage, setLicenseStatusMessage] = useState<string | null>(null);
  const [isPhotoBusy, setIsPhotoBusy] = useState(false);

  const [contractContactIds, setContractContactIds] = useState<string[]>(existing?.linkedContactIds ?? []);
  const [addContactId, setAddContactId] = useState('');
  const [contractAccountId, setContractAccountId] = useState(existing?.linkedAccountId ?? '');
  const [depositName, setDepositName] = useState(existing?.contractDepositTemplate?.name ?? '');
  const [depositValue, setDepositValue] = useState<number | ''>(existing?.contractDepositTemplate?.value ?? '');
  const [contractTasks, setContractTasks] = useState<ContractTask[]>(normalizeExistingContractTasks(existing));
  const [contractTaskTab, setContractTaskTab] = useState<ContractTaskTab>('library');
  const [contractTaskSearch, setContractTaskSearch] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<NewContractTaskType>('CHECK');
  const [counterTarget, setCounterTarget] = useState(10);
  const [counterUnit, setCounterUnit] = useState('count');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [timerSeconds, setTimerSeconds] = useState(300);
  const [ratingScale, setRatingScale] = useState(5);
  const [ratingPrompt, setRatingPrompt] = useState('');
  const [textPrompt, setTextPrompt] = useState('');
  const [contractTaskError, setContractTaskError] = useState('');

  const [ingredients, setIngredients] = useState<{ id: string; itemRef: string; quantity: number | ''; unit: string }[]>(
    existing?.recipeIngredients?.map((ingredient) => ({
      id: ingredient.id,
      itemRef: ingredient.itemRef ?? '',
      quantity: ingredient.quantity ?? '',
      unit: ingredient.unit ?? '',
    })) ?? [],
  );
  const [steps, setSteps] = useState<{ id: string; text: string }[]>(existing?.recipeSteps ?? []);
  const [newStepText, setNewStepText] = useState('');

  const allContacts = Object.values(resources).filter(isContact);
  const allVehicles = Object.values(resources).filter(isVehicle);
  const allAccounts = Object.values(resources).filter((resource): resource is AccountResource => resource.type === 'account');
  const availableContacts = allContacts.filter((contact) => !contractContactIds.includes(contact.id));
  const libraryTemplates = useMemo(() => getLibraryTemplatePool(), []);
  const normalizedSearch = contractTaskSearch.trim().toLowerCase();
  const filteredLibraryTemplates = useMemo(
    () => libraryTemplates.filter((template) => template.name.toLowerCase().includes(normalizedSearch)),
    [libraryTemplates, normalizedSearch],
  );

  const legacyLayoutLinkedResource = existing?.docType === 'layout' && existing.linkedResourceRef
    ? resources[existing.linkedResourceRef]
    : undefined;

  const itemOptions: { id: string; name: string }[] = Array.from(
    new Map([
      ...itemLibrary.map((template) => [template.id, { id: template.id, name: template.name }] as [string, { id: string; name: string }]),
      ...getUserInventoryItemTemplates(user).map((template) => [template.id, { id: template.id, name: template.name }] as [string, { id: string; name: string }]),
    ]).values(),
  ).sort((left, right) => left.name.localeCompare(right.name));

  const canSave = displayName.trim().length > 0;

  function addContact() {
    if (!addContactId || contractContactIds.includes(addContactId)) return;
    setContractContactIds((prev) => [...prev, addContactId]);
    setAddContactId('');
  }

  function removeContact(id: string) {
    setContractContactIds((prev) => prev.filter((contactId) => contactId !== id));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { id: uuidv4(), itemRef: '', quantity: '', unit: '' }]);
  }

  function updateIngredient(id: string, field: 'unit', value: string): void;
  function updateIngredient(id: string, field: 'itemRef', value: string): void;
  function updateIngredient(id: string, field: 'quantity', value: number | ''): void;
  function updateIngredient(id: string, field: string, value: string | number | '') {
    setIngredients((prev) => prev.map((ingredient) => (ingredient.id === id ? { ...ingredient, [field]: value } : ingredient)));
  }

  function addStep() {
    const text = newStepText.trim();
    if (!text) return;
    setSteps((prev) => [...prev, { id: uuidv4(), text }]);
    setNewStepText('');
  }

  function addLibraryContractTask(template: TaskTemplate) {
    if (!template.id) return;
    setContractTasks((prev) => [
      ...prev,
      {
        id: uuidv4(),
        isUnique: false,
        templateRef: template.id,
        taskType: template.taskType,
      },
    ]);
  }

  function addUniqueContractTask() {
    if (!newTaskTitle.trim()) {
      setContractTaskError('Title is required.');
      return;
    }

    setContractTasks((prev) => [
      ...prev,
      {
        id: uuidv4(),
        isUnique: true,
        title: newTaskTitle.trim(),
        taskType: newTaskType,
        parameters: buildContractTaskParameters(newTaskType, {
          counterTarget,
          counterUnit,
          durationMinutes,
          timerSeconds,
          ratingScale,
          ratingPrompt,
          textPrompt,
        }),
      },
    ]);

    setNewTaskTitle('');
    setContractTaskError('');
    setCounterTarget(10);
    setCounterUnit('count');
    setDurationMinutes(30);
    setTimerSeconds(300);
    setRatingScale(5);
    setRatingPrompt('');
    setTextPrompt('');
  }

  function removeContractTask(id: string) {
    setContractTasks((prev) => prev.filter((task) => task.id !== id));
  }

  async function commitLicensePhoto(data: { uri: string; sourceLabel: string }) {
    setLicensePhoto(data.uri);
    setLicenseStatusMessage(`${data.sourceLabel} added.`);
  }

  async function handleWebPhotoChange(eventValue: React.ChangeEvent<HTMLInputElement>) {
    const file = eventValue.target.files?.[0];
    eventValue.target.value = '';
    if (!file) return;

    setIsPhotoBusy(true);
    setLicenseStatusMessage(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      await commitLicensePhoto({ uri: dataUrl, sourceLabel: 'Photo' });
    } catch {
      setLicenseStatusMessage('Unable to load that image.');
    } finally {
      setIsPhotoBusy(false);
    }
  }

  async function handleNativeLicensePhoto(source: 'camera' | 'gallery') {
    if (!isNativePlatform) {
      fileInputRef.current?.click();
      return;
    }

    setIsPhotoBusy(true);
    setLicenseStatusMessage(null);

    try {
      const cameraModule = await import(/* @vite-ignore */ CAMERA_MODULE_SPECIFIER);
      const { Camera, CameraResultType, CameraSource } = cameraModule as {
        Camera: {
          getPhoto: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
        };
        CameraResultType: { DataUrl: string };
        CameraSource: { Camera: string; Photos: string };
      };

      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.DataUrl,
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      });

      const dataUrl = typeof photo.dataUrl === 'string' ? photo.dataUrl : '';
      if (!dataUrl) {
        setLicenseStatusMessage('No image was returned.');
        return;
      }

      estimateDataUrlSizeBytes(dataUrl);
      await commitLicensePhoto({
        uri: dataUrl,
        sourceLabel: source === 'camera' ? 'Camera photo' : 'Gallery photo',
      });
    } catch {
      setLicenseStatusMessage('Camera/gallery is unavailable here. Using photo upload instead.');
      fileInputRef.current?.click();
    } finally {
      setIsPhotoBusy(false);
    }
  }

  function clearLicensePhoto() {
    setLicensePhoto('');
    setLicenseStatusMessage('Photo removed.');
  }

  function handleSave() {
    if (!canSave) return;
    const now = new Date().toISOString();

    const finalIngredients: DocRecipeIngredient[] = ingredients
      .filter((ingredient) => ingredient.itemRef)
      .map((ingredient) => {
        const template = getItemTemplateByRef(ingredient.itemRef) ?? getUserInventoryItemTemplates(user).find((entry) => entry.id === ingredient.itemRef);
        return {
          id: ingredient.id,
          name: template?.name ?? ingredient.itemRef,
          itemRef: ingredient.itemRef,
          quantity: ingredient.quantity !== '' ? ingredient.quantity : undefined,
          unit: ingredient.unit.trim() || undefined,
        };
      });

    const finalSteps: DocRecipeStep[] = steps.filter((step) => step.text.trim());
    const finalDeposit: DocContractDepositTemplate | undefined = depositName.trim()
      ? { name: depositName.trim(), value: depositValue !== '' ? depositValue : undefined }
      : undefined;

    const resource: DocResource = {
      id: existing?.id ?? uuidv4(),
      type: 'doc',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      docType,
      walkthroughType: existing?.walkthroughType,
      courseProgress: existing?.courseProgress ?? null,
      notes: existing?.notes,
      links: currentExisting?.links ?? existing?.links,
      sharedWith: existing?.sharedWith ?? null,
      url: (docType === 'reference' || docType === 'manual') ? (url.trim() || undefined) : undefined,
      licensePhoto: docType === 'license' ? (licensePhoto || undefined) : undefined,
      licenseNumber: docType === 'license' ? (licenseNumber.trim() || undefined) : undefined,
      renewalNotes: docType === 'license' ? (renewalNotes.trim() || undefined) : undefined,
      expiryDate: expiryDate || undefined,
      expiryLeadDays: expiryLeadDays === '' ? undefined : expiryLeadDays,
      linkedResourceRef:
        docType === 'manual' ? (manualLinkedRef || undefined) :
        docType === 'layout' ? existing?.linkedResourceRef : undefined,
      linkedResourceRefs: docType === 'layout' ? existing?.linkedResourceRefs : undefined,
      linkedContactIds: docType === 'contract' && contractContactIds.length > 0 ? contractContactIds : undefined,
      linkedAccountId: docType === 'contract' ? (contractAccountId || undefined) : undefined,
      contractDepositTemplate: docType === 'contract' ? finalDeposit : undefined,
      contractTasks: docType === 'contract' && contractTasks.length > 0 ? contractTasks : undefined,
      trackedTasks: docType === 'layout' ? existing?.trackedTasks : undefined,
      recipeIngredients: docType === 'recipe' && finalIngredients.length > 0 ? finalIngredients : undefined,
      recipeSteps: docType === 'recipe' && finalSteps.length > 0 ? finalSteps : undefined,
      layoutAreas: docType === 'layout' ? existing?.layoutAreas : undefined,
    };

    setResource(resource);

    if (!existing && user) {
      setUser({
        ...user,
        resources: {
          ...user.resources,
          docs: user.resources.docs.includes(resource.id) ? user.resources.docs : [...user.resources.docs, resource.id],
        },
      });
    }

    generateGTDItems(resource);
    generateDocTasks_stub();
    onSaved();
  }

  function renderContractTaskLibrary() {
    if (filteredLibraryTemplates.length === 0) {
      return <p className="text-sm text-gray-500 dark:text-gray-400">No matching library templates.</p>;
    }

    return (
      <div className="flex flex-col gap-2">
        {filteredLibraryTemplates.map((template) => (
          <button
            key={template.id ?? template.name}
            type="button"
            onClick={() => addLibraryContractTask(template)}
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <IconDisplay iconKey={template.icon || 'task'} size={18} className="h-4.5 w-4.5 shrink-0 object-contain" alt="" />
              <span className="truncate font-medium text-gray-800 dark:text-gray-100">{template.name}</span>
            </div>
            <span className="rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              {template.taskType}
            </span>
          </button>
        ))}
      </div>
    );
  }

  function renderNewContractTaskEditor() {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Title</label>
          <input
            type="text"
            value={newTaskTitle}
            onChange={(event) => {
              setNewTaskTitle(event.target.value);
              setContractTaskError('');
            }}
            className={SMALL_INPUT_CLS}
            maxLength={100}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Task Type</label>
          <select
            value={newTaskType}
            onChange={(event) => setNewTaskType(event.target.value as NewContractTaskType)}
            className={SELECT_CLS}
          >
            {NEW_TASK_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {newTaskType === 'COUNTER' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Target number</label>
              <input type="number" min={1} value={counterTarget} onChange={(event) => setCounterTarget(Number(event.target.value) || 1)} className={SMALL_INPUT_CLS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Unit text</label>
              <input type="text" value={counterUnit} onChange={(event) => setCounterUnit(event.target.value)} className={SMALL_INPUT_CLS} />
            </div>
          </div>
        ) : null}

        {newTaskType === 'DURATION' ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Minutes</label>
            <input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) || 1)} className={SMALL_INPUT_CLS} />
          </div>
        ) : null}

        {newTaskType === 'TIMER' ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Seconds</label>
            <input type="number" min={1} value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value) || 1)} className={SMALL_INPUT_CLS} />
          </div>
        ) : null}

        {newTaskType === 'RATING' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Out of</label>
              <input type="number" min={2} value={ratingScale} onChange={(event) => setRatingScale(Number(event.target.value) || 2)} className={SMALL_INPUT_CLS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Prompt text</label>
              <input type="text" value={ratingPrompt} onChange={(event) => setRatingPrompt(event.target.value)} className={SMALL_INPUT_CLS} />
            </div>
          </div>
        ) : null}

        {newTaskType === 'TEXT' ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Prompt text</label>
            <input type="text" value={textPrompt} onChange={(event) => setTextPrompt(event.target.value)} className={SMALL_INPUT_CLS} />
          </div>
        ) : null}

        {contractTaskError ? <p className="text-sm text-red-500">{contractTaskError}</p> : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={addUniqueContractTask}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            Add
          </button>
        </div>
      </div>
    );
  }

  function renderTypeArea() {
    switch (docType) {
      case 'reference':
        return (
          <TextInput label="URL" value={url} onChange={setUrl} placeholder="https://..." maxLength={500} />
        );

      case 'manual':
        return (
          <div className="space-y-3">
            <TextInput label="URL" value={url} onChange={setUrl} placeholder="https://..." maxLength={500} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Linked vehicle or item</label>
              <select
                value={manualLinkedRef}
                onChange={(event) => setManualLinkedRef(event.target.value)}
                className={SELECT_CLS}
              >
                <option value="">None</option>
                {allVehicles.length > 0 ? (
                  <optgroup label="Vehicles">
                    {allVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
                  </optgroup>
                ) : null}
                {itemOptions.length > 0 ? (
                  <optgroup label="Items">
                    {itemOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </optgroup>
                ) : null}
              </select>
            </div>
          </div>
        );

      case 'contract':
        return (
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Contacts</label>
              {contractContactIds.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {contractContactIds.map((id) => {
                    const contact = resources[id];
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      >
                        {contact ? (
                          <>
                            <IconDisplay iconKey={contact.icon} size={12} className="h-3 w-3 object-contain" alt="" />
                            <span>{contact.name}</span>
                          </>
                        ) : (
                          <span className="italic text-gray-400">Unknown</span>
                        )}
                        <button type="button" onClick={() => removeContact(id)} className="ml-0.5 text-blue-400 hover:text-red-400">×</button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
              <div className="flex gap-2">
                <select value={addContactId} onChange={(event) => setAddContactId(event.target.value)} className={`flex-1 ${SELECT_CLS}`}>
                  <option value="">Add a contact…</option>
                  {availableContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={addContact}
                  disabled={!addContactId}
                  className="shrink-0 rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 hover:bg-blue-600"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Account</label>
              <select value={contractAccountId} onChange={(event) => setContractAccountId(event.target.value)} className={SELECT_CLS}>
                <option value="">None</option>
                {allAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Deposit on completion</span>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="text"
                  value={depositName}
                  onChange={(event) => setDepositName(event.target.value)}
                  placeholder="Task name"
                  maxLength={80}
                  className={SMALL_INPUT_CLS}
                />
                <div className="w-28">
                  <NumberInput label="" value={depositValue} onChange={setDepositValue} placeholder="Amount" step={0.01} />
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Contract tasks</span>
                <div className="flex gap-2">
                  {([
                    { id: 'library', label: 'Library' },
                    { id: 'new', label: 'New Task' },
                  ] as const).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setContractTaskTab(tab.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        contractTaskTab === tab.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {contractTaskTab === 'library' ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={contractTaskSearch}
                    onChange={(event) => setContractTaskSearch(event.target.value)}
                    placeholder="Search library tasks"
                    className={SMALL_INPUT_CLS}
                  />
                  {renderContractTaskLibrary()}
                </div>
              ) : renderNewContractTaskEditor()}

              {contractTasks.length > 0 ? (
                <div className="space-y-2 border-t border-gray-200 pt-3 dark:border-gray-700">
                  {contractTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 dark:bg-gray-800">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                          {getContractTaskDisplayName(task, taskTemplates)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {getContractTaskDisplayType(task, taskTemplates, libraryTemplates)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeContractTask(task.id)}
                        className="text-xs text-gray-400 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-gray-400">No contract tasks yet.</p>
              )}
            </div>
          </div>
        );

      case 'license':
        return (
          <div className="space-y-4">
            <TextInput label="License Number" value={licenseNumber} onChange={setLicenseNumber} placeholder="Optional" maxLength={120} />

            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Photo</span>
                {licensePhoto ? (
                  <button type="button" onClick={clearLicensePhoto} className="text-xs text-gray-400 hover:text-red-400">Remove</button>
                ) : null}
              </div>

              <input
                id={fileInputId}
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleWebPhotoChange}
              />

              {licensePhoto ? (
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                  <img src={licensePhoto} alt="License" className="h-40 w-full object-cover" />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                  No photo selected
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPhotoBusy}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
                >
                  Upload photo
                </button>

                <button
                  type="button"
                  onClick={() => void handleNativeLicensePhoto('camera')}
                  disabled={isPhotoBusy || !isNativePlatform}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Camera
                </button>

                <button
                  type="button"
                  onClick={() => void handleNativeLicensePhoto('gallery')}
                  disabled={isPhotoBusy || !isNativePlatform}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Gallery
                </button>
              </div>

              {licenseStatusMessage ? <p className="text-xs text-gray-500 dark:text-gray-400">{licenseStatusMessage}</p> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">License Expiry</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(event) => setExpiryDate(event.target.value)}
                  className={SELECT_CLS}
                />
              </div>
              <NumberInput
                label="Notify me N days before expiry"
                value={expiryLeadDays}
                onChange={setExpiryLeadDays}
                placeholder="30"
                step={1}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Renewal Notes</label>
              <textarea
                value={renewalNotes}
                onChange={(event) => setRenewalNotes(event.target.value)}
                rows={4}
                maxLength={1000}
                className={SMALL_INPUT_CLS}
              />
            </div>
          </div>
        );

      case 'recipe':
        return (
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Ingredients</span>
                <button type="button" onClick={addIngredient} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add</button>
              </div>
              {ingredients.length === 0 ? (
                <p className="text-xs italic text-gray-400">No ingredients yet.</p>
              ) : null}
              {ingredients.map((ingredient) => (
                <div key={ingredient.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                  <select
                    value={ingredient.itemRef}
                    onChange={(event) => updateIngredient(ingredient.id, 'itemRef', event.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">Select item…</option>
                    {itemOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <input
                    type="number"
                    value={ingredient.quantity}
                    onChange={(event) => updateIngredient(ingredient.id, 'quantity', event.target.value === '' ? '' : Number(event.target.value))}
                    placeholder="Qty"
                    className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={ingredient.unit}
                    onChange={(event) => updateIngredient(ingredient.id, 'unit', event.target.value)}
                    placeholder="Unit"
                    maxLength={20}
                    className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setIngredients((prev) => prev.filter((entry) => entry.id !== ingredient.id))}
                    className="text-xs text-gray-400 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Steps</span>
              {steps.length > 0 ? (
                <div className="space-y-1">
                  {steps.map((step, index) => (
                    <div key={step.id} className="flex items-start gap-2">
                      <span className="mt-2 shrink-0 text-xs font-medium text-gray-400">{index + 1}.</span>
                      <input
                        type="text"
                        value={step.text}
                        onChange={(event) => setSteps((prev) => prev.map((entry) => entry.id === step.id ? { ...entry, text: event.target.value } : entry))}
                        maxLength={200}
                        className={`flex-1 ${SMALL_INPUT_CLS}`}
                      />
                      <button
                        type="button"
                        onClick={() => setSteps((prev) => prev.filter((entry) => entry.id !== step.id))}
                        className="mt-1.5 text-xs text-gray-400 hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStepText}
                  onChange={(event) => setNewStepText(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addStep(); } }}
                  placeholder="Add a step…"
                  maxLength={200}
                  className={`flex-1 ${SMALL_INPUT_CLS}`}
                />
                <button
                  type="button"
                  onClick={addStep}
                  disabled={!newStepText.trim()}
                  className="shrink-0 rounded-md bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:bg-blue-600"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        );

      case 'course':
        return (
          <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-700/60">
            <p className="text-xs italic text-gray-400">Course content — coming soon.</p>
          </div>
        );

      case 'layout':
        return (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 dark:border-amber-700/60 dark:bg-amber-900/20">
            <div className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              Legacy Layout
            </div>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Layout docs are deprecated. Legacy layout fields remain read only here; standard doc fields can still be edited.
            </p>
            {legacyLayoutLinkedResource ? (
              <div className="flex items-center gap-2 text-sm text-amber-900 dark:text-amber-100">
                <IconDisplay iconKey={legacyLayoutLinkedResource.icon} size={16} className="h-4 w-4 object-contain" alt="" />
                <span>{legacyLayoutLinkedResource.name}</span>
              </div>
            ) : null}
            {(existing?.layoutAreas?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-1">
                {(existing?.layoutAreas ?? []).map((area) => (
                  <span key={area.id} className="rounded bg-white/70 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    {area.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700 shrink-0">
        <button type="button" onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          Back
        </button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          {existing ? 'Edit Doc' : 'New Doc'}
        </h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={canSave ? 'text-sm font-semibold text-blue-500 hover:text-blue-600' : 'text-sm font-semibold text-gray-300'}
        >
          Save
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 px-4 py-3">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={iconKey} onChange={setIconKey} />
          <TextInput label="Name *" value={displayName} onChange={setDisplayName} placeholder="e.g. Driver License" maxLength={100} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Type</label>
          <select value={docType} onChange={(event) => setDocType(event.target.value as DocType)} className={SELECT_CLS}>
            {docType === 'layout' ? <option value="layout">Legacy Layout</option> : null}
            {DOC_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {renderTypeArea()}
      </div>
    </div>
  );
}