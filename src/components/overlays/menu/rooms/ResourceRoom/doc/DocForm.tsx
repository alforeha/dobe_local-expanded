import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  AccountResource,
  DocContractDepositTemplate,
  DocLayoutArea,
  DocRecipeIngredient,
  DocRecipeStep,
  DocResource,
  DocType,
  HomeResource,
} from '../../../../../../types/resource';
import { isContact, isHome, isInventory, isVehicle } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateGTDItems, generateDocTasks_stub } from '../../../../../../engine/resourceEngine';
import { itemLibrary, getItemTemplateByRef } from '../../../../../../coach/ItemLibrary';
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

const DOC_TYPE_OPTIONS: { value: DocType; label: string }[] = [
  { value: 'reference', label: 'Reference' },
  { value: 'manual', label: 'Manual' },
  { value: 'contract', label: 'Contract' },
  { value: 'recipe', label: 'Recipe' },
  { value: 'layout', label: 'Layout' },
  { value: 'course', label: 'Course' },
];

const SELECT_CLS =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 focus:border-purple-500 focus:outline-none disabled:opacity-40';

const SMALL_INPUT_CLS =
  'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

export function DocForm({ existing, onSaved, onCancel }: DocFormProps) {
  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? (resources[existing.id] as typeof existing | undefined) : undefined;

  // ── Shared ────────────────────────────────────────────────────
  const [iconKey, setIconKey] = useState(existing?.icon ?? 'doc');
  const [displayName, setDisplayName] = useState(existing?.name ?? '');
  const [docType, setDocType] = useState<DocType>(existing?.docType ?? 'reference');

  // ── Reference / Manual ────────────────────────────────────────
  const [url, setUrl] = useState(existing?.url ?? '');

  // ── Manual: linked vehicle or item ────────────────────────────
  const [manualLinkedRef, setManualLinkedRef] = useState(
    existing?.docType === 'manual' ? (existing?.linkedResourceRef ?? '') : '',
  );

  // ── Contract ──────────────────────────────────────────────────
  const [contractContactIds, setContractContactIds] = useState<string[]>(existing?.linkedContactIds ?? []);
  const [addContactId, setAddContactId] = useState('');
  const [contractAccountId, setContractAccountId] = useState(existing?.linkedAccountId ?? '');
  const [depositName, setDepositName] = useState(existing?.contractDepositTemplate?.name ?? '');
  const [depositValue, setDepositValue] = useState<number | ''>(existing?.contractDepositTemplate?.value ?? '');
  const [trackedTasks, setTrackedTasks] = useState<string[]>(existing?.trackedTasks ?? []);

  // ── Recipe ────────────────────────────────────────────────────
  const [ingredients, setIngredients] = useState<{ id: string; itemRef: string; quantity: number | ''; unit: string }[]>(
    existing?.recipeIngredients?.map((i) => ({
      id: i.id,
      itemRef: i.itemRef ?? '',
      quantity: i.quantity ?? '',
      unit: i.unit ?? '',
    })) ?? [],
  );
  const [steps, setSteps] = useState<{ id: string; text: string }[]>(existing?.recipeSteps ?? []);
  const [newStepText, setNewStepText] = useState('');

  // ── Layout ────────────────────────────────────────────────────
  const [layoutLinkedRef, setLayoutLinkedRef] = useState(
    existing?.docType === 'layout' ? (existing?.linkedResourceRef ?? '') : '',
  );
  const [layoutAreas, setLayoutAreas] = useState<{ id: string; name: string; roomId: string }[]>(
    existing?.layoutAreas?.map((a) => ({ id: a.id, name: a.name, roomId: a.roomId ?? '' })) ?? [],
  );

  // ── Derived lists ─────────────────────────────────────────────
  const allContacts = Object.values(resources).filter(isContact);
  const allVehicles = Object.values(resources).filter(isVehicle);
  const allInventory = Object.values(resources).filter(isInventory);
  const allHomes = Object.values(resources).filter(isHome);
  const allAccounts = Object.values(resources).filter((r): r is AccountResource => r.type === 'account');
  const availableContacts = allContacts.filter((c) => !contractContactIds.includes(c.id));

  const layoutLinkedResource = layoutLinkedRef ? resources[layoutLinkedRef] : undefined;
  const layoutLinkedHome = layoutLinkedResource && isHome(layoutLinkedResource) ? (layoutLinkedResource as HomeResource) : null;

  // Items for manual + recipe
  const itemOptions: { id: string; name: string }[] = Array.from(
    new Map([
      ...itemLibrary.map((t) => [t.id, { id: t.id, name: t.name }] as [string, { id: string; name: string }]),
      ...getUserInventoryItemTemplates(user).map((t) => [t.id, { id: t.id, name: t.name }] as [string, { id: string; name: string }]),
    ]).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Tasks for contract tracked tasks, grouped by source
  interface TaskGroup { group: string; tasks: string[] }
  const taskGroups: TaskGroup[] = [];
  for (const h of allHomes) {
    const tasks = (h.chores ?? []).map((c) => c.name).filter(Boolean);
    if (tasks.length > 0) taskGroups.push({ group: h.name, tasks });
  }
  for (const v of allVehicles) {
    const tasks = (v.maintenanceTasks ?? []).map((t) => t.name).filter(Boolean);
    if (tasks.length > 0) taskGroups.push({ group: v.name, tasks });
  }
  for (const a of allAccounts) {
    const tasks = (a.accountTasks ?? []).filter((t) => t.kind !== 'transaction-log').map((t) => t.name).filter(Boolean);
    if (tasks.length > 0) taskGroups.push({ group: a.name, tasks });
  }
  for (const inv of allInventory) {
    const tasks = (inv.itemTemplates ?? [])
      .flatMap((t) => (t.customTaskTemplates ?? []).map((ct) => ct.name))
      .filter(Boolean);
    if (tasks.length > 0) taskGroups.push({ group: inv.name, tasks });
  }

  const canSave = displayName.trim().length > 0;

  // ── Contract handlers ─────────────────────────────────────────
  function addContact() {
    if (!addContactId || contractContactIds.includes(addContactId)) return;
    setContractContactIds((prev) => [...prev, addContactId]);
    setAddContactId('');
  }

  function removeContact(id: string) {
    setContractContactIds((prev) => prev.filter((c) => c !== id));
  }

  function addTrackedTask(name: string) {
    if (!name || trackedTasks.includes(name)) return;
    setTrackedTasks((prev) => [...prev, name]);
  }

  // ── Recipe handlers ───────────────────────────────────────────
  function addIngredient() {
    setIngredients((prev) => [...prev, { id: uuidv4(), itemRef: '', quantity: '', unit: '' }]);
  }

  function updateIngredient(id: string, field: 'unit', value: string): void;
  function updateIngredient(id: string, field: 'itemRef', value: string): void;
  function updateIngredient(id: string, field: 'quantity', value: number | ''): void;
  function updateIngredient(id: string, field: string, value: string | number | '') {
    setIngredients((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  }

  function addStep() {
    const text = newStepText.trim();
    if (!text) return;
    setSteps((prev) => [...prev, { id: uuidv4(), text }]);
    setNewStepText('');
  }

  // ── Layout handlers ───────────────────────────────────────────
  function addLayoutArea() {
    setLayoutAreas((prev) => [...prev, { id: uuidv4(), name: '', roomId: '' }]);
  }

  function updateLayoutArea(id: string, field: 'name' | 'roomId', value: string) {
    setLayoutAreas((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  }

  // ── Save ──────────────────────────────────────────────────────
  function handleSave() {
    if (!canSave) return;
    const now = new Date().toISOString();

    const finalIngredients: DocRecipeIngredient[] = ingredients
      .filter((i) => i.itemRef)
      .map((i) => {
        const template = getItemTemplateByRef(i.itemRef) ?? getUserInventoryItemTemplates(user).find((t) => t.id === i.itemRef);
        return {
          id: i.id,
          name: template?.name ?? i.itemRef,
          itemRef: i.itemRef,
          quantity: i.quantity !== '' ? i.quantity : undefined,
          unit: i.unit.trim() || undefined,
        };
      });

    const finalSteps: DocRecipeStep[] = steps.filter((s) => s.text.trim());

    const finalAreas: DocLayoutArea[] = layoutAreas
      .filter((a) => a.name.trim())
      .map((a) => ({ id: a.id, name: a.name.trim(), roomId: a.roomId || undefined }));

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
      linkedResourceRef:
        docType === 'manual' ? (manualLinkedRef || undefined) :
        docType === 'layout' ? (layoutLinkedRef || undefined) : undefined,
      linkedResourceRefs: undefined,
      linkedContactIds: docType === 'contract' && contractContactIds.length > 0 ? contractContactIds : undefined,
      linkedAccountId: docType === 'contract' ? (contractAccountId || undefined) : undefined,
      contractDepositTemplate: docType === 'contract' ? finalDeposit : undefined,
      trackedTasks: docType === 'contract' && trackedTasks.length > 0 ? trackedTasks : undefined,
      recipeIngredients: docType === 'recipe' && finalIngredients.length > 0 ? finalIngredients : undefined,
      recipeSteps: docType === 'recipe' && finalSteps.length > 0 ? finalSteps : undefined,
      layoutAreas: docType === 'layout' && finalAreas.length > 0 ? finalAreas : undefined,
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

  // ── Type-specific section ─────────────────────────────────────
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
                onChange={(e) => setManualLinkedRef(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">None</option>
                {allVehicles.length > 0 && (
                  <optgroup label="Vehicles">
                    {allVehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </optgroup>
                )}
                {itemOptions.length > 0 && (
                  <optgroup label="Items">
                    {itemOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
        );

      case 'contract':
        return (
          <div className="space-y-3">
            {/* Contacts */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Contacts</label>
              {contractContactIds.length > 0 && (
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
              )}
              <div className="flex gap-2">
                <select value={addContactId} onChange={(e) => setAddContactId(e.target.value)} className={`flex-1 ${SELECT_CLS}`}>
                  <option value="">Add a contact…</option>
                  {availableContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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

            {/* Account */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Account</label>
              <select value={contractAccountId} onChange={(e) => setContractAccountId(e.target.value)} className={SELECT_CLS}>
                <option value="">None</option>
                {allAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Deposit template */}
            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-800/60">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Deposit on completion</span>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="text"
                  value={depositName}
                  onChange={(e) => setDepositName(e.target.value)}
                  placeholder="Task name"
                  maxLength={80}
                  className={SMALL_INPUT_CLS}
                />
                <div className="w-28">
                  <NumberInput label="" value={depositValue} onChange={setDepositValue} placeholder="Amount" step={0.01} />
                </div>
              </div>
            </div>

            {/* Tracked tasks */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Tracked tasks</label>
              {trackedTasks.length > 0 && (
                <div className="space-y-1">
                  {trackedTasks.map((task, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded bg-gray-50 px-2 py-1.5 dark:bg-gray-700">
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{task}</span>
                      <button
                        type="button"
                        onClick={() => setTrackedTasks((prev) => prev.filter((_, i) => i !== idx))}
                        className="text-xs text-gray-400 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {taskGroups.length > 0 ? (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addTrackedTask(e.target.value); }}
                  className={SELECT_CLS}
                >
                  <option value="">Add a task…</option>
                  {taskGroups.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.tasks
                        .filter((t) => !trackedTasks.includes(t))
                        .map((t) => <option key={t} value={t}>{t}</option>)}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <p className="text-xs italic text-gray-400">No tasks found. Add homes, vehicles, accounts, or inventory with tasks first.</p>
              )}
            </div>
          </div>
        );

      case 'recipe':
        return (
          <div className="space-y-3">
            {/* Ingredients */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Ingredients</span>
                <button type="button" onClick={addIngredient} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add</button>
              </div>
              {ingredients.length === 0 && (
                <p className="text-xs italic text-gray-400">No ingredients yet.</p>
              )}
              {ingredients.map((ingredient) => (
                <div key={ingredient.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                  <select
                    value={ingredient.itemRef}
                    onChange={(e) => updateIngredient(ingredient.id, 'itemRef', e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">Select item…</option>
                    {itemOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <input
                    type="number"
                    value={ingredient.quantity}
                    onChange={(e) => updateIngredient(ingredient.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="Qty"
                    className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={ingredient.unit}
                    onChange={(e) => updateIngredient(ingredient.id, 'unit', e.target.value)}
                    placeholder="Unit"
                    maxLength={20}
                    className="w-16 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setIngredients((prev) => prev.filter((i) => i.id !== ingredient.id))}
                    className="text-xs text-gray-400 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Steps */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Steps</span>
              {steps.length > 0 && (
                <div className="space-y-1">
                  {steps.map((step, idx) => (
                    <div key={step.id} className="flex items-start gap-2">
                      <span className="mt-2 shrink-0 text-xs font-medium text-gray-400">{idx + 1}.</span>
                      <input
                        type="text"
                        value={step.text}
                        onChange={(e) => setSteps((prev) => prev.map((s) => s.id === step.id ? { ...s, text: e.target.value } : s))}
                        maxLength={200}
                        className={`flex-1 ${SMALL_INPUT_CLS}`}
                      />
                      <button
                        type="button"
                        onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))}
                        className="mt-1.5 text-xs text-gray-400 hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStepText}
                  onChange={(e) => setNewStepText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStep(); } }}
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

      case 'layout':
        return (
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Linked home or vehicle</label>
              <select
                value={layoutLinkedRef}
                onChange={(e) => { setLayoutLinkedRef(e.target.value); setLayoutAreas([]); }}
                className={SELECT_CLS}
              >
                <option value="">None</option>
                {allHomes.length > 0 && (
                  <optgroup label="Homes">
                    {allHomes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </optgroup>
                )}
                {allVehicles.length > 0 && (
                  <optgroup label="Vehicles">
                    {allVehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </optgroup>
                )}
              </select>
            </div>

            {layoutLinkedRef && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Floor plan areas</span>
                  <button type="button" onClick={addLayoutArea} className="text-xs font-medium text-blue-500 hover:text-blue-600">+ Add area</button>
                </div>
                {layoutAreas.length === 0 && (
                  <p className="text-xs italic text-gray-400">No areas defined yet.</p>
                )}
                {layoutAreas.map((area) => (
                  <div key={area.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={area.name}
                      onChange={(e) => updateLayoutArea(area.id, 'name', e.target.value)}
                      placeholder="Area name"
                      maxLength={60}
                      className={`flex-1 ${SMALL_INPUT_CLS}`}
                    />
                    {layoutLinkedHome && (layoutLinkedHome.rooms ?? []).length > 0 && (
                      <select
                        value={area.roomId}
                        onChange={(e) => updateLayoutArea(area.id, 'roomId', e.target.value)}
                        className="w-36 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none"
                      >
                        <option value="">No room</option>
                        {(layoutLinkedHome.rooms ?? []).map((room) => (
                          <option key={room.id} value={room.id}>{room.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setLayoutAreas((prev) => prev.filter((a) => a.id !== area.id))}
                      className="text-xs text-gray-400 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'course':
        return (
          <div className="rounded-lg bg-gray-50 px-3 py-4 text-center dark:bg-gray-700/60">
            <p className="text-xs italic text-gray-400">Course content — coming soon.</p>
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
          <TextInput label="Name *" value={displayName} onChange={setDisplayName} placeholder="e.g. Car Manual" maxLength={100} />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Type</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value as DocType)} className={SELECT_CLS}>
            {DOC_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {renderTypeArea()}
      </div>
    </div>
  );
}
