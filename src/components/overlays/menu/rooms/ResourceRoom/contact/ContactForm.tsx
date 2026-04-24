import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ContactResource, ResourceNote } from '../../../../../../types/resource';
import { CONTACT_GROUPS } from '../../../../../../types/resource';
import type { ContactGroup } from '../../../../../../types/resource';
import { useResourceStore } from '../../../../../../stores/useResourceStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { generateGTDItems, generateScheduledTasks } from '../../../../../../engine/resourceEngine';
import { TextInput } from '../../../../../shared/inputs/TextInput';
import { IconPicker } from '../../../../../shared/IconPicker';
import { NotesLogEditor } from '../../../../../shared/NotesLogEditor';

interface ContactFormProps {
  existing?: ContactResource;
  onSaved: () => void;
  onCancel: () => void;
}

export function ContactForm({ existing, onSaved, onCancel }: ContactFormProps) {
  const [iconKey, setIconKey] = useState<string>(existing?.icon ?? 'social');
  const [displayName, setDisplayName] = useState(existing?.displayName ?? existing?.name ?? '');
  const [groups, setGroups] = useState<ContactGroup[]>(existing?.groups ?? []);
  const [customGroups, setCustomGroups] = useState<string[]>(existing?.customGroups ?? []);
  const [groupsMenuOpen, setGroupsMenuOpen] = useState(false);
  const [isEditingCustomGroups, setIsEditingCustomGroups] = useState(false);
  const [isAddingCustomGroup, setIsAddingCustomGroup] = useState(false);
  const [customGroupInput, setCustomGroupInput] = useState('');
  const [editingCustomGroupValues, setEditingCustomGroupValues] = useState<Record<string, string>>({});
  const [birthday, setBirthday] = useState(existing?.birthday ?? '');
  const [birthdayLeadDays, setBirthdayLeadDays] = useState<number>(existing?.birthdayLeadDays ?? 14);
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [notes, setNotes] = useState<ResourceNote[]>(existing?.notes ?? []);

  const resources = useResourceStore((s) => s.resources);
  const setResource = useResourceStore((s) => s.setResource);
  const setUser = useUserStore((s) => s.setUser);
  const user = useUserStore((s) => s.user);
  const currentExisting = existing ? resources[existing.id] as ContactResource | undefined : undefined;
  const customGroupOptions = useMemo(() => {
    const allTags = new Set<string>();
    for (const resource of Object.values(resources)) {
      if (resource.type !== 'contact') continue;
      for (const tag of resource.customGroups ?? []) {
        const normalizedTag = tag.trim();
        if (normalizedTag) allTags.add(normalizedTag);
      }
    }
    for (const tag of customGroups) {
      const normalizedTag = tag.trim();
      if (normalizedTag) allTags.add(normalizedTag);
    }
    return Array.from(allTags).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }, [customGroups, resources]);
  const selectedGroupSummary = useMemo(() => {
    const selected = [...groups, ...customGroups];
    if (selected.length === 0) return 'Select groups';
    if (selected.length <= 2) return selected.join(', ');
    return `${selected.slice(0, 2).join(', ')} +${selected.length - 2}`;
  }, [customGroups, groups]);

  function toggleGroup(group: ContactGroup) {
    setGroups((prev) => (
      prev.includes(group)
        ? prev.filter((entry) => entry !== group)
        : [...prev, group]
    ));
  }

  function addCustomGroup() {
    const nextTag = customGroupInput.trim();
    if (!nextTag) return;
    setCustomGroups((prev) => (prev.includes(nextTag) ? prev : [...prev, nextTag]));
    setCustomGroupInput('');
    setIsAddingCustomGroup(false);
  }

  function removeCustomGroup(tag: string) {
    setCustomGroups((prev) => prev.filter((entry) => entry !== tag));
  }

  function toggleCustomGroup(tag: string) {
    setCustomGroups((prev) => (
      prev.includes(tag)
        ? prev.filter((entry) => entry !== tag)
        : [...prev, tag]
    ));
  }

  function beginCustomGroupEditing() {
    setEditingCustomGroupValues(
      Object.fromEntries(customGroups.map((tag) => [tag, tag])),
    );
    setIsEditingCustomGroups(true);
  }

  function cancelCustomGroupEditing() {
    setEditingCustomGroupValues({});
    setIsEditingCustomGroups(false);
  }

  function saveEditedCustomGroup(originalTag: string) {
    const nextValue = (editingCustomGroupValues[originalTag] ?? '').trim();
    if (!nextValue) return;
    setCustomGroups((prev) => prev.map((tag) => (tag === originalTag ? nextValue : tag)).filter((tag, index, arr) => arr.indexOf(tag) === index));
    setEditingCustomGroupValues((prev) => {
      const next = { ...prev };
      delete next[originalTag];
      next[nextValue] = nextValue;
      return next;
    });
  }

  function deleteEditedCustomGroup(tag: string) {
    removeCustomGroup(tag);
    setEditingCustomGroupValues((prev) => {
      const next = { ...prev };
      delete next[tag];
      return next;
    });
  }

  const canSave = displayName.trim().length > 0;

  function handleSave() {
    if (!canSave) return;

    const now = new Date().toISOString();
    const resource: ContactResource = {
      id: existing?.id ?? uuidv4(),
      type: 'contact',
      icon: iconKey,
      name: displayName.trim(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      displayName: displayName.trim(),
      groups,
      customGroups: customGroups.length > 0 ? customGroups : undefined,
      phone: phone || undefined,
      email: email || undefined,
      birthday: birthday || undefined,
      birthdayLeadDays: birthday ? birthdayLeadDays : undefined,
      address: address || undefined,
      linkedContacts: currentExisting?.linkedContacts ?? existing?.linkedContacts,
      notes,
      links: currentExisting?.links ?? existing?.links,
      linkedHomeId: currentExisting?.linkedHomeId ?? existing?.linkedHomeId,
      linkedAccountIds: currentExisting?.linkedAccountIds ?? existing?.linkedAccountIds,
      sharedProfile: currentExisting?.sharedProfile ?? existing?.sharedProfile ?? null,
    };

    setResource(resource);

    if (!existing && user) {
      const updatedUser = {
        ...user,
        resources: {
          ...user.resources,
          contacts: user.resources.contacts.includes(resource.id)
            ? user.resources.contacts
            : [...user.resources.contacts, resource.id],
        },
      };
      setUser(updatedUser);
    }

    generateScheduledTasks(resource);
    generateGTDItems(resource);
    onSaved();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          Back
        </button>
        <h3 className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
          {existing ? 'Edit Contact' : 'New Contact'}
        </h3>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className={`text-sm font-semibold transition-colors ${
            canSave ? 'text-blue-500 hover:text-blue-600' : 'text-gray-300'
          }`}
        >
          Save
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <IconPicker value={iconKey} onChange={setIconKey} />
          <TextInput
            label="Name *"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Full name"
            maxLength={100}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Groups</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setGroupsMenuOpen((prev) => !prev);
                setIsAddingCustomGroup(false);
                if (isEditingCustomGroups) cancelCustomGroupEditing();
              }}
              className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <span className="truncate text-left">{selectedGroupSummary}</span>
              <span className="text-xs text-gray-400">{groupsMenuOpen ? '▲' : '▼'}</span>
            </button>
            {groupsMenuOpen && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <div className="max-h-72 overflow-y-auto p-2">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Default groups</div>
                  <div className="space-y-1">
                    {CONTACT_GROUPS.map((group) => {
                      const selected = groups.includes(group);
                      return (
                        <button
                          key={group}
                          type="button"
                          onClick={() => toggleGroup(group)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm capitalize transition-colors ${
                            selected
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                              : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span>{group}</span>
                          <span className="text-xs">{selected ? '✓' : ''}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Custom groups</div>
                  {customGroupOptions.length === 0 ? (
                    <p className="rounded-lg px-2.5 py-2 text-sm text-gray-400">No custom groups yet.</p>
                  ) : isEditingCustomGroups ? (
                    <div className="space-y-2">
                      {customGroups.map((tag) => (
                        <div key={tag} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingCustomGroupValues[tag] ?? tag}
                            onChange={(event) => setEditingCustomGroupValues((prev) => ({ ...prev, [tag]: event.target.value }))}
                            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          />
                          <button
                            type="button"
                            onClick={() => saveEditedCustomGroup(tag)}
                            className="rounded-md border border-blue-300 px-2.5 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEditedCustomGroup(tag)}
                            className="rounded-md border border-red-300 px-2.5 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950/40"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {customGroupOptions.map((tag) => {
                        const selected = customGroups.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleCustomGroup(tag)}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${
                              selected
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800'
                            }`}
                          >
                            <span>{tag}</span>
                            <span className="text-xs">{selected ? '✓' : ''}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {isAddingCustomGroup && (
                    <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                      <input
                        type="text"
                        value={customGroupInput}
                        onChange={(event) => setCustomGroupInput(event.target.value)}
                        placeholder="New custom group"
                        maxLength={40}
                        className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      <button
                        type="button"
                        onClick={addCustomGroup}
                        className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCustomGroup((prev) => !prev);
                      setCustomGroupInput('');
                      if (isEditingCustomGroups) cancelCustomGroupEditing();
                    }}
                    className="text-sm font-medium text-blue-500 hover:text-blue-600"
                  >
                    {isAddingCustomGroup ? 'Cancel add' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isEditingCustomGroups) {
                        cancelCustomGroupEditing();
                        return;
                      }
                      setIsAddingCustomGroup(false);
                      beginCustomGroupEditing();
                    }}
                    disabled={customGroups.length === 0}
                    className="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:text-gray-300 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    {isEditingCustomGroups ? 'Done editing' : 'Edit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Birthday</label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Reminder</label>
            <select
              value={birthday ? birthdayLeadDays : ''}
              disabled={!birthday}
              onChange={(e) => setBirthdayLeadDays(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value={-1}>Never</option>
              <option value={0}>Day of</option>
              <option value={3}>3 days before</option>
              <option value={7}>7 days before</option>
              <option value={14}>14 days before</option>
              <option value={30}>30 days before</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <TextInput
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="+1 555 000 0000"
            maxLength={40}
          />
          <TextInput
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="email@example.com"
            maxLength={120}
          />
        </div>

        <TextInput
          label="Address"
          value={address}
          onChange={setAddress}
          placeholder="123 Main St"
          maxLength={200}
        />

        <NotesLogEditor
          notes={notes}
          onChange={setNotes}
          resource={existing}
          linkTabLabel="Relationships"
          allowedLinkTypes={['contact']}
        />
      </div>
    </div>
  );
}
